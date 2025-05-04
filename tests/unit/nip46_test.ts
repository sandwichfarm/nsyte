import { assertEquals, assertThrows } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { encodeBunkerInfo, decodeBunkerInfo, parseBunkerUrl, BunkerInfo } from "../../src/lib/nip46.ts";

describe("NIP-46 Bunker Functions", () => {
  describe("parseBunkerUrl", () => {
    it("should correctly parse a valid bunker URL", () => {
      const url = "bunker://1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef?relay=wss://relay.example.com&relay=wss://relay2.example.com&secret=mySecret";
      const parsed = parseBunkerUrl(url);
      
      assertEquals(parsed.pubkey, "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      assertEquals(parsed.relays.length, 2);
      assertEquals(parsed.relays[0], "wss://relay.example.com");
      assertEquals(parsed.relays[1], "wss://relay2.example.com");
      assertEquals(parsed.secret, "mySecret");
    });

    it("should handle URL encoded special characters", () => {
      const url = "bunker://1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef?relay=wss%3A%2F%2Frelay.example.com%3Ftoken%3Dabc&secret=secret%20with%20spaces";
      const parsed = parseBunkerUrl(url);
      
      assertEquals(parsed.pubkey, "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      assertEquals(parsed.relays.length, 1);
      assertEquals(parsed.relays[0], "wss://relay.example.com?token=abc");
      assertEquals(parsed.secret, "secret with spaces");
    });

    it("should throw an error for invalid bunker URL", () => {
      assertThrows(() => parseBunkerUrl("https://example.com"), Error, "Invalid bunker URL format");
    });

    it("should throw an error if no relay is provided", () => {
      assertThrows(
        () => parseBunkerUrl("bunker://1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"), 
        Error, 
        "Bunker URL must include at least one relay parameter"
      );
    });
  });

  describe("encodeBunkerInfo and decodeBunkerInfo", () => {
    it("should round-trip encode and decode bunker info correctly", () => {
      const originalInfo: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com", "wss://relay2.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        secret: "secretString"
      };

      const encoded = encodeBunkerInfo(originalInfo);
      
      // Should start with nbunksec
      assertEquals(encoded.startsWith("nbunksec"), true);
      
      const decoded = decodeBunkerInfo(encoded);
      
      assertEquals(decoded.pubkey, originalInfo.pubkey);
      assertEquals(decoded.relays.length, originalInfo.relays.length);
      assertEquals(decoded.relays[0], originalInfo.relays[0]);
      assertEquals(decoded.relays[1], originalInfo.relays[1]);
      assertEquals(decoded.local_key, originalInfo.local_key);
      assertEquals(decoded.secret, originalInfo.secret);
    });

    it("should encode and decode without a secret", () => {
      const originalInfo: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      };

      const encoded = encodeBunkerInfo(originalInfo);
      const decoded = decodeBunkerInfo(encoded);
      
      assertEquals(decoded.pubkey, originalInfo.pubkey);
      assertEquals(decoded.relays.length, originalInfo.relays.length);
      assertEquals(decoded.relays[0], originalInfo.relays[0]);
      assertEquals(decoded.local_key, originalInfo.local_key);
      assertEquals(decoded.secret, undefined);
    });

    it("should throw error when decoding invalid nbunksec string", () => {
      assertThrows(() => decodeBunkerInfo("invalid"), Error, "Not a valid nbunksec string");
    });

    it("should throw error for nbunksec missing required fields", () => {
      // Create a minimal valid nbunksec then corrupt it 
      const info: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      };
      
      const encoded = encodeBunkerInfo(info);
      // Corrupt by replacing nbunksec prefix with nbuck (invalid)
      const corrupted = "nbuck" + encoded.slice(5);
      
      assertThrows(() => decodeBunkerInfo(corrupted), Error);
    });
  });
}); 