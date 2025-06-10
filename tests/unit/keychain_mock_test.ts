import { assertEquals, assertExists } from "std/assert/mod.ts";
import { stub, restore } from "std/testing/mock.ts";
import { 
  getKeychainProvider,
  type KeychainProvider,
  type KeychainCredential
} from "../../src/lib/secrets/keychain.ts";

Deno.test("Keychain Provider Factory", async (t) => {
  await t.step("returns provider for darwin", async () => {
    const osStub = stub(Deno.build, "os", () => "darwin");
    const commandStub = stub(Deno, "Command", () => ({
      output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
    }));
    
    const provider = await getKeychainProvider();
    assertExists(provider);
    
    osStub.restore();
    commandStub.restore();
  });

  await t.step("returns provider for windows", async () => {
    const osStub = stub(Deno.build, "os", () => "windows");
    const commandStub = stub(Deno, "Command", () => ({
      output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
    }));
    
    const provider = await getKeychainProvider();
    assertExists(provider);
    
    osStub.restore();
    commandStub.restore();
  });

  await t.step("returns provider for linux", async () => {
    const osStub = stub(Deno.build, "os", () => "linux");
    const commandStub = stub(Deno, "Command", () => ({
      output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
    }));
    
    const provider = await getKeychainProvider();
    assertExists(provider);
    
    osStub.restore();
    commandStub.restore();
  });

  await t.step("returns null for unsupported platform", async () => {
    const osStub = stub(Deno.build, "os", () => "freebsd" as any);
    
    const provider = await getKeychainProvider();
    assertEquals(provider, null);
    
    osStub.restore();
  });

  await t.step("returns null when provider is not available", async () => {
    const osStub = stub(Deno.build, "os", () => "darwin");
    const commandStub = stub(Deno, "Command", () => ({
      output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
    }));
    
    const provider = await getKeychainProvider();
    assertEquals(provider, null);
    
    osStub.restore();
    commandStub.restore();
  });
});

Deno.test("Keychain Provider Mock Operations", async (t) => {
  const mockProvider: KeychainProvider = {
    isAvailable: async () => true,
    store: async (cred: KeychainCredential) => true,
    retrieve: async (service: string, account: string) => "mock-password",
    delete: async (service: string, account: string) => true,
    list: async (service: string) => ["account1", "account2"]
  };

  await t.step("mock provider operations", async () => {
    const available = await mockProvider.isAvailable();
    assertEquals(available, true);

    const stored = await mockProvider.store({
      service: "test",
      account: "test-account",
      password: "test-password"
    });
    assertEquals(stored, true);

    const password = await mockProvider.retrieve("test", "test-account");
    assertEquals(password, "mock-password");

    const deleted = await mockProvider.delete("test", "test-account");
    assertEquals(deleted, true);

    const accounts = await mockProvider.list("test");
    assertEquals(accounts.length, 2);
  });
});

Deno.test("Keychain Error Handling", async (t) => {
  await t.step("handles command errors gracefully", async () => {
    const osStub = stub(Deno.build, "os", () => "darwin");
    const commandStub = stub(Deno, "Command", () => {
      throw new Error("Command not found");
    });
    
    const provider = await getKeychainProvider();
    assertEquals(provider, null);
    
    osStub.restore();
    commandStub.restore();
  });

  await t.step("handles runtime errors in operations", async () => {
    const osStub = stub(Deno.build, "os", () => "darwin");
    const commandStub = stub(Deno, "Command", () => ({
      output: () => Promise.reject(new Error("Operation failed"))
    }));
    
    const provider = await getKeychainProvider();
    assertEquals(provider, null);
    
    osStub.restore();
    commandStub.restore();
  });
});

// Clean up
Deno.test("Cleanup", () => {
  restore();
});