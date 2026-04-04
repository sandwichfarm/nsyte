import { extname } from "@std/path";

/**
 * Extensions of known binary file types.
 * Files matching these extensions are skipped before any content reading.
 */
export const BINARY_EXTENSIONS = new Set([
  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".bmp",
  ".webp",
  ".avif",
  // Note: .svg is intentionally NOT here — SVGs are text XML and can contain secrets
  ".tiff",
  ".tif",
  // Fonts
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  // WebAssembly and compiled
  ".wasm",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  // Archives
  ".zip",
  ".gz",
  ".br",
  ".tar",
  ".7z",
  ".rar",
  ".bz2",
  ".xz",
  ".zst",
  // Media
  ".mp3",
  ".mp4",
  ".ogg",
  ".webm",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".avi",
  ".mov",
  ".mkv",
  // Documents (binary)
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  // Databases
  ".sqlite",
  ".db",
  ".sqlite3",
  // Source maps (often very large hex-like content, high false-positive risk)
  ".map",
]);

/**
 * Check if a file has a known binary extension.
 * This is the fast first-pass filter — no I/O required.
 *
 * @param filePath - File path (relative or absolute)
 * @returns true if the extension indicates a binary file
 */
export function isBinaryExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if file content contains null bytes (indicates binary).
 * Reads only the first `sampleSize` bytes for efficiency.
 *
 * @param filePath - Absolute path to the file
 * @param sampleSize - Number of bytes to check (default: 512)
 * @returns true if null bytes are found (binary file)
 */
export async function hasNullBytes(
  filePath: string,
  sampleSize = 512,
): Promise<boolean> {
  try {
    const file = await Deno.open(filePath, { read: true });
    try {
      const buffer = new Uint8Array(sampleSize);
      const bytesRead = await file.read(buffer);
      if (bytesRead === null) return false; // Empty file
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) return true;
      }
      return false;
    } finally {
      file.close();
    }
  } catch {
    // If we can't read the file, treat it as non-binary (let scanner handle the read error)
    return false;
  }
}

/**
 * Determine if a file should be skipped by the scanner.
 * Uses two-layer detection: extension list first, then null-byte check.
 *
 * @param filePath - Relative file path (for extension check)
 * @param absolutePath - Absolute file path (for null-byte check)
 * @returns true if the file should be skipped (binary)
 */
export async function shouldSkipFile(
  filePath: string,
  absolutePath: string,
): Promise<boolean> {
  // Layer 1: Extension check (fast, no I/O)
  if (isBinaryExtension(filePath)) {
    return true;
  }

  // Layer 2: Null-byte detection (requires reading first 512 bytes)
  return await hasNullBytes(absolutePath);
}
