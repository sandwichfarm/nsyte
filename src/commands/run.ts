import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
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
}

/**
 * Register the run command
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a resolver server that serves nsites via npub subdomains")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-p, --port <port:number>", "Port number for the resolver server.", { default: 8080 })
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("--nbunksec <nbunksec:string>", "The nbunksec string to use for authentication.")
    .action(async (options: RunOptions) => {
      await runCommand(options);
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
export async function runCommand(options: RunOptions): Promise<void> {
  try {
    const port = options.port || 8080;
    
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
    console.log(colors.gray(`Example: http://npub1abc123.localhost:${port}/index.html\n`));
    console.log(colors.gray(`Press Ctrl+C to stop the server\n`));

    // Cache for profile data and file listings
    const profileCache = new Map<string, { profile: any; relayList: any; timestamp: number }>();
    const fileListCache = new Map<string, { files: FileEntry[]; timestamp: number; loading?: boolean }>();
    const fileCache = new Map<string, { data: Uint8Array; timestamp: number }>();
    const CACHE_TTL = 300000; // 5 minutes cache
    const FILE_CACHE_TTL = 3600000; // 1 hour for individual files

    // Create HTTP handler
    const handler = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const hostname = request.headers.get("host")?.split(":")[0] || "";

      // Extract npub from subdomain
      const npub = extractNpubFromHost(hostname);

      if (!npub) {
        return new Response("Invalid request. Use npub subdomain (e.g., npub123.localhost)", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Validate npub format
      if (!validateNpub(npub)) {
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
        
        // If we're loading file list for the first time, show loading page
        if (!fileListEntry && requestedPath === "/") {
          // Start loading file list in background
          fileListCache.set(npub, { files: [], timestamp: Date.now(), loading: true });
          
          (async () => {
            try {
              console.log(colors.gray(`  → Fetching file list...`));
              const files = await listRemoteFiles(relays, pubkeyHex);
              fileListCache.set(npub, { files, timestamp: Date.now(), loading: false });
              console.log(colors.gray(`  → Found ${files.length} files`));
            } catch (error) {
              console.log(colors.red(`  → Failed to fetch file list: ${error}`));
              fileListCache.set(npub, { files: [], timestamp: Date.now(), loading: false });
            }
          })();
          
          // Return loading page
          const loadingHtml = generateLoadingPage(npub, profileData?.profile);
          return new Response(loadingHtml, {
            status: 200,
            headers: { 
              "Content-Type": "text/html",
              "Refresh": "2" // Auto-refresh every 2 seconds
            },
          });
        }
        
        // If still loading, show loading page
        if (fileListEntry?.loading) {
          const loadingHtml = generateLoadingPage(npub, profileData?.profile);
          return new Response(loadingHtml, {
            status: 200,
            headers: { 
              "Content-Type": "text/html",
              "Refresh": "2"
            },
          });
        }
        
        // Refresh file list if needed
        if (!fileListEntry || Date.now() - fileListEntry.timestamp > CACHE_TTL) {
          console.log(colors.gray(`  → Refreshing file list...`));
          const files = await listRemoteFiles(relays, pubkeyHex);
          fileListEntry = { files, timestamp: Date.now(), loading: false };
          fileListCache.set(npub, fileListEntry);
          console.log(colors.gray(`  → Found ${files.length} files`));
        }
        
        if (fileListEntry.files.length === 0) {
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
            console.log(colors.gray(`  → Showing directory listing`));
            const html = generateDirectoryListing(npub, fileListEntry.files);
            return new Response(html, {
              status: 200,
              headers: { "Content-Type": "text/html" },
            });
          }
        }
        
        // Find the requested file
        const normalizedRequestPath = targetPath.startsWith("/") ? targetPath.slice(1) : targetPath;
        const file = fileListEntry.files.find(f => {
          const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
          return normalizedFilePath === normalizedRequestPath;
        });
        
        if (!file || !file.sha256) {
          return new Response(`File not found: ${requestedPath}`, {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        }
        
        // Check file cache
        const cacheKey = `${npub}-${file.sha256}`;
        let fileData = fileCache.get(cacheKey)?.data;
        
        if (!fileData || (fileCache.get(cacheKey)?.timestamp && Date.now() - fileCache.get(cacheKey)!.timestamp > FILE_CACHE_TTL)) {
          // Download file on-demand
          console.log(colors.gray(`  → Downloading ${colors.cyan(file.path)}...`));
          
          for (const server of servers) {
            try {
              const downloadService = DownloadService.create();
              const downloadedData = await downloadService.downloadFromServer(server, file.sha256);
              if (downloadedData) {
                fileData = downloadedData;
                // Cache the file
                fileCache.set(cacheKey, { data: fileData, timestamp: Date.now() });
                console.log(colors.gray(`  → Downloaded from ${server}`));
                break;
              }
            } catch (error) {
              log.debug(`Failed to download from ${server}: ${error}`);
            }
          }
          
          if (!fileData) {
            return new Response("Failed to download file from any server", {
              status: 500,
              headers: { "Content-Type": "text/plain" },
            });
          }
        }
        
        // Serve the file
        const contentType = getContentType(file.path);
        console.log(colors.gray(`  → Served ${colors.cyan(file.path)} (${formatFileSize(fileData.byteLength)})`));
        
        return new Response(fileData, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Length": fileData.byteLength.toString(),
            "Cache-Control": "public, max-age=3600", // Browser can cache for 1 hour
          },
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Error handling request: ${errorMessage}`);

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