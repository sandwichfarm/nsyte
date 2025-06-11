/**
 * Test environment setup
 * This file MUST be imported before any other imports in test files
 * to ensure mocks are properly applied
 */

// Set environment variable to disable keychain before any imports
Deno.env.set("NSYTE_TEST_MODE", "true");
Deno.env.set("NSYTE_DISABLE_KEYCHAIN", "true");

// Mock the keychain module before it can be imported anywhere
const originalImport = globalThis.import;
(globalThis as any).import = async (specifier: string) => {
  if (specifier.includes("secrets/keychain")) {
    return {
      getKeychainProvider: async () => null,
      KeychainProvider: class MockKeychainProvider {},
    };
  }
  return originalImport(specifier);
};