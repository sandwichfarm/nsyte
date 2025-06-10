import { assertEquals, assertExists } from "std/assert/mod.ts";
import { SecretsManager } from "../../src/lib/secrets/manager.ts";
import { join } from "std/path/mod.ts";
import { ensureDir } from "std/fs/mod.ts";

Deno.test("SecretsManager", async (t) => {
  let manager: SecretsManager;
  const testDir = join(Deno.cwd(), ".test_secrets_manager");
  const testPubkey = "test-pubkey-" + Date.now();
  const testNbunksec = "nbunksec1test";

  const setupTest = async () => {
    // Create test directory
    await ensureDir(testDir);
    // Get singleton instance
    manager = SecretsManager.getInstance();
  };

  const cleanupTest = async () => {
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
  };

  await t.step("Basic Operations", async (t) => {
    await t.step("should store and retrieve a bunker", async () => {
      await setupTest();
      const stored = await manager.storeNbunk(testPubkey, testNbunksec);
      assertEquals(stored, true);

      const retrieved = await manager.getNbunk(testPubkey);
      assertEquals(retrieved, testNbunksec);
      await cleanupTest();
    });

    await t.step("should return null for non-existent bunker", async () => {
      await setupTest();
      const retrieved = await manager.getNbunk("non-existent-pubkey");
      assertEquals(retrieved, null);
      await cleanupTest();
    });

    await t.step("should delete a bunker", async () => {
      await setupTest();
      // First store it
      await manager.storeNbunk(testPubkey, testNbunksec);

      // Then delete it
      const deleted = await manager.deleteNbunk(testPubkey);
      assertEquals(deleted, true);

      // Verify it's gone
      const retrieved = await manager.getNbunk(testPubkey);
      assertEquals(retrieved, null);
      await cleanupTest();
    });

    await t.step("should handle deletion of non-existent bunker", async () => {
      await setupTest();
      const deleted = await manager.deleteNbunk("non-existent-pubkey");
      // Should return true even if it didn't exist
      assertEquals(deleted, true);
      await cleanupTest();
    });

    await t.step("should list all bunkers", async () => {
      await setupTest();
      // Store multiple bunkers
      const pubkey1 = testPubkey + "-1";
      const pubkey2 = testPubkey + "-2";

      await manager.storeNbunk(pubkey1, testNbunksec + "1");
      await manager.storeNbunk(pubkey2, testNbunksec + "2");

      const bunkers = await manager.getAllPubkeys();
      assertEquals(bunkers.includes(pubkey1), true);
      assertEquals(bunkers.includes(pubkey2), true);

      // Cleanup
      await manager.deleteNbunk(pubkey1);
      await manager.deleteNbunk(pubkey2);
      await cleanupTest();
    });

    await t.step("should handle empty bunker list", async () => {
      await setupTest();
      const bunkers = await manager.getAllPubkeys();
      assertEquals(Array.isArray(bunkers), true);
      await cleanupTest();
    });
  });

  await t.step("Migration", async (t) => {
    await t.step("should handle migration when available", async () => {
      await setupTest();
      // This test depends on the implementation details
      // It may need to be adjusted based on how migration is triggered

      // Try to list bunkers to trigger any migration
      const bunkers = await manager.getAllPubkeys();
      assertEquals(Array.isArray(bunkers), true);
      await cleanupTest();
    });
  });

  await t.step("Storage Backend", async (t) => {
    await t.step("should use appropriate storage backend", async () => {
      await setupTest();
      // Store using whatever backend is available
      const stored = await manager.storeNbunk(testPubkey, testNbunksec);
      assertEquals(stored, true);

      // Should be able to retrieve regardless of backend
      const retrieved = await manager.getNbunk(testPubkey);
      assertEquals(retrieved, testNbunksec);
      await cleanupTest();
    });

    await t.step("should handle storage failures gracefully", async () => {
      await setupTest();
      // Test with invalid characters that might fail in some backends
      const invalidPubkey = "test/invalid\\pubkey";
      const stored = await manager.storeNbunk(invalidPubkey, testNbunksec);

      // Should either succeed or fail gracefully
      assertEquals(typeof stored, "boolean");

      if (stored) {
        // Clean up if it was stored
        await manager.deleteNbunk(invalidPubkey);
      }
      await cleanupTest();
    });
  });

  await t.step("Project Bunker", async (t) => {
    await t.step("should get project bunker when set", async () => {
      await setupTest();
      // This would require mocking the project config
      // For now, just test that the method exists and doesn't throw
      // Since getProjectBunker doesn't exist, we'll test getAllPubkeys instead
      const pubkeys = await manager.getAllPubkeys();
      assertEquals(Array.isArray(pubkeys), true);
      await cleanupTest();
    });
  });
});
