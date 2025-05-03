import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import * as path from "std/path/mod.ts";
import { ensureDirSync } from "std/fs/ensure_dir.ts";
import { fileExists } from "../../src/lib/secrets/utils.ts";

// Mock implementation for testing
class TestableSecretsManager {
  private static testInstance: TestableSecretsManager;
  private _secretsPath: string;
  private _secrets: Record<string, string> = {};
  private _initialized = false;

  private constructor(testDir: string) {
    this._secretsPath = path.join(testDir, "test_secrets.json");
    this._initialized = true;
  }

  public static getTestInstance(testDir: string): TestableSecretsManager {
    if (!TestableSecretsManager.testInstance) {
      TestableSecretsManager.testInstance = new TestableSecretsManager(testDir);
    }
    return TestableSecretsManager.testInstance;
  }

  public static resetInstance(): void {
    TestableSecretsManager.testInstance = null as unknown as TestableSecretsManager;
  }

  public initialize(): boolean {
    return this._initialized;
  }

  public storeNbunk(pubkey: string, nbunksec: string): boolean {
    this._secrets[pubkey] = nbunksec;
    this.save();
    return true;
  }

  public getNbunk(pubkey: string): string | null {
    return this._secrets[pubkey] || null;
  }

  public getAllPubkeys(): string[] {
    return Object.keys(this._secrets);
  }

  public deleteNbunk(pubkey: string): boolean {
    if (!(pubkey in this._secrets)) {
      return false;
    }
    
    delete this._secrets[pubkey];
    this.save();
    return true;
  }

  private save(): void {
    try {
      Deno.writeTextFileSync(this._secretsPath, JSON.stringify(this._secrets, null, 2));
    } catch (error) {
      console.error(`Test error: ${error}`);
    }
  }

  public getSecretsPath(): string {
    return this._secretsPath;
  }
}

describe("Secrets Manager", () => {
  const testDir = path.join(Deno.cwd(), "test-output", "secrets");
  let secretsManager: TestableSecretsManager;

  beforeEach(() => {
    ensureDirSync(testDir);
    TestableSecretsManager.resetInstance();
    secretsManager = TestableSecretsManager.getTestInstance(testDir);
    
    // Clean up any existing test files
    try {
      Deno.removeSync(secretsManager.getSecretsPath(), { recursive: true });
    } catch (_) {
      // Ignore if file doesn't exist
    }
  });

  afterEach(() => {
    try {
      Deno.removeSync(secretsManager.getSecretsPath());
    } catch (_) {
      // Ignore if file doesn't exist
    }
  });

  describe("nbunksec storage", () => {
    it("should store and retrieve a nbunksec string", () => {
      const pubkey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const nbunksec = "nbunk1q..."; // Simplified for testing
      
      const storeResult = secretsManager.storeNbunk(pubkey, nbunksec);
      assertEquals(storeResult, true, "storeNbunk should return true on success");
      
      const retrievedNbunk = secretsManager.getNbunk(pubkey);
      assertEquals(retrievedNbunk, nbunksec, "Retrieved nbunksec should match stored nbunksec");
      
      // Check that the secrets file was created
      assertEquals(fileExists(secretsManager.getSecretsPath()), true, "Secrets file should exist after storage");
    });

    it("should return null for non-existent pubkey", () => {
      const nonExistentPubkey = "0000000000000000000000000000000000000000000000000000000000000000";
      const retrievedNbunk = secretsManager.getNbunk(nonExistentPubkey);
      assertEquals(retrievedNbunk, null, "getNbunk should return null for non-existent pubkey");
    });
    
    it("should return all stored pubkeys", () => {
      const pubkey1 = "1111111111111111111111111111111111111111111111111111111111111111";
      const pubkey2 = "2222222222222222222222222222222222222222222222222222222222222222";
      const nbunk1 = "nbunk1..."; // Simplified for testing
      const nbunk2 = "nbunk2..."; // Simplified for testing
      
      secretsManager.storeNbunk(pubkey1, nbunk1);
      secretsManager.storeNbunk(pubkey2, nbunk2);
      
      const pubkeys = secretsManager.getAllPubkeys();
      assertEquals(pubkeys.length, 2, "Should have two stored pubkeys");
      assertEquals(pubkeys.includes(pubkey1), true, "Should include pubkey1");
      assertEquals(pubkeys.includes(pubkey2), true, "Should include pubkey2");
    });
    
    it("should delete stored nbunksec", () => {
      const pubkey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const nbunksec = "nbunk1q..."; // Simplified for testing
      
      secretsManager.storeNbunk(pubkey, nbunksec);
      
      // Verify it was stored
      assertExists(secretsManager.getNbunk(pubkey));
      
      // Delete it
      const deleteResult = secretsManager.deleteNbunk(pubkey);
      assertEquals(deleteResult, true, "deleteNbunk should return true on success");
      
      // Verify it was deleted
      assertEquals(secretsManager.getNbunk(pubkey), null, "nbunksec should be null after deletion");
    });
    
    it("should return false when deleting non-existent nbunksec", () => {
      const nonExistentPubkey = "0000000000000000000000000000000000000000000000000000000000000000";
      const deleteResult = secretsManager.deleteNbunk(nonExistentPubkey);
      assertEquals(deleteResult, false, "deleteNbunk should return false for non-existent pubkey");
    });
  });

  describe("persistence", () => {
    it("should persist secrets to disk", () => {
      const pubkey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const nbunksec = "nbunk1q..."; // Simplified for testing
      
      secretsManager.storeNbunk(pubkey, nbunksec);
      
      // Create a new instance to verify persistence
      TestableSecretsManager.resetInstance();
      const newSecretsManager = TestableSecretsManager.getTestInstance(testDir);
      
      // Load from disk
      try {
        const content = Deno.readTextFileSync(newSecretsManager.getSecretsPath());
        const secrets = JSON.parse(content);
        assertEquals(secrets[pubkey], nbunksec, "Persisted secret should match");
      } catch (error) {
        assertEquals(true, false, `Failed to read secrets file: ${error}`);
      }
    });
  });

  // Basic test for the real SecretsManager 
  // This will connect to the actual implementation but does minimal testing
  describe("Actual SecretsManager class", () => {
    it("should be instantiable as a singleton", () => {
      const instance1 = SecretsManager.getInstance();
      const instance2 = SecretsManager.getInstance();
      
      assertEquals(instance1 === instance2, true, "Should return the same singleton instance");
    });
  });
}); 