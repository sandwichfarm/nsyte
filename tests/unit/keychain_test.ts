import { assertEquals, assertExists } from "std/assert/mod.ts";
import { getKeychainProvider } from "../../src/lib/secrets/keychain.ts";

Deno.test("Keychain Provider", async (t) => {
  await t.step("getKeychainProvider", async (t) => {
    await t.step("should return a keychain provider", async () => {
      const provider = await getKeychainProvider();
      assertExists(provider);
      assertEquals(typeof provider.isAvailable, "function");
      assertEquals(typeof provider.store, "function");
      assertEquals(typeof provider.retrieve, "function");
      assertEquals(typeof provider.delete, "function");
      assertEquals(typeof provider.list, "function");
    });

    await t.step("should check if provider is available", async () => {
      const provider = await getKeychainProvider();
      const isAvailable = await provider.isAvailable();
      assertEquals(typeof isAvailable, "boolean");
    });
  });

  await t.step("Keychain Operations", async (t) => {
    const testService = "nsyte-test";
    const testAccount = "test-pubkey-" + Date.now();
    const testPassword = "test-nbunksec-value";

    await t.step("should handle credential operations", async () => {
      const provider = await getKeychainProvider();

      // Clean up any existing test credential
      await provider.delete(testService, testAccount);

      // Test store
      const stored = await provider.store({
        service: testService,
        account: testAccount,
        password: testPassword,
      });
      assertEquals(typeof stored, "boolean");

      // Test retrieve
      const retrieved = await provider.retrieve(testService, testAccount);
      if (stored) {
        assertEquals(retrieved, testPassword);
      } else {
        // If storage failed (e.g., no keychain available), retrieve should return null
        assertEquals(retrieved, null);
      }

      // Test list
      const accounts = await provider.list(testService);
      assertEquals(Array.isArray(accounts), true);
      if (stored) {
        assertEquals(accounts.includes(testAccount), true);
      }

      // Test delete
      const deleted = await provider.delete(testService, testAccount);
      assertEquals(typeof deleted, "boolean");

      // Verify deletion
      const afterDelete = await provider.retrieve(testService, testAccount);
      assertEquals(afterDelete, null);
    });

    await t.step("should handle non-existent credentials", async () => {
      const provider = await getKeychainProvider();
      const nonExistent = await provider.retrieve(testService, "non-existent-account");
      assertEquals(nonExistent, null);
    });

    await t.step("should handle deletion of non-existent credentials", async () => {
      const provider = await getKeychainProvider();
      const deleted = await provider.delete(testService, "non-existent-account");
      assertEquals(typeof deleted, "boolean");
    });
  });
});
