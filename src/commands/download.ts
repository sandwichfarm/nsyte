import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { dirname } from "@std/path";
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import {
  resolvePubkey,
  resolveRelays,
  type ResolverOptions,
  resolveServers,
} from "../lib/resolver-utils.ts";
import { readProjectFile } from "../lib/config.ts";
import { getDisplayManager } from "../lib/display-mode.ts";
import { type DownloadResult, DownloadService } from "../lib/download.ts";
import type { FileEntry } from "../lib/nostr.ts";

const log = createLogger("download");

export interface DownloadOptions extends ResolverOptions {
  output?: string;
  overwrite?: boolean;
  verbose?: boolean;
}

// Re-export types from the service
export type { DownloadProgress, DownloadResult, DownloadStats } from "../lib/download.ts";

/**
 * Register the download command
 */
export function registerDownloadCommand(program: Command): void {
  const command = program
    .command("download")
    .description("Download files from the nostr network")
    .option("-o, --output <dir:string>", "The output directory to save files to.", {
      default: "./downloads",
    })
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-s, --servers <servers:string>", "The blossom servers to use (comma separated).")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option(
      "-p, --pubkey <npub:string>",
      "The public key to download files from (if not using private key).",
    )
    .option(
      "--nbunksec <nbunksec:string>",
      "The nbunksec string to use for authentication (for CI/CD).",
    )
    .option("--overwrite", "Overwrite existing files.", { default: false })
    .option("-v, --verbose", "Verbose output.", { default: false })
    .action(async (options: DownloadOptions) => {
      try {
        await downloadCommand(options);
      } catch (error: unknown) {
        handleError("Error downloading files", error, {
          exit: true,
          showConsole: true,
          logger: log,
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

  // Create download service
  const downloadService = DownloadService.create({ concurrency: 3 });

  // Fetch file list from relays
  console.log(colors.yellow("Fetching file list from relays..."));
  const remoteFiles = await downloadService.fetchFileList(relays, pubkey);

  if (remoteFiles.length === 0) {
    console.log(colors.yellow("No files found for this public key."));
    console.log(colors.gray("This could mean:"));
    console.log(colors.gray("- No files have been uploaded by this key"));
    console.log(colors.gray("- The relays don't have the file events"));
    console.log(colors.gray("- The public key is incorrect"));
    return;
  }

  console.log(colors.green(`Found ${remoteFiles.length} files to download.`));

  // Download files using the service
  const downloadOptions = {
    output: options.output!,
    overwrite: options.overwrite,
    verbose: options.verbose,
  };

  const results = await downloadService.downloadFiles(remoteFiles, servers, downloadOptions);

  // Display results
  displayResults(results);
}

/**
 * Download multiple files with progress tracking
 * @deprecated Use DownloadService.downloadFiles instead
 */
export async function downloadFiles(
  files: FileEntry[],
  servers: string[],
  options: DownloadOptions,
): Promise<DownloadResult[]> {
  const downloadService = DownloadService.create();
  const downloadOptions = {
    output: options.output!,
    overwrite: options.overwrite,
    verbose: options.verbose,
  };
  return await downloadService.downloadFiles(files, servers, downloadOptions);
}

// Legacy functions for backward compatibility and testing
// Note: These are now implemented in the DownloadService class

/**
 * Download a single file from blossom servers
 * @deprecated Use DownloadService.downloadSingleFile instead
 */
export async function downloadSingleFile(
  file: FileEntry,
  servers: string[],
  options: DownloadOptions,
): Promise<DownloadResult> {
  const downloadService = DownloadService.create();
  const downloadOptions = {
    output: options.output!,
    overwrite: options.overwrite,
    verbose: options.verbose,
  };
  return await downloadService.downloadSingleFile(file, servers, downloadOptions);
}

/**
 * Download file data from a blossom server
 * @deprecated Use DownloadService.downloadFromServer instead
 */
export async function downloadFromServer(
  server: string,
  sha256: string,
): Promise<Uint8Array | null> {
  const downloadService = DownloadService.create();
  return await downloadService.downloadFromServer(server, sha256);
}

/**
 * Display download results summary
 */
export function displayResults(results: DownloadResult[]): void {
  const successful = results.filter((r) => r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.success);

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

  console.log(
    colors.cyan(
      `\n📂 Files saved to: ${
        results[0]?.savedPath ? dirname(results[0].savedPath) : "./downloads"
      }`,
    ),
  );
}
