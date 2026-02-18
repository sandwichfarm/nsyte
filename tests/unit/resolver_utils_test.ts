import { assertEquals, assertExists, assertRejects, type assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import {
  createSigner,
  parseCommaSeparated,
  resolvePubkey,
  resolveRelays,
  type ResolverOptions,
  resolveServers,
} from "../../src/lib/resolver-utils.ts";
import type { ProjectConfig } from "../../src/lib/config.ts";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "../../src/lib/constants.ts";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import { Secret, Select } from "@cliffy/prompt";

// A valid 64-char hex pubkey for testing
const VALID_HEX_PUBKEY = "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e";

describe("resolver-utils - comprehensive branch coverage", () => {
  let consoleLogStub: any;
  let consoleErrorStub: any;
  let exitStub: any;

  beforeEach(() => {
    consoleLogStub = stub(console, "log");
    consoleErrorStub = stub(console, "error");
    exitStub = stub(Deno, "exit");
  });

  afterEach(() => {
    restore();
  });

  describe("parseCommaSeparated", () => {
    it("should handle all edge cases", () => {
      // Empty and whitespace
      assertEquals(parseCommaSeparated(""), []);
      assertEquals(parseCommaSeparated("   "), []);
      assertEquals(parseCommaSeparated("\t\n"), []);

      // Single values with various whitespace
      assertEquals(parseCommaSeparated("single"), ["single"]);
      assertEquals(parseCommaSeparated("  single  "), ["single"]);
      assertEquals(parseCommaSeparated("\tsingle\n"), ["single"]);

      // Multiple values with various separators
      assertEquals(parseCommaSeparated("a,b,c"), ["a", "b", "c"]);
      assertEquals(parseCommaSeparated("a, b, c"), ["a", "b", "c"]);
      assertEquals(parseCommaSeparated("  a  ,  b  ,  c  "), ["a", "b", "c"]);

      // Empty values between commas
      assertEquals(parseCommaSeparated("a,,b"), ["a", "b"]);
      assertEquals(parseCommaSeparated(",a,b,"), ["a", "b"]);
      assertEquals(parseCommaSeparated(",,a,,b,,"), ["a", "b"]);
      assertEquals(parseCommaSeparated(",,,"), []);

      // URLs and special characters
      assertEquals(parseCommaSeparated("https://example.com,wss://relay.com:8080"), [
        "https://example.com",
        "wss://relay.com:8080",
      ]);

      // Unicode and special chars
      assertEquals(parseCommaSeparated("test🚀,emoji✨,unicode"), ["test🚀", "emoji✨", "unicode"]);

      // Undefined and null-like strings
      assertEquals(parseCommaSeparated(undefined), []);
      assertEquals(parseCommaSeparated("null"), ["null"]);
      assertEquals(parseCommaSeparated("undefined"), ["undefined"]);
    });
  });

  describe("resolveRelays", () => {
    it("should handle options and config priority", () => {
      // Branch 1: Options provided (highest priority)
      const options1: ResolverOptions = { relays: "wss://opt1.com,wss://opt2.com" };
      const config1: ProjectConfig = {
        relays: ["wss://cfg1.com"],
        servers: [],
        bunkerPubkey: undefined,
      };
      assertEquals(resolveRelays(options1, config1), ["wss://opt1.com", "wss://opt2.com"]);

      // Branch 2: Empty string in options (still takes priority)
      const options2: ResolverOptions = { relays: "" };
      assertEquals(resolveRelays(options2, config1), []);

      // Branch 3: Options undefined, use config
      const options3: ResolverOptions = {};
      assertEquals(resolveRelays(options3, config1), ["wss://cfg1.com"]);

      // Branch 4: No options, empty config relays, use defaults
      const config2: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };
      assertEquals(resolveRelays(options3, config2, false), NSYTE_BROADCAST_RELAYS);
      assertEquals(resolveRelays(options3, config2, true), RELAY_DISCOVERY_RELAYS);
    });

    it("should handle whitespace in relay URLs", () => {
      const options: ResolverOptions = { relays: "  wss://relay1.com  ,  wss://relay2.com  " };
      assertEquals(resolveRelays(options), ["wss://relay1.com", "wss://relay2.com"]);
    });
  });

  describe("resolveServers", () => {
    it("should handle all priority branches", () => {
      // Branch 1: Options provided
      const options1: ResolverOptions = { servers: "https://srv1.com,https://srv2.com" };
      const config1: ProjectConfig = {
        relays: [],
        servers: ["https://cfg-srv.com"],
        bunkerPubkey: undefined,
      };
      assertEquals(resolveServers(options1, config1), ["https://srv1.com", "https://srv2.com"]);

      // Branch 2: Empty string in options
      const options2: ResolverOptions = { servers: "" };
      assertEquals(resolveServers(options2, config1), []);

      // Branch 3: Options undefined, use config
      const options3: ResolverOptions = {};
      assertEquals(resolveServers(options3, config1), ["https://cfg-srv.com"]);

      // Branch 4: No options, empty config servers
      const config2: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };
      assertEquals(resolveServers(options3, config2), []);
    });
  });

  describe("resolvePubkey", () => {
    it("should handle explicit hex pubkey", async () => {
      const options: ResolverOptions = { pubkey: VALID_HEX_PUBKEY };
      const result = await resolvePubkey(options, null, false);
      assertEquals(result, VALID_HEX_PUBKEY);
    });

    it("should reject invalid pubkey format", async () => {
      const options: ResolverOptions = { pubkey: "invalid-pubkey-123" };
      await assertRejects(
        () => resolvePubkey(options, null, false),
        Error,
        "Failed to resolve pubkey from --pubkey parameter",
      );
    });

    it("should derive pubkey from sec with hex private key", async () => {
      const options: ResolverOptions = {
        sec: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      };
      const result = await resolvePubkey(options, null, false);
      assertExists(result);
      assertEquals(result.length, 64);
    });

    it("should reject invalid sec format", async () => {
      const options: ResolverOptions = { sec: "totally-invalid-secret" };
      await assertRejects(
        () => resolvePubkey(options, null, false),
        Error,
        "Invalid secret format",
      );
    });

    it("should use bunker pubkey from config", async () => {
      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: "config-bunker-pubkey-123",
      };

      const result = await resolvePubkey(options, configData, false);
      assertEquals(result, "config-bunker-pubkey-123");
    });

    it("should throw in non-interactive mode without pubkey", async () => {
      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };

      await assertRejects(
        () => resolvePubkey(options, configData, false),
        Error,
        "No public key available",
      );
    });

    it("should handle interactive mode with existing private key", async () => {
      const mockSecretsManager = {
        getAllPubkeys: async () => [],
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      const selectStub = stub(Select, "prompt", async () => "existing" as any);
      const secretStub = stub(
        Secret,
        "prompt",
        async () => "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      );

      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };

      const result = await resolvePubkey(options, configData, true);
      assertExists(result);
      assertEquals(result.length, 64);

      getInstanceStub.restore();
      selectStub.restore();
      secretStub.restore();
    });

    it("should handle new bunker option", async () => {
      const mockSecretsManager = {
        getAllPubkeys: async () => [],
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      const selectStub = stub(Select, "prompt", async () => "new_bunker" as any);

      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };

      await assertRejects(
        () => resolvePubkey(options, configData, true),
        Error,
      );

      // Check console output
      assertEquals(consoleErrorStub.calls.length >= 1, true);
      assertEquals(exitStub.calls[0].args[0], 1);

      getInstanceStub.restore();
      selectStub.restore();
    });

    it("should handle interactive selection returning undefined", async () => {
      const mockSecretsManager = {
        getAllPubkeys: async () => [],
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      // Simulate user cancelling the selection
      const selectStub = stub(Select, "prompt", async () => {
        throw new Error("User cancelled");
      });

      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };

      await assertRejects(
        () => resolvePubkey(options, configData, true),
        Error,
      );

      getInstanceStub.restore();
      selectStub.restore();
    });
  });

  describe("createSigner", () => {
    it("should create signer from sec with private key", async () => {
      const options: ResolverOptions = {
        sec: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      };
      const signer = await createSigner(options);

      assertExists(signer);
      assertExists(await signer!.getPublicKey());
    });

    it("should return null when config bunker has no stored nbunk", async () => {
      const mockSecretsManager = {
        getNbunk: async () => null,
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: "config-bunker-pubkey",
      };

      const signer = await createSigner(options, configData);
      assertEquals(signer, null);

      getInstanceStub.restore();
    });

    it("should return null with no signer options", async () => {
      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };

      const signer = await createSigner(options, configData);
      assertEquals(signer, null);
    });

    it("should return null for invalid sec format", async () => {
      const options: ResolverOptions = { sec: "totally-invalid" };
      const signer = await createSigner(options);
      assertEquals(signer, null);
    });
  });
});
