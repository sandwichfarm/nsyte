import { assertEquals, assertNotEquals } from "std/testing/asserts.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import * as nostrTools from "npm:nostr-tools";
import * as path from "std/path/mod.ts";
import { SecretsManager } from "./mod.ts";
import { 
  getBunkerInfo, 
  saveBunkerInfo, 
  storeBunkerUrl,
  getClientKey,
  saveClientKey,
  parseBunkerUrl,
  encodeBunkerInfo,
  decodeBunkerInfo
} from "../nip46.ts";

describe("NIP-46 Secrets Integration", () => {
  const testDir = path.join(Deno.cwd(), ".test_secrets");
  const testBunkerPubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const testBunkerUrl = `bunker://${testBunkerPubkey}?relay=wss://test.relay&relay=wss://another.relay`;
  let originalHomeDir: string | undefined;
  let secretsManager: SecretsManager;

  // Set up test environment
  beforeEach(() => {
    // Override home directory for testing
    originalHomeDir = Deno.env.get("HOME");
    Deno.env.set("HOME", testDir);
    
    // Create test directory if it doesn't exist
    try {
      Deno.mkdirSync(testDir, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.AlreadyExists)) {
        throw e;
      }
    }
    
    secretsManager = SecretsManager.getInstance();
  });

  // Clean up after tests
  afterEach(() => {
    // Clean up any stored bunker info
    secretsManager.deleteNbunk(testBunkerPubkey);
    
    // Restore original HOME
    if (originalHomeDir) {
      Deno.env.set("HOME", originalHomeDir);
    } else {
      Deno.env.delete("HOME");
    }
  });

  it("should store and retrieve bunker information", () => {
    // Generate a client key
    const clientKey = nostrTools.generateSecretKey();
    
    // Save the bunker info
    saveBunkerInfo(testBunkerPubkey, clientKey, testBunkerUrl);
    
    // Retrieve the bunker info
    const info = getBunkerInfo(testBunkerPubkey);
    
    // Verify the stored info
    assertNotEquals(info, null);
    assertEquals(info?.bunkerUrl.startsWith(`bunker://${testBunkerPubkey}`), true);
    assertEquals(info?.bunkerUrl.includes("relay=wss%3A%2F%2Ftest.relay"), true);
    assertEquals(info?.bunkerUrl.includes("relay=wss%3A%2F%2Fanother.relay"), true);
    assertEquals(info?.clientKey.length, 32); // 32 bytes for a proper key
  });

  it("should store a bunker URL and generate a client key", () => {
    // Store the bunker URL which should generate a client key
    storeBunkerUrl(testBunkerPubkey, testBunkerUrl);
    
    // Retrieve the info
    const info = getBunkerInfo(testBunkerPubkey);
    
    // Verify we have the expected data
    assertNotEquals(info, null);
    assertEquals(info?.bunkerUrl.includes(testBunkerPubkey), true);
    assertEquals(info?.clientKey.length, 32);
  });

  it("should retrieve a client key for backward compatibility", () => {
    // Generate a client key
    const clientKey = nostrTools.generateSecretKey();
    
    // Save the bunker info
    saveBunkerInfo(testBunkerPubkey, clientKey, testBunkerUrl);
    
    // Retrieve just the client key
    const retrievedKey = getClientKey(testBunkerPubkey);
    
    // Verify the key matches
    assertEquals(retrievedKey?.toString(), clientKey.toString());
  });

  it("should save just a client key for backward compatibility", () => {
    // Generate a client key
    const clientKey = nostrTools.generateSecretKey();
    
    // Save just the client key
    saveClientKey(testBunkerPubkey, clientKey);
    
    // Retrieve the bunker info
    const info = getBunkerInfo(testBunkerPubkey);
    
    // Verify the stored info
    assertNotEquals(info, null);
    assertEquals(info?.clientKey.toString(), clientKey.toString());
  });
}); 