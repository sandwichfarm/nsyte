import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
// Using Deno.serve instead of importing serve
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { resolveRelays, resolveServers, type ResolverOptions } from "../lib/resolver-utils.ts";
import { listRemoteFiles, fetchProfileEvent, fetchRelayListEvent, type FileEntry, pool, USER_BLOSSOM_SERVER_LIST_KIND } from "../lib/nostr.ts";
import { fetchServerListEvents } from "../lib/debug-helpers.ts";
import { extractRelaysFromEvent, extractServersFromEvent } from "../lib/utils.ts";
import { decode } from "nostr-tools/nip19";
import { normalizeToPubkey } from "applesauce-core/helpers";
import { DownloadService } from "../lib/download.ts";
import { decompress as brotliDecompress } from "jsr:@nick/brotli@0.1.0";
import { readProjectFile } from "../lib/config.ts";
import type { ByteArray } from "../lib/types.ts";

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
    .description("Run a resolver server that serves nsites via npub subdomains. Optionally specify an npub to launch instead of default.")
    .arguments("[npub:string]")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-p, --port <port:number>", "Port number for the resolver server.", { default: 6798 })
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("--nbunksec <nbunksec:string>", "The nbunksec string to use for authentication.")
    .option("-c, --cache-dir <dir:string>", "Directory to cache downloaded files (uses temp dir if not specified)")
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
    const profileCache = new Map<string, { profile: any; relayList: any; serverList: string[]; timestamp: number }>();
    const fileListCache = new Map<string, { files: FileEntry[]; timestamp: number; loading?: boolean; eventTimestamps?: Map<string, number> }>();
    const fileCache = new Map<string, { data: ByteArray; timestamp: number; sha256: string }>();
    
    // Track when specific paths have been updated
    const pathUpdateTimestamps = new Map<string, number>();
    const CACHE_TTL = 600000; // 10 minutes cache for profile data only
    // No longer using time-based intervals for file cache - check for updates on each request
    
    // Track ongoing background update checks to prevent duplicates
    const backgroundUpdateChecks = new Map<string, Promise<void>>();

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
            "Cache-Control": "no-cache"
          }
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
        
        // Update check endpoint
        if (requestedPath === "/_nsyte/check-updates") {
          const path = url.searchParams.get("path");
          const since = parseInt(url.searchParams.get("since") || "0");
          
          if (!path) {
            return new Response(JSON.stringify({ error: "Missing path parameter" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          
          const updateKey = `${npub}:${path}`;
          const lastUpdate = pathUpdateTimestamps.get(updateKey) || 0;
          const hasUpdate = lastUpdate > since;
          
          return new Response(JSON.stringify({ hasUpdate, timestamp: lastUpdate }), {
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              "Cache-Control": "no-cache"
            },
          });
        }

        log.debug(`Request: ${hostname}${requestedPath} -> npub: ${npub}`);
        
        // Log successful npub resolution to console
        console.log(colors.green(`✓ Resolved ${colors.cyan(npub)} → ${colors.gray(requestedPath)}`));
        
        // Check profile cache
        let profileData = profileCache.get(npub);
        if (!profileData || Date.now() - profileData.timestamp > CACHE_TTL) {
          // Fetch profile and relay list
          console.log(colors.gray(`  → Fetching profile data for ${npub}...`));
          
          try {
            const [profile, relayList] = await Promise.all([
              fetchProfileEvent(profileRelays, pubkeyHex),
              fetchRelayListEvent(profileRelays, pubkeyHex),
            ]);
            
            // Extract user's relays from relay list
            const userRelays = extractRelaysFromEvent(relayList);
            if (userRelays.length > 0) {
              log.debug(`Found ${userRelays.length} relays from user's relay list: ${userRelays.join(", ")}`);
            }
            
            // Fetch server list from the user's configured relays
            const relaysToUse = userRelays.length > 0 ? userRelays : profileRelays;
            log.debug(`Fetching server list (Kind ${USER_BLOSSOM_SERVER_LIST_KIND}) for ${pubkeyHex} from relays: ${relaysToUse.join(", ")}`);
            const serverListEvents = await fetchServerListEvents(
              pool,
              relaysToUse,
              pubkeyHex
            );
            
            const serverList = serverListEvents && serverListEvents.length > 0 
              ? extractServersFromEvent(serverListEvents[0])
              : [];
            
            if (serverList.length > 0) {
              log.debug(`Found ${serverList.length} servers from server list event`);
              console.log(colors.gray(`  → Found server list with ${serverList.length} servers`));
            } else {
              log.debug("No server list event found");
              console.log(colors.gray(`  → No server list found`));
            }
            
            profileData = { profile, relayList, serverList, timestamp: Date.now() };
            profileCache.set(npub, profileData);
            
            if (profile) {
              try {
                const profileContent = JSON.parse(profile.content || "{}");
                console.log(colors.gray(`  → Profile: ${profileContent.name || profileContent.display_name || "Unknown"}`));
              } catch (e) {
                console.log(colors.gray(`  → Profile data found but could not parse`));
              }
            } else {
              console.log(colors.gray(`  → No profile found (user may not have set one)`));
            }
            
            if (relayList) {
              console.log(colors.gray(`  → Found relay list with ${relayList.tags.filter(t => t[0] === 'r').length} relays`));
            }
          } catch (error) {
            console.log(colors.yellow(`  → Could not fetch profile data: ${error}`));
            profileData = { profile: null, relayList: null, serverList: [], timestamp: Date.now() };
            profileCache.set(npub, profileData);
          }
        }
        
        // Get or fetch file list
        let fileListEntry = fileListCache.get(npub);
        
        // If we have no in-memory cache, try to load from disk first
        if (!fileListEntry && cacheDir) {
          console.log(colors.gray(`  → Checking disk cache for ${npub}...`));
          const diskCache = await loadFileListFromDiskCache(cacheDir, npub);
          if (diskCache) {
            fileListEntry = {
              files: diskCache.files,
              timestamp: Date.now(),
              loading: false,
              eventTimestamps: diskCache.eventTimestamps
            };
            fileListCache.set(npub, fileListEntry);
            console.log(colors.gray(`  → Loaded ${diskCache.files.length} files from disk cache`));
          } else {
            console.log(colors.gray(`  → No manifest.json found in disk cache (will fetch file list)`));
          }
        }
        
        // If we still have no cache at all, we need to load first
        if (!fileListEntry) {
          // For non-HTML requests when there's no cache, return 404
          // But allow directory paths that might have index files
          const mightBeHtml = requestedPath === "/" || 
                             requestedPath.endsWith(".html") || 
                             requestedPath.endsWith(".htm") ||
                             requestedPath.endsWith("/") ||
                             !requestedPath.includes(".");
          
          if (!mightBeHtml) {
            const elapsed = Math.round(performance.now() - startTime);
            console.log(colors.yellow(`  → File not found (no cache) - ${elapsed}ms`));
            return new Response("File not found", {
              status: 404,
              headers: { "Content-Type": "text/plain" },
            });
          }
          
          // Start loading file list
          fileListCache.set(npub, { files: [], timestamp: Date.now(), loading: true });
          
          (async () => {
            try {
              console.log(colors.gray(`  → Fetching file list...`));
              const files = await listRemoteFiles(relays, pubkeyHex);
              
              // Track event timestamps for cache invalidation
              const eventTimestamps = new Map<string, number>();
              files.forEach(file => {
                if (file.event) {
                  eventTimestamps.set(file.path, file.event.created_at);
                }
              });
              
              // Only cache if we got files
              if (files.length > 0) {
                fileListCache.set(npub, { files, timestamp: Date.now(), loading: false, eventTimestamps });
                console.log(colors.gray(`  → Found ${files.length} files`));
                // Save to disk cache
                await saveFileListManifest(cacheDir, npub, files, eventTimestamps);
              } else {
                // Remove the loading entry if we got no files
                fileListCache.delete(npub);
                console.log(colors.yellow(`  → No files found (removed from cache)`));
              }
            } catch (error) {
              console.log(colors.red(`  → Failed to fetch file list: ${error}`));
              // Remove the loading entry on error
              fileListCache.delete(npub);
            }
          })();
          
          // Return loading page only for first-time load
          const loadingHtml = generateLoadingPage(npub, profileData?.profile);
          const elapsed = Math.round(performance.now() - startTime);
          console.log(colors.blue(`  → Loading page served (first visit) - ${elapsed}ms`));
          return new Response(loadingHtml, {
            status: 200,
            headers: { 
              "Content-Type": "text/html",
              "Refresh": "2" // Auto-refresh every 2 seconds
            },
          });
        }
        
        // If we have cached content, serve it immediately and check for updates in the background
        if (fileListEntry && !fileListEntry.loading && fileListEntry.files.length > 0) {
          // Check if there's already a background update in progress for this npub
          if (!backgroundUpdateChecks.has(npub)) {
            // Start background update check (non-blocking)
            const updatePromise = (async () => {
            try {
              console.log(colors.gray(`  → Checking for updates in background...`));
              const files = await listRemoteFiles(relays, pubkeyHex);

              // Track event timestamps for cache invalidation
              const newEventTimestamps = new Map<string, number>();
              files.forEach(file => {
                if (file.event) {
                  newEventTimestamps.set(file.path, file.event.created_at);
                }
              });

              // Check if any files have been updated
              let hasUpdates = false;
              let currentPathAffected = false;
              
              if (fileListEntry.eventTimestamps) {
                // Check for new or updated files
                for (const [path, newTimestamp] of newEventTimestamps) {
                  const oldTimestamp = fileListEntry.eventTimestamps.get(path);
                  if (!oldTimestamp || newTimestamp > oldTimestamp) {
                    hasUpdates = true;
                    console.log(colors.yellow(`  → Updated: ${path}`));
                    // Check if this affects the current request path
                    if (requestedPath === "/" || path === requestedPath.slice(1) || 
                        (requestedPath.endsWith("/") && path.startsWith(requestedPath.slice(1)))) {
                      currentPathAffected = true;
                    }
                  }
                }

                // Check for deleted files
                if (!hasUpdates) {
                  for (const [path] of fileListEntry.eventTimestamps) {
                    if (!newEventTimestamps.has(path)) {
                      hasUpdates = true;
                      console.log(colors.yellow(`  → Removed: ${path}`));
                      // Check if this affects the current request path
                      if (requestedPath === "/" || path === requestedPath.slice(1) || 
                          (requestedPath.endsWith("/") && path.startsWith(requestedPath.slice(1)))) {
                        currentPathAffected = true;
                      }
                    }
                  }
                }
              }

              // Only update cache if we got files or if we're sure the site has no files
              // Don't overwrite cache with empty results from timeouts
              if (hasUpdates && files.length > 0) {
                fileListCache.set(npub, { files, timestamp: Date.now(), loading: false, eventTimestamps: newEventTimestamps });
                console.log(colors.gray(`  → Found ${files.length} files (cache updated)`));
                // Save to disk cache
                await saveFileListManifest(cacheDir, npub, files, newEventTimestamps);
                
                if (currentPathAffected) {
                  console.log(colors.yellow(`  → Current path affected by updates, client should refresh`));
                  // Mark this path as updated
                  pathUpdateTimestamps.set(`${npub}:${requestedPath}`, Date.now());
                }
              } else if (files.length === 0) {
                console.log(colors.gray(`  → No files returned (keeping existing cache)`));
              } else {
                console.log(colors.gray(`  → No updates found (${files.length} files)`));
              }
            } catch (error) {
              console.log(colors.red(`  → Background update check failed: ${error}`));
            } finally {
              // Remove from ongoing checks
              backgroundUpdateChecks.delete(npub);
            }
            })();
            
            // Track this background check
            backgroundUpdateChecks.set(npub, updatePromise);
          }
        }

        // At this point, fileListEntry should be defined
        if (!fileListEntry) {
          const elapsed = Math.round(performance.now() - startTime);
          console.log(colors.red(`  → Internal error: file list entry is undefined - ${elapsed}ms`));
          return new Response("Internal server error", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
        
        if (fileListEntry.files.length === 0) {
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
        let rootIsCompressed = false;
        let rootCompressionType: "br" | "gz" | null = null;
        
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
            "docs/404.html"
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
            const file = fileListEntry.files.find(f => {
              const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedPath === possibleFile;
            });
            
            if (file) {
              foundFile = file;
              // Check if this is a compressed version
              if (possibleFile.endsWith(".br")) {
                targetPath = "/" + possibleFile.slice(0, -3); // Remove .br extension
                rootIsCompressed = true;
                rootCompressionType = "br";
              } else if (possibleFile.endsWith(".gz")) {
                targetPath = "/" + possibleFile.slice(0, -3); // Remove .gz extension
                rootIsCompressed = true;
                rootCompressionType = "gz";
              } else {
                targetPath = "/" + possibleFile;
              }
              break;
            }
          }
          
          // If still root, show directory listing
          if (targetPath === "/") {
            const html = generateDirectoryListing(npub, fileListEntry.files);
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
          // But we should still add all available versions for fallback
          
          // First add the one we found
          filesToTry.push({file, compressed: rootIsCompressed, type: rootCompressionType});
          
          // Then add other versions as fallbacks
          // Extract the base path without compression extension
          let basePath = targetPath.startsWith("/") ? targetPath.slice(1) : targetPath;
          
          // Add other compressed versions if they exist and weren't already added
          if (rootCompressionType !== "br" && supportsBrotli) {
            const brPath = basePath + ".br";
            const brFile = fileListEntry.files.find(f => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === brPath;
            });
            
            if (brFile && brFile !== file) {
              filesToTry.push({file: brFile, compressed: true, type: "br"});
              log.debug(`Added alternative brotli version: ${brPath}`);
            }
          }
          
          if (rootCompressionType !== "gz" && supportsGzip) {
            const gzPath = basePath + ".gz";
            const gzFile = fileListEntry.files.find(f => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === gzPath;
            });
            
            if (gzFile && gzFile !== file) {
              filesToTry.push({file: gzFile, compressed: true, type: "gz"});
              log.debug(`Added alternative gzip version: ${gzPath}`);
            }
          }
          
          // Add uncompressed version if we started with compressed
          if (rootIsCompressed) {
            const uncompressedFile = fileListEntry.files.find(f => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === basePath;
            });
            
            if (uncompressedFile && uncompressedFile !== file) {
              filesToTry.push({file: uncompressedFile, compressed: false, type: null});
              log.debug(`Added uncompressed fallback: ${basePath}`);
            }
          }
        }
        
        // If path ends with / or looks like a directory (no extension), try directory index files
        if (filesToTry.length === 0 && (requestedPath.endsWith("/") || !requestedPath.includes("."))) {
          const dirPath = requestedPath.endsWith("/") ? normalizedRequestPath : normalizedRequestPath + "/";
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
          const notFoundFile = fileListEntry.files.find(f => {
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
        let fileData: ByteArray | null = null;
        let successfulFile: FileEntry | null = null;
        
        for (const fileOption of filesToTry) {
          if (!fileOption.file || !fileOption.file.sha256) continue;
          
          const tryFile = fileOption.file;
          const fileSha256 = tryFile.sha256!; // We already checked this is not undefined
          // Use different cache keys for compressed vs decompressed content
          const rawCacheKey = `${npub}-${fileSha256}-raw`;
          const decompressedCacheKey = `${npub}-${fileSha256}-decompressed`;
          const isStale = isCacheStale(fileListEntry, tryFile);
          
          let currentFileData: ByteArray | null = null;
          let isAlreadyDecompressed = false;
          
          // For compressed files, check if we have a decompressed version cached
          if (fileOption.compressed && !isStale) {
            // Try decompressed cache first (memory)
            const memCachedDecompressed = fileCache.get(decompressedCacheKey);
            if (memCachedDecompressed) {
              currentFileData = memCachedDecompressed.data;
              isAlreadyDecompressed = true;
              log.debug(`Loaded decompressed ${tryFile.path} from memory cache`);
            }
            
            // Try decompressed cache (disk)
            if (!currentFileData && cacheDir) {
              currentFileData = await loadCachedFile(cacheDir, npub, fileSha256 + "-decompressed");
              if (currentFileData) {
                isAlreadyDecompressed = true;
                log.debug(`Loaded decompressed ${tryFile.path} from disk cache`);
              }
            }
          }
          
          // If no decompressed version, try raw cache
          if (!currentFileData && !isStale) {
            // Try persistent cache first if available
            if (cacheDir) {
              currentFileData = await loadCachedFile(cacheDir, npub, fileSha256);
              if (currentFileData) {
                log.debug(`Loaded raw ${tryFile.path} from disk cache`);
              }
            }
            
            // Check memory cache if no persistent cache or file not found
            if (!currentFileData) {
              const memCached = fileCache.get(rawCacheKey);
              if (memCached) {
                currentFileData = memCached.data;
                log.debug(`Loaded raw ${tryFile.path} from memory cache`);
              }
            }
          }
          
          // Try to download the file if not in cache
          if (!currentFileData) {
            console.log(colors.gray(`  → Downloading ${colors.cyan(tryFile.path)}...${isStale ? ' (updated)' : ''}`));
            
            // Use servers from profile data if available, otherwise fall back to configured servers
            const userServers = profileData?.serverList && profileData.serverList.length > 0 
              ? profileData.serverList 
              : servers;
            
            log.debug(`Using ${userServers.length} servers for download: ${userServers.join(", ")}`);
            
            for (const server of userServers) {
              try {
                log.debug(`Attempting download from ${server} for hash ${fileSha256}`);
                const downloadService = DownloadService.create();
                const downloadedData = await downloadService.downloadFromServer(server, fileSha256);
                if (downloadedData) {
                  currentFileData = downloadedData;
                  
                  // Save raw file to memory cache (no expiration - only invalidated by new events)
                  fileCache.set(rawCacheKey, { data: currentFileData, timestamp: Date.now(), sha256: fileSha256 });
                  
                  // Save raw file to disk cache if available
                  if (cacheDir) {
                    await saveCachedFile(cacheDir, npub, fileSha256, currentFileData);
                    log.debug(`Saved raw ${tryFile.path} to disk cache`);
                  }
                  
                  console.log(colors.gray(`  → Downloaded from ${server}`));
                  break;
                } else {
                  log.debug(`Server ${server} returned no data for hash ${fileSha256}`);
                }
              } catch (error) {
                log.debug(`Failed to download from ${server}: ${error}`);
              }
            }
            
            if (!currentFileData) {
              console.log(colors.gray(`  → Could not download ${tryFile.path} from ${userServers.length} servers, trying alternative formats...`));
              log.debug(`Failed to download ${tryFile.path} from any of: ${userServers.join(", ")}`);
              continue;
            }
          }
          
          // Now we have the file data, try to decompress if needed
          if (fileOption.compressed && fileOption.type && currentFileData && !isAlreadyDecompressed) {
            if (fileOption.type === "br") {
              // Decompress Brotli
              try {
                const decompressed = brotliDecompress(currentFileData) as ByteArray;
                console.log(colors.gray(`  → Decompressed Brotli data: ${formatFileSize(decompressed.byteLength)}`));
                fileData = decompressed;
                successfulFile = tryFile;
                
                // Cache the decompressed version
                fileCache.set(decompressedCacheKey, { data: decompressed, timestamp: Date.now(), sha256: fileSha256 });
                if (cacheDir) {
                  await saveCachedFile(cacheDir, npub, fileSha256 + "-decompressed", decompressed);
                  log.debug(`Saved decompressed ${tryFile.path} to disk cache`);
                }
                
                // Successfully decompressed
                break; // Success!
              } catch (brError) {
                log.debug(`Brotli decompression error: ${brError}`);
                console.log(colors.gray(`  → Brotli version corrupted, trying alternative formats...`));
                // Clear the failed file from cache to prevent repeated failures
                fileCache.delete(rawCacheKey);
                fileCache.delete(decompressedCacheKey);
                continue; // Try next option
              }
            } else if (fileOption.type === "gz") {
              // Decompress Gzip
              try {
                const decompressed = await new Response(
                  new Response(currentFileData).body!.pipeThrough(new DecompressionStream("gzip"))
                ).arrayBuffer();
                fileData = new Uint8Array(decompressed);
                console.log(colors.gray(`  → Decompressed Gzip data: ${formatFileSize(fileData.byteLength)}`));
                successfulFile = tryFile;
                
                // Cache the decompressed version
                fileCache.set(decompressedCacheKey, { data: fileData, timestamp: Date.now(), sha256: fileSha256 });
                if (cacheDir) {
                  await saveCachedFile(cacheDir, npub, fileSha256 + "-decompressed", fileData);
                  log.debug(`Saved decompressed ${tryFile.path} to disk cache`);
                }
                
                // Successfully decompressed
                break; // Success!
              } catch (gzError) {
                log.debug(`Gzip decompression error: ${gzError}`);
                console.log(colors.gray(`  → Gzip version corrupted, trying alternative formats...`));
                // Clear the failed file from cache to prevent repeated failures
                fileCache.delete(rawCacheKey);
                fileCache.delete(decompressedCacheKey);
                continue; // Try next option
              }
            }
          } else if (isAlreadyDecompressed) {
            // Already decompressed, use as-is
            fileData = currentFileData;
            successfulFile = tryFile;
            log.debug(`Using cached decompressed data for ${tryFile.path}`);
            break; // Success!
          } else {
            // Uncompressed file, use as-is
            fileData = currentFileData;
            successfulFile = tryFile;
            // Uncompressed file
            break; // Success!
          }
        }
        
        if (!fileData || !successfulFile) {
          const elapsed = Math.round(performance.now() - startTime);
          const userServers = profileData?.serverList && profileData.serverList.length > 0 
            ? profileData.serverList 
            : servers;
          console.log(colors.red(`  → Failed to download any version of the file - ${elapsed}ms`));
          log.debug(`No servers had the requested file. Servers tried: ${userServers.join(", ")}`);
          return new Response(`Failed to download file from any server. Tried servers: ${userServers.join(", ")}`, {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
        
        // Update variables for serving
        file = successfulFile;
        
        // Serve the file
        // For 404 pages, use the 404.html content type, otherwise use the target path (without .br/.gz)
        const is404 = (file.path.endsWith("404.html") || file.path.endsWith("404.html.br") || file.path.endsWith("404.html.gz")) && 
                      requestedPath !== "/404.html";
        // Use original path (without compression extension) for content type detection
        let contentTypePath: string;
        if (is404) {
          contentTypePath = "404.html";
        } else {
          // Use the actual file path for content type detection
          let originalPath = file.path.startsWith("/") ? file.path.slice(1) : file.path;
          // Remove compression extensions if present
          if (originalPath.endsWith(".br")) {
            originalPath = originalPath.slice(0, -3);
          } else if (originalPath.endsWith(".gz")) {
            originalPath = originalPath.slice(0, -3);
          }
          contentTypePath = originalPath;
        }
        const contentType = getContentType(contentTypePath);
        console.log(colors.yellow(`  → DEBUG: file.path=${file.path}, contentTypePath=${contentTypePath}, contentType=${contentType}`));
        const elapsed = Math.round(performance.now() - startTime);
        const statusCode = is404 ? 404 : 200;
        
        const servedPath = file.path.replace(/\.(br|gz)$/, '');
        console.log(colors.gray(`  → Served ${colors.cyan(servedPath)} (${formatFileSize(fileData.byteLength)}) - ${elapsed}ms${is404 ? ' [404]' : ''}`));
        
        const headers: Record<string, string> = {
          "Content-Type": contentType,
          "Content-Length": fileData.byteLength.toString(),
          "Cache-Control": "public, max-age=3600", // Browser can cache for 1 hour
        };
        
        // No need for Content-Encoding since we're serving decompressed data
        console.log(colors.blue(`  → Headers: Content-Type: ${contentType}`));
        
        // For HTML responses, inject auto-refresh script
        if (contentType === "text/html" && !is404) {
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          let html = decoder.decode(fileData);
          
          // Inject update checker script before closing body tag
          const updateScript = `
<script>
(function() {
  const currentPath = '${requestedPath}';
  const npub = '${npub}';
  const startTime = Date.now();
  
  function checkForUpdates() {
    fetch('/_nsyte/check-updates?path=' + encodeURIComponent(currentPath) + '&since=' + startTime)
      .then(r => r.json())
      .then(data => {
        if (data.hasUpdate) {
          console.log('Page update detected, refreshing...');
          location.reload();
        }
      })
      .catch(err => console.error('Update check failed:', err));
  }
  
  // Check for updates every 5 seconds
  setInterval(checkForUpdates, 5000);
})();
</script>`;
          
          // Try to inject before closing body tag, or at the end if not found
          if (html.includes('</body>')) {
            html = html.replace('</body>', updateScript + '</body>');
          } else if (html.includes('</html>')) {
            html = html.replace('</html>', updateScript + '</html>');
          } else {
            html += updateScript;
          }
          
          fileData = encoder.encode(html);
          headers["Content-Length"] = fileData.byteLength.toString();
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
    
    // Set up cleanup handlers
    const cleanup = () => {
      console.log(colors.yellow("\n🛑 Shutting down server..."));
      // Clear all background checks
      backgroundUpdateChecks.clear();
      Deno.exit(0);
    };
    
    // Handle graceful shutdown
    Deno.addSignalListener("SIGINT", cleanup);
    Deno.addSignalListener("SIGTERM", cleanup);

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
function generateLoadingPage(npub: string, profile: any): string {
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
    ${profileContent.picture ? `<div class="profile-pic"><img src="${profileContent.picture}" alt="${name}" onerror="this.style.display='none'"></div>` : ''}
    <h1>Loading ${name}'s nsite</h1>
    <div class="npub">${npub}</div>
    <div class="loader"></div>
    <div class="status">
      Connecting to nostr relays...<br>
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
  const lastDotIndex = filename.lastIndexOf(".");
  const ext = lastDotIndex !== -1 ? filename.slice(lastDotIndex + 1).toLowerCase() : "";
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
async function loadCachedFile(cacheDir: string | null, npub: string, sha256: string): Promise<ByteArray | null> {
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
async function saveCachedFile(cacheDir: string | null, npub: string, sha256: string, data: ByteArray): Promise<void> {
  if (!cacheDir) return;
  const dirPath = join(cacheDir, npub);
  await ensureDir(dirPath);
  const filePath = join(dirPath, sha256);
  await Deno.writeFile(filePath, data);
}

/**
 * Save file list manifest to disk cache
 */
async function saveFileListManifest(cacheDir: string | null, npub: string, files: FileEntry[], eventTimestamps?: Map<string, number>): Promise<void> {
  if (!cacheDir) return;
  
  const dirPath = join(cacheDir, npub);
  await ensureDir(dirPath);
  const manifestPath = join(dirPath, "manifest.json");
  
  const manifest = {
    files,
    eventTimestamps: eventTimestamps ? Object.fromEntries(eventTimestamps) : {},
    timestamp: Date.now()
  };
  
  await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
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
 * Load file list from disk cache if available
 */
async function loadFileListFromDiskCache(cacheDir: string | null, npub: string): Promise<{ files: FileEntry[], eventTimestamps: Map<string, number> } | null> {
  if (!cacheDir) return null;
  
  try {
    const manifestPath = join(cacheDir, npub, "manifest.json");
    const manifestData = await Deno.readTextFile(manifestPath);
    const manifest = JSON.parse(manifestData);
    
    // Convert back to FileEntry format
    const files: FileEntry[] = manifest.files || [];
    if (files.length === 0) return null;
    
    // Reconstruct event timestamps Map
    const eventTimestamps = new Map<string, number>();
    if (manifest.eventTimestamps) {
      Object.entries(manifest.eventTimestamps).forEach(([path, timestamp]) => {
        eventTimestamps.set(path, timestamp as number);
      });
    }
    
    return { files, eventTimestamps };
  } catch {
    // No manifest - for backward compatibility, return a minimal file list
    // This allows old caches to still work (they just won't have proper file metadata)
    console.log(colors.gray(`  → No manifest.json, using backward compatibility mode`));
    
    // We can't reconstruct the full file list from just the SHA256 files,
    // but we can at least indicate that this npub has cached content
    // The actual file resolution will happen when individual files are requested
    return null;
  }
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
        console.log(colors.yellow(`⚠️  Cannot auto-open browser on ${os}. Please manually open: ${url}`));
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
