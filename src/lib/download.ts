import { ensureDir } from "@std/fs/ensure-dir";
import { dirname, join } from "@std/path";
import { ProgressRenderer } from "../ui/progress.ts";
import { createLogger } from "./logger.ts";
import { type FileEntry, listRemoteFiles } from "./nostr.ts";
import type { ByteArray } from "./types.ts";

const log = createLogger("download");

export interface DownloadOptions {
  output: string;
  overwrite?: boolean;
  verbose?: boolean;
}

export interface DownloadResult {
  file: FileEntry;
  success: boolean;
  error?: string;
  savedPath?: string;
  skipped?: boolean;
  reason?: string;
}

export interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  inProgress: number;
}

export interface DownloadStats {
  totalFiles: number;
  successful: number;
  skipped: number;
  failed: number;
  totalSize: number;
  downloadedSize: number;
}

/**
 * Core download service for handling file downloads from blossom servers
 */
export class DownloadService {
  private concurrency = 3;

  constructor(private options: { concurrency?: number } = {}) {
    if (options.concurrency) {
      this.concurrency = options.concurrency;
    }
  }

  /**
   * Fetch file list from relays for a given pubkey
   */
  async fetchFileList(
    relays: string[],
    pubkey: string,
    site?: string,
  ): Promise<FileEntry[]> {
    log.debug(
      `Fetching file list from ${relays.length} relays for pubkey: ${pubkey.slice(0, 8)}...${
        site ? ` (site: ${site})` : ""
      }`,
    );
    return await listRemoteFiles(relays, pubkey, site);
  }

  /**
   * Download multiple files with progress tracking
   */
  async downloadFiles(
    files: FileEntry[],
    servers: string[],
    options: DownloadOptions,
  ): Promise<DownloadResult[]> {
    const progress: DownloadProgress = {
      total: files.length,
      completed: 0,
      failed: 0,
      skipped: 0,
      inProgress: 0,
    };

    const progressRenderer = new ProgressRenderer(files.length);
    progressRenderer.start();

    const results: DownloadResult[] = [];

    // Process files in batches
    for (let i = 0; i < files.length; i += this.concurrency) {
      const batch = files.slice(i, i + this.concurrency);
      progress.inProgress = batch.length;

      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            return await this.downloadSingleFile(file, servers, options);
          } catch (error) {
            return {
              file,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
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
          inProgress: progress.inProgress,
        });
      }
    }

    progressRenderer.complete(
      progress.failed === 0,
      `Downloaded ${progress.completed} files, skipped ${progress.skipped}, failed ${progress.failed}`,
    );

    return results;
  }

  /**
   * Download a single file from blossom servers
   */
  async downloadSingleFile(
    file: FileEntry,
    servers: string[],
    options: DownloadOptions,
  ): Promise<DownloadResult> {
    const outputPath = join(options.output, file.path);

    // Check if file already exists
    const existingFile = await this.checkExistingFile(outputPath, options.overwrite);
    if (existingFile) {
      return existingFile;
    }

    if (!file.sha256) {
      return {
        file,
        success: false,
        error: "No SHA256 hash found for file",
      };
    }

    // Try to download from each server until one succeeds
    for (const server of servers) {
      try {
        const fileData = await this.downloadFromServer(server, file.sha256);

        if (fileData) {
          await this.saveFile(outputPath, fileData);

          if (options.verbose) {
            log.info(`Downloaded ${file.path} from ${server}`);
          }

          return {
            file,
            success: true,
            savedPath: outputPath,
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
      error: `Failed to download from any server (tried ${servers.length} servers)`,
    };
  }

  /**
   * Download file data from a blossom server
   */
  async downloadFromServer(server: string, sha256: string): Promise<ByteArray | null> {
    const serverUrl = server.endsWith("/") ? server : `${server}/`;
    const downloadUrl = `${serverUrl}${sha256}`;

    try {
      const response = await fetch(downloadUrl, {
        method: "GET",
        headers: {
          "Accept": "*/*",
        },
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
   * Check if a file already exists and handle overwrite logic
   */
  private async checkExistingFile(
    outputPath: string,
    overwrite?: boolean,
  ): Promise<DownloadResult | null> {
    try {
      const stat = await Deno.stat(outputPath);
      if (stat.isFile && !overwrite) {
        return {
          file: { path: outputPath } as FileEntry,
          success: true,
          skipped: true,
          reason: "File already exists (use --overwrite to replace)",
          savedPath: outputPath,
        };
      }
    } catch {
      // File doesn't exist, continue with download
    }
    return null;
  }

  /**
   * Save file data to the filesystem
   */
  private async saveFile(outputPath: string, data: ByteArray): Promise<void> {
    // Ensure directory exists
    await ensureDir(dirname(outputPath));

    // Save file
    await Deno.writeFile(outputPath, data);
  }

  /**
   * Calculate download statistics
   */
  calculateStats(results: DownloadResult[]): DownloadStats {
    const successful = results.filter((r) => r.success && !r.skipped);
    const skipped = results.filter((r) => r.skipped);
    const failed = results.filter((r) => !r.success);

    const totalSize = results.reduce((sum, r) => sum + (r.file.size || 0), 0);
    const downloadedSize = successful.reduce((sum, r) => sum + (r.file.size || 0), 0);

    return {
      totalFiles: results.length,
      successful: successful.length,
      skipped: skipped.length,
      failed: failed.length,
      totalSize,
      downloadedSize,
    };
  }

  /**
   * Validate download options
   */
  static validateOptions(options: Partial<DownloadOptions>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!options.output || options.output.trim() === "") {
      errors.push("Output directory is required");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a download service with default options
   */
  static create(options: { concurrency?: number } = {}): DownloadService {
    return new DownloadService(options);
  }
}
