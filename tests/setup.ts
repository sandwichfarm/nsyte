/**
 * Common test setup and utilities
 * Import this at the beginning of test files that need mocking
 */

import { stub } from "std/testing/mock.ts";

// Automatically mock keychain access for all tests
// We'll do this in each test that needs it to avoid top-level issues

// Export all mock utilities
export * from "./mocks/index.ts";

// Export commonly used test assertions
export {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "std/assert/mod.ts";

// Export test utilities from std
export { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";

export { restore, type Spy, spy, type Stub, stub } from "std/testing/mock.ts";

// Test data generators
export function generateTestPubkey(index: number = 0): string {
  return `${"0".repeat(63)}${index}`;
}

export function generateTestNbunk(pubkey: string): string {
  return `nbunksec1${pubkey.slice(0, 20)}`;
}

// Reset singleton instances between tests
export function resetSingletons() {
  // Reset SecretsManager
  const secretsModule = globalThis as any;
  if (secretsModule.SecretsManager) {
    secretsModule.SecretsManager.instance = null;
  }
}
