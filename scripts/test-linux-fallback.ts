#!/usr/bin/env -S deno run --allow-all

/**
 * Test script to verify Linux encrypted storage fallback is working
 */

import { SecretsManager } from "./src/lib/secrets/manager.ts";

async function testEncryptedStorageFallback() {
  console.log("Testing Linux Encrypted Storage Fallback");
  console.log("========================================\n");

  // Force disable keychain by temporarily renaming getKeychainProvider
  const originalEnv = Deno.env.get("NSYTE_FORCE_ENCRYPTED_STORAGE");
  Deno.env.set("NSYTE_FORCE_ENCRYPTED_STORAGE", "true");

  try {
    const manager = SecretsManager.getInstance();
    
    // Initialize the manager
    console.log("1. Initializing SecretsManager...");
    const initialized = await manager.initialize();
    console.log(`   Initialized: ${initialized ? "✓" : "✗"}`);

    if (!initialized) {
      console.error("Failed to initialize SecretsManager");
      return;
    }

    // Test data
    const testPubkey = "npub1test" + Date.now();
    const testNbunksec = "nbunksec1test" + Date.now();

    // Test store
    console.log("\n2. Testing store operation...");
    const stored = await manager.storeNbunk(testPubkey, testNbunksec);
    console.log(`   Store result: ${stored ? "✓" : "✗"}`);

    // Test retrieve
    console.log("\n3. Testing retrieve operation...");
    const retrieved = await manager.getNbunk(testPubkey);
    console.log(`   Retrieved: ${retrieved === testNbunksec ? "✓" : "✗"}`);
    if (retrieved !== testNbunksec) {
      console.log(`   Expected: ${testNbunksec}`);
      console.log(`   Got: ${retrieved}`);
    }

    // Test persistence by creating a new instance
    console.log("\n4. Testing persistence (new instance)...");
    // Clear the singleton to force a new instance
    (SecretsManager as any).instance = null;
    
    const manager2 = SecretsManager.getInstance();
    await manager2.initialize();
    
    const retrieved2 = await manager2.getNbunk(testPubkey);
    console.log(`   Retrieved from new instance: ${retrieved2 === testNbunksec ? "✓" : "✗"}`);
    if (retrieved2 !== testNbunksec) {
      console.log(`   Expected: ${testNbunksec}`);
      console.log(`   Got: ${retrieved2}`);
    }

    // Test list
    console.log("\n5. Testing list operation...");
    const pubkeys = await manager2.getAllPubkeys();
    const found = pubkeys.includes(testPubkey);
    console.log(`   Found in list: ${found ? "✓" : "✗"}`);
    console.log(`   Total stored: ${pubkeys.length}`);

    // Test delete
    console.log("\n6. Testing delete operation...");
    const deleted = await manager2.deleteNbunk(testPubkey);
    console.log(`   Delete result: ${deleted ? "✓" : "✗"}`);

    // Verify deletion
    const retrievedAfterDelete = await manager2.getNbunk(testPubkey);
    console.log(`   Verified deletion: ${retrievedAfterDelete === null ? "✓" : "✗"}`);

    // Check storage file location
    console.log("\n7. Storage file location:");
    const configDir = Deno.env.get("XDG_CONFIG_HOME") || 
                     `${Deno.env.get("HOME")}/.config`;
    const storageFile = `${configDir}/nsyte/secrets.enc`;
    try {
      const stats = await Deno.stat(storageFile);
      console.log(`   File exists: ✓`);
      console.log(`   Location: ${storageFile}`);
      console.log(`   Size: ${stats.size} bytes`);
    } catch {
      console.log(`   File exists: ✗`);
      console.log(`   Expected location: ${storageFile}`);
    }

  } finally {
    // Restore original env
    if (originalEnv !== undefined) {
      Deno.env.set("NSYTE_FORCE_ENCRYPTED_STORAGE", originalEnv);
    } else {
      Deno.env.delete("NSYTE_FORCE_ENCRYPTED_STORAGE");
    }
  }

  console.log("\nTest complete!");
}

if (import.meta.main) {
  await testEncryptedStorageFallback();
}