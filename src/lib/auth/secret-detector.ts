import { decodePointer } from "applesauce-core/helpers";
import { createLogger } from "../logger.ts";

const log = createLogger("secret-detector");

/**
 * Secret format types
 */
export type SecretFormat = "nsec" | "nbunksec" | "bunker-url" | "hex";

/**
 * Detected secret information
 */
export interface DetectedSecret {
  format: SecretFormat;
  value: string;
}

/**
 * Detect the format of a secret string
 *
 * Supports:
 * - nsec1... (bech32 encoded private key)
 * - nbunksec1... (bech32 encoded bunker info)
 * - bunker://... (bunker URL)
 * - 64-character hex string (raw private key)
 *
 * @param secret - The secret string to detect
 * @returns Detected secret information or null if format cannot be determined
 */
export function detectSecretFormat(secret: string): DetectedSecret | null {
  if (!secret || typeof secret !== "string") {
    return null;
  }

  const trimmed = secret.trim();

  // Check for nbunksec (must come before nsec check since both start with 'n')
  if (trimmed.startsWith("nbunksec1")) {
    log.debug("Detected nbunksec format");
    return { format: "nbunksec", value: trimmed };
  }

  // Check for nsec
  if (trimmed.startsWith("nsec1")) {
    log.debug("Detected nsec format");
    return { format: "nsec", value: trimmed };
  }

  // Check for bunker URL
  if (trimmed.startsWith("bunker://")) {
    log.debug("Detected bunker URL format");
    return { format: "bunker-url", value: trimmed };
  }

  // Check for raw hex (64 characters, hex digits only)
  const hexPattern = /^[0-9a-fA-F]{64}$/;
  if (hexPattern.test(trimmed)) {
    log.debug("Detected raw hex format");
    return { format: "hex", value: trimmed };
  }

  // Try to decode as nsec to catch variations (e.g., lowercase)
  try {
    const decoded = decodePointer(trimmed);
    if (decoded.type === "nsec") {
      log.debug("Detected nsec format (via decode)");
      return { format: "nsec", value: trimmed };
    }
  } catch {
    // Not a valid nsec, continue
  }

  log.warn(`Could not detect secret format for: ${trimmed.slice(0, 10)}...`);
  return null;
}

/**
 * Normalize a secret to the appropriate format for signer creation
 *
 * @param secret - The secret string
 * @returns Normalized secret information or null if invalid
 */
export function normalizeSecret(secret: string): DetectedSecret | null {
  const detected = detectSecretFormat(secret);
  if (!detected) {
    return null;
  }

  // For nsec, we might need to convert to hex for PrivateKeySigner
  // But PrivateKeySigner.fromKey() accepts both nsec and hex, so we can pass as-is
  return detected;
}
