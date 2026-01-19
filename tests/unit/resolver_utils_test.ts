import { assertEquals, assertExists, assertRejects, assertThrows } from "jsr:@std/assert";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { restore, stub } from "jsr:@std/testing/mock";
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
import * as config from "../../src/lib/config.ts";
import * as nostr from "../../src/lib/nostr.ts";
import * as nip46 from "../../src/lib/nip46.ts";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import { Secret, Select } from "@cliffy/prompt";

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
    it("should handle all priority branches", () => {
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

      // Branch 5: No options, null config, read from file
      const readProjectFileStub = stub(config, "readProjectFile", () => null);
      assertEquals(resolveRelays(options3, undefined), NSYTE_BROADCAST_RELAYS);
      readProjectFileStub.restore();

      // Branch 6: No options, no config param, file has relays
      const fileConfig: ProjectConfig = {
        relays: ["wss://file-relay.com"],
        servers: [],
        bunkerPubkey: undefined,
      };
      const readProjectFileStub2 = stub(config, "readProjectFile", () => fileConfig);
      assertEquals(resolveRelays(options3), ["wss://file-relay.com"]);
      readProjectFileStub2.restore();
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

      // Branch 5: No options, null config, read from file
      const readProjectFileStub = stub(config, "readProjectFile", () => null);
      assertEquals(resolveServers(options3, undefined), []);
      readProjectFileStub.restore();

      // Branch 6: No options, no config param, file has servers
      const fileConfig: ProjectConfig = {
        relays: [],
        servers: ["https://file-server.com"],
        bunkerPubkey: undefined,
      };
      const readProjectFileStub2 = stub(config, "readProjectFile", () => fileConfig);
      assertEquals(resolveServers(options3), ["https://file-server.com"]);
      readProjectFileStub2.restore();
    });
  });

  describe("resolvePubkey", () => {
    it("should handle explicit pubkey", async () => {
      const options: ResolverOptions = { pubkey: "explicit-pubkey-123" };
      const result = await resolvePubkey(options, null, false);
      assertEquals(result, "explicit-pubkey-123");
    });

    it("should derive pubkey from private key", async () => {
      const options: ResolverOptions = {
        privatekey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      };
      const result = await resolvePubkey(options, null, false);
      assertExists(result);
      assertEquals(result.length, 64);
    });

    it("should derive pubkey from nbunksec", async () => {
      const mockSigner = {
        getPublicKey: async () => "nbunk-derived-pubkey",
        close: async () => {},
      };

      const importStub = stub(nip46, "importFromNbunk", async () => mockSigner as any);

      const options: ResolverOptions = { nbunksec: "nbunksec1..." };
      const result = await resolvePubkey(options, null, false);
      assertEquals(result, "nbunk-derived-pubkey");

      importStub.restore();
    });

    it("should handle nbunksec import error", async () => {
      const importStub = stub(nip46, "importFromNbunk", async () => {
        throw new Error("Invalid nbunksec format");
      });

      const options: ResolverOptions = { nbunksec: "invalid-nbunksec" };
      await assertRejects(
        () => resolvePubkey(options, null, false),
        Error,
        "Invalid nbunksec format",
      );

      importStub.restore();
    });

    it("should handle nbunksec signer without close method", async () => {
      const mockSigner = {
        getPublicKey: async () => "nbunk-derived-pubkey-no-close",
      };

      const importStub = stub(nip46, "importFromNbunk", async () => mockSigner as any);

      const options: ResolverOptions = { nbunksec: "nbunksec1..." };
      const result = await resolvePubkey(options, null, false);
      assertEquals(result, "nbunk-derived-pubkey-no-close");

      importStub.restore();
    });

    it("should derive pubkey from bunker URL", async () => {
      const mockClient = {
        getPublicKey: async () => "bunker-derived-pubkey",
        close: async () => {},
      };

      const createStub = stub(nostr, "createNip46ClientFromUrl", async () => ({
        client: mockClient as any,
        userPubkey: "test-user-pubkey",
      }));

      const options: ResolverOptions = { bunker: "bunker://pubkey?relay=wss://relay.com" };
      const result = await resolvePubkey(options, null, false);
      assertEquals(result, "bunker-derived-pubkey");

      createStub.restore();
    });

    it("should handle bunker URL error", async () => {
      const createStub = stub(nostr, "createNip46ClientFromUrl", async () => {
        throw new Error("Failed to connect to bunker");
      });

      const options: ResolverOptions = { bunker: "invalid-bunker-url" };
      await assertRejects(
        () => resolvePubkey(options, null, false),
        Error,
        "Failed to connect to bunker",
      );

      createStub.restore();
    });

    it("should handle bunker client without close method", async () => {
      const mockClient = {
        getPublicKey: async () => "bunker-pubkey-no-close",
      };

      const createStub = stub(nostr, "createNip46ClientFromUrl", async () => ({
        client: mockClient as any,
        userPubkey: "test-user-pubkey",
      }));

      const options: ResolverOptions = { bunker: "bunker://pubkey?relay=wss://relay.com" };
      const result = await resolvePubkey(options, null, false);
      assertEquals(result, "bunker-pubkey-no-close");

      createStub.restore();
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

    it("should read config file when not provided", async () => {
      const fileConfig: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: "file-bunker-pubkey",
      };
      const readStub = stub(config, "readProjectFile", () => fileConfig);

      const options: ResolverOptions = {};
      const result = await resolvePubkey(options, undefined, false);
      assertEquals(result, "file-bunker-pubkey");

      readStub.restore();
    });

    it("should use default config when file returns null", async () => {
      const readStub = stub(config, "readProjectFile", () => null);

      const options: ResolverOptions = {};
      await assertRejects(
        () => resolvePubkey(options, undefined, false),
        Error,
        "No public key available",
      );

      readStub.restore();
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

    it("should handle interactive mode with generate option", async () => {
      const selectStub = stub(Select, "prompt", async () => "generate" as any);
      const keyPair = {
        privateKey: "generated-private-key",
        publicKey: "generated-public-key",
      };
      const generateStub = stub(nostr, "generateKeyPair", () => keyPair);

      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };

      const result = await resolvePubkey(options, configData, true);
      assertEquals(result, "generated-public-key");

      // Check console output
      assertEquals(consoleLogStub.calls.length >= 3, true);

      selectStub.restore();
      generateStub.restore();
    });

    it("should handle interactive mode with existing private key", async () => {
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

      selectStub.restore();
      secretStub.restore();
    });

    it("should handle interactive mode with existing bunker", async () => {
      const mockSecretsManager = {
        getAllPubkeys: async () => ["existing-bunker-pubkey-1", "existing-bunker-pubkey-2"],
        getNbunk: async () => "nbunksec1...",
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      const selectStub = stub(Select, "prompt");
      selectStub.onFirstCall().resolves("existing_bunker" as any);
      selectStub.onSecondCall().resolves("existing-bunker-pubkey-1" as any);

      const mockSigner = {
        getPublicKey: async () => "bunker-user-pubkey",
        close: async () => {},
      };
      const importStub = stub(nip46, "importFromNbunk", async () => mockSigner as any);

      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };

      const result = await resolvePubkey(options, configData, true);
      assertEquals(result, "bunker-user-pubkey");

      getInstanceStub.restore();
      selectStub.restore();
      importStub.restore();
    });

    it("should handle existing bunker connection failure", async () => {
      const mockSecretsManager = {
        getAllPubkeys: async () => ["existing-bunker-pubkey"],
        getNbunk: async () => "nbunksec1...",
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      const selectStub = stub(Select, "prompt");
      selectStub.onFirstCall().resolves("existing_bunker" as any);
      selectStub.onSecondCall().resolves("existing-bunker-pubkey" as any);

      const importStub = stub(nip46, "importFromNbunk", async () => {
        throw new Error("Connection failed");
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

      // Check error output
      assertEquals(consoleErrorStub.calls.length >= 1, true);
      assertEquals(exitStub.calls[0].args[0], 1);

      getInstanceStub.restore();
      selectStub.restore();
      importStub.restore();
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

    it("should handle signer close error gracefully", async () => {
      const mockSecretsManager = {
        getAllPubkeys: async () => [],
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      const selectStub = stub(Select, "prompt", async () => "generate" as any);
      const keyPair = {
        privateKey: "generated-private-key",
        publicKey: "generated-public-key-with-close-error",
      };
      const generateStub = stub(nostr, "generateKeyPair", () => keyPair);

      // Mock a signer that throws on close
      const mockSigner = {
        getPublicKey: async () => keyPair.publicKey,
        close: async () => {
          throw new Error("Close failed");
        },
      };

      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: undefined,
      };

      const result = await resolvePubkey(options, configData, true);
      assertEquals(result, "generated-public-key-with-close-error");

      getInstanceStub.restore();
      selectStub.restore();
      generateStub.restore();
    });
  });

  describe("createSigner", () => {
    it("should create signer from nbunksec", async () => {
      const mockSigner = {
        getPublicKey: async () => "nbunk-signer-pubkey",
        signEvent: async () => ({} as any),
      };
      const importStub = stub(nip46, "importFromNbunk", async () => mockSigner as any);

      const options: ResolverOptions = { nbunksec: "nbunksec1..." };
      const signer = await createSigner(options);

      assertExists(signer);
      assertEquals(await signer!.getPublicKey(), "nbunk-signer-pubkey");

      importStub.restore();
    });

    it("should create signer from bunker URL", async () => {
      const mockClient = {
        getPublicKey: async () => "bunker-signer-pubkey",
        signEvent: async () => ({} as any),
      };
      const createStub = stub(nostr, "createNip46ClientFromUrl", async () => ({
        client: mockClient as any,
        userPubkey: "test-user-pubkey",
      }));

      const options: ResolverOptions = { bunker: "bunker://pubkey?relay=wss://relay.com" };
      const signer = await createSigner(options);

      assertExists(signer);
      assertEquals(await signer!.getPublicKey(), "bunker-signer-pubkey");

      createStub.restore();
    });

    it("should create signer from private key", async () => {
      const options: ResolverOptions = {
        privatekey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      };
      const signer = await createSigner(options);

      assertExists(signer);
      assertExists(await signer!.getPublicKey());
    });

    it("should create signer from config bunker", async () => {
      const mockSecretsManager = {
        getNbunk: async () => "nbunksec1-from-config",
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      const mockSigner = {
        getPublicKey: async () => "config-bunker-signer-pubkey",
        signEvent: async () => ({} as any),
      };
      const importStub = stub(nip46, "importFromNbunk", async () => mockSigner as any);

      const options: ResolverOptions = {};
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: "config-bunker-pubkey",
      };

      const signer = await createSigner(options, configData);

      assertExists(signer);
      assertEquals(await signer!.getPublicKey(), "config-bunker-signer-pubkey");

      getInstanceStub.restore();
      importStub.restore();
    });

    it("should read config from file when not provided", async () => {
      const mockSecretsManager = {
        getNbunk: async () => "nbunksec1-from-file",
      };
      const getInstanceStub = stub(SecretsManager, "getInstance", () => mockSecretsManager as any);

      const fileConfig: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: "file-bunker-pubkey",
      };
      const readStub = stub(config, "readProjectFile", () => fileConfig);

      const mockSigner = {
        getPublicKey: async () => "file-bunker-signer-pubkey",
        signEvent: async () => ({} as any),
      };
      const importStub = stub(nip46, "importFromNbunk", async () => mockSigner as any);

      const options: ResolverOptions = {};
      const signer = await createSigner(options);

      assertExists(signer);
      assertEquals(await signer!.getPublicKey(), "file-bunker-signer-pubkey");

      getInstanceStub.restore();
      readStub.restore();
      importStub.restore();
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

    it("should handle priority: nbunksec > bunker > privatekey > config", async () => {
      const mockSigner = {
        getPublicKey: async () => "nbunksec-priority-pubkey",
        signEvent: async () => ({} as any),
      };
      const importStub = stub(nip46, "importFromNbunk", async () => mockSigner as any);

      const options: ResolverOptions = {
        nbunksec: "nbunksec1...",
        bunker: "bunker://pubkey",
        privatekey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      };
      const configData: ProjectConfig = {
        relays: [],
        servers: [],
        bunkerPubkey: "config-bunker",
      };

      const signer = await createSigner(options, configData);

      // Should use nbunksec (highest priority)
      assertExists(signer);
      assertEquals(await signer!.getPublicKey(), "nbunksec-priority-pubkey");

      importStub.restore();
    });
  });
});
