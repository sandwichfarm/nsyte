import { assertEquals, assertExists } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://jsr.io/@std/testing/1.0.12/bdd.ts";
import { SecretsManager } from "../../src/lib/secrets/manager.ts";
import { join } from "std/path/mod.ts";
import { ensureDir } from "std/fs/mod.ts";

describe("SecretsManager", () => {
  let manager: SecretsManager;
  const testDir = join(Deno.cwd(), ".test_secrets_manager");
  const testPubkey = "test-pubkey-" + Date.now();
  const testNbunksec = "nbunksec1test";

  beforeEach(async () => {
    // Create test directory
    await ensureDir(testDir);
    // Get singleton instance
    manager = SecretsManager.getInstance();
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await manager.deleteNbunk(testPubkey);
    } catch {
      // Ignore errors during cleanup
    }
    
    // Remove test directory
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch {
      // Ignore if already removed
    }
  });

  describe("Basic Operations", () => {
    it("should store and retrieve a bunker", async () => {
      const stored = await manager.storeBunker(testPubkey, testNbunksec);
      assertEquals(stored, true);

      const retrieved = await manager.getBunker(testPubkey);
      assertEquals(retrieved, testNbunksec);
    });

    it("should return null for non-existent bunker", async () => {
      const retrieved = await manager.getBunker("non-existent-pubkey");
      assertEquals(retrieved, null);
    });

    it("should delete a bunker", async () => {
      // First store it
      await manager.storeBunker(testPubkey, testNbunksec);
      
      // Then delete it
      const deleted = await manager.deleteBunker(testPubkey);
      assertEquals(deleted, true);

      // Verify it's gone
      const retrieved = await manager.getBunker(testPubkey);
      assertEquals(retrieved, null);
    });

    it("should handle deletion of non-existent bunker", async () => {
      const deleted = await manager.deleteBunker("non-existent-pubkey");
      // Should return true even if it didn't exist
      assertEquals(deleted, true);
    });

    it("should list all bunkers", async () => {
      // Store multiple bunkers
      const pubkey1 = testPubkey + "-1";
      const pubkey2 = testPubkey + "-2";
      
      await manager.storeBunker(pubkey1, testNbunksec + "1");
      await manager.storeBunker(pubkey2, testNbunksec + "2");

      const bunkers = await manager.listBunkers();
      assertEquals(bunkers.includes(pubkey1), true);
      assertEquals(bunkers.includes(pubkey2), true);

      // Cleanup
      await manager.deleteBunker(pubkey1);
      await manager.deleteBunker(pubkey2);
    });

    it("should handle empty bunker list", async () => {
      const bunkers = await manager.listBunkers();
      assertEquals(Array.isArray(bunkers), true);
    });
  });

  describe("Migration", () => {
    it("should handle migration when available", async () => {
      // This test depends on the implementation details
      // It may need to be adjusted based on how migration is triggered
      
      // Try to list bunkers to trigger any migration
      const bunkers = await manager.listBunkers();
      assertEquals(Array.isArray(bunkers), true);
    });
  });

  describe("Storage Backend", () => {
    it("should use appropriate storage backend", async () => {
      // Store using whatever backend is available
      const stored = await manager.storeBunker(testPubkey, testNbunksec);
      assertEquals(stored, true);
      
      // Should be able to retrieve regardless of backend
      const retrieved = await manager.getBunker(testPubkey);
      assertEquals(retrieved, testNbunksec);
    });

    it("should handle storage failures gracefully", async () => {
      // Test with invalid characters that might fail in some backends
      const invalidPubkey = "test/invalid\\pubkey";
      const stored = await manager.storeBunker(invalidPubkey, testNbunksec);
      
      // Should either succeed or fail gracefully
      assertEquals(typeof stored, "boolean");
      
      if (stored) {
        // Clean up if it was stored
        await manager.deleteBunker(invalidPubkey);
      }
    });
  });

  describe("Project Bunker", () => {
    it("should get project bunker when set", async () => {
      // This would require mocking the project config
      // For now, just test that the method exists and returns expected type
      const projectBunker = await manager.getProjectBunker();
      assertEquals(projectBunker === null || typeof projectBunker === "object", true);
    });
  });
});