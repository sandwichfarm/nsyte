import { assertEquals, assertExists } from "std/assert/mod.ts";
import { type KeychainCredential, type KeychainProvider } from "../../src/lib/secrets/keychain.ts";

// Test the interface contract
Deno.test("KeychainProvider Interface", async (t) => {
  // Create a mock implementation that satisfies the interface
  class MockKeychainProvider implements KeychainProvider {
    private storage = new Map<string, string>();

    async isAvailable(): Promise<boolean> {
      return true;
    }

    async store(credential: KeychainCredential): Promise<boolean> {
      const key = `${credential.service}:${credential.account}`;
      this.storage.set(key, credential.password);
      return true;
    }

    async retrieve(service: string, account: string): Promise<string | null> {
      const key = `${service}:${account}`;
      return this.storage.get(key) || null;
    }

    async delete(service: string, account: string): Promise<boolean> {
      const key = `${service}:${account}`;
      return this.storage.delete(key);
    }

    async list(service: string): Promise<string[]> {
      const accounts: string[] = [];
      for (const key of this.storage.keys()) {
        if (key.startsWith(`${service}:`)) {
          const account = key.split(":")[1];
          accounts.push(account);
        }
      }
      return accounts;
    }
  }

  await t.step("implements all required methods", async () => {
    const provider = new MockKeychainProvider();

    // Check method existence
    assertEquals(typeof provider.isAvailable, "function");
    assertEquals(typeof provider.store, "function");
    assertEquals(typeof provider.retrieve, "function");
    assertEquals(typeof provider.delete, "function");
    assertEquals(typeof provider.list, "function");
  });

  await t.step("store and retrieve credentials", async () => {
    const provider = new MockKeychainProvider();

    const credential: KeychainCredential = {
      service: "test-service",
      account: "test-account",
      password: "test-password",
    };

    // Store
    const stored = await provider.store(credential);
    assertEquals(stored, true);

    // Retrieve
    const retrieved = await provider.retrieve(credential.service, credential.account);
    assertEquals(retrieved, credential.password);
  });

  await t.step("list accounts for service", async () => {
    const provider = new MockKeychainProvider();

    // Store multiple credentials
    await provider.store({
      service: "test-service",
      account: "account1",
      password: "pass1",
    });

    await provider.store({
      service: "test-service",
      account: "account2",
      password: "pass2",
    });

    await provider.store({
      service: "other-service",
      account: "account3",
      password: "pass3",
    });

    // List should only return accounts for the requested service
    const accounts = await provider.list("test-service");
    assertEquals(accounts.length, 2);
    assertEquals(accounts.includes("account1"), true);
    assertEquals(accounts.includes("account2"), true);
    assertEquals(accounts.includes("account3"), false);
  });

  await t.step("delete credentials", async () => {
    const provider = new MockKeychainProvider();

    const credential: KeychainCredential = {
      service: "test-service",
      account: "test-account",
      password: "test-password",
    };

    // Store
    await provider.store(credential);

    // Verify it exists
    const beforeDelete = await provider.retrieve(credential.service, credential.account);
    assertEquals(beforeDelete, credential.password);

    // Delete
    const deleted = await provider.delete(credential.service, credential.account);
    assertEquals(deleted, true);

    // Verify it's gone
    const afterDelete = await provider.retrieve(credential.service, credential.account);
    assertEquals(afterDelete, null);
  });

  await t.step("handle non-existent credentials", async () => {
    const provider = new MockKeychainProvider();

    // Retrieve non-existent
    const retrieved = await provider.retrieve("non-existent", "account");
    assertEquals(retrieved, null);

    // Delete non-existent
    const deleted = await provider.delete("non-existent", "account");
    assertEquals(deleted, false);

    // List empty service
    const accounts = await provider.list("non-existent");
    assertEquals(accounts.length, 0);
  });
});

Deno.test("KeychainCredential Structure", async (t) => {
  await t.step("has required fields", () => {
    const credential: KeychainCredential = {
      service: "test-service",
      account: "test-account",
      password: "test-password",
    };

    assertExists(credential.service);
    assertExists(credential.account);
    assertExists(credential.password);

    assertEquals(typeof credential.service, "string");
    assertEquals(typeof credential.account, "string");
    assertEquals(typeof credential.password, "string");
  });
});

Deno.test("Keychain Error Scenarios", async (t) => {
  class ErrorKeychainProvider implements KeychainProvider {
    async isAvailable(): Promise<boolean> {
      throw new Error("Provider check failed");
    }

    async store(credential: KeychainCredential): Promise<boolean> {
      throw new Error("Store failed");
    }

    async retrieve(service: string, account: string): Promise<string | null> {
      throw new Error("Retrieve failed");
    }

    async delete(service: string, account: string): Promise<boolean> {
      throw new Error("Delete failed");
    }

    async list(service: string): Promise<string[]> {
      throw new Error("List failed");
    }
  }

  await t.step("handles errors in operations", async () => {
    const provider = new ErrorKeychainProvider();

    try {
      await provider.isAvailable();
      assertEquals(true, false, "Should have thrown");
    } catch (e) {
      assertEquals(e.message, "Provider check failed");
    }

    try {
      await provider.store({
        service: "test",
        account: "test",
        password: "test",
      });
      assertEquals(true, false, "Should have thrown");
    } catch (e) {
      assertEquals(e.message, "Store failed");
    }

    try {
      await provider.retrieve("test", "test");
      assertEquals(true, false, "Should have thrown");
    } catch (e) {
      assertEquals(e.message, "Retrieve failed");
    }

    try {
      await provider.delete("test", "test");
      assertEquals(true, false, "Should have thrown");
    } catch (e) {
      assertEquals(e.message, "Delete failed");
    }

    try {
      await provider.list("test");
      assertEquals(true, false, "Should have thrown");
    } catch (e) {
      assertEquals(e.message, "List failed");
    }
  });
});
