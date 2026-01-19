// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "jsr:@std/assert";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { restore, type Stub, stub } from "jsr:@std/testing/mock";

import { createMockSecretsManager } from "../mocks/secrets-manager.ts";

// Test state
let mockSecretsManager: ReturnType<typeof createMockSecretsManager>;
let consoleOutput: { logs: string[]; errors: string[] };
let originalLog: typeof console.log;
let originalError: typeof console.error;

describe("Secrets Safe Tests", () => {
  beforeEach(() => {
    // Create fresh mock
    mockSecretsManager = createMockSecretsManager();

    // Setup console capture
    consoleOutput = { logs: [], errors: [] };
    originalLog = console.log;
    originalError = console.error;

    console.log = (...args: unknown[]) => {
      consoleOutput.logs.push(args.map(String).join(" "));
    };

    console.error = (...args: unknown[]) => {
      consoleOutput.errors.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    // Restore all stubs
    restore();

    // Restore console
    console.log = originalLog;
    console.error = originalError;
  });

  describe("MockSecretsManager", () => {
    it("should store and retrieve nbunks", async () => {
      const stored = await mockSecretsManager.storeNbunk("pubkey123", "nbunksec1test");
      assertEquals(stored, true);

      const retrieved = await mockSecretsManager.getNbunk("pubkey123");
      assertEquals(retrieved, "nbunksec1test");
    });

    it("should return null for non-existent pubkeys", async () => {
      const retrieved = await mockSecretsManager.getNbunk("nonexistent");
      assertEquals(retrieved, null);
    });

    it("should delete nbunks", async () => {
      await mockSecretsManager.storeNbunk("pubkey123", "nbunksec1test");

      const deleted = await mockSecretsManager.deleteNbunk("pubkey123");
      assertEquals(deleted, true);

      const retrieved = await mockSecretsManager.getNbunk("pubkey123");
      assertEquals(retrieved, null);
    });

    it("should list all pubkeys", async () => {
      await mockSecretsManager.storeNbunk("pubkey1", "nbunk1");
      await mockSecretsManager.storeNbunk("pubkey2", "nbunk2");
      await mockSecretsManager.storeNbunk("pubkey3", "nbunk3");

      const pubkeys = await mockSecretsManager.getAllPubkeys();
      assertEquals(pubkeys.sort(), ["pubkey1", "pubkey2", "pubkey3"]);
    });

    it("should clear all secrets", async () => {
      await mockSecretsManager.storeNbunk("pubkey1", "nbunk1");
      await mockSecretsManager.storeNbunk("pubkey2", "nbunk2");

      await mockSecretsManager.clearAllSecrets();

      const pubkeys = await mockSecretsManager.getAllPubkeys();
      assertEquals(pubkeys, []);
    });

    it("should initialize properly", async () => {
      const initialized = await mockSecretsManager.initialize();
      assertEquals(initialized, true);
    });
  });

  describe("Secrets Module Integration", () => {
    it("should import secrets modules without keychain access", async () => {
      // Test that we can import all secrets modules safely
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      const managerModule = await import("../../src/lib/secrets/manager.ts");
      const encryptedStorageModule = await import("../../src/lib/secrets/encrypted-storage.ts");
      const utilsModule = await import("../../src/lib/secrets/utils.ts");
      const modModule = await import("../../src/lib/secrets/mod.ts");

      assertExists(keychainModule.getKeychainProvider);
      assertExists(managerModule.SecretsManager);
      assertExists(encryptedStorageModule.EncryptedStorage);
      assertExists(utilsModule.getSystemConfigDir);
      assertExists(modModule.SecretsManager);

      // Verify keychain is blocked
      const provider = await keychainModule.getKeychainProvider();
      assertEquals(provider, null);
    });

    it("should load encrypted storage module without system access", async () => {
      // The main goal is to verify the module can be imported without keychain access
      const { EncryptedStorage } = await import("../../src/lib/secrets/encrypted-storage.ts");

      // Verify the class exists
      assertExists(EncryptedStorage);

      // Try to create an instance (this should not trigger keychain access)
      const tempDir = await Deno.makeTempDir({ prefix: "nsyte_test_" });

      try {
        const storage = new EncryptedStorage(tempDir);
        assertExists(storage);

        // Try to initialize (this should work without keychain)
        const initialized = await storage.initialize();
        assertEquals(initialized, true);
      } finally {
        // Cleanup
        try {
          await Deno.remove(tempDir, { recursive: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it("should handle system config directory functions", async () => {
      const { getSystemConfigDir, getHomeDir } = await import("../../src/lib/secrets/utils.ts");

      const homeDir = getHomeDir();
      const configDir = getSystemConfigDir();

      // These should return strings or null, not throw errors
      assertEquals(typeof homeDir === "string" || homeDir === null, true);
      assertEquals(typeof configDir === "string" || configDir === null, true);
    });

    it("should handle secrets manager creation without keychain", async () => {
      // This tests that the SecretsManager can be created without
      // trying to access the real keychain
      const { SecretsManager } = await import("../../src/lib/secrets/manager.ts");

      // The singleton should be creatable without system access
      const instance = SecretsManager.getInstance();
      assertExists(instance);

      // Initialize should work (it will use encrypted storage since keychain is blocked)
      const initialized = await instance.initialize();
      assertEquals(initialized, true);
    });
  });

  describe("Mock Utilities", () => {
    it("should support setting initial data", async () => {
      const initialData = {
        "pubkey1": "nbunk1",
        "pubkey2": "nbunk2",
      };

      const mock = createMockSecretsManager(initialData);

      assertEquals(await mock.getNbunk("pubkey1"), "nbunk1");
      assertEquals(await mock.getNbunk("pubkey2"), "nbunk2");

      const pubkeys = await mock.getAllPubkeys();
      assertEquals(pubkeys.sort(), ["pubkey1", "pubkey2"]);
    });

    it("should support storage inspection", () => {
      mockSecretsManager.setStorageContents({
        "test1": "value1",
        "test2": "value2",
      });

      const contents = mockSecretsManager.getStorageContents();
      assertEquals(contents, {
        "test1": "value1",
        "test2": "value2",
      });
    });
  });

  describe("Environment Security", () => {
    it("should have all security flags set", () => {
      assertEquals(Deno.env.get("NSYTE_DISABLE_KEYCHAIN"), "true");
      assertEquals(Deno.env.get("NSYTE_TEST_MODE"), "true");
    });

    it("should block system command execution for security tools", () => {
      // Verify that security-related commands are blocked
      let securityBlocked = false;
      let cmdkeyBlocked = false;
      let secretToolBlocked = false;

      try {
        new Deno.Command("security", { args: ["help"] });
      } catch (error) {
        if (error.message.includes("security") && error.message.includes("blocked")) {
          securityBlocked = true;
        }
      }

      try {
        new Deno.Command("cmdkey", { args: ["/help"] });
      } catch (error) {
        if (error.message.includes("cmdkey") && error.message.includes("blocked")) {
          cmdkeyBlocked = true;
        }
      }

      try {
        new Deno.Command("secret-tool", { args: ["help"] });
      } catch (error) {
        if (error.message.includes("secret-tool") && error.message.includes("blocked")) {
          secretToolBlocked = true;
        }
      }

      // At least the security command should be blocked on macOS
      if (Deno.build.os === "darwin") {
        assertEquals(securityBlocked, true, "macOS security command should be blocked");
      }
    });
  });
});
