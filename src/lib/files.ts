import { join, relative, normalize, extname } from "std/path/mod.ts";
import { contentType } from "std/media_types/mod.ts";
import { encodeHex } from "std/encoding/hex.ts";
import { createLogger } from "./logger.ts";
import { FileEntry } from "./nostr.ts";
import { existsSync } from "std/fs/exists.ts";
import { expandGlob, type WalkEntry } from "jsr:@std/fs/expand-glob";
import { globToRegExp } from "jsr:@std/path/glob-to-regexp";

const log = createLogger("files");

export const DEFAULT_IGNORE_PATTERNS = [
  ".git/**",
  ".DS_Store",
  "node_modules/**",
  ".nsite-ignore",
  ".nsite/config.json",
  ".vscode/**",
];

/**
 * Get all files from a local directory, honoring .nsite-ignore using Deno std lib
 * Returns both the files to include and the paths of those ignored.
 */
export async function getLocalFiles(dirPath: string): Promise<{ includedFiles: FileEntry[]; ignoredFilePaths: string[] }> {
  log.info(`Scanning local files in ${dirPath}`);
  
  const includedFiles: FileEntry[] = [];
  const ignoredFilePaths: string[] = [];
  const normalizedDir = normalize(dirPath).replace(/\/$/, ""); // Target directory for upload
  const cwd = Deno.cwd(); // Current working directory (where .nsite-ignore lives)
  
  // --- Load and parse .nsite-ignore rules from CWD --- 
  const ignoreFilePath = join(cwd, ".nsite-ignore");
  let ignorePatterns: string[] = [...DEFAULT_IGNORE_PATTERNS];
  let foundIgnoreFile = false;

  if (existsSync(ignoreFilePath)) {
    try {
      const ignoreContent = await Deno.readTextFile(ignoreFilePath);
      const customPatterns = ignoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"));
      ignorePatterns.push(...customPatterns);
      log.info(`Found .nsite-ignore in ${cwd}, loaded ${customPatterns.length} custom rules.`);
      foundIgnoreFile = true;
    } catch (error) {
      log.warn(`Failed to read .nsite-ignore file from ${cwd}: ${error}. Using default ignore patterns.`);
    }
  } else {
    log.debug(`No .nsite-ignore file found in ${cwd}, using default ignore patterns.`);
  }
  const parsedRules = parseIgnorePatterns(ignorePatterns);
  // --- End ignore rule loading ---

  try {
    // Use expandGlob to walk the target directory
    for await (const entry of expandGlob("**/*", { 
        root: normalizedDir, 
        includeDirs: true, 
        extended: true,
        globstar: true,
    })) {
      // --- Ignore Check Logic --- 
      // 1. Get path relative to CWD (where .nsite-ignore is)
      const pathRelativeToCwd = relative(cwd, entry.path);
      const isDir = entry.isDirectory;
      // 2. Format path for matching (add trailing slash for dirs)
      const checkPath = isDir ? pathRelativeToCwd + "/" : pathRelativeToCwd;
      // 3. Perform the check
      if (isIgnored(checkPath, parsedRules, isDir)) {
          const ignoredPath = checkPath.replace(/\\/g, '/'); 
          ignoredFilePaths.push(ignoredPath);
          // Log which path (relative to CWD) caused the ignore
          if (isDir) {
              log.debug(`Ignoring directory (and contents): ${ignoredPath}`);
          } else {
              log.debug(`Ignoring file: ${ignoredPath}`);
          }
          continue; // Skip this entry entirely
      }
      // --- End Ignore Check --- 
      
      // Skip directories that were *not* ignored (we only upload files)
      if (isDir) {
          continue;
      }

      // --- Process Included File --- 
      // This code only runs for files that were NOT ignored.
      // Get path relative to the UPLOAD directory for the final FileEntry path
      const relativeToUploadDir = relative(normalizedDir, entry.path);
      try {
        const fileInfo = await Deno.stat(entry.path);
        const fileEntry: FileEntry = {
          path: "/" + relativeToUploadDir.replace(/\\/g, '/'), // Correct regex, ensure leading /
          size: fileInfo.size,
          contentType: getContentType(relativeToUploadDir),
        };
        includedFiles.push(fileEntry);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.warn(`Could not get file stats for included file ${entry.path}: ${errorMessage}`);
      }
      // --- End Process Included File --- 
    }
    
    log.info(`Scan complete: ${includedFiles.length} files included, ${ignoredFilePaths.length} ignored.` + 
             (foundIgnoreFile ? ` (Used .nsite-ignore from CWD)` : ""));
    
    return { 
        includedFiles: includedFiles.sort((a, b) => a.path.localeCompare(b.path)), 
        ignoredFilePaths: ignoredFilePaths.sort((a, b) => a.localeCompare(b))
    }; 

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to scan directory ${dirPath}: ${errorMessage}`);
    throw new Error(`Failed to scan directory: ${errorMessage}`);
  }
}


export interface IgnoreRule {
  pattern: string;
  regex: RegExp;
  negates: boolean;
  appliesToDir: boolean;
}

/**
 * Parses raw ignore patterns into structured rules with regex
 */
export function parseIgnorePatterns(patterns: string[]): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (let pattern of patterns) {
    let negates = false;
    if (pattern.startsWith("!")) {
      negates = true;
      pattern = pattern.substring(1);
    }

    let appliesToDir = false;
    if (pattern.endsWith("/")) {
      appliesToDir = true;
    }

    try {
      const regex = globToRegExp(pattern.endsWith('/') ? pattern.slice(0, -1) : pattern, { 
          extended: true, 
          globstar: true, 
          caseInsensitive: false 
      });
      rules.push({ pattern, regex, negates, appliesToDir });
    } catch (e) {
      // Safely get error message
      const errorMessage = e instanceof Error ? e.message : String(e);
      log.warn(`Invalid pattern in .nsite-ignore, skipping: "${patterns[patterns.indexOf(pattern)]}" - Error: ${errorMessage}`);
    }
  }
  return rules;
}

/**
 * Checks if a given path should be ignored based on the rules.
 * Rules are processed in order. The last matching rule determines the outcome.
 * Negation rules (`!pattern`) override previous ignore rules.
 */
export function isIgnored(relativePath: string, rules: IgnoreRule[], isDirectory: boolean): boolean {
  let lastMatchStatus: { ignored: boolean } | null = null;

  const normalizedPath = relativePath.replace(/\\/g, '/');
  const checkPath = isDirectory && !normalizedPath.endsWith("/") ? normalizedPath + "/" : normalizedPath;

  for (const rule of rules) {
    let match = false;
    if (rule.appliesToDir) {
        const dirPattern = rule.pattern.endsWith('/') ? rule.pattern : rule.pattern + '/';
        if (checkPath === dirPattern || checkPath.startsWith(dirPattern)) {
            match = true;
        }
    } else if (isDirectory && !rule.pattern.endsWith('/')) {
        if (rule.regex.test(checkPath.endsWith('/') ? checkPath.slice(0,-1) : checkPath)) {
             match = true;
        }
    } else {
        if (rule.regex.test(checkPath)) {
            match = true;
        }
    }

    if (match) {
        lastMatchStatus = { ignored: !rule.negates }; 
    }
  }

  if (lastMatchStatus === null) {
      if (checkPath.startsWith(".") && !checkPath.startsWith(".well-known/")) {
          log.debug(`Implicitly ignoring dotfile/dir (no rule matched): ${checkPath}`);
          return true; 
      } else {
          return false; 
      }
  }

  log.debug(`Ignore check for ${checkPath}: ${lastMatchStatus.ignored ? 'IGNORED' : 'NOT IGNORED'} (last match rule)`);
  return lastMatchStatus.ignored;
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
  const fullPath = join(normalizedDir, fileEntry.path.replace(/^\//, ""));

  
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