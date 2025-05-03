import { assertEquals, assertExists } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { SecretsManager } from "./mod.ts";
import { getSystemConfigDir, ensureSystemConfigDir } from "./utils.ts";
import { join } from "std/path/mod.ts";

const originalEnv = Deno.env.toObject();

let secretsManagerInstance: SecretsManager | null = null;

describe("Secrets Module", () => {
  let tempDir: string;
  
  beforeEach(() => {
    tempDir = Deno.makeTempDirSync({ prefix: "nsite-secrets-test-" });
    
    (SecretsManager as any).instance = null;
    secretsManagerInstance = null;
  });
  
  afterEach(() => {
    try {
      Deno.removeSync(tempDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to clean up test directory: ${error}`);
    }
    
    Object.entries(originalEnv).forEach(([key, value]) => {
      Deno.env.set(key, value);
    });
  });
  
  it("should store and retrieve nbunksec strings", () => {
    const manager = SecretsManager.getInstance();
    secretsManagerInstance = manager;
    
    const pubkey = "e8b487c079b0f67c695ae6c4c2552a47f38adfa6d0fc795cfd1f5bd787875948";
    const nbunkString = "nbunk1q2w3e4r";
    
    const stored = manager.storeNbunk(pubkey, nbunkString);
    assertEquals(stored, true, "Should successfully store the nbunksec");
    
    const retrieved = manager.getNbunk(pubkey);
    assertEquals(retrieved, nbunkString, "Should retrieve the stored nbunksec");
    
    const pubkeys = manager.getAllPubkeys();
    assertEquals(pubkeys.length, 1, "Should have one pubkey stored");
    assertEquals(pubkeys[0], pubkey, "Should match the stored pubkey");
  });
  
  it("should delete a stored nbunksec", () => {
    const manager = SecretsManager.getInstance();
    secretsManagerInstance = manager;
    
    const pubkey = "e8b487c079b0f67c695ae6c4c2552a47f38adfa6d0fc795cfd1f5bd787875948";
    const nbunkString = "nbunk1q2w3e4r";
    
    manager.storeNbunk(pubkey, nbunkString);
    
    const retrieved = manager.getNbunk(pubkey);
    assertEquals(retrieved, nbunkString, "Should have stored the nbunksec");
    
    const deleted = manager.deleteNbunk(pubkey);
    assertEquals(deleted, true, "Should return true for successful deletion");
    
    const afterDelete = manager.getNbunk(pubkey);
    assertEquals(afterDelete, null, "Should return null after deletion");
    
    const pubkeys = manager.getAllPubkeys();
    assertEquals(pubkeys.length, 0, "Should have no pubkeys stored");
  });
});

describe("System Directory Detection", () => {
  beforeEach(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      Deno.env.set(key, value);
    });
  });
  
  it("should detect home directory", () => {
    const homeDir = getSystemConfigDir();
    assertExists(homeDir, "Should return a non-null system config directory");
  });
}); 