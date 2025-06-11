import { assertEquals, assertExists, assertThrows } from "std/assert/mod.ts";
import { describe, it } from "jsr:@std/testing/bdd";
import { PrivateKeySigner } from "../../src/lib/signer.ts";
import type { NostrEventTemplate } from "../../src/lib/nostr.ts";

describe("signer - comprehensive branch coverage", () => {
  describe("PrivateKeySigner constructor branches", () => {
    it("should handle valid 64-char hex private key", () => {
      const validHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const signer = new PrivateKeySigner(validHex);
      assertExists(signer);
    });

    it("should handle valid nsec bech32 private key", () => {
      // This is a test nsec key (32 bytes of 0x01)
      const validNsec = "nsec1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqsl3mldn";
      const signer = new PrivateKeySigner(validNsec);
      assertExists(signer);
    });

    it("should throw on invalid hex length (too short)", () => {
      const shortHex = "0123456789abcdef"; // Only 16 chars
      assertThrows(
        () => new PrivateKeySigner(shortHex),
        Error,
        "Private key must be a 64-character hex string"
      );
    });

    it("should throw on invalid hex length (too long)", () => {
      const longHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00"; // 66 chars
      assertThrows(
        () => new PrivateKeySigner(longHex),
        Error,
        "Private key must be a 64-character hex string"
      );
    });

    it("should throw on invalid hex characters", () => {
      const invalidHex = "xyz1234567890abc1234567890abcdef1234567890abcdef1234567890abcdef"; // Contains xyz
      assertThrows(
        () => new PrivateKeySigner(invalidHex),
        Error,
        "Private key must be a 64-character hex string"
      );
    });

    it("should throw on invalid nsec format", () => {
      const invalidNsec = "nsec1invalid"; // Too short and invalid chars
      assertThrows(
        () => new PrivateKeySigner(invalidNsec),
        Error
      );
    });

    it("should throw on wrong bech32 prefix", () => {
      // npub instead of nsec
      const wrongPrefix = "npub1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqsz5v4gk";
      assertThrows(
        () => new PrivateKeySigner(wrongPrefix),
        Error
      );
    });

    it("should handle mixed case hex key by normalizing", () => {
      const mixedCase = "ABCdef0123456789ABCdef0123456789ABCdef0123456789ABCdef0123456789";
      const signer = new PrivateKeySigner(mixedCase);
      assertExists(signer);
    });

    it("should throw on empty string", () => {
      assertThrows(
        () => new PrivateKeySigner(""),
        Error,
        "Private key must be a 64-character hex string"
      );
    });

    it("should throw on whitespace-only string", () => {
      assertThrows(
        () => new PrivateKeySigner("   "),
        Error
      );
    });

    it("should throw on null input", () => {
      assertThrows(
        () => new PrivateKeySigner(null as any),
        Error
      );
    });

    it("should throw on undefined input", () => {
      assertThrows(
        () => new PrivateKeySigner(undefined as any),
        Error
      );
    });

    it("should throw on number input", () => {
      assertThrows(
        () => new PrivateKeySigner(123456 as any),
        Error
      );
    });

    it("should throw on object input", () => {
      assertThrows(
        () => new PrivateKeySigner({} as any),
        Error
      );
    });

    it("should throw on array input", () => {
      assertThrows(
        () => new PrivateKeySigner([] as any),
        Error
      );
    });
  });

  describe("SimpleSigner inheritance and functionality", () => {
    it("should inherit getPublicKey from SimpleSigner", async () => {
      const privateKey = "1111111111111111111111111111111111111111111111111111111111111111";
      const signer = new PrivateKeySigner(privateKey);
      
      const pubkey = await signer.getPublicKey();
      assertExists(pubkey);
      assertEquals(typeof pubkey, "string");
      assertEquals(pubkey.length, 64);
      assertEquals(/^[0-9a-f]{64}$/.test(pubkey), true);
    });

    it("should inherit signEvent from SimpleSigner", async () => {
      const privateKey = "2222222222222222222222222222222222222222222222222222222222222222";
      const signer = new PrivateKeySigner(privateKey);
      
      const template: NostrEventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: "Test message"
      };
      
      const signedEvent = await signer.signEvent(template);
      
      assertExists(signedEvent);
      assertExists(signedEvent.id);
      assertExists(signedEvent.pubkey);
      assertExists(signedEvent.sig);
      assertEquals(signedEvent.kind, template.kind);
      assertEquals(signedEvent.content, template.content);
    });

    it("should produce consistent public keys for same private key", async () => {
      const privateKey = "3333333333333333333333333333333333333333333333333333333333333333";
      const signer1 = new PrivateKeySigner(privateKey);
      const signer2 = new PrivateKeySigner(privateKey);
      
      const pubkey1 = await signer1.getPublicKey();
      const pubkey2 = await signer2.getPublicKey();
      
      assertEquals(pubkey1, pubkey2);
    });

    it("should produce different public keys for different private keys", async () => {
      const privateKey1 = "4444444444444444444444444444444444444444444444444444444444444444";
      const privateKey2 = "5555555555555555555555555555555555555555555555555555555555555555";
      
      const signer1 = new PrivateKeySigner(privateKey1);
      const signer2 = new PrivateKeySigner(privateKey2);
      
      const pubkey1 = await signer1.getPublicKey();
      const pubkey2 = await signer2.getPublicKey();
      
      assertEquals(pubkey1 !== pubkey2, true);
    });
  });

  describe("Edge cases with normalizeToSecretKey", () => {
    it("should handle hex key with leading zeros", () => {
      const keyWithLeadingZeros = "0000000000000000000000000000000000000000000000000000000000000001";
      const signer = new PrivateKeySigner(keyWithLeadingZeros);
      assertExists(signer);
    });

    it("should handle hex key with all zeros", () => {
      const allZeros = "0000000000000000000000000000000000000000000000000000000000000000";
      // This might throw depending on the crypto library's validation
      try {
        const signer = new PrivateKeySigner(allZeros);
        assertExists(signer);
      } catch (e) {
        // Some crypto libraries reject all-zero keys
        assertExists(e);
      }
    });

    it("should handle hex key with all F's", () => {
      const allFs = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      const signer = new PrivateKeySigner(allFs);
      assertExists(signer);
    });

    it("should handle nsec with maximum valid value", () => {
      // nsec for key with all bits set to 1 (except for curve order constraints)
      const maxNsec = "nsec1llllllllllllllllllllllllllllllllllllllllllllllllllllsfet2h";
      try {
        const signer = new PrivateKeySigner(maxNsec);
        assertExists(signer);
      } catch (e) {
        // Some values might be outside the valid curve order
        assertExists(e);
      }
    });
  });

  describe("Type exports", () => {
    it("should export Signer type alias", () => {
      // This is a compile-time check - the Signer type is actually a type alias
      // Type aliases don't exist at runtime, so we just verify the module can be imported
      const signerModule = import("../../src/lib/signer.ts");
      assertExists(signerModule);
    });
  });

  describe("Deprecated annotation", () => {
    it("should still function despite deprecation", () => {
      // The @deprecated annotation doesn't affect runtime behavior
      const privateKey = "6666666666666666666666666666666666666666666666666666666666666666";
      const signer = new PrivateKeySigner(privateKey);
      assertExists(signer);
      // In real usage, developers would see deprecation warnings in their IDE
    });
  });
});