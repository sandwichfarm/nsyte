import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { join, dirname } from "std/path/mod.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { resolvePubkey, resolveRelays, resolveServers, type ResolverOptions } from "../lib/resolver-utils.ts";
import { listRemoteFiles, type FileEntry } from "../lib/nostr.ts";
import { readProjectFile } from "../lib/config.ts";
import { ProgressRenderer } from "../ui/progress.ts";
import { getDisplayManager } from "../lib/display-mode.ts";

const log = createLogger("download");

interface DownloadOptions extends ResolverOptions {
  output?: string;
  overwrite?: boolean;
  verbose?: boolean;
}

interface DownloadResult {
  file: FileEntry;
  success: boolean;
  error?: string;
  savedPath?: string;
  skipped?: boolean;
  reason?: string;
}

interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  inProgress: number;
}

/**
 * Register the download command
 */
export function registerDownloadCommand(program: Command): void {
  const command = program
    .command("download")
    .description("Download files from the nostr network")
    .option("-o, --output <dir:string>", "The output directory to save files to.", { default: "./downloads" })
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-s, --servers <servers:string>", "The blossom servers to use (comma separated).")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("-p, --pubkey <npub:string>", "The public key to download files from (if not using private key).")
    .option("--nbunksec <nbunksec:string>", "The nbunksec string to use for authentication (for CI/CD).")
    .option("--overwrite", "Overwrite existing files.", { default: false })
    .option("-v, --verbose", "Verbose output.", { default: false })
    .action(async (options: DownloadOptions) => {
    try {
      await downloadCommand(options);
    } catch (error: unknown) {
      handleError("Error downloading files", error, {
        exit: true,
        showConsole: true,
        logger: log
      });
    }
  });
}

/**
 * Main download command implementation
 */
async function downloadCommand(options: DownloadOptions): Promise<void> {
  const displayManager = getDisplayManager();
  displayManager.configureFromOptions(options);

  // Resolve public key
  const pubkey = await resolvePubkey(options, readProjectFile(), false);
  
  // Resolve relays and servers
  const relays = resolveRelays(options, readProjectFile(), true);
  const servers = resolveServers(options, readProjectFile());
  
  console.log(colors.cyan(`Downloading files for: ${pubkey.slice(0, 8)}...`));
  console.log(colors.gray(`Using relays: ${relays.join(", ")}`));
  console.log(colors.gray(`Using servers: ${servers.join(", ")}`));
  console.log(colors.gray(`Output directory: ${options.output}`));
  
  // Ensure output directory exists
  await ensureDir(options.output!);
  
  // Fetch file list from relays
  console.log(colors.yellow("Fetching file list from relays..."));
  const remoteFiles = await listRemoteFiles(relays, pubkey);
  
  if (remoteFiles.length === 0) {
    console.log(colors.yellow("No files found for this public key."));
    console.log(colors.gray("This could mean:"));
    console.log(colors.gray("- No files have been uploaded by this key"));
    console.log(colors.gray("- The relays don't have the file events"));
    console.log(colors.gray("- The public key is incorrect"));
    return;
  }
  
  console.log(colors.green(`Found ${remoteFiles.length} files to download.`));
  
  // Download files
  const results = await downloadFiles(remoteFiles, servers, options);
  
  // Display results
  displayResults(results);
}

/**
 * Download multiple files with progress tracking
 */
async function downloadFiles(
  files: FileEntry[],
  servers: string[],
  options: DownloadOptions
): Promise<DownloadResult[]> {
  const progress: DownloadProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    inProgress: 0
  };
  
  const progressRenderer = new ProgressRenderer(files.length);
  progressRenderer.start();
  
  const results: DownloadResult[] = [];
  const concurrency = 3; // Limit concurrent downloads
  
  // Process files in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    progress.inProgress = batch.length;
    
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          return await downloadSingleFile(file, servers, options);
        } catch (error) {
          return {
            file,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    for (const result of batchResults) {
      results.push(result);
      
      if (result.success) {
        if (result.skipped) {
          progress.skipped++;
        } else {
          progress.completed++;
        }
      } else {
        progress.failed++;
      }
      
      progress.inProgress--;
      
      // Update progress
      progressRenderer.update({
        total: progress.total,
        completed: progress.completed + progress.skipped,
        failed: progress.failed,
        inProgress: progress.inProgress
      });
    }
  }
  
  progressRenderer.complete(
    progress.failed === 0,
    `Downloaded ${progress.completed} files, skipped ${progress.skipped}, failed ${progress.failed}`
  );
  
  return results;
}

/**
 * Download a single file from blossom servers
 */
async function downloadSingleFile(
  file: FileEntry,
  servers: string[],
  options: DownloadOptions
): Promise<DownloadResult> {
  const outputPath = join(options.output!, file.path);
  
  // Check if file already exists
  try {
    const stat = await Deno.stat(outputPath);
    if (stat.isFile && !options.overwrite) {
      return {
        file,
        success: true,
        skipped: true,
        reason: "File already exists (use --overwrite to replace)",
        savedPath: outputPath
      };
    }
  } catch {
    // File doesn't exist, continue with download
  }
  
  if (!file.sha256) {
    return {
      file,
      success: false,
      error: "No SHA256 hash found for file"
    };
  }
  
  // Try to download from each server until one succeeds
  for (const server of servers) {
    try {
      const fileData = await downloadFromServer(server, file.sha256);
      
      if (fileData) {
        // Ensure directory exists
        await ensureDir(dirname(outputPath));
        
        // Save file
        await Deno.writeFile(outputPath, fileData);
        
        if (options.verbose) {
          log.info(`Downloaded ${file.path} from ${server}`);
        }
        
        return {
          file,
          success: true,
          savedPath: outputPath
        };
      }
    } catch (error) {
      if (options.verbose) {
        log.debug(`Failed to download ${file.path} from ${server}: ${error}`);
      }
      continue;
    }
  }
  
  return {
    file,
    success: false,
    error: `Failed to download from any server (tried ${servers.length} servers)`
  };
}

/**
 * Download file data from a blossom server
 */
async function downloadFromServer(server: string, sha256: string): Promise<Uint8Array | null> {
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
        log.debug(`File ${sha256} not found on server ${server}`);
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    log.debug(`Error downloading from ${server}: ${error}`);
    throw error;
  }
}

/**
 * Display download results summary
 */
function displayResults(results: DownloadResult[]): void {
  const successful = results.filter(r => r.success && !r.skipped);
  const skipped = results.filter(r => r.skipped);
  const failed = results.filter(r => !r.success);
  
  console.log(colors.green(`\n📁 Download Summary:`));
  console.log(colors.green(`✅ Successfully downloaded: ${successful.length} files`));
  
  if (skipped.length > 0) {
    console.log(colors.yellow(`⏭️  Skipped: ${skipped.length} files`));
  }
  
  if (failed.length > 0) {
    console.log(colors.red(`❌ Failed: ${failed.length} files`));
  }
  
  // Show successful downloads
  if (successful.length > 0) {
    console.log(colors.green(`\n✅ Downloaded files:`));
    for (const result of successful) {
      console.log(colors.gray(`   ${result.file.path} → ${result.savedPath}`));
    }
  }
  
  // Show skipped files
  if (skipped.length > 0) {
    console.log(colors.yellow(`\n⏭️  Skipped files:`));
    for (const result of skipped) {
      console.log(colors.gray(`   ${result.file.path} (${result.reason})`));
    }
  }
  
  // Show failed downloads
  if (failed.length > 0) {
    console.log(colors.red(`\n❌ Failed downloads:`));
    for (const result of failed) {
      console.log(colors.gray(`   ${result.file.path}: ${result.error}`));
    }
  }
  
  console.log(colors.cyan(`\n📂 Files saved to: ${results[0]?.savedPath ? dirname(results[0].savedPath) : "./downloads"}`));
}