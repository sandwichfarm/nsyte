import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
// Using Deno.serve instead of importing serve
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { resolveRelays, type ResolverOptions, resolveServers } from "../lib/resolver-utils.ts";
import {
  fetchProfileEvent,
  fetchRelayListEvent,
  type FileEntry,
  listRemoteFiles,
} from "../lib/nostr.ts";
import { decode } from "nostr-tools/nip19";
import { normalizeToPubkey } from "applesauce-core/helpers";
import { DownloadService } from "../lib/download.ts";
import { readProjectFile } from "../lib/config.ts";

const log = createLogger("run");

interface RunOptions extends ResolverOptions {
  port?: number;
  cacheDir?: string;
  noOpen?: boolean;
}

/**
 * Register the run command
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .alias("rn")
    .description(
      "Run a resolver server that serves nsites via npub subdomains. Optionally specify an npub to launch instead of default.",
    )
    .arguments("[npub:string]")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-p, --port <port:number>", "Port number for the resolver server.", { default: 6798 })
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("--nbunksec <nbunksec:string>", "The nbunksec string to use for authentication.")
    .option(
      "-c, --cache-dir <dir:string>",
      "Directory to cache downloaded files (uses temp dir if not specified)",
    )
    .option("--no-open", "Don't automatically open the browser")
    .action(async (options: RunOptions, npub?: string) => {
      await runCommand(options, npub);
    });
}

/**
 * Validates an npub string format
 */
export function validateNpub(npub: string): boolean {
  try {
    const decoded = decode(npub);
    return decoded.type === "npub";
  } catch {
    return false;
  }
}

/**
 * Extract npub from hostname (e.g., "npub123.localhost" -> "npub123")
 */
function extractNpubFromHost(hostname: string): string | null {
  const parts = hostname.split(".");
  if (parts.length < 2) return null;

  const subdomain = parts[0];
  if (subdomain.startsWith("npub")) {
    return subdomain;
  }
  return null;
}

/**
 * Main run command implementation - runs a resolver server
 */
export async function runCommand(options: RunOptions, npub?: string): Promise<void> {
  try {
    const port = options.port || 6798;

    // Validate npub parameter if provided
    let targetNpub = "npub1rqznq898cxkjly6fqak09qheqkeure2qazr8tc2tjkzkcs9htces9rzvta"; // default
    if (npub) {
      if (!validateNpub(npub)) {
        console.log(colors.red(`✗ Invalid npub format: ${npub}`));
        Deno.exit(1);
      }
      targetNpub = npub;
    }

    // Set up cache directory
    let cacheDir: string | null = null;
    let usingPersistentCache = false;

    if (options.cacheDir) {
      // Use specified cache directory
      cacheDir = options.cacheDir;
      usingPersistentCache = true;
      await ensureDir(cacheDir);
      console.log(colors.cyan(`📂 Using cache directory: ${cacheDir}`));
    }

    // Use specific relays for profile/relay list resolution
    const profileRelays = ["wss://user.kindpag.es", "wss://purplepag.es"];

    // Ensure relays are connected
    log.debug(`Connecting to profile relays: ${profileRelays.join(", ")}`);

    // Use configured relays for file events, or fall back to profile relays
    const fileRelays = resolveRelays(options, readProjectFile(), false);
    const relays = fileRelays.length > 0 ? fileRelays : profileRelays;

    // Get blossom servers
    const servers = resolveServers(options, readProjectFile());

    console.log(colors.green(`\n🚀 Starting nsyte resolver server`));
    console.log(colors.cyan(`📡 Profile relays: ${profileRelays.join(", ")}`));
    console.log(colors.cyan(`📁 File relays: ${relays.join(", ")}`));
    console.log(colors.cyan(`💾 Blossom servers: ${servers.join(", ")}`));
    console.log(colors.cyan(`🌐 Server URL: http://localhost:${port}`));
    console.log(colors.gray(`\nAccess nsites via: http://{npub}.localhost:${port}/path/to/file`));
    console.log(colors.gray(`Example: http://npub1abc123.localhost:${port}/index.html`));
    console.log(colors.gray(`\nNote: http://localhost:${port} redirects to:`));
    console.log(colors.gray(`http://${targetNpub}.localhost:${port}\n`));
    console.log(colors.gray(`Press Ctrl+C to stop the server\n`));

    // Open browser automatically unless disabled
    if (!options.noOpen) {
      await openBrowser(`http://localhost:${port}`);
    }

    // Cache for profile data and file listings
    const profileCache = new Map<string, { profile: any; relayList: any; timestamp: number }>();
    const fileListCache = new Map<
      string,
      {
        files: FileEntry[];
        timestamp: number;
        loading?: boolean;
        updating?: boolean;
        eventTimestamps?: Map<string, number>;
      }
    >();
    const fileCache = new Map<string, { data: Uint8Array; timestamp: number; sha256: string }>();
    // No longer using time-based intervals - check for updates on each request

    // Create HTTP handler
    const handler = async (request: Request): Promise<Response> => {
      const startTime = performance.now();
      const url = new URL(request.url);
      const hostname = request.headers.get("host")?.split(":")[0] || "";

      // Handle root localhost redirect
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
        const redirectUrl = `http://${targetNpub}.localhost:${port}${url.pathname}${url.search}`;
        const elapsed = Math.round(performance.now() - startTime);
        console.log(colors.cyan(`→ Redirecting to ${redirectUrl} - ${elapsed}ms`));
        return new Response(null, {
          status: 302,
          headers: {
            "Location": redirectUrl,
            "Cache-Control": "no-cache",
          },
        });
      }

      // Extract npub from subdomain
      const npub = extractNpubFromHost(hostname);

      if (!npub) {
        const elapsed = Math.round(performance.now() - startTime);
        console.log(colors.red(`✗ Invalid request (no npub) - ${elapsed}ms`));
        return new Response("Invalid request. Use npub subdomain (e.g., npub123.localhost)", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Validate npub format
      if (!validateNpub(npub)) {
        const elapsed = Math.round(performance.now() - startTime);
        console.log(colors.red(`✗ Invalid npub format: ${npub} - ${elapsed}ms`));
        return new Response(`Invalid npub format: ${npub}`, {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      try {
        const pubkeyHex = normalizeToPubkey(npub);
        const requestedPath = url.pathname;

        log.debug(`Request: ${hostname}${requestedPath} -> npub: ${npub}`);

        // Log successful npub resolution to console
        console.log(
          colors.green(`✓ Resolved ${colors.cyan(npub)} → ${colors.gray(requestedPath)}`),
        );

        // Check profile cache - we'll keep profile cache time-based to avoid too many profile lookups
        let profileData = profileCache.get(npub);
        if (!profileData || Date.now() - profileData.timestamp > 600000) { // 10 minutes for profile data
          // Fetch profile and relay list
          console.log(colors.gray(`  → Fetching profile data for ${npub}...`));

          try {
            const [profile, relayList] = await Promise.all([
              fetchProfileEvent(profileRelays, pubkeyHex),
              fetchRelayListEvent(profileRelays, pubkeyHex),
            ]);

            profileData = { profile, relayList, timestamp: Date.now() };
            profileCache.set(npub, profileData);

            if (profile) {
              try {
                const profileContent = JSON.parse(profile.content || "{}");
                console.log(
                  colors.gray(
                    `  → Profile: ${
                      profileContent.name || profileContent.display_name || "Unknown"
                    }`,
                  ),
                );
              } catch (e) {
                console.log(colors.gray(`  → Profile data found but could not parse`));
              }
            } else {
              console.log(colors.gray(`  → No profile found (user may not have set one)`));
            }

            if (relayList) {
              console.log(
                colors.gray(
                  `  → Found relay list with ${
                    relayList.tags.filter((t) => t[0] === "r").length
                  } relays`,
                ),
              );
            }
          } catch (error) {
            console.log(colors.yellow(`  → Could not fetch profile data: ${error}`));
            profileData = { profile: null, relayList: null, timestamp: Date.now() };
            profileCache.set(npub, profileData);
          }
        }

        // Get or fetch file list
        let fileListEntry = fileListCache.get(npub);

        // If we're loading file list for the first time, show loading page (only for HTML requests)
        if (
          !fileListEntry &&
          (requestedPath === "/" || requestedPath.endsWith(".html") ||
            requestedPath.endsWith(".htm"))
        ) {
          // Start loading file list in background
          fileListCache.set(npub, {
            files: [],
            timestamp: Date.now(),
            loading: true,
            updating: false,
          });

          (async () => {
            try {
              console.log(colors.gray(`  → Fetching file list...`));
              const files = await listRemoteFiles(relays, pubkeyHex);

              // Track event timestamps for cache invalidation
              const eventTimestamps = new Map<string, number>();
              files.forEach((file) => {
                if (file.event) {
                  eventTimestamps.set(file.path, file.event.created_at);
                }
              });

              fileListCache.set(npub, {
                files,
                timestamp: Date.now(),
                loading: false,
                updating: false,
                eventTimestamps,
              });
              console.log(colors.gray(`  → Found ${files.length} files`));
            } catch (error) {
              console.log(colors.red(`  → Failed to fetch file list: ${error}`));
              fileListCache.set(npub, {
                files: [],
                timestamp: Date.now(),
                loading: false,
                updating: false,
              });
            }
          })();

          // Return loading page
          const loadingHtml = generateLoadingPage(npub, profileData?.profile);
          const elapsed = Math.round(performance.now() - startTime);
          console.log(colors.blue(`  → Loading page served - ${elapsed}ms`));
          return new Response(loadingHtml, {
            status: 200,
            headers: {
              "Content-Type": "text/html",
              "Refresh": "2", // Auto-refresh every 2 seconds
            },
          });
        }

        // If still loading, show loading page (only for HTML requests)
        if (fileListEntry?.loading) {
          // Only serve loading page for HTML files and root path
          if (
            requestedPath === "/" || requestedPath.endsWith(".html") ||
            requestedPath.endsWith(".htm")
          ) {
            const loadingHtml = generateLoadingPage(npub, profileData?.profile);
            const elapsed = Math.round(performance.now() - startTime);
            console.log(colors.blue(`  → Loading page served (still fetching) - ${elapsed}ms`));
            return new Response(loadingHtml, {
              status: 200,
              headers: {
                "Content-Type": "text/html",
                "Refresh": "2",
              },
            });
          } else {
            // For non-HTML files like favicon.ico, return 404 while still loading
            const elapsed = Math.round(performance.now() - startTime);
            console.log(colors.yellow(`  → File not found (still loading) - ${elapsed}ms`));
            return new Response("File not found", {
              status: 404,
              headers: { "Content-Type": "text/plain" },
            });
          }
        }

        // Check for updates on every request (or fetch initial file list)
        if (!fileListEntry || !fileListEntry.loading) {
          const isInitialLoad = !fileListEntry;
          console.log(
            colors.gray(
              `  → ${isInitialLoad ? "Fetching file list..." : "Checking for updates..."}`,
            ),
          );
          const files = await listRemoteFiles(relays, pubkeyHex);

          // Track event timestamps for cache invalidation
          const newEventTimestamps = new Map<string, number>();
          files.forEach((file) => {
            if (file.event) {
              newEventTimestamps.set(file.path, file.event.created_at);
            }
          });

          // Check if any files have been updated
          let hasUpdates = false;
          if (fileListEntry?.eventTimestamps) {
            // Check for new or updated files
            for (const [path, newTimestamp] of newEventTimestamps) {
              const oldTimestamp = fileListEntry.eventTimestamps.get(path);
              if (!oldTimestamp || newTimestamp > oldTimestamp) {
                hasUpdates = true;
                console.log(colors.yellow(`  → Updated: ${path}`));
                break;
              }
            }

            // Check for deleted files
            if (!hasUpdates) {
              for (const [path] of fileListEntry.eventTimestamps) {
                if (!newEventTimestamps.has(path)) {
                  hasUpdates = true;
                  console.log(colors.yellow(`  → Removed: ${path}`));
                  break;
                }
              }
            }
          } else {
            // No previous timestamps, so this is the first load
            hasUpdates = true;
          }

          if (hasUpdates) {
            fileListEntry = {
              files,
              timestamp: Date.now(),
              loading: false,
              updating: false,
              eventTimestamps: newEventTimestamps,
            };
            fileListCache.set(npub, fileListEntry);
            console.log(colors.gray(`  → Found ${files.length} files (cache updated)`));
          } else {
            // No updates found, keep existing cache
            console.log(colors.gray(`  → No updates found (${files.length} files)`));
          }
        }

        if (!fileListEntry || fileListEntry.files.length === 0) {
          const elapsed = Math.round(performance.now() - startTime);
          console.log(colors.yellow(`  → No files found - ${elapsed}ms`));
          return new Response("No files found for this npub", {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Handle root path - look for default files
        let targetPath = requestedPath;
        let foundFile = null;
        let isCompressed = false;
        let compressionType: "br" | "gz" | null = null;
        
        // Check for compressed versions support
        const acceptEncoding = request.headers.get("accept-encoding") || "";
        const supportsBrotli = acceptEncoding.includes("br");
        const supportsGzip = acceptEncoding.includes("gzip");
        
        // Debug log the Accept-Encoding header
        if (acceptEncoding) {
          log.debug(`Accept-Encoding: ${acceptEncoding}, supportsBrotli: ${supportsBrotli}, supportsGzip: ${supportsGzip}`);
        }
        
        if (requestedPath === "/") {
          const defaultFiles = [
            "index.html",
            "index.htm",
            "README.md",
            "docs/index.html",
            "dist/index.html",
            "public/index.html",
            "build/index.html",
            "404.html",
            "docs/404.html",
          ];
          // Build a list of all possible files including compressed versions
          const possibleFiles: string[] = [];
          for (const defaultFile of defaultFiles) {
            // Add compressed versions first (preferred)
            if (supportsBrotli) {
              possibleFiles.push(defaultFile + ".br");
            }
            if (supportsGzip) {
              possibleFiles.push(defaultFile + ".gz");
            }
            // Add uncompressed version
            possibleFiles.push(defaultFile);
          }
          
          for (const possibleFile of possibleFiles) {
            const file = fileListEntry?.files.find((f) => {
              const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedPath === possibleFile;
            });

            if (file) {
              foundFile = file;
              // Check if this is a compressed version
              if (possibleFile.endsWith(".br")) {
                targetPath = "/" + possibleFile.slice(0, -3); // Remove .br extension
                isCompressed = true;
                compressionType = "br";
              } else if (possibleFile.endsWith(".gz")) {
                targetPath = "/" + possibleFile.slice(0, -3); // Remove .gz extension
                isCompressed = true;
                compressionType = "gz";
              } else {
                targetPath = "/" + possibleFile;
              }
              break;
            }
          }

          // If still root, show directory listing
          if (targetPath === "/") {
            const html = generateDirectoryListing(npub, fileListEntry?.files || []);
            const elapsed = Math.round(performance.now() - startTime);
            console.log(colors.gray(`  → Directory listing served - ${elapsed}ms`));
            return new Response(html, {
              status: 200,
              headers: { "Content-Type": "text/html" },
            });
          }
        }

        // Find the requested file
        const normalizedRequestPath = targetPath.startsWith("/") ? targetPath.slice(1) : targetPath;
        let file: FileEntry | null = foundFile;
        
        log.debug(`Looking for file: ${normalizedRequestPath}, supportsBrotli: ${supportsBrotli}, supportsGzip: ${supportsGzip}`);
        
        // Build a list of files to try in order of preference
        const filesToTry: Array<{file: FileEntry | null, compressed: boolean, type: "br" | "gz" | null}> = [];
        
        // If we haven't found a file yet (not from root path handling)
        if (!file) {
          // Add compressed versions first if browser supports them
          if (supportsBrotli) {
            const brPath = normalizedRequestPath + ".br";
            log.debug(`Checking for brotli version: ${brPath}`);
            
            const brFile = fileListEntry.files.find(f => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === brPath;
            });
            
            if (brFile) {
              filesToTry.push({file: brFile, compressed: true, type: "br"});
              log.debug(`Found brotli version: ${brPath}`);
            }
          }
          
          if (supportsGzip) {
            const gzPath = normalizedRequestPath + ".gz";
            log.debug(`Checking for gzip version: ${gzPath}`);
            
            const gzFile = fileListEntry.files.find(f => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === gzPath;
            });
            
            if (gzFile) {
              filesToTry.push({file: gzFile, compressed: true, type: "gz"});
              log.debug(`Found gzip version: ${gzPath}`);
            }
          }
          
          // Always add the uncompressed version as fallback
          const uncompressedFile = fileListEntry.files.find(f => {
            const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedFilePath === normalizedRequestPath;
          });
          
          if (uncompressedFile) {
            filesToTry.push({file: uncompressedFile, compressed: false, type: null});
            log.debug(`Found uncompressed version: ${normalizedRequestPath}`);
          }
        } else {
          // We already have a file from root path handling
          filesToTry.push({file, compressed: isCompressed, type: compressionType});
        }
        
        // If path ends with / and no files found yet, try directory index files
        if (filesToTry.length === 0 && requestedPath.endsWith("/")) {
          const dirPath = normalizedRequestPath;
          const indexFiles = ["index.html", "index.htm", "README.md"];

          for (const indexFile of indexFiles) {
            const indexPath = dirPath + indexFile;
            let foundIndexFile = false;
            
            // Check for compressed versions first
            if (supportsBrotli) {
              const brPath = indexPath + ".br";
              const brFile = fileListEntry.files.find(f => {
                const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
                return normalizedFilePath === brPath;
              });
              
              if (brFile) {
                filesToTry.push({file: brFile, compressed: true, type: "br"});
                foundIndexFile = true;
              }
            }
            
            if (supportsGzip) {
              const gzPath = indexPath + ".gz";
              const gzFile = fileListEntry.files.find(f => {
                const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
                return normalizedFilePath === gzPath;
              });
              
              if (gzFile) {
                filesToTry.push({file: gzFile, compressed: true, type: "gz"});
                foundIndexFile = true;
              }
            }
            
            // Always check for uncompressed version
            const indexFileEntry = fileListEntry.files.find(f => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === indexPath;
            });
            
            if (indexFileEntry) {
              filesToTry.push({file: indexFileEntry, compressed: false, type: null});
              foundIndexFile = true;
            }
            
            // If we found any version of this index file, stop looking
            if (foundIndexFile) {
              log.debug(`Directory ${requestedPath} resolved to ${indexPath} (with ${filesToTry.length} variants)`);
              break;
            }
          }
        }
        
        // If no files found yet, try 404.html
        if (filesToTry.length === 0) {
          let found404 = false;
          
          // Try to find /404.html as fallback per nsite specification
          // Check for compressed versions first if supported
          if (supportsBrotli) {
            const notFoundBr = fileListEntry.files.find(f => {
              const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedPath === "404.html.br";
            });
            
            if (notFoundBr && notFoundBr.sha256) {
              filesToTry.push({file: notFoundBr, compressed: true, type: "br"});
              found404 = true;
              console.log(colors.yellow(`  → File not found: ${requestedPath}, will try /404.html.br`));
            }
          }
          
          if (supportsGzip) {
            const notFoundGz = fileListEntry.files.find(f => {
              const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedPath === "404.html.gz";
            });
            
            if (notFoundGz && notFoundGz.sha256) {
              filesToTry.push({file: notFoundGz, compressed: true, type: "gz"});
              found404 = true;
              console.log(colors.yellow(`  → File not found: ${requestedPath}, will try /404.html.gz`));
            }
          }
          
          // Always try uncompressed 404.html
          const notFoundFile = fileListEntry?.files.find(f => {
            const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedPath === "404.html";
          });

          if (notFoundFile && notFoundFile.sha256) {
            filesToTry.push({file: notFoundFile, compressed: false, type: null});
            found404 = true;
            console.log(colors.yellow(`  → File not found: ${requestedPath}, will try /404.html`));
          }
          
          // If still no file found, return error response
          if (!found404) {
            const elapsed = Math.round(performance.now() - startTime);
            console.log(colors.red(`  → File not found: ${requestedPath} (no 404.html available) - ${elapsed}ms`));
            
            // Generate a simple HTML 404 page if the request appears to be for HTML content
            const wantsHtml = requestedPath === "/" || requestedPath.endsWith(".html") || requestedPath.endsWith(".htm") || 
                             !requestedPath.includes(".") || request.headers.get("accept")?.includes("text/html");
            
            if (wantsHtml) {
              const html404 = `<!DOCTYPE html>
<html>
<head>
  <title>404 - Not Found</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
    h1 { color: #666; }
    p { color: #999; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>404 - Not Found</h1>
  <p>The requested file <code>${requestedPath}</code> was not found.</p>
  <p style="font-size: 0.9em;">This nsite does not have a custom 404.html page.</p>
</body>
</html>`;
              
              return new Response(html404, {
                status: 404,
                headers: { "Content-Type": "text/html" },
              });
            }
            
            // Return plain text for non-HTML requests
            return new Response(`File not found: ${requestedPath}`, {
              status: 404,
              headers: { "Content-Type": "text/plain" },
            });
          }
        }
        
        // Try to download files in order of preference
        let fileData: Uint8Array | null = null;
        let successfulFile: FileEntry | null = null;
        let successfulCompression: boolean = false;
        let successfulCompressionType: "br" | "gz" | null = null;
        
        for (const fileOption of filesToTry) {
          if (!fileOption.file || !fileOption.file.sha256) continue;
          
          const tryFile = fileOption.file;
          const fileSha256 = tryFile.sha256!; // We already checked this is not undefined
          const cacheKey = `${npub}-${fileSha256}`;
          const isStale = isCacheStale(fileListEntry, tryFile);
          
          // Try persistent cache first if available
          if (cacheDir && !isStale) {
            fileData = await loadCachedFile(cacheDir, npub, fileSha256);
            if (fileData) {
              log.debug(`Loaded ${tryFile.path} from disk cache`);
              successfulFile = tryFile;
              successfulCompression = fileOption.compressed;
              successfulCompressionType = fileOption.type;
              if (fileOption.compressed) {
                console.log(colors.gray(`  → Using ${fileOption.type} compressed version: ${tryFile.path}`));
              }
              break;
            }
          }
          
          // Check memory cache if no persistent cache or file not found
          if (!fileData && !isStale) {
            const memCached = fileCache.get(cacheKey);
            if (memCached) {
              fileData = memCached.data;
              log.debug(`Loaded ${tryFile.path} from memory cache`);
              successfulFile = tryFile;
              successfulCompression = fileOption.compressed;
              successfulCompressionType = fileOption.type;
              if (fileOption.compressed) {
                console.log(colors.gray(`  → Using ${fileOption.type} compressed version: ${tryFile.path}`));
              }
              break;
            }
          }
          
          // Try to download the file
          console.log(colors.gray(`  → Downloading ${colors.cyan(tryFile.path)}...${isStale ? ' (updated)' : ''}`));
          
          let downloaded = false;
          for (const server of servers) {
            try {
              const downloadService = DownloadService.create();
              const downloadedData = await downloadService.downloadFromServer(server, fileSha256);
              if (downloadedData) {
                fileData = downloadedData;
                
                // Save to memory cache (no expiration - only invalidated by new events)
                fileCache.set(cacheKey, {
                  data: fileData,
                  timestamp: Date.now(),
                  sha256: fileSha256,
                });
                
                // Save to disk cache if available
                if (cacheDir) {
                  await saveCachedFile(cacheDir, npub, fileSha256, fileData);
                  log.debug(`Saved ${tryFile.path} to disk cache`);
                }

                console.log(colors.gray(`  → Downloaded from ${server}`));
                downloaded = true;
                successfulFile = tryFile;
                successfulCompression = fileOption.compressed;
                successfulCompressionType = fileOption.type;
                break;
              }
            } catch (error) {
              log.debug(`Failed to download from ${server}: ${error}`);
            }
          }
          
          if (downloaded) {
            if (fileOption.compressed) {
              console.log(colors.gray(`  → Using ${fileOption.type} compressed version: ${tryFile.path}`));
            }
            break;
          } else {
            console.log(colors.yellow(`  → Failed to download ${tryFile.path}, trying next option...`));
          }
        }
        
        if (!fileData || !successfulFile) {
          const elapsed = Math.round(performance.now() - startTime);
          console.log(colors.red(`  → Failed to download any version of the file - ${elapsed}ms`));
          return new Response("Failed to download file from any server", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
        
        // Update variables for serving
        file = successfulFile;
        isCompressed = successfulCompression;
        compressionType = successfulCompressionType;
        
        // Serve the file
        // For 404 pages, use the 404.html content type, otherwise use the requested path
        const is404 = (file.path.endsWith("404.html") || file.path.endsWith("404.html.br") || file.path.endsWith("404.html.gz")) && 
                      requestedPath !== "/404.html";
        const contentTypePath = is404 ? "404.html" : normalizedRequestPath;
        const contentType = getContentType(contentTypePath);
        const elapsed = Math.round(performance.now() - startTime);
        const statusCode = is404 ? 404 : 200;
        
        console.log(colors.gray(`  → Served ${colors.cyan(file.path)} (${formatFileSize(fileData.byteLength)}) - ${elapsed}ms${is404 ? ' [404]' : ''}`));
        
        const headers: Record<string, string> = {
          "Content-Type": contentType,
          "Content-Length": fileData.byteLength.toString(),
          "Cache-Control": "public, max-age=3600", // Browser can cache for 1 hour
        };
        
        // Add Content-Encoding header if serving compressed version
        if (isCompressed && compressionType) {
          headers["Content-Encoding"] = compressionType;
          headers["Vary"] = "Accept-Encoding"; // Important for caching
        }
        
        return new Response(fileData, {
          status: statusCode,
          headers,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Error handling request: ${errorMessage}`);

        const elapsed = Math.round(performance.now() - startTime);
        console.log(colors.red(`  → Error: ${errorMessage} - ${elapsed}ms`));

        return new Response(`Error: ${errorMessage}`, {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }
    };

    // Start server using Deno.serve
    await Deno.serve({ port }, handler).finished;
  } catch (error: unknown) {
    handleError("Error running resolver server", error, {
      exit: true,
      showConsole: true,
      logger: log,
    });
  }
}

/**
 * Generate loading page
 */
function generateLoadingPage(npub: string, profile: any, isUpdating: boolean = false): string {
  const profileContent = profile ? JSON.parse(profile.content || "{}") : {};
  const name = profileContent.name || profileContent.display_name || npub.slice(0, 12) + "...";

  return `<!DOCTYPE html>
<html>
<head>
  <title>Loading ${name}'s nsite...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #fafafa;
      color: #333;
    }
    .container {
      text-align: center;
      max-width: 400px;
      padding: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 400;
      margin-bottom: 1rem;
      color: #555;
    }
    .npub {
      font-family: monospace;
      font-size: 0.875rem;
      color: #999;
      word-break: break-all;
      margin-bottom: 2rem;
    }
    .loader {
      width: 40px;
      height: 40px;
      margin: 0 auto 2rem;
      border: 3px solid #e0e0e0;
      border-top-color: #666;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status {
      font-size: 0.875rem;
      color: #666;
      line-height: 1.5;
    }
    .profile-pic {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      margin: 0 auto 1rem;
      background: #e0e0e0;
      overflow: hidden;
    }
    .profile-pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
</head>
<body>
  <div class="container">
    ${
    profileContent.picture
      ? `<div class="profile-pic"><img src="${profileContent.picture}" alt="${name}" onerror="this.style.display='none'"></div>`
      : ""
  }
    <h1>${isUpdating ? "Updating" : "Loading"} ${name}'s nsite</h1>
    <div class="npub">${npub}</div>
    <div class="loader"></div>
    <div class="status">
      ${isUpdating ? "Checking for new content..." : "Connecting to nostr relays..."}<br>
      This will only take a moment.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate HTML directory listing
 */
function generateDirectoryListing(npub: string, files: any[]): string {
  const fileList = files.map((file) => {
    const size = file.size ? formatFileSize(file.size) : "unknown";
    return `<li><a href="/${file.path}">${file.path}</a> (${size})</li>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <title>nsite: ${npub}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #333; }
    ul { list-style: none; padding: 0; }
    li { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .info { background: #f0f0f0; padding: 1rem; border-radius: 4px; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <h1>nsite: ${npub}</h1>
  <div class="info">
    <strong>Files:</strong> ${files.length}<br>
    <strong>Total size:</strong> ${formatFileSize(files.reduce((sum, f) => sum + (f.size || 0), 0))}
  </div>
  <ul>
    ${fileList || "<li>No files found</li>"}
  </ul>
</body>
</html>`;
}

/**
 * Get content type based on file extension
 */
function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    txt: "text/plain",
    md: "text/markdown",
    pdf: "application/pdf",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
  };

  return types[ext || ""] || "application/octet-stream";
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Load cached file from disk
 */
async function loadCachedFile(
  cacheDir: string | null,
  npub: string,
  sha256: string,
): Promise<Uint8Array | null> {
  if (!cacheDir) return null;
  try {
    const filePath = join(cacheDir, npub, sha256);
    const data = await Deno.readFile(filePath);
    return data;
  } catch {
    return null;
  }
}

/**
 * Save file to disk cache
 */
async function saveCachedFile(
  cacheDir: string | null,
  npub: string,
  sha256: string,
  data: Uint8Array,
): Promise<void> {
  if (!cacheDir) return;
  const dirPath = join(cacheDir, npub);
  await ensureDir(dirPath);
  const filePath = join(dirPath, sha256);
  await Deno.writeFile(filePath, data);
}

/**
 * Check if cached file is stale based on event timestamps
 */
function isCacheStale(fileListEntry: any, file: FileEntry): boolean {
  if (!fileListEntry.eventTimestamps || !file.event) {
    return false;
  }

  const cachedEventTime = fileListEntry.eventTimestamps.get(file.path);
  const currentEventTime = file.event.created_at;

  return cachedEventTime !== undefined && currentEventTime > cachedEventTime;
}

/**
 * Open browser with the given URL (cross-platform)
 */
async function openBrowser(url: string): Promise<void> {
  try {
    const os = Deno.build.os;
    let cmd: string[];

    switch (os) {
      case "darwin": // macOS
        cmd = ["open", url];
        break;
      case "windows":
        cmd = ["cmd", "/c", "start", url];
        break;
      case "linux":
        // Try xdg-open first, then fallback to other options
        cmd = ["xdg-open", url];
        break;
      default:
        console.log(
          colors.yellow(`⚠️  Cannot auto-open browser on ${os}. Please manually open: ${url}`),
        );
        return;
    }

    const command = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: "null",
      stderr: "null",
    });

    const { success } = await command.output();

    if (success) {
      console.log(colors.green(`🌐 Browser opened automatically`));
    } else if (os === "linux") {
      // Try alternative Linux browsers
      const alternatives = [
        ["firefox", url],
        ["google-chrome", url],
        ["chromium-browser", url],
        ["sensible-browser", url],
      ];

      for (const alt of alternatives) {
        try {
          const altCmd = new Deno.Command(alt[0], {
            args: alt.slice(1),
            stdout: "null",
            stderr: "null",
          });
          const result = await altCmd.output();
          if (result.success) {
            console.log(colors.green(`🌐 Browser opened with ${alt[0]}`));
            return;
          }
        } catch {
          // Try next alternative
        }
      }

      console.log(colors.yellow(`⚠️  Could not auto-open browser. Please manually open: ${url}`));
    }
  } catch (error) {
    log.debug(`Failed to open browser: ${error}`);
    console.log(colors.yellow(`⚠️  Could not auto-open browser. Please manually open: ${url}`));
  }
}
