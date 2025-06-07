import { assertEquals, assertExists } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import { getSystemConfigDir, ensureSystemConfigDir } from "../../src/lib/secrets/utils.ts";
import { join } from "std/path/mod.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";

const originalEnv = Deno.env.toObject();

let secretsManagerInstance: SecretsManager | null = null;

describe("Secrets Module", () => {
  let tempDir: string;
  
  beforeEach(() => {
    tempDir = Deno.makeTempDirSync({ prefix: "nsite-secrets-test-" });
    
    (SecretsManager as any).instance = null;
    secretsManagerInstance = null;
    
    // Force legacy mode to avoid keychain interactions
    Deno.env.set("HOME", tempDir);
    Deno.env.set("USERPROFILE", tempDir);
    Deno.env.set("NSYTE_DISABLE_KEYCHAIN", "1");
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
  
  it("should store and retrieve nbunksec strings", async () => {
    const manager = SecretsManager.getInstance();
    secretsManagerInstance = manager;
    
    // Force legacy mode to avoid keychain prompts
    (manager as any).legacyMode = true;
    (manager as any).storageBackend = null;
    (manager as any).initialized = true;
    const nsiteDir = join(tempDir, ".nsite");
    await ensureDir(nsiteDir);
    (manager as any).secretsPath = join(nsiteDir, "secrets.json");
    
    const existingPubkeys = await manager.getAllPubkeys();
    for (const pubkey of existingPubkeys) {
      await manager.deleteNbunk(pubkey);
    }
    
    const pubkey = "e8b487c079b0f67c695ae6c4c2552a47f38adfa6d0fc795cfd1f5bd787875948";
    const nbunkString = "nbunk1q2w3e4r";
    
    const stored = await manager.storeNbunk(pubkey, nbunkString);
    assertEquals(stored, true, "Should successfully store the nbunksec");
    
    const retrieved = await manager.getNbunk(pubkey);
    assertEquals(retrieved, nbunkString, "Should retrieve the stored nbunksec");
    
    const pubkeys = await manager.getAllPubkeys();
    assertEquals(pubkeys.length, 1, "Should have one pubkey stored");
    assertEquals(pubkeys[0], pubkey, "Should match the stored pubkey");
  });
  
  it("should delete a stored nbunksec", async () => {
    const manager = SecretsManager.getInstance();
    secretsManagerInstance = manager;
    
    // Force legacy mode to avoid keychain prompts
    (manager as any).legacyMode = true;
    (manager as any).storageBackend = null;
    (manager as any).initialized = true;
    const nsiteDir = join(tempDir, ".nsite");
    await ensureDir(nsiteDir);
    (manager as any).secretsPath = join(nsiteDir, "secrets.json");
    
    const existingPubkeys = await manager.getAllPubkeys();
    for (const pubkey of existingPubkeys) {
      await manager.deleteNbunk(pubkey);
    }
    
    const pubkey = "e8b487c079b0f67c695ae6c4c2552a47f38adfa6d0fc795cfd1f5bd787875948";
    const nbunkString = "nbunk1q2w3e4r";
    
    await manager.storeNbunk(pubkey, nbunkString);
    
    const retrieved = await manager.getNbunk(pubkey);
    assertEquals(retrieved, nbunkString, "Should have stored the nbunksec");
    
    const deleted = await manager.deleteNbunk(pubkey);
    assertEquals(deleted, true, "Should return true for successful deletion");
    
    const afterDelete = await manager.getNbunk(pubkey);
    assertEquals(afterDelete, null, "Should return null after deletion");
    
    const pubkeys = await manager.getAllPubkeys();
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