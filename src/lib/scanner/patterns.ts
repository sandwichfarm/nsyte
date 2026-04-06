import type { ScanPattern } from "./types.ts";

/**
 * All scanner patterns organized by level.
 * Patterns are evaluated per-line with regex.exec() or regex.test().
 *
 * Levels are cumulative:
 * - low: Only patterns with level === "low"
 * - medium: Patterns with level === "low" OR "medium"
 * - high: All patterns
 */
export const SCAN_PATTERNS: ScanPattern[] = [
  // === LOW LEVEL — Nostr-specific only ===
  {
    id: "nsec-key",
    name: "Nostr Private Key (nsec)",
    regex: /nsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}/,
    severity: "high",
    level: "low",
    description:
      "Bech32-encoded Nostr private key. If committed, the key is permanently compromised.",
  },
  {
    id: "nbunksec",
    name: "Bunker Secret (nbunksec)",
    regex: /nbunksec1[a-z0-9]{20,}/,
    severity: "high",
    level: "low",
    description:
      "Encoded bunker connection secret. Leaking this grants signing access via the bunker.",
  },
  {
    id: "bunker-url",
    name: "Bunker Connection URL",
    regex: /bunker:\/\/[^\s"'<>]+/,
    severity: "high",
    level: "low",
    description:
      "NIP-46 bunker connection URL containing relay and secret parameters.",
  },

  // === MEDIUM LEVEL — Adds hex keys and env patterns ===
  {
    id: "hex-64",
    name: "64-char Hex String (potential private key)",
    regex: /\b[0-9a-fA-F]{64}\b/,
    severity: "medium",
    level: "medium",
    description:
      "64-character hexadecimal string that could be a raw Nostr private key.",
  },
  {
    id: "env-secret",
    name: "Environment Variable Secret",
    regex:
      /(?:PRIVATE_KEY|SECRET_KEY|SECRET|API_KEY|API_SECRET|TOKEN|PASSWORD|PASSPHRASE)\s*[=:]\s*\S+/i,
    severity: "medium",
    level: "medium",
    description:
      "Environment variable assignment containing a potentially sensitive value.",
  },
  {
    id: "pem-private-key",
    name: "PEM Private Key Header",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: "high",
    level: "medium",
    description:
      "PEM-encoded private key block header. File contains an unencrypted private key.",
  },

  // === HIGH LEVEL — Adds entropy detection (handled separately in scanner) ===
  // High-entropy detection is not a simple regex — it is implemented in scanner.ts
  // but we define a pattern entry for consistency in reporting
  {
    id: "high-entropy",
    name: "High-Entropy String",
    regex: /[A-Za-z0-9+/=_-]{40,}/,
    severity: "low",
    level: "high",
    description:
      "Long string with high Shannon entropy — may be an API token or encoded secret.",
  },
];

/**
 * Suspicious filenames that should trigger a warning at medium+ level.
 * These are checked against the filename (not content).
 */
export const SUSPICIOUS_FILENAMES: Array<{
  id: string;
  name: string;
  pattern: RegExp;
  severity: "high" | "medium" | "low";
  level: "low" | "medium" | "high";
  description: string;
}> = [
  {
    id: "dotenv-file",
    name: "Environment File",
    pattern: /^\.env(\..*)?$/,
    severity: "medium",
    level: "medium",
    description:
      "Environment file that typically contains secrets and credentials.",
  },
  {
    id: "pem-file",
    name: "PEM Certificate/Key File",
    pattern: /\.(pem|key|p12|pfx)$/i,
    severity: "medium",
    level: "medium",
    description:
      "Certificate or key file that may contain private key material.",
  },
  {
    id: "credentials-file",
    name: "Credentials File",
    pattern: /^(credentials|service[_-]?account)\.json$/i,
    severity: "medium",
    level: "medium",
    description:
      "Credentials or service account file that typically contains secrets.",
  },
];

/**
 * Get patterns active for a given scan level.
 * Levels are cumulative: medium includes low, high includes medium and low.
 */
export function getPatternsForLevel(
  level: "low" | "medium" | "high",
): ScanPattern[] {
  const levelHierarchy: Record<string, string[]> = {
    low: ["low"],
    medium: ["low", "medium"],
    high: ["low", "medium", "high"],
  };
  const activeLevels = levelHierarchy[level];
  return SCAN_PATTERNS.filter((p) => activeLevels.includes(p.level));
}

/**
 * Get suspicious filename patterns active for a given scan level.
 */
export function getSuspiciousFilenamesForLevel(
  level: "low" | "medium" | "high",
) {
  const levelHierarchy: Record<string, string[]> = {
    low: ["low"],
    medium: ["low", "medium"],
    high: ["low", "medium", "high"],
  };
  const activeLevels = levelHierarchy[level];
  return SUSPICIOUS_FILENAMES.filter((p) => activeLevels.includes(p.level));
}
