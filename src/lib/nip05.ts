import { normalizeToPubkey } from "applesauce-core/helpers";
import { createLogger } from "./logger.ts";

const log = createLogger("nip05");

/**
 * Cache for NIP-05 lookups to avoid repeated network requests
 * Maps identifier -> { pubkey: string, timestamp: number }
 */
const nip05Cache = new Map<string, { pubkey: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * NIP-05 identifier format validation
 * Matches: name@domain.com or _@domain.com
 */
const NIP05_REGEX = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/**
 * Check if a string looks like a NIP-05 identifier
 */
export function isNip05Identifier(input: string): boolean {
  return NIP05_REGEX.test(input);
}

/**
 * Resolve a NIP-05 identifier to a pubkey
 * @param identifier - NIP-05 identifier (e.g., "user@domain.com" or "_@domain.com")
 * @param options - Resolution options
 * @returns Hex pubkey string or null if resolution fails
 */
export async function resolveNip05ToPubkey(
  identifier: string,
  options: {
    timeout?: number;
    useCache?: boolean;
  } = {},
): Promise<string | null> {
  const { timeout = 5000, useCache = true } = options;

  // Validate format
  if (!isNip05Identifier(identifier)) {
    log.debug(`Invalid NIP-05 format: ${identifier}`);
    return null;
  }

  // Check cache
  if (useCache) {
    const cached = nip05Cache.get(identifier);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      log.debug(`Using cached NIP-05 result for ${identifier}`);
      return cached.pubkey;
    }
  }

  // Parse identifier
  const [name, domain] = identifier.split("@");
  if (!name || !domain) {
    log.debug(`Failed to parse NIP-05 identifier: ${identifier}`);
    return null;
  }

  // Construct URL
  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
  log.debug(`Fetching NIP-05 data from: ${url}`);

  try {
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      log.debug(`NIP-05 fetch failed with status ${response.status}: ${url}`);
      // Consume the body to prevent resource leak
      try {
        await response.text();
      } catch {
        // Ignore errors when consuming error response
      }
      return null;
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      log.debug(`Failed to parse NIP-05 JSON response from ${url}: ${error}`);
      return null;
    }

    // Validate response structure
    if (!data || typeof data !== "object" || !data.names || typeof data.names !== "object") {
      log.debug(`Invalid NIP-05 response structure from ${url}`);
      return null;
    }

    // Get pubkey from response
    const pubkey = data.names[name];
    if (!pubkey || typeof pubkey !== "string") {
      log.debug(`NIP-05 identifier not found in response: ${identifier}`);
      return null;
    }

    // Validate it's a valid hex pubkey (64 chars, hex)
    if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
      log.debug(`Invalid pubkey format in NIP-05 response: ${pubkey}`);
      return null;
    }

    // Verify relays if present (optional but recommended by NIP-05)
    if (data.relays && typeof data.relays === "object") {
      const userRelays = data.relays[pubkey];
      if (userRelays && Array.isArray(userRelays)) {
        log.debug(`NIP-05 found ${userRelays.length} relays for ${identifier}`);
      }
    }

    // Cache the result
    if (useCache) {
      nip05Cache.set(identifier, { pubkey, timestamp: Date.now() });
    }

    log.debug(`Successfully resolved NIP-05 ${identifier} to ${pubkey.slice(0, 8)}...`);
    return pubkey.toLowerCase();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        log.debug(`NIP-05 lookup timeout for ${identifier}`);
      } else {
        log.debug(`NIP-05 lookup error for ${identifier}: ${error.message}`);
      }
    }
    return null;
  }
}

/**
 * Normalize a pubkey input to hex format
 * Handles: npub, hex, and NIP-05 identifiers
 * @param input - Public key in various formats (npub, hex, or NIP-05)
 * @returns Hex pubkey string
 * @throws Error if input cannot be resolved to a valid pubkey
 */
export async function normalizePubkeyInput(input: string): Promise<string> {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid pubkey input: empty or not a string");
  }

  const trimmed = input.trim();

  // Try npub/hex normalization first (fast, synchronous)
  try {
    const normalized = normalizeToPubkey(trimmed);
    if (normalized) {
      log.debug(`Normalized pubkey from npub/hex: ${normalized.slice(0, 8)}...`);
      return normalized;
    }
  } catch (error) {
    // Not a valid npub/hex, continue to NIP-05 check
    log.debug(
      `Input not a valid npub/hex: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Check if it's a NIP-05 identifier
  if (isNip05Identifier(trimmed)) {
    log.debug(`Attempting NIP-05 resolution for: ${trimmed}`);
    const pubkey = await resolveNip05ToPubkey(trimmed);
    if (pubkey) {
      return pubkey;
    }
    throw new Error(
      `Failed to resolve NIP-05 identifier: ${trimmed}\n` +
        `Please check:\n` +
        `  - The identifier is correct (e.g., "name@domain.com")\n` +
        `  - The domain's .well-known/nostr.json is accessible\n` +
        `  - Your internet connection is working`,
    );
  }

  // If we get here, the input is invalid
  throw new Error(
    `Invalid pubkey format: ${trimmed}\n` +
      `Expected one of:\n` +
      `  - npub (e.g., "npub1...")\n` +
      `  - hex (64-character hex string)\n` +
      `  - NIP-05 identifier (e.g., "name@domain.com")`,
  );
}

/**
 * Clear the NIP-05 cache
 * Useful for testing or forcing fresh lookups
 */
export function clearNip05Cache(): void {
  nip05Cache.clear();
  log.debug("NIP-05 cache cleared");
}
