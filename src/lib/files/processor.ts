import { extname } from "@std/path";
import { createLogger } from "../logger.ts";
import type { FileEntry } from "../nostr.ts";

const log = createLogger("file-processor");

/**
 * Result of file comparison
 */
export interface FileComparison {
  toUpload: FileEntry[];
  toDelete: FileEntry[];
  unchanged: FileEntry[];
}

/**
 * Compare local and remote files to determine what needs to be uploaded/deleted
 */
export function compareFiles(local: FileEntry[], remote: FileEntry[]): FileComparison {
  const toUpload: FileEntry[] = [];
  const toDelete: FileEntry[] = [];
  const unchanged: FileEntry[] = [];

  // Create maps for efficient lookup
  const localMap = new Map(local.map((f) => [f.path, f]));
  const remoteMap = new Map(remote.map((f) => [f.path, f]));

  // Check local files
  for (const localFile of local) {
    const remoteFile = remoteMap.get(localFile.path);

    if (!remoteFile) {
      // New file
      toUpload.push(localFile);
    } else if (remoteFile.sha256 !== localFile.sha256) {
      // Modified file
      toUpload.push(localFile);
    } else {
      // Unchanged file
      unchanged.push(localFile);
    }
  }

  // Check for deleted files
  for (const remoteFile of remote) {
    if (!localMap.has(remoteFile.path)) {
      toDelete.push(remoteFile);
    }
  }

  return { toUpload, toDelete, unchanged };
}

/**
 * Prepare files for upload by checking size limits and filtering
 */
export function prepareFilesForUpload(files: FileEntry[], maxSizeMB: number = 100): {
  valid: FileEntry[];
  oversized: FileEntry[];
} {
  const maxSize = maxSizeMB * 1024 * 1024;
  const valid: FileEntry[] = [];
  const oversized: FileEntry[] = [];

  for (const file of files) {
    if (file.size && file.size > maxSize) {
      oversized.push(file);
    } else {
      valid.push(file);
    }
  }

  return { valid, oversized };
}

/**
 * Calculate total size of files
 */
export function calculateTotalSize(files: FileEntry[]): number {
  return files.reduce((total, file) => total + (file.size || 0), 0);
}

/**
 * Group files by extension
 */
export function groupFilesByExtension(files: FileEntry[]): Map<string, FileEntry[]> {
  const groups = new Map<string, FileEntry[]>();

  for (const file of files) {
    const ext = extname(file.path) || "no-extension";

    const group = groups.get(ext) || [];
    group.push(file);
    groups.set(ext, group);
  }

  return groups;
}
