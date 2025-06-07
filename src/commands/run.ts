import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { serve } from "std/http/server.ts";
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { resolveRelays, type ResolverOptions } from "../lib/resolver-utils.ts";
import { bech32Decode } from "../lib/utils.ts";
import { listRemoteFiles } from "../lib/nostr.ts";

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
    const decoded = bech32Decode(npub);
    return decoded.prefix === "npub" && decoded.data.length === 32;
  } catch {
    return false;
  }
}

/**
 * Converts npub to hex pubkey
 */
export function npubToHex(npub: string): string {
  const decoded = bech32Decode(npub);
  return Array.from(decoded.data, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract npub from hostname (e.g., "npub123.localhost" -> "npub123")
 */
function extractNpubFromHost(hostname: string): string | null {
  const parts = hostname.split('.');
  if (parts.length < 2) return null;
  
  const subdomain = parts[0];
  if (subdomain.startsWith('npub')) {
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
    const relays = resolveRelays(options, null, true);
    
    if (relays.length === 0) {
      console.error(colors.red("No relays available. Please configure relays or use -r option."));
      Deno.exit(1);
    }

    console.log(colors.green(`\n🚀 Starting nsyte resolver server`));
    console.log(colors.cyan(`📡 Using relays: ${relays.join(", ")}`));
    console.log(colors.cyan(`🌐 Server URL: http://localhost:${port}`));
    console.log(colors.gray(`\nAccess nsites via: http://{npub}.localhost:${port}/path/to/file`));
    console.log(colors.gray(`Example: http://npub1abc123.localhost:${port}/index.html\n`));
    console.log(colors.gray(`Press Ctrl+C to stop the server\n`));

    // Cache for file listings
    const fileCache = new Map<string, { files: any[], timestamp: number }>();
    const CACHE_TTL = 60000; // 1 minute cache

    // Create HTTP handler
    const handler = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const hostname = request.headers.get("host")?.split(":")[0] || "";
      
      // Extract npub from subdomain
      const npub = extractNpubFromHost(hostname);
      
      if (!npub) {
        return new Response("Invalid request. Use npub subdomain (e.g., npub123.localhost)", { 
          status: 400,
          headers: { "Content-Type": "text/plain" }
        });
      }

      // Validate npub format
      if (!validateNpub(npub)) {
        return new Response(`Invalid npub format: ${npub}`, { 
          status: 400,
          headers: { "Content-Type": "text/plain" }
        });
      }

      try {
        const pubkeyHex = npubToHex(npub);
        const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
        
        log.debug(`Request: ${hostname}${requestedPath} -> npub: ${npub}`);

        // Check cache
        const cached = fileCache.get(npub);
        let remoteFiles;
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          remoteFiles = cached.files;
        } else {
          // Fetch file list from nostr
          remoteFiles = await listRemoteFiles(relays, pubkeyHex);
          fileCache.set(npub, { files: remoteFiles, timestamp: Date.now() });
        }

        // Find the requested file
        const file = remoteFiles.find(f => f.path === requestedPath.slice(1));
        
        if (!file) {
          // Generate directory listing if no specific file requested
          if (requestedPath === "/" || requestedPath === "/index.html") {
            const html = generateDirectoryListing(npub, remoteFiles);
            return new Response(html, {
              status: 200,
              headers: { "Content-Type": "text/html" }
            });
          }
          
          return new Response(`File not found: ${requestedPath}`, { 
            status: 404,
            headers: { "Content-Type": "text/plain" }
          });
        }

        // Download the file content from blossom servers
        if (!file.sha256) {
          return new Response("File has no SHA256 hash", { 
            status: 500,
            headers: { "Content-Type": "text/plain" }
          });
        }

        // Try default blossom servers
        const blossomServers = [
          "https://blossom.primal.net",
          "https://cdn.satellite.earth",
          "https://blossom.nos.social"
        ];

        let fileData: Uint8Array | null = null;
        for (const server of blossomServers) {
          try {
            fileData = await downloadFromBlossom(server, file.sha256);
            if (fileData) break;
          } catch (error) {
            log.debug(`Failed to download from ${server}: ${error}`);
          }
        }
        
        if (!fileData) {
          return new Response("Failed to download file from any blossom server", { 
            status: 500,
            headers: { "Content-Type": "text/plain" }
          });
        }

        // Determine content type
        const contentType = getContentType(file.path);
        
        return new Response(fileData, {
          status: 200,
          headers: { 
            "Content-Type": contentType,
            "Content-Length": fileData.byteLength.toString()
          }
        });
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Error handling request: ${errorMessage}`);
        
        return new Response(`Error: ${errorMessage}`, { 
          status: 500,
          headers: { "Content-Type": "text/plain" }
        });
      }
    };

    // Start server
    await serve(handler, { port });
    
  } catch (error: unknown) {
    handleError("Error running resolver server", error, {
      exit: true,
      showConsole: true,
      logger: log
    });
  }
}

/**
 * Generate HTML directory listing
 */
function generateDirectoryListing(npub: string, files: any[]): string {
  const fileList = files.map(file => {
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
    ${fileList || '<li>No files found</li>'}
  </ul>
</body>
</html>`;
}

/**
 * Get content type based on file extension
 */
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
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
    otf: "font/otf"
  };
  
  return types[ext || ""] || "application/octet-stream";
}

/**
 * Download file from a blossom server
 */
async function downloadFromBlossom(server: string, sha256: string): Promise<Uint8Array | null> {
  const serverUrl = server.endsWith("/") ? server : `${server}/`;
  const downloadUrl = `${serverUrl}${sha256}`;
  
  try {
    const response = await fetch(downloadUrl, {
      method: "GET",
      headers: {
        "Accept": "*/*"
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    throw error;
  }
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