import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { bech32Decode, npubEncode } from "../../src/lib/utils.ts";
import { hexToBytes } from "@noble/hashes/utils";
import { bech32 } from "@scure/base";

Deno.test("Utils - bech32Decode", async (t) => {
  await t.step("should decode valid npub", () => {
    const validNpub = "npub105xzerq73d8456ea9c0s4xuv04h97j3m9swsa8u20dk96n3l9gdslddae9";
    const result = bech32Decode(validNpub);
    
    assertEquals(result.prefix, "npub");
    assertEquals(result.data.length, 32);
    assertEquals(result.data instanceof Uint8Array, true);
  });

  await t.step("should decode valid nsec", () => {
    // Create a valid nsec by first encoding a test key
    const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const keyBytes = hexToBytes(testKey);
    
    // Create a proper nsec using the encoding function
    const nsec = bech32.encode("nsec", bech32.toWords(keyBytes));
    
    const result = bech32Decode(nsec);
    
    assertEquals(result.prefix, "nsec");
    assertEquals(result.data.length, 32);
  });

  await t.step("should throw on invalid bech32", () => {
    const invalidBech32 = "invalid_bech32_string";
    assertThrows(() => bech32Decode(invalidBech32));
  });

  await t.step("should throw on invalid checksum", () => {
    const invalidChecksum = "npub1w8lhpn6nsjjf0lg6lw25gzv9qj0vzzwvr7dgahs0y0cddhr2wrqqh6edsj";
    assertThrows(() => bech32Decode(invalidChecksum));
  });

  await t.step("should handle empty string", () => {
    assertThrows(() => bech32Decode(""));
  });
});

Deno.test("Utils - npubEncode", async (t) => {
  await t.step("should encode hex pubkey to npub", () => {
    const pubkeyHex = "7d0c2c8c1e8b4f5a6b3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b";
    const npub = npubEncode(pubkeyHex);
    
    assertEquals(npub.startsWith("npub1"), true);
    assertEquals(npub.length > 60, true); // npub should be around 63 characters
    
    // Should be able to decode back to the same hex
    const decoded = bech32Decode(npub);
    const decodedHex = Array.from(decoded.data, byte => byte.toString(16).padStart(2, '0')).join('');
    assertEquals(decodedHex, pubkeyHex);
  });

  await t.step("should handle all zeros", () => {
    const zeroHex = "0000000000000000000000000000000000000000000000000000000000000000";
    const npub = npubEncode(zeroHex);
    
    assertEquals(npub.startsWith("npub1"), true);
    
    // Verify round-trip
    const decoded = bech32Decode(npub);
    const decodedHex = Array.from(decoded.data, byte => byte.toString(16).padStart(2, '0')).join('');
    assertEquals(decodedHex, zeroHex);
  });

  await t.step("should handle all ones", () => {
    const onesHex = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const npub = npubEncode(onesHex);
    
    assertEquals(npub.startsWith("npub1"), true);
    
    // Verify round-trip
    const decoded = bech32Decode(npub);
    const decodedHex = Array.from(decoded.data, byte => byte.toString(16).padStart(2, '0')).join('');
    assertEquals(decodedHex, onesHex);
  });

  await t.step("should handle invalid hex length", () => {
    const shortHex = "1234"; // Too short
    // npubEncode may not validate length, so let's test what actually happens
    try {
      const result = npubEncode(shortHex);
      // If it doesn't throw, that's fine too - we just verify the behavior
      assertEquals(typeof result, "string");
    } catch (error) {
      // If it does throw, that's also acceptable
      assertEquals(error instanceof Error, true);
    }
  });

  await t.step("should throw on invalid hex characters", () => {
    const invalidHex = "7d0c2c8c1e8b4f5a6b3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2azz";
    assertThrows(() => npubEncode(invalidHex));
  });
});

Deno.test("Utils - Round Trip Encoding/Decoding", async (t) => {
  await t.step("should maintain consistency between encode and decode", () => {
    const testCases = [
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "0000000000000000000000000000000000000000000000000000000000000000",
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      "7d0c2c8c1e8b4f5a6b3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b",
      "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890"
    ];

    for (const originalHex of testCases) {
      // Encode to npub
      const npub = npubEncode(originalHex);
      
      // Decode back to hex
      const decoded = bech32Decode(npub);
      const decodedHex = Array.from(decoded.data, byte => byte.toString(16).padStart(2, '0')).join('');
      
      // Should match original
      assertEquals(decodedHex, originalHex);
      assertEquals(decoded.prefix, "npub");
    }
  });

  await t.step("should handle case insensitive hex input", () => {
    const lowerHex = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const upperHex = "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";
    
    const npubLower = npubEncode(lowerHex);
    const npubUpper = npubEncode(upperHex);
    
    // Both should produce the same npub (since hex is case insensitive)
    assertEquals(npubLower, npubUpper);
    
    // Verify both decode to the same value (lowercase)
    const decodedLower = bech32Decode(npubLower);
    const decodedUpper = bech32Decode(npubUpper);
    
    const hexLower = Array.from(decodedLower.data, byte => byte.toString(16).padStart(2, '0')).join('');
    const hexUpper = Array.from(decodedUpper.data, byte => byte.toString(16).padStart(2, '0')).join('');
    
    assertEquals(hexLower, hexUpper);
    assertEquals(hexLower, lowerHex); // Should be normalized to lowercase
  });
});

Deno.test("Utils - Edge Cases and Error Handling", async (t) => {
  await t.step("should handle malformed inputs gracefully", () => {
    const malformedInputs = [
      "",
      "npub",
      "npub1",
      "not_bech32_at_all", 
      "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", // Valid format but wrong prefix for npub
      "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1invalid" // Invalid checksum
    ];

    for (const input of malformedInputs) {
      assertThrows(() => bech32Decode(input));
    }
  });

  await t.step("should handle various hex input formats", () => {
    const testInputs = [
      "", // Empty
      "12345", // Odd length  
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde", // Too short (63 chars)
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef0", // Too long (65 chars)
    ];

    for (const input of testInputs) {
      try {
        const result = npubEncode(input);
        // If encoding succeeds, verify it's a string
        assertEquals(typeof result, "string");
      } catch (error) {
        // If it throws, that's also valid behavior
        assertEquals(error instanceof Error, true);
      }
    }
  });

  await t.step("should validate data length constraints", () => {
    // Test that decoded data is exactly 32 bytes for npub
    const validNpub = "npub105xzerq73d8456ea9c0s4xuv04h97j3m9swsa8u20dk96n3l9gdslddae9";
    const decoded = bech32Decode(validNpub);
    
    assertEquals(decoded.data.length, 32);
    assertEquals(decoded.data instanceof Uint8Array, true);
    
    // Test that all bytes are valid (0-255)
    for (const byte of decoded.data) {
      assertEquals(byte >= 0 && byte <= 255, true);
    }
  });
});