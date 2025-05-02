import { assertEquals, assertExists } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import { SecretsManager } from "./mod.ts";
import { getSystemConfigDir, ensureSystemConfigDir } from "./utils.ts";
import { join } from "std/path/mod.ts";

// Mock environment variables for testing
const originalEnv = Deno.env.toObject();

// We'll use this to cleanly reset the singleton between tests
let secretsManagerInstance: SecretsManager | null = null;

describe("Secrets Module", () => {
  let tempDir: string;
  
  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = Deno.makeTempDirSync({ prefix: "nsite-secrets-test-" });
    
    // Reset the singleton
    // This is a hack for testing - we're reaching into private property via any
    (SecretsManager as any).instance = null;
    secretsManagerInstance = null;
  });
  
  afterEach(() => {
    // Clean up
    try {
      Deno.removeSync(tempDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to clean up test directory: ${error}`);
    }
    
    // Reset any mocks
    Object.entries(originalEnv).forEach(([key, value]) => {
      Deno.env.set(key, value);
    });
  });
  
  it("should store and retrieve nbunk strings", () => {
    const manager = SecretsManager.getInstance();
    secretsManagerInstance = manager;
    
    // Store a test nbunk
    const pubkey = "e8b487c079b0f67c695ae6c4c2552a47f38adfa6d0fc795cfd1f5bd787875948";
    const nbunkString = "nbunk1q2w3e4r"; // Not a real nbunk string, just for testing
    
    const stored = manager.storeNbunk(pubkey, nbunkString);
    assertEquals(stored, true, "Should successfully store the nbunk");
    
    // Retrieve the nbunk
    const retrieved = manager.getNbunk(pubkey);
    assertEquals(retrieved, nbunkString, "Should retrieve the stored nbunk");
    
    // Check getAllPubkeys
    const pubkeys = manager.getAllPubkeys();
    assertEquals(pubkeys.length, 1, "Should have one pubkey stored");
    assertEquals(pubkeys[0], pubkey, "Should match the stored pubkey");
  });
  
  it("should delete a stored nbunk", () => {
    const manager = SecretsManager.getInstance();
    secretsManagerInstance = manager;
    
    // Store a test nbunk
    const pubkey = "e8b487c079b0f67c695ae6c4c2552a47f38adfa6d0fc795cfd1f5bd787875948";
    const nbunkString = "nbunk1q2w3e4r"; // Not a real nbunk string, just for testing
    
    manager.storeNbunk(pubkey, nbunkString);
    
    // Verify it's stored
    const retrieved = manager.getNbunk(pubkey);
    assertEquals(retrieved, nbunkString, "Should have stored the nbunk");
    
    // Delete it
    const deleted = manager.deleteNbunk(pubkey);
    assertEquals(deleted, true, "Should return true for successful deletion");
    
    // Verify it's gone
    const afterDelete = manager.getNbunk(pubkey);
    assertEquals(afterDelete, null, "Should return null after deletion");
    
    // Check getAllPubkeys
    const pubkeys = manager.getAllPubkeys();
    assertEquals(pubkeys.length, 0, "Should have no pubkeys stored");
  });
});

describe("System Directory Detection", () => {
  beforeEach(() => {
    // Reset environment variables
    Object.entries(originalEnv).forEach(([key, value]) => {
      Deno.env.set(key, value);
    });
  });
  
  it("should detect home directory", () => {
    // We can't effectively test this cross-platform in a unit test,
    // but we can verify it returns a non-null value
    const homeDir = getSystemConfigDir();
    assertExists(homeDir, "Should return a non-null system config directory");
  });
}); 