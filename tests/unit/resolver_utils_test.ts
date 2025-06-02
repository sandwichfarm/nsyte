import { assertEquals, assert } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { stub, restore, type Stub } from "jsr:@std/testing/mock";
import { 
  parseCommaSeparated, 
  resolveRelays, 
  resolveServers,
  resolvePubkey
} from "../../src/lib/resolver-utils.ts";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "../../src/lib/constants.ts";

describe("resolver-utils", () => {
  let readProjectFileStub: Stub;

  beforeEach(async () => {
    const configModule = await import("../../src/lib/config.ts");
    readProjectFileStub = stub(
      configModule,
      "readProjectFile",
      () => null
    );
  });

  afterEach(() => {
    restore();
  });

  describe("parseCommaSeparated", () => {
    it("should parse comma-separated string", () => {
      const result = parseCommaSeparated("a,b,c");
      assertEquals(result, ["a", "b", "c"]);
    });

    it("should trim whitespace", () => {
      const result = parseCommaSeparated("a, b , c ");
      assertEquals(result, ["a", "b", "c"]);
    });

    it("should filter empty strings", () => {
      const result = parseCommaSeparated("a,,b,");
      assertEquals(result, ["a", "b"]);
    });

    it("should return empty array for undefined", () => {
      const result = parseCommaSeparated(undefined);
      assertEquals(result, []);
    });

    it("should return empty array for empty string", () => {
      const result = parseCommaSeparated("");
      assertEquals(result, []);
    });
  });

  describe("resolveRelays", () => {
    it("should use CLI option relays", () => {
      const options = { relays: "wss://relay1,wss://relay2" };
      const result = resolveRelays(options);
      assertEquals(result, ["wss://relay1", "wss://relay2"]);
    });

    it("should use config relays when no CLI option", async () => {
      const configModule = await import("../../src/lib/config.ts");
      readProjectFileStub.restore();
      readProjectFileStub = stub(
        configModule,
        "readProjectFile",
        () => ({ relays: ["wss://config1", "wss://config2"], servers: [], publishServerList: false, publishRelayList: false })
      );
      
      const options = {};
      const result = resolveRelays(options);
      assertEquals(result, ["wss://config1", "wss://config2"]);
    });

    it("should use default broadcast relays when no config", () => {
      readProjectFileStub.returns(null);
      
      const options = {};
      const result = resolveRelays(options);
      assertEquals(result, NSYTE_BROADCAST_RELAYS);
    });

    it("should use discovery relays when specified", () => {
      readProjectFileStub.returns(null);
      
      const options = {};
      const result = resolveRelays(options, null, true);
      assertEquals(result, RELAY_DISCOVERY_RELAYS);
    });

    it("should prefer CLI over config", () => {
      readProjectFileStub.returns({ relays: ["wss://config1"] });
      
      const options = { relays: "wss://cli1" };
      const result = resolveRelays(options);
      assertEquals(result, ["wss://cli1"]);
    });
  });

  describe("resolveServers", () => {
    it("should use CLI option servers", () => {
      const options = { servers: "https://server1,https://server2" };
      const result = resolveServers(options);
      assertEquals(result, ["https://server1", "https://server2"]);
    });

    it("should use config servers when no CLI option", () => {
      readProjectFileStub.returns({ servers: ["https://config1", "https://config2"] });
      
      const options = {};
      const result = resolveServers(options);
      assertEquals(result, ["https://config1", "https://config2"]);
    });

    it("should return empty array when no config", () => {
      readProjectFileStub.returns(null);
      
      const options = {};
      const result = resolveServers(options);
      assertEquals(result, []);
    });

    it("should prefer CLI over config", () => {
      readProjectFileStub.returns({ servers: ["https://config1"] });
      
      const options = { servers: "https://cli1" };
      const result = resolveServers(options);
      assertEquals(result, ["https://cli1"]);
    });
  });

  describe("resolvePubkey", () => {
    it("should use explicit pubkey option", async () => {
      const options = { pubkey: "npub123" };
      const result = await resolvePubkey(options, null, false);
      assertEquals(result, "npub123");
    });

    it("should derive pubkey from private key", async () => {
      // Mock PrivateKeySigner
      const mockSigner = {
        getPublicKey: () => Promise.resolve("derived-pubkey")
      };
      
      const PrivateKeySignerStub = stub(
        await import("../../src/lib/signer.ts"),
        "PrivateKeySigner",
        () => mockSigner as any
      );

      const options = { privatekey: "nsec123" };
      const result = await resolvePubkey(options, null, false);
      assertEquals(result, "derived-pubkey");

      PrivateKeySignerStub.restore();
    });

    it("should use bunker pubkey from config", async () => {
      const config = { bunkerPubkey: "bunker-pubkey" };
      const options = {};
      const result = await resolvePubkey(options, config, false);
      assertEquals(result, "bunker-pubkey");
    });

    it("should throw when no pubkey available in non-interactive mode", async () => {
      readProjectFileStub.returns(null);
      
      const options = {};
      let error: Error | null = null;
      
      try {
        await resolvePubkey(options, null, false);
      } catch (e) {
        error = e as Error;
      }
      
      assert(error !== null);
      assert(error.message.includes("No public key available"));
    });
  });
});