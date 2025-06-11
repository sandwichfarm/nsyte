import { stub } from "std/testing/mock.ts";
import type { KeychainProvider } from "../../src/lib/secrets/keychain.ts";

/**
 * Mock keychain provider for testing
 */
export class MockKeychainProvider implements KeychainProvider {
  private storage = new Map<string, string>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async store(
    credential: { service: string; account: string; password: string },
  ): Promise<boolean> {
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
    for (const [key] of this.storage) {
      if (key.startsWith(`${service}:`)) {
        accounts.push(key.substring(service.length + 1));
      }
    }
    return accounts;
  }
}

/**
 * Setup mock for keychain provider in tests
 * This prevents tests from accessing the real system keychain
 */
export async function mockKeychainInTests() {
  const keychainModule = await import("../../src/lib/secrets/keychain.ts");

  // Always return null to force encrypted storage fallback
  const getKeychainProviderStub = stub(
    keychainModule,
    "getKeychainProvider",
    () => Promise.resolve(null),
  );

  return {
    restore: () => getKeychainProviderStub.restore(),
  };
}

/**
 * Setup mock for SecretsManager singleton
 * This ensures tests get a fresh instance
 */
export function resetSecretsManagerSingleton() {
  const SecretsManager = (globalThis as any).SecretsManager;
  if (SecretsManager) {
    SecretsManager.instance = null;
  }
}

/**
 * Mock environment for secrets tests
 */
export function mockSecretsEnvironment(testDir: string) {
  const originalEnv = {
    HOME: Deno.env.get("HOME"),
    USERPROFILE: Deno.env.get("USERPROFILE"),
    APPDATA: Deno.env.get("APPDATA"),
  };

  // Set test environment
  Deno.env.set("HOME", testDir);
  Deno.env.set("USERPROFILE", testDir);
  Deno.env.set("APPDATA", testDir);

  return () => {
    // Restore original environment
    if (originalEnv.HOME) Deno.env.set("HOME", originalEnv.HOME);
    else Deno.env.delete("HOME");

    if (originalEnv.USERPROFILE) Deno.env.set("USERPROFILE", originalEnv.USERPROFILE);
    else Deno.env.delete("USERPROFILE");

    if (originalEnv.APPDATA) Deno.env.set("APPDATA", originalEnv.APPDATA);
    else Deno.env.delete("APPDATA");
  };
}
