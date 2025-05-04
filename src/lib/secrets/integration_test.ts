import { assertEquals, assertNotEquals } from "std/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import * as nostrTools from "npm:nostr-tools";
import * as path from "std/path/mod.ts";
import { SecretsManager } from "./mod.ts";
import { 
  getBunkerInfo, 
  saveBunkerInfo, 
  storeBunkerUrl,
  getClientKey,
  saveClientKey,
  BunkerInfo,
  encodeBunkerInfo,
  decodeBunkerInfo,
  parseBunkerUrl
} from "../nip46.ts";

describe("Secrets and NIP-46 Integration", () => {
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
    
    // Reset secrets manager to ensure a fresh instance with our test directory
    (SecretsManager as any).instance = null;
    secretsManager = SecretsManager.getInstance();
    
    // Clean up any existing test data
    secretsManager.getAllPubkeys().forEach(pubkey => {
      secretsManager.deleteNbunk(pubkey);
    });
  });

  // Clean up after tests
  afterEach(() => {
    // Clean up any stored bunker info
    secretsManager.getAllPubkeys().forEach(pubkey => {
      secretsManager.deleteNbunk(pubkey);
    });
    
    // Restore original HOME
    if (originalHomeDir) {
      Deno.env.set("HOME", originalHomeDir);
    } else {
      Deno.env.delete("HOME");
    }
    
    // Reset the instance
    (SecretsManager as any).instance = null;
  });

  it("should properly encode, store, and retrieve bunker information", () => {
    // Create bunker info
    const bunkerInfo: BunkerInfo = {
      pubkey: testBunkerPubkey,
      relays: ["wss://test.relay", "wss://another.relay"],
      local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      secret: "test_secret"
    };
    
    // Encode it
    const encoded = encodeBunkerInfo(bunkerInfo);
    
    // Verify the encoding
    assertEquals(encoded.startsWith("nbunksec"), true);
    
    // Store it directly with the secrets manager
    secretsManager.storeNbunk(testBunkerPubkey, encoded);
    
    // Retrieve it with getBunkerInfo
    const retrieved = getBunkerInfo(testBunkerPubkey);
    
    // Verify the retrieved info
    assertNotEquals(retrieved, null);
    assertEquals(retrieved?.bunkerUrl.startsWith(`bunker://${testBunkerPubkey}`), true);
    assertEquals(retrieved?.bunkerUrl.includes("relay="), true);
    assertEquals(retrieved?.clientKey.length, 32);
  });

  it("should properly handle bunker URL storage and retrieval", () => {
    // Store a bunker URL
    storeBunkerUrl(testBunkerPubkey, testBunkerUrl);
    
    // Retrieve all pubkeys
    const pubkeys = secretsManager.getAllPubkeys();
    
    // Verify the pubkey is stored
    assertEquals(pubkeys.includes(testBunkerPubkey), true);
    
    // Retrieve the stored nbunksec
    const nbunk = secretsManager.getNbunk(testBunkerPubkey);
    assertNotEquals(nbunk, null);
    
    // Decode it
    const decoded = decodeBunkerInfo(nbunk!);
    
    // Verify the decoded info
    assertEquals(decoded.pubkey, testBunkerPubkey);
    assertEquals(decoded.relays.length, 2);
    assertEquals(decoded.relays.includes("wss://test.relay"), true);
    assertEquals(decoded.relays.includes("wss://another.relay"), true);
  });

  it("should provide backwards compatibility with getClientKey and saveClientKey", () => {
    // Generate a client key
    const clientKey = nostrTools.generateSecretKey();
    
    // Save it
    saveClientKey(testBunkerPubkey, clientKey);
    
    // Retrieve it
    const retrievedKey = getClientKey(testBunkerPubkey);
    
    // Verify it
    assertNotEquals(retrievedKey, null);
    assertEquals(new Uint8Array(retrievedKey!).toString(), new Uint8Array(clientKey).toString());
    
    // Delete it using the secrets manager
    secretsManager.deleteNbunk(testBunkerPubkey);
    
    // Verify it's gone
    const afterDelete = getClientKey(testBunkerPubkey);
    assertEquals(afterDelete, null);
  });
}); 