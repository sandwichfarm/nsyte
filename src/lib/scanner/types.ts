/**
 * Scan level determines which patterns are active
 * - low: Nostr-specific only (nsec1, nbunksec1, bunker://)
 * - medium: Nostr + hex-64 + env patterns + suspicious filenames (default)
 * - high: Everything + high-entropy string detection
 */
export type ScanLevel = "low" | "medium" | "high";

/**
 * Pattern severity for color-coded output
 */
export type Severity = "high" | "medium" | "low" | "warning";

/**
 * A single pattern definition for the scanner
 */
export interface ScanPattern {
  /** Unique identifier, e.g. "nsec-key" */
  id: string;
  /** Human-readable name, e.g. "Nostr Private Key (nsec)" */
  name: string;
  /** The detection regex — applied per-line */
  regex: RegExp;
  /** Severity for output color coding */
  severity: Severity;
  /** Minimum scan level required to activate this pattern */
  level: ScanLevel;
  /** Human-readable explanation shown in verbose mode */
  description: string;
}

/**
 * A single finding from the scanner
 */
export interface ScanFinding {
  /** File path relative to scan root */
  filePath: string;
  /** 1-based line number */
  line: number;
  /** Pattern ID that matched */
  patternId: string;
  /** Human-readable pattern name */
  patternName: string;
  /** Severity level */
  severity: Severity;
  /** Truncated match preview — first 4 chars + "..." (NEVER full secret) */
  matchPreview: string;
}

/**
 * Aggregated scan result
 */
export interface ScanResult {
  /** All findings across all files */
  findings: ScanFinding[];
  /** Number of text files scanned */
  filesScanned: number;
  /** Number of files skipped (binary) */
  filesSkipped: number;
  /** Scan level used */
  scanLevel: ScanLevel;
  /** Scan duration in milliseconds */
  duration: number;
}

/**
 * Options for the scan functions
 */
export interface ScanOptions {
  /** Scan level — determines active patterns (default: "medium") */
  level?: ScanLevel;
  /** Include verbose output context */
  verbose?: boolean;
}

/**
 * A file entry for scanning — path + absolute path for reading
 */
export interface ScanFileEntry {
  /** Relative path (for display) */
  path: string;
  /** Absolute path (for reading file content) */
  absolutePath: string;
}
