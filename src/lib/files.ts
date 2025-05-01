import { join, relative, normalize, extname } from "std/path/mod.ts";
import { contentType } from "std/media_types/mod.ts";
import { encodeHex } from "std/encoding/hex.ts";
import { createLogger } from "./logger.ts";
import { FileEntry } from "./nostr.ts";

const log = createLogger("files");

/**
 * Get all files from a local directory
 */
export async function getLocalFiles(dirPath: string): Promise<FileEntry[]> {
  log.info(`Scanning local files in ${dirPath}`);
  
  const files: FileEntry[] = [];
  const normalizedDir = normalize(dirPath).replace(/\/$/, "");
  
  try {
    for await (const entry of walkDirectory(normalizedDir)) {
      if (entry.isDirectory || entry.name.startsWith(".")) {
        continue;
      }
      
      const fullPath = join(entry.path, entry.name);
      const relativePath = relative(normalizedDir, fullPath);
      
      try {
        const fileInfo = await Deno.stat(fullPath);
        
        const fileEntry: FileEntry = {
          path: "/" + relativePath,
          size: fileInfo.size,
          contentType: getContentType(relativePath),
        };
        
        files.push(fileEntry);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.warn(`Could not get file stats for ${fullPath}: ${errorMessage}`);
      }
    }
    
    log.debug(`Found ${files.length} files in ${dirPath}`);
    
    return files.sort((a, b) => {
      const aSegments = a.path.split('/').filter(s => s.length > 0);
      const bSegments = b.path.split('/').filter(s => s.length > 0);
      
      if (aSegments.length !== bSegments.length) {
        return bSegments.length - aSegments.length;
      }
      
      return a.path.localeCompare(b.path);
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to scan directory ${dirPath}: ${errorMessage}`);
    throw new Error(`Failed to scan directory: ${errorMessage}`);
  }
}

/**
 * Compare local and remote files
 */
export function compareFiles(localFiles: FileEntry[], remoteFiles: FileEntry[]): {
  toTransfer: FileEntry[];
  existing: FileEntry[];
  toDelete: FileEntry[];
} {
  const toTransfer: FileEntry[] = [];
  const existing: FileEntry[] = [];
  const toDelete: FileEntry[] = [...remoteFiles];
  
  log.debug(`Comparing ${localFiles.length} local files with ${remoteFiles.length} remote files`);
  
  const normalizedRemotes = toDelete.map(file => ({
    ...file,
    normalizedPath: file.path.replace(/^\/+/, "/").toLowerCase()
  }));
  
  for (const localFile of localFiles) {
    const normalizedLocalPath = localFile.path.replace(/^\/+/, "/").toLowerCase();
    let found = false;
    
    for (let i = 0; i < normalizedRemotes.length; i++) {
      const remote = normalizedRemotes[i];
      const remoteFile = toDelete[i];
      
      if (remote.normalizedPath === normalizedLocalPath) {
        if (!localFile.sha256 || !remoteFile.sha256 || remoteFile.sha256 === localFile.sha256) {
          log.debug(`File ${localFile.path} already exists remotely with matching hash`);
          existing.push(localFile);
        } else {
          log.debug(`File ${localFile.path} exists remotely but has different hash, will update`);
          toTransfer.push(localFile);
        }
        
        toDelete.splice(i, 1);
        normalizedRemotes.splice(i, 1);
        found = true;
        break;
      }
    }
    
    if (!found) {
      log.debug(`File ${localFile.path} doesn't exist remotely, will upload`);
      toTransfer.push(localFile);
    }
  }
  
  log.debug(`Comparison result: ${toTransfer.length} to upload, ${existing.length} unchanged, ${toDelete.length} to delete`);
  return { toTransfer, existing, toDelete };
}

/**
 * Calculate SHA-256 hash for a file
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  try {
    const fileContent = await Deno.readFile(filePath);
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileContent);
    return encodeHex(new Uint8Array(hashBuffer));
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to calculate hash for ${filePath}: ${errorMessage}`);
    throw new Error(`Failed to calculate file hash: ${errorMessage}`);
  }
}

/**
 * Load file data for a file entry
 */
export async function loadFileData(dirPath: string, fileEntry: FileEntry): Promise<FileEntry> {
  const normalizedDir = normalize(dirPath).replace(/\/$/, "");
  const fullPath = join(normalizedDir, fileEntry.path.replace(/^\
  
  try {
    const data = await Deno.readFile(fullPath);
    
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const sha256 = encodeHex(new Uint8Array(hashBuffer));
    
    return {
      ...fileEntry,
      data,
      sha256,
      size: data.length,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to load file ${fullPath}: ${errorMessage}`);
    throw new Error(`Failed to load file: ${errorMessage}`);
  }
}

/**
 * Get content type for a file based on extension
 */
function getContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const type = contentType(ext);
  return type || "application/octet-stream";
}

/**
 * Walk a directory recursively
 */
async function* walkDirectory(dir: string): AsyncGenerator<Deno.DirEntry & { path: string }> {
  for await (const entry of Deno.readDir(dir)) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory) {
      yield { ...entry, path: dir };
      yield* walkDirectory(entryPath);
    } else {
      yield { ...entry, path: dir };
    }
  }
} 