/**
 * NIP-5A: Named site encoding and validation utilities
 * Base36 pubkey encoding/decoding and dTag format validation
 */

export const PUBKEY_B36_LENGTH = 50;
export const PUBKEY_BYTE_LENGTH = 32;
export const DTAG_MAX_LENGTH = 13;
const DTAG_REGEX = /^[a-z0-9-]{1,13}$/;

/**
 * Encode a 32-byte public key as a base36 string of exactly 50 lowercase characters.
 * @param pubkey - 32-byte Uint8Array public key
 * @returns 50-character lowercase base36 string
 */
export function encodePubkeyBase36(pubkey: Uint8Array): string {
  if (pubkey.length !== PUBKEY_BYTE_LENGTH) {
    throw new Error(`Expected 32-byte pubkey, got ${pubkey.length} bytes`);
  }

  let num = 0n;
  for (const byte of pubkey) {
    num = (num << 8n) | BigInt(byte);
  }

  return num.toString(36).padStart(PUBKEY_B36_LENGTH, "0");
}

/**
 * Decode a 50-character base36 string back to a 32-byte public key.
 * @param encoded - 50-character lowercase base36 string
 * @returns 32-byte Uint8Array public key
 */
export function decodePubkeyBase36(encoded: string): Uint8Array {
  if (encoded.length !== PUBKEY_B36_LENGTH) {
    throw new Error(
      `Expected 50-character base36 string, got ${encoded.length} characters`,
    );
  }

  for (const char of encoded) {
    if (!/[0-9a-z]/.test(char)) {
      throw new Error(`Invalid base36 character: '${char}'`);
    }
  }

  let num = 0n;
  for (const char of encoded) {
    num = num * 36n + BigInt(parseInt(char, 36));
  }

  const bytes = new Uint8Array(PUBKEY_BYTE_LENGTH);
  for (let i = PUBKEY_BYTE_LENGTH - 1; i >= 0; i--) {
    bytes[i] = Number(num & 0xFFn);
    num = num >> 8n;
  }

  if (num !== 0n) {
    throw new Error("Base36 value does not fit into 32-byte pubkey");
  }

  return bytes;
}

/**
 * Validate a dTag (site identifier) against NIP-5A constraints.
 * Valid dTags: 1-13 characters, lowercase alphanumeric and hyphens, no trailing hyphen.
 * @param tag - The dTag string to validate
 * @returns Validation result with optional error message and suggestion
 */
export function validateDTag(
  tag: string,
): { valid: boolean; error?: string; suggestion?: string } {
  if (tag === "") {
    return { valid: false, error: "Site identifier cannot be empty" };
  }

  if (tag.endsWith("-")) {
    const suggestion = tag.replace(/-+$/, "") || "site";
    return {
      valid: false,
      error: `Site identifier cannot end with a hyphen. Try "${suggestion}"`,
      suggestion,
    };
  }

  if (tag.length > DTAG_MAX_LENGTH) {
    const suggestion = suggestIdentifier(tag);
    return {
      valid: false,
      error:
        `Site identifier "${tag}" is too long (${tag.length} chars, max ${DTAG_MAX_LENGTH}). Try "${suggestion}"`,
      suggestion,
    };
  }

  if (!DTAG_REGEX.test(tag)) {
    const suggestion = suggestIdentifier(tag);
    return {
      valid: false,
      error:
        `Invalid site identifier "${tag}". Try "${suggestion}" (lowercase, no underscores, max ${DTAG_MAX_LENGTH} chars)`,
      suggestion,
    };
  }

  return { valid: true };
}

/**
 * Transform an arbitrary input string into a valid dTag suggestion.
 * @param input - Any string to transform
 * @returns A valid dTag string, or "site" if the input is empty after transformation
 */
export function suggestIdentifier(input: string): string {
  let result = input
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+$/, "")
    .slice(0, DTAG_MAX_LENGTH);

  // After truncation, trailing hyphens may appear again
  result = result.replace(/-+$/, "");

  if (result === "") {
    return "site";
  }

  return result;
}
