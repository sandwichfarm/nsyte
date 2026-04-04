/**
 * Secrets Scanner Module
 *
 * Detects Nostr-specific secrets and common secret patterns in file content.
 * Provides three configurable scan levels:
 * - low: Nostr-specific only (nsec1, nbunksec1, bunker://)
 * - medium (default): Nostr + hex-64 + env patterns + suspicious filenames
 * - high: Everything + high-entropy string detection
 */

// Public API
export {
  createMatchPreview,
  scanContent,
  scanDirectory,
  scanFileList,
  shannonEntropy,
} from "./scanner.ts";
export {
  getPatternsForLevel,
  getSuspiciousFilenamesForLevel,
  SCAN_PATTERNS,
  SUSPICIOUS_FILENAMES,
} from "./patterns.ts";
export {
  BINARY_EXTENSIONS,
  hasNullBytes,
  isBinaryExtension,
  shouldSkipFile,
} from "./filter.ts";

// Types
export type {
  ScanFileEntry,
  ScanFinding,
  ScanLevel,
  ScanOptions,
  ScanPattern,
  ScanResult,
  Severity,
} from "./types.ts";
