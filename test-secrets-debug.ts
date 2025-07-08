#!/usr/bin/env -S deno run --allow-all

/**
 * Debug the secrets manager issue
 */

import { SecretsManager } from "./src/lib/secrets/manager.ts";
import { getKeychainProvider } from "./src/lib/secrets/keychain.ts";

// Enable debug logging
Deno.env.set("NSYTE_LOG_LEVEL", "debug");

async function debugSecretsManager() {
  console.log("=== Debugging Secrets Manager ===\n");

  // Check keychain provider
  console.log("1. Checking keychain provider availability...");
  const keychainProvider = await getKeychainProvider();
  console.log(`Keychain provider available: ${keychainProvider !== null}`);
  
  if (keychainProvider) {
    console.log("\n2. Testing keychain provider list method...");
    const keychainList = await keychainProvider.list("nsyte");
    console.log(`Keychain list returned ${keychainList.length} items`);
    keychainList.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.slice(0, 8)}...${item.slice(-4)}`);
    });
  }

  // Test SecretsManager
  console.log("\n3. Testing SecretsManager...");
  const secretsManager = SecretsManager.getInstance();
  
  console.log("Initializing SecretsManager...");
  const initialized = await secretsManager.initialize();
  console.log(`Initialized: ${initialized}`);
  
  console.log("\nCalling getAllPubkeys()...");
  const pubkeys = await secretsManager.getAllPubkeys();
  console.log(`getAllPubkeys returned ${pubkeys.length} items`);
  
  pubkeys.forEach((pubkey, idx) => {
    console.log(`  ${idx + 1}. ${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`);
  });

  // Check internal state
  console.log("\n4. Checking SecretsManager internal state...");
  const manager = secretsManager as any;
  console.log(`Initialized: ${manager.initialized}`);
  console.log(`Legacy mode: ${manager.legacyMode}`);
  console.log(`Storage backend exists: ${manager.storageBackend !== null}`);
  console.log(`Secrets path: ${manager.secretsPath}`);
}

if (import.meta.main) {
  await debugSecretsManager();
}