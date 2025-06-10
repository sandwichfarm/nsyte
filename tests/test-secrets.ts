#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run

/**
 * Test script for the secrets management integration
 * Tests keychain, encrypted storage, and legacy fallback
 */

import { SecretsManager } from "../src/lib/secrets/mod.ts";
import { getKeychainProvider } from "../src/lib/secrets/keychain.ts";
import { EncryptedStorage } from "../src/lib/secrets/encrypted-storage.ts";

async function testSecretsManager() {
  console.log("🔑 Testing nsyte secrets management integration");
  console.log("=".repeat(50));

  // Test keychain availability
  console.log("\n1. Testing keychain availability...");
  const keychainProvider = await getKeychainProvider();
  if (keychainProvider) {
    console.log("✅ Native keychain available:", Deno.build.os);
  } else {
    console.log("❌ Native keychain not available");
  }

  // Test encrypted storage
  console.log("\n2. Testing encrypted storage...");
  const encryptedStorage = new EncryptedStorage();
  const encryptedInitialized = await encryptedStorage.initialize();
  if (encryptedInitialized) {
    console.log("✅ Encrypted storage initialized");
  } else {
    console.log("❌ Encrypted storage failed to initialize");
  }

  // Test SecretsManager
  console.log("\n3. Testing SecretsManager...");
  const secretsManager = SecretsManager.getInstance();
  const initialized = await secretsManager.initialize();

  if (!initialized) {
    console.log("❌ SecretsManager failed to initialize");
    return;
  }
  console.log("✅ SecretsManager initialized");

  // Test storing and retrieving a secret
  console.log("\n4. Testing secret storage...");
  const testPubkey = "npub1test1234567890abcdef";
  const testNbunksec = "bunker://test-connection-string";

  // Store
  const stored = await secretsManager.storeNbunk(testPubkey, testNbunksec);
  if (stored) {
    console.log("✅ Secret stored successfully");
  } else {
    console.log("❌ Failed to store secret");
    return;
  }

  // Retrieve
  const retrieved = await secretsManager.getNbunk(testPubkey);
  if (retrieved === testNbunksec) {
    console.log("✅ Secret retrieved successfully");
  } else {
    console.log("❌ Failed to retrieve secret or value mismatch");
    console.log("Expected:", testNbunksec);
    console.log("Got:", retrieved);
  }

  // List
  const pubkeys = await secretsManager.getAllPubkeys();
  if (pubkeys.includes(testPubkey)) {
    console.log("✅ Secret appears in pubkey list");
  } else {
    console.log("❌ Secret not found in pubkey list");
  }

  // Delete
  const deleted = await secretsManager.deleteNbunk(testPubkey);
  if (deleted) {
    console.log("✅ Secret deleted successfully");
  } else {
    console.log("❌ Failed to delete secret");
  }

  // Verify deletion
  const retrievedAfterDelete = await secretsManager.getNbunk(testPubkey);
  if (retrievedAfterDelete === null) {
    console.log("✅ Secret properly removed");
  } else {
    console.log("❌ Secret still exists after deletion");
  }

  console.log("\n" + "=".repeat(50));
  console.log("🎉 Secrets management test completed!");
}

if (import.meta.main) {
  try {
    await testSecretsManager();
  } catch (error) {
    console.error("💥 Test failed with error:", error);
    Deno.exit(1);
  }
}
