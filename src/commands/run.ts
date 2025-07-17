import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
// Using Deno.serve instead of importing serve
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { resolveRelays, resolveServers, type ResolverOptions } from "../lib/resolver-utils.ts";
import { listRemoteFiles, fetchProfileEvent, fetchRelayListEvent, type FileEntry } from "../lib/nostr.ts";
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
    .description("Run a resolver server that serves nsites via npub subdomains. Optionally specify an npub to launch instead of default.")
    .arguments("[npub:string]")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-p, --port <port:number>", "Port number for the resolver server.", { default: 8080 })
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
    const port = options.port || 8080;
    
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
    const fileListCache = new Map<string, { files: FileEntry[]; timestamp: number; loading?: boolean; eventTimestamps?: Map<string, number> }>();
    const fileCache = new Map<string, { data: Uint8Array; timestamp: number; sha256: string }>();
    const CACHE_TTL = 600000; // 10 minutes cache
    const FILE_CACHE_TTL = usingPersistentCache ? 86400000 : 3600000; // 24 hours for persistent cache, 1 hour for memory

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
            
            profileData = { profile, relayList, timestamp: Date.now() };
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
            profileData = { profile: null, relayList: null, timestamp: Date.now() };
            profileCache.set(npub, profileData);
          }
        }
        
        // Get or fetch file list
        let fileListEntry = fileListCache.get(npub);
        
        // If we're loading file list for the first time, show loading page (only for HTML requests)
        if (!fileListEntry && (requestedPath === "/" || requestedPath.endsWith(".html") || requestedPath.endsWith(".htm"))) {
          // Start loading file list in background
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
              
              fileListCache.set(npub, { files, timestamp: Date.now(), loading: false, eventTimestamps });
              console.log(colors.gray(`  → Found ${files.length} files`));
            } catch (error) {
              console.log(colors.red(`  → Failed to fetch file list: ${error}`));
              fileListCache.set(npub, { files: [], timestamp: Date.now(), loading: false });
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
              "Refresh": "2" // Auto-refresh every 2 seconds
            },
          });
        }
        
        // If still loading, show loading page (only for HTML requests)
        if (fileListEntry?.loading) {
          // Only serve loading page for HTML files and root path
          if (requestedPath === "/" || requestedPath.endsWith(".html") || requestedPath.endsWith(".htm")) {
            const loadingHtml = generateLoadingPage(npub, profileData?.profile);
            const elapsed = Math.round(performance.now() - startTime);
            console.log(colors.blue(`  → Loading page served (still fetching) - ${elapsed}ms`));
            return new Response(loadingHtml, {
              status: 200,
              headers: { 
                "Content-Type": "text/html",
                "Refresh": "2"
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
        
        // Refresh file list if needed
        if (!fileListEntry || Date.now() - fileListEntry.timestamp > CACHE_TTL) {
          console.log(colors.gray(`  → Refreshing file list...`));
          const files = await listRemoteFiles(relays, pubkeyHex);
          
          // Track event timestamps for cache invalidation
          const eventTimestamps = new Map<string, number>();
          files.forEach(file => {
            if (file.event) {
              eventTimestamps.set(file.path, file.event.created_at);
            }
          });
          
          fileListEntry = { files, timestamp: Date.now(), loading: false, eventTimestamps };
          fileListCache.set(npub, fileListEntry);
          console.log(colors.gray(`  → Found ${files.length} files`));
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
          
          for (const defaultFile of defaultFiles) {
            const file = fileListEntry.files.find(f => {
              const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedPath === defaultFile;
            });
            
            if (file) {
              targetPath = "/" + defaultFile;
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
        let file = fileListEntry.files.find(f => {
          const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
          return normalizedFilePath === normalizedRequestPath;
        });
        
        // If path ends with / and file not found, try directory index files
        if (!file && requestedPath.endsWith("/")) {
          const dirPath = normalizedRequestPath;
          const indexFiles = ["index.html", "index.htm", "README.md"];
          
          for (const indexFile of indexFiles) {
            const indexPath = dirPath + indexFile;
            file = fileListEntry.files.find(f => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === indexPath;
            });
            
            if (file) {
              console.log(colors.gray(`  → Directory ${requestedPath} resolved to ${indexPath}`));
              break;
            }
          }
        }
        
        if (!file || !file.sha256) {
          // Try to find /404.html as fallback per nsite specification
          const notFoundFile = fileListEntry.files.find(f => {
            const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedPath === "404.html";
          });
          
          if (notFoundFile && notFoundFile.sha256) {
            // Serve the 404.html file
            console.log(colors.yellow(`  → File not found: ${requestedPath}, serving /404.html`));
            file = notFoundFile;
            // Continue processing to serve the 404.html file
          } else {
            // No 404.html available, return plain text error
            const elapsed = Math.round(performance.now() - startTime);
            console.log(colors.red(`  → File not found: ${requestedPath} (no 404.html) - ${elapsed}ms`));
            return new Response(`File not found: ${requestedPath}`, {
              status: 404,
              headers: { "Content-Type": "text/plain" },
            });
          }
        }
        
        // At this point, file is guaranteed to have sha256
        if (!file.sha256) {
          throw new Error("File sha256 is missing");
        }
        
        // Check file cache
        const cacheKey = `${npub}-${file.sha256}`;
        let fileData: Uint8Array | null = null;
        const isStale = isCacheStale(fileListEntry, file);
        
        // Try persistent cache first if available
        if (cacheDir && !isStale) {
          fileData = await loadCachedFile(cacheDir, npub, file.sha256);
          if (fileData) {
            log.debug(`Loaded ${file.path} from disk cache`);
          }
        }
        
        // Check memory cache if no persistent cache or file not found
        if (!fileData) {
          const memCached = fileCache.get(cacheKey);
          if (memCached && (!memCached.timestamp || Date.now() - memCached.timestamp < FILE_CACHE_TTL) && !isStale) {
            fileData = memCached.data;
            log.debug(`Loaded ${file.path} from memory cache`);
          }
        }
        
        // Download if not cached or stale
        if (!fileData || isStale) {
          console.log(colors.gray(`  → Downloading ${colors.cyan(file.path)}...${isStale ? ' (updated)' : ''}`));
          
          for (const server of servers) {
            try {
              const downloadService = DownloadService.create();
              const downloadedData = await downloadService.downloadFromServer(server, file.sha256);
              if (downloadedData) {
                fileData = downloadedData;
                
                // Save to memory cache
                fileCache.set(cacheKey, { data: fileData, timestamp: Date.now(), sha256: file.sha256 });
                
                // Save to disk cache if available
                if (cacheDir) {
                  await saveCachedFile(cacheDir, npub, file.sha256, fileData);
                  log.debug(`Saved ${file.path} to disk cache`);
                }
                
                console.log(colors.gray(`  → Downloaded from ${server}`));
                break;
              }
            } catch (error) {
              log.debug(`Failed to download from ${server}: ${error}`);
            }
          }
          
          if (!fileData) {
            const elapsed = Math.round(performance.now() - startTime);
            console.log(colors.red(`  → Failed to download file - ${elapsed}ms`));
            return new Response("Failed to download file from any server", {
              status: 500,
              headers: { "Content-Type": "text/plain" },
            });
          }
        }
        
        // Serve the file
        const contentType = getContentType(file.path);
        const elapsed = Math.round(performance.now() - startTime);
        
        // Check if we're serving a 404 page
        const is404 = file.path.endsWith("404.html") && requestedPath !== "/404.html";
        const statusCode = is404 ? 404 : 200;
        
        console.log(colors.gray(`  → Served ${colors.cyan(file.path)} (${formatFileSize(fileData.byteLength)}) - ${elapsed}ms${is404 ? ' [404]' : ''}`));
        
        return new Response(fileData, {
          status: statusCode,
          headers: {
            "Content-Type": contentType,
            "Content-Length": fileData.byteLength.toString(),
            "Cache-Control": "public, max-age=3600", // Browser can cache for 1 hour
          },
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
async function loadCachedFile(cacheDir: string | null, npub: string, sha256: string): Promise<Uint8Array | null> {
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
async function saveCachedFile(cacheDir: string | null, npub: string, sha256: string, data: Uint8Array): Promise<void> {
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