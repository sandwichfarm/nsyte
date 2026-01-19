import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { ensureDirSync, existsSync } from "jsr:@std/fs";
import { EncryptedStorage } from "../../src/lib/secrets/encrypted-storage.ts";

// Test utilities
const TEST_DIR = "./test_encrypted_storage_tmp";
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

Deno.test("EncryptedStorage - Sequential Operations", async () => {
  setupTestDir();
  const restoreEnv = mockEnvironment();

  try {
    const storage = new EncryptedStorage();
    await storage.initialize();

    // Test multiple store/retrieve operations
    const testData = [
      { account: "npub1test1", secret: "bunker://connection-1" },
      { account: "npub1test2", secret: "bunker://connection-2" },
      { account: "npub1test3", secret: "bunker://connection-3" },
    ];

    // Store secrets
    for (const { account, secret } of testData) {
      const stored = await storage.store("nsyte", account, secret);
      assert(stored, `Store ${account} should succeed`);
    }

    // Retrieve and verify
    for (const { account, secret } of testData) {
      const retrieved = await storage.retrieve("nsyte", account);
      assertEquals(retrieved, secret, `Retrieved ${account} should match`);
    }

    // Update secrets
    for (const { account } of testData) {
      const updated = await storage.store("nsyte", account, `${account}-updated`);
      assert(updated, `Update ${account} should succeed`);
    }

    // Verify updates
    for (const { account } of testData) {
      const retrieved = await storage.retrieve("nsyte", account);
      assertEquals(retrieved, `${account}-updated`, `Updated ${account} should match`);
    }

    // Test list functionality
    const accounts = await storage.list("nsyte");
    assertEquals(accounts.length, testData.length, "Should list all accounts");
    for (const { account } of testData) {
      assert(accounts.includes(account), `List should include ${account}`);
    }
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
      assert(
        !fileContent.includes(sensitiveData),
        "Encrypted file should not contain plaintext secret",
      );
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
