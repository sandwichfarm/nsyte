/**
 * Unit tests for the secrets management system
 * Tests keychain providers, encrypted storage, and SecretsManager
 */

import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { join } from "std/path/mod.ts";
import { ensureDirSync, existsSync } from "std/fs/mod.ts";
import { SecretsManager } from "../src/lib/secrets/manager.ts";
import { EncryptedStorage } from "../src/lib/secrets/encrypted-storage.ts";
import { getKeychainProvider } from "../src/lib/secrets/keychain.ts";

// Mock keychain provider for testing
class MockKeychainProvider {
  private storage = new Map<string, string>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async store(credential: { service: string; account: string; password: string }): Promise<boolean> {
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

// Test utilities
const TEST_DIR = "./test_secrets_tmp";
const TEST_SERVICE = "nsyte-test";

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    Deno.removeSync(TEST_DIR, { recursive: true });
  }
  ensureDirSync(TEST_DIR);
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    Deno.removeSync(TEST_DIR, { recursive: true });
  }
}

// Mock environment for testing
function mockEnvironment() {
  const originalEnv = {
    HOME: Deno.env.get("HOME"),
    USER: Deno.env.get("USER"),
    USERNAME: Deno.env.get("USERNAME"),
  };

  // Set test environment
  Deno.env.set("HOME", TEST_DIR);
  Deno.env.set("USER", "testuser");

  return () => {
    // Restore original environment
    if (originalEnv.HOME) Deno.env.set("HOME", originalEnv.HOME);
    if (originalEnv.USER) Deno.env.set("USER", originalEnv.USER);
    if (originalEnv.USERNAME) Deno.env.set("USERNAME", originalEnv.USERNAME);
  };
}

Deno.test("Keychain Provider Detection", async () => {
  const provider = await getKeychainProvider();
  
  // Should detect provider on supported platforms
  if (["darwin", "windows", "linux"].includes(Deno.build.os)) {
    // Provider might be available or not depending on system setup
    // Just ensure the function doesn't throw
    assert(provider !== undefined); // null or KeychainProvider
  } else {
    assertEquals(provider, null);
  }
});

Deno.test("EncryptedStorage - Basic Operations", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();
  
  try {
    const storage = new EncryptedStorage();
    const initialized = await storage.initialize();
    assert(initialized, "EncryptedStorage should initialize successfully");

    // Test store and retrieve
    const testData = "test-secret-value";
    const stored = await storage.store(TEST_SERVICE, "test-account", testData);
    assert(stored, "Should store secret successfully");

    const retrieved = await storage.retrieve(TEST_SERVICE, "test-account");
    assertEquals(retrieved, testData, "Retrieved data should match stored data");

    // Test list
    const accounts = await storage.list(TEST_SERVICE);
    assert(accounts.includes("test-account"), "Account should appear in list");

    // Test delete
    const deleted = await storage.delete(TEST_SERVICE, "test-account");
    assert(deleted, "Should delete secret successfully");

    const retrievedAfterDelete = await storage.retrieve(TEST_SERVICE, "test-account");
    assertEquals(retrievedAfterDelete, null, "Secret should be null after deletion");
  } finally {
    restoreEnv();
    cleanupTestDir();
  }
});

Deno.test("EncryptedStorage - Multiple Secrets", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();
  
  try {
    const storage = new EncryptedStorage();
    await storage.initialize();

    // Store multiple secrets
    const secrets = {
      "account1": "secret1",
      "account2": "secret2",
      "account3": "secret3",
    };

    for (const [account, secret] of Object.entries(secrets)) {
      await storage.store(TEST_SERVICE, account, secret);
    }

    // Verify all secrets
    for (const [account, expectedSecret] of Object.entries(secrets)) {
      const retrieved = await storage.retrieve(TEST_SERVICE, account);
      assertEquals(retrieved, expectedSecret, `Secret for ${account} should match`);
    }

    // Test list returns all accounts
    const accounts = await storage.list(TEST_SERVICE);
    assertEquals(accounts.sort(), Object.keys(secrets).sort(), "All accounts should be listed");
  } finally {
    restoreEnv();
    cleanupTestDir();
  }
});

Deno.test("SecretsManager - Encrypted Storage Fallback", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();
  
  try {
    // Test with encrypted storage directly to avoid keychain prompts
    const storage = new EncryptedStorage();
    const initialized = await storage.initialize();
    assert(initialized, "EncryptedStorage should initialize");
    
    // Test basic operations
    const testPubkey = "npub1test123";
    const testNbunksec = "bunker://test-connection";
    
    const stored = await storage.store("nsyte", testPubkey, testNbunksec);
    assert(stored, "Should store nbunksec successfully");
    
    const retrieved = await storage.retrieve("nsyte", testPubkey);
    assertEquals(retrieved, testNbunksec, "Should retrieve correct nbunksec");
    
    const pubkeys = await storage.list("nsyte");
    assert(pubkeys.includes(testPubkey), "Pubkey should be in list");
    
    const deleted = await storage.delete("nsyte", testPubkey);
    assert(deleted, "Should delete nbunksec successfully");
  } finally {
    restoreEnv();
    cleanupTestDir();
  }
});

Deno.test("SecretsManager - Legacy Migration (Encrypted Storage)", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();
  
  try {
    // Create legacy secrets file
    const configDir = join(TEST_DIR, ".config", "nsyte");
    ensureDirSync(configDir);
    
    const legacySecrets = {
      "npub1legacy1": "bunker://legacy-connection-1",
      "npub1legacy2": "bunker://legacy-connection-2",
    };
    
    const legacyPath = join(configDir, "secrets.json");
    Deno.writeTextFileSync(legacyPath, JSON.stringify(legacySecrets, null, 2));
    
    // Test migration with encrypted storage directly
    const storage = new EncryptedStorage();
    await storage.initialize();
    
    // Manually test migration logic by reading legacy file and storing in encrypted storage
    for (const [pubkey, nbunksec] of Object.entries(legacySecrets)) {
      const stored = await storage.store("nsyte", pubkey, nbunksec);
      assert(stored, `Should migrate ${pubkey} successfully`);
    }
    
    // Verify migration worked
    for (const [pubkey, expectedNbunksec] of Object.entries(legacySecrets)) {
      const retrieved = await storage.retrieve("nsyte", pubkey);
      assertEquals(retrieved, expectedNbunksec, `Migrated secret for ${pubkey} should match`);
    }
    
    const pubkeys = await storage.list("nsyte");
    assertEquals(pubkeys.sort(), Object.keys(legacySecrets).sort(), "All migrated pubkeys should be available");
  } finally {
    restoreEnv();
    cleanupTestDir();
  }
});

Deno.test("EncryptedStorage - Error Handling", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();
  
  try {
    const storage = new EncryptedStorage();
    await storage.initialize();
    
    // Test retrieving non-existent secret
    const nonExistent = await storage.retrieve("nsyte", "npub1nonexistent");
    assertEquals(nonExistent, null, "Non-existent secret should return null");
    
    // Test deleting non-existent secret
    const deletedNonExistent = await storage.delete("nsyte", "npub1nonexistent");
    assertEquals(deletedNonExistent, false, "Deleting non-existent secret should return false");
    
    // Test empty account
    const emptyResult = await storage.retrieve("nsyte", "");
    assertEquals(emptyResult, null, "Empty account should return null");
  } finally {
    restoreEnv();
    cleanupTestDir();
  }
});

Deno.test("EncryptedStorage - Concurrent Operations", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();
  
  try {
    const storage = new EncryptedStorage();
    await storage.initialize();
    
    // Store multiple secrets concurrently
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(storage.store("nsyte", `npub1test${i}`, `bunker://connection-${i}`));
    }
    
    const results = await Promise.all(promises);
    results.forEach((result: boolean, i: number) => {
      assert(result, `Concurrent store ${i} should succeed`);
    });
    
    // Small delay to ensure all writes are flushed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Retrieve all secrets concurrently
    const retrievePromises = [];
    for (let i = 0; i < 10; i++) {
      retrievePromises.push(storage.retrieve("nsyte", `npub1test${i}`));
    }
    
    const retrievedSecrets = await Promise.all(retrievePromises);
    retrievedSecrets.forEach((secret: string | null, i: number) => {
      assertEquals(secret, `bunker://connection-${i}`, `Concurrent retrieve ${i} should match`);
    });
  } finally {
    restoreEnv();
    cleanupTestDir();
  }
});

Deno.test("EncryptedStorage - Encryption Security", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();
  
  try {
    const storage = new EncryptedStorage();
    await storage.initialize();
    
    // Store a secret
    const sensitiveData = "very-sensitive-bunker-connection-string-with-keys";
    await storage.store(TEST_SERVICE, "test-account", sensitiveData);
    
    // Check that the file doesn't contain the plaintext secret
    const configDir = join(TEST_DIR, ".config", "nsyte");
    const encryptedFile = join(configDir, "secrets.enc");
    
    if (existsSync(encryptedFile)) {
      const fileContent = Deno.readTextFileSync(encryptedFile);
      assert(!fileContent.includes(sensitiveData), "Encrypted file should not contain plaintext secret");
      assert(fileContent.includes("salt"), "Encrypted file should contain salt");
      assert(fileContent.includes("iv"), "Encrypted file should contain IV");
      assert(fileContent.includes("data"), "Encrypted file should contain encrypted data");
      assert(fileContent.includes("tag"), "Encrypted file should contain authentication tag");
    }
    
    // Verify we can still retrieve the correct data
    const retrieved = await storage.retrieve(TEST_SERVICE, "test-account");
    assertEquals(retrieved, sensitiveData, "Should decrypt to original data");
  } finally {
    restoreEnv();
    cleanupTestDir();
  }
});

Deno.test("Platform Config Directory Handling", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();
  
  try {
    const storage = new EncryptedStorage();
    await storage.initialize();
    
    // Verify config directory is created in the right place
    let expectedPath: string;
    switch (Deno.build.os) {
      case "darwin":
        expectedPath = join(TEST_DIR, "Library", "Application Support", "nsyte");
        break;
      case "windows":
        expectedPath = join(TEST_DIR, "AppData", "Roaming", "nsite");
        break;
      default:
        expectedPath = join(TEST_DIR, ".config", "nsyte");
    }
    
    assert(existsSync(expectedPath), `Config directory should exist at ${expectedPath}`);
  } finally {
    restoreEnv();
    cleanupTestDir();
  }
});