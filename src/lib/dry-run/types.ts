import type { EventTemplate } from "applesauce-core/helpers";

/**
 * Represents a single event that would be published during a deploy or announce.
 * Contains the unsigned event template (no signer involved).
 */
export interface DryRunEvent {
  /** Human-readable label, e.g. "Site Manifest (kind 35128)" */
  label: string;
  /** Nostr event kind number */
  kind: number;
  /** Unsigned event template — no pubkey, id, or sig */
  template: EventTemplate;
  /** Output filename, e.g. "manifest-35128.json" */
  filename: string;
}

/**
 * Options for dry-run output behavior.
 */
export interface DryRunOptions {
  /** Custom output directory (--dry-run-output). Defaults to /tmp/nsyte-dry-run-{timestamp}/ */
  outputDir?: string;
  /** Kind numbers to also print to stdout (--dry-run-show-kinds) */
  showKinds?: number[];
  /** Whether to launch TUI inspector (true when interactive terminal, no --non-interactive) */
  interactive?: boolean;
}

/**
 * Result from writing dry-run output files.
 */
export interface DryRunResult {
  /** Actual output directory used */
  outputDir: string;
  /** Full paths of written files */
  files: string[];
  /** All collected events */
  events: DryRunEvent[];
}
