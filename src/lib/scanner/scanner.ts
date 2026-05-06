import { basename } from "@std/path";
import { expandGlob } from "@std/fs/expand-glob";
import { normalize, relative } from "@std/path";
import { getPatternsForLevel, getSuspiciousFilenamesForLevel } from "./patterns.ts";
import { shouldSkipFile } from "./filter.ts";
import type { ScanFileEntry, ScanFinding, ScanLevel, ScanOptions, ScanResult } from "./types.ts";

/**
 * Truncate a matched string for safe display.
 * NEVER shows the full secret — only first 4 chars + "..."
 */
export function createMatchPreview(match: string): string {
  if (match.length <= 4) return match.slice(0, 2) + "...";
  return match.slice(0, 4) + "...";
}

/**
 * Calculate Shannon entropy of a string.
 * Used for high-level scan to detect high-entropy strings.
 * Returns bits per character.
 */
export function shannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const char of str) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Scan a single file's content for secret patterns.
 *
 * @param filePath - Relative file path (for display and filename checks)
 * @param content - File text content
 * @param level - Scan level
 * @returns Array of findings for this file
 */
export function scanContent(
  filePath: string,
  content: string,
  level: ScanLevel = "medium",
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const patterns = getPatternsForLevel(level);
  const filenamePatterns = getSuspiciousFilenamesForLevel(level);

  // Check suspicious filenames
  const filename = basename(filePath);
  for (const fp of filenamePatterns) {
    if (fp.pattern.test(filename)) {
      findings.push({
        filePath,
        line: 0, // Filename match, not a line match
        patternId: fp.id,
        patternName: fp.name,
        severity: fp.severity,
        matchPreview: filename,
      });
    }
  }

  // Scan content line-by-line
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of patterns) {
      // For high-entropy pattern, use Shannon entropy check instead of just regex
      if (pattern.id === "high-entropy") {
        // Find all long strings on this line
        const longStringRegex = /[A-Za-z0-9+/=_-]{40,}/g;
        let match;
        while ((match = longStringRegex.exec(line)) !== null) {
          const entropy = shannonEntropy(match[0]);
          // Threshold: > 4.5 bits/char indicates likely random/secret data
          if (entropy > 4.5) {
            findings.push({
              filePath,
              line: i + 1,
              patternId: pattern.id,
              patternName: pattern.name,
              severity: pattern.severity,
              matchPreview: createMatchPreview(match[0]),
            });
          }
        }
        continue;
      }

      // Standard regex pattern matching — loop to catch all matches per line
      const regex = new RegExp(
        pattern.regex.source,
        pattern.regex.flags.includes("g") ? pattern.regex.flags : pattern.regex.flags + "g",
      );
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        findings.push({
          filePath,
          line: i + 1,
          patternId: pattern.id,
          patternName: pattern.name,
          severity: pattern.severity,
          matchPreview: createMatchPreview(match[0]),
        });
        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) regex.lastIndex++;
      }
    }
  }

  return findings;
}

/**
 * Scan a list of files for secrets.
 * Used by deploy integration where the file list is already available.
 *
 * @param files - Array of file entries with relative and absolute paths
 * @param options - Scan options (level, verbose)
 * @returns Aggregated scan result
 */
export async function scanFileList(
  files: ScanFileEntry[],
  options: ScanOptions = {},
): Promise<ScanResult> {
  const level: ScanLevel = options.level || "medium";
  const startTime = Date.now();
  const allFindings: ScanFinding[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;

  for (const file of files) {
    // Check if binary
    if (await shouldSkipFile(file.path, file.absolutePath)) {
      filesSkipped++;
      continue;
    }

    // Read and scan content
    try {
      const content = await Deno.readTextFile(file.absolutePath);
      const findings = scanContent(file.path, content, level);
      allFindings.push(...findings);
      filesScanned++;
    } catch {
      // File unreadable — record as a warning finding so users know the scan was incomplete
      filesSkipped++;
      allFindings.push({
        filePath: file.path,
        line: 0,
        patternId: "unreadable-file",
        patternName: "Unreadable file",
        severity: "low",
        matchPreview: "(file could not be read — scan incomplete for this file)",
      });
    }
  }

  return {
    findings: allFindings,
    filesScanned,
    filesSkipped,
    scanLevel: level,
    duration: Date.now() - startTime,
  };
}

/**
 * Scan a directory for secrets.
 * Used by the standalone `nsyte scan` command.
 *
 * @param dirPath - Directory path to scan
 * @param options - Scan options (level, verbose)
 * @returns Aggregated scan result
 */
export async function scanDirectory(
  dirPath: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const normalizedDir = normalize(dirPath).replace(/\/$/, "");
  const files: ScanFileEntry[] = [];

  for await (
    const entry of expandGlob("**/*", {
      root: normalizedDir,
      includeDirs: false,
      extended: true,
      globstar: true,
    })
  ) {
    const relativePath = relative(normalizedDir, entry.path);
    files.push({
      path: relativePath,
      absolutePath: entry.path,
    });
  }

  return scanFileList(files, options);
}
