import { assertEquals, assertExists } from "jsr:@std/assert";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import { getSystemConfigDir } from "../../src/lib/secrets/utils.ts";
import { join } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs/ensure-dir";

const originalEnv = Deno.env.toObject();

describe("Secrets Manager - Basic Operations", () => {
  let tempDir: string;
  let manager: SecretsManager;

  beforeEach(() => {
    tempDir = Deno.makeTempDirSync({ prefix: "nsite-secrets-test-" });

    // Reset singleton instance
    (SecretsManager as any).instance = null;

    // Force legacy mode to avoid keychain interactions
    Deno.env.set("HOME", tempDir);
    Deno.env.set("USERPROFILE", tempDir);
    Deno.env.set("NSYTE_DISABLE_KEYCHAIN", "1");

    manager = SecretsManager.getInstance();

    // Configure for legacy mode
    (manager as any).legacyMode = true;
    (manager as any).storageBackend = null;
    (manager as any).initialized = true;
    const nsiteDir = join(tempDir, ".nsite");
    ensureDir(nsiteDir);
    (manager as any).secretsPath = join(nsiteDir, "secrets.json");
  });

  afterEach(() => {
    try {
      Deno.removeSync(tempDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to clean up test directory: ${error}`);
    }

    // Restore environment
    Object.entries(originalEnv).forEach(([key, value]) => {
      Deno.env.set(key, value);
    });
  });

  describe("CRUD Operations", () => {
    it("should store and retrieve nbunksec strings", async () => {
      // Clear any existing data
      const existingPubkeys = await manager.getAllPubkeys();
      for (const pubkey of existingPubkeys) {
        await manager.deleteNbunk(pubkey);
      }

      const pubkey = "e8b487c079b0f67c695ae6c4c2552a47f38adfa6d0fc795cfd1f5bd787875948";
      const nbunkString = "nbunk1q2w3e4r";

      const stored = await manager.storeNbunk(pubkey, nbunkString);
      assertEquals(stored, true, "Should successfully store the nbunksec");

      const retrieved = await manager.getNbunk(pubkey);
      assertEquals(retrieved, nbunkString, "Should retrieve the stored nbunksec");

      const pubkeys = await manager.getAllPubkeys();
      assertEquals(pubkeys.length, 1, "Should have one pubkey stored");
      assertEquals(pubkeys[0], pubkey, "Should match the stored pubkey");
    });

    it("should delete a stored nbunksec", async () => {
      // Clear any existing data
      const existingPubkeys = await manager.getAllPubkeys();
      for (const pubkey of existingPubkeys) {
        await manager.deleteNbunk(pubkey);
      }

      const pubkey = "e8b487c079b0f67c695ae6c4c2552a47f38adfa6d0fc795cfd1f5bd787875948";
      const nbunkString = "nbunk1q2w3e4r";

      await manager.storeNbunk(pubkey, nbunkString);

      const retrieved = await manager.getNbunk(pubkey);
      assertEquals(retrieved, nbunkString, "Should have stored the nbunksec");

      const deleted = await manager.deleteNbunk(pubkey);
      assertEquals(deleted, true, "Should return true for successful deletion");

      const afterDelete = await manager.getNbunk(pubkey);
      assertEquals(afterDelete, null, "Should return null after deletion");

      const pubkeys = await manager.getAllPubkeys();
      assertEquals(pubkeys.length, 0, "Should have no pubkeys stored");
    });

    it("should handle multiple nbunksec entries", async () => {
      // Clear any existing data
      const existingPubkeys = await manager.getAllPubkeys();
      for (const pubkey of existingPubkeys) {
        await manager.deleteNbunk(pubkey);
      }

      const entries = [
        { pubkey: "pubkey1", nbunk: "nbunk1" },
        { pubkey: "pubkey2", nbunk: "nbunk2" },
        { pubkey: "pubkey3", nbunk: "nbunk3" },
      ];

      // Store all entries
      for (const entry of entries) {
        const stored = await manager.storeNbunk(entry.pubkey, entry.nbunk);
        assertEquals(stored, true);
      }

      // Verify all entries can be retrieved
      for (const entry of entries) {
        const retrieved = await manager.getNbunk(entry.pubkey);
        assertEquals(retrieved, entry.nbunk);
      }

      // Verify getAllPubkeys returns all
      const pubkeys = await manager.getAllPubkeys();
      assertEquals(pubkeys.length, 3);
      assertEquals(pubkeys.sort(), entries.map((e) => e.pubkey).sort());
    });

    it("should handle non-existent pubkeys", async () => {
      const retrieved = await manager.getNbunk("non-existent-pubkey");
      assertEquals(retrieved, null, "Should return null for non-existent pubkey");

      const deleted = await manager.deleteNbunk("non-existent-pubkey");
      assertEquals(deleted, false, "Should return false when deleting non-existent pubkey");
    });
  });

  describe("Module Export", () => {
    it("should export SecretsManager from mod.ts", async () => {
      // This test verifies the module structure
      const { SecretsManager: ImportedManager } = await import("../../src/lib/secrets/mod.ts");
      assertExists(ImportedManager);
      assertEquals(typeof ImportedManager.getInstance, "function");
    });
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = SecretsManager.getInstance();
      const instance2 = SecretsManager.getInstance();
      assertEquals(instance1, instance2, "Should return the same instance");
    });
  });
});

describe("System Directory Detection", () => {
  beforeEach(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      Deno.env.set(key, value);
    });
  });

  it("should detect system config directory", () => {
    const configDir = getSystemConfigDir();
    assertExists(configDir, "Should return a non-null system config directory");
    assertEquals(typeof configDir, "string");
    assertEquals(configDir.length > 0, true);
  });
});
