import { ensureDirSync } from "@std/fs/ensure-dir";
import { dirname, join, relative, basename } from "@std/path";
import { createLogger } from "./logger.ts";
import type { FileEntry } from "./nostr.ts";
import { Tar } from "jsr:@std/archive@0.225.4/tar";
import { Buffer } from "jsr:@std/io@0.224.9/buffer";
import { readAll } from "jsr:@std/io@0.224.9/read-all";

const log = createLogger("archive");

/**
 * Create a tar.gz archive from a list of files
 * @param files Array of FileEntry objects to archive
 * @param baseDir Base directory for relative paths in the archive
 * @param outputPath Path where the archive should be saved
 * @returns Object with path and size of the created archive
 */
export async function createTarGzArchive(
  files: FileEntry[],
  baseDir: string,
  outputPath: string,
): Promise<{ path: string; data: Uint8Array; size: number }> {
  log.debug(`Creating tar.gz archive with ${files.length} files`);
  
  // Ensure output directory exists
  ensureDirSync(dirname(outputPath));
  
  // Create tar archive
  const tar = new Tar();
  
  for (const file of files) {
    if (!file.data) {
      log.warn(`Skipping file without data: ${file.path}`);
      continue;
    }
    
    // Use the file path as is (already relative from scan)
    const archivePath = file.path.startsWith("/") ? file.path.slice(1) : file.path;
    
    log.debug(`Adding to archive: ${archivePath}`);
    
    await tar.append(archivePath, {
      reader: new Buffer(file.data),
      contentSize: file.data.length,
    });
  }
  
  // Get tar data
  const tarData = tar.getReader();
  const tarBytes = await readAll(tarData);
  
  // Create a temporary file for the tar data
  const tempTarPath = `${outputPath}.tar`;
  await Deno.writeFile(tempTarPath, tarBytes);
  
  // Use Deno's built-in gzip command to compress the tar file
  const command = new Deno.Command("gzip", {
    args: ["-9", tempTarPath],
  });
  
  const { success } = await command.output();
  
  if (!success) {
    // Clean up temp file
    try {
      await Deno.remove(tempTarPath);
    } catch {}
    throw new Error("Failed to compress archive with gzip");
  }
  
  // Read the compressed file (gzip adds .gz extension)
  const compressedData = await Deno.readFile(`${tempTarPath}.gz`);
  
  // Move compressed file to final location
  await Deno.rename(`${tempTarPath}.gz`, outputPath);
  
  // Clean up any remaining temp files
  try {
    await Deno.remove(tempTarPath);
  } catch {}
  
  log.info(`Created archive: ${outputPath} (${compressedData.length} bytes)`);
  
  return {
    path: outputPath,
    data: compressedData,
    size: compressedData.length,
  };
}

/**
 * Calculate SHA-256 hash of a file
 * @param data File data as Uint8Array
 * @returns Hex-encoded SHA-256 hash
 */
export async function calculateSha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Detect platform from file name based on common patterns
 */
export function detectPlatformsFromFileName(fileName: string): string[] {
  const lowerName = fileName.toLowerCase();
  const platforms: string[] = [];

  // Check for specific OS patterns first
  if (lowerName.includes("linux") || lowerName.includes("ubuntu") || lowerName.includes("debian")) {
    platforms.push("linux");
  }
  if (lowerName.includes("windows") || lowerName.includes("win32") || lowerName.includes("win64") || lowerName.endsWith(".exe") || lowerName.includes("msvc")) {
    platforms.push("windows");
  }
  if (lowerName.includes("macos") || lowerName.includes("darwin") || lowerName.includes("osx") || lowerName.endsWith(".dmg") || lowerName.endsWith(".pkg")) {
    platforms.push("macos");
  }
  if (lowerName.includes("android") || lowerName.endsWith(".apk") || lowerName.endsWith(".aab")) {
    platforms.push("android");
  }
  if (lowerName.includes("ios") || lowerName.endsWith(".ipa")) {
    platforms.push("ios");
  }
  
  // Architecture-based detection only if no platform detected yet
  if (platforms.length === 0) {
    if (lowerName.includes("arm64") || lowerName.includes("aarch64")) {
      // Default to linux for ARM architectures unless other indicators present
      platforms.push("linux");
    }
    if (lowerName.includes("x86_64") || lowerName.includes("amd64")) {
      // Default to linux for x86_64 architectures
      platforms.push("linux");
    }
  }

  // If no platform detected, assume web/universal
  if (platforms.length === 0) {
    platforms.push("web");
  }

  return platforms;
}