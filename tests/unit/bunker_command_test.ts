import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { 
  showBunkerHelp, 
  importNbunk, 
  exportNbunk,
  useBunkerForProject,
  removeBunker
} from "../../src/commands/bunker.ts";
import { encodeBunkerInfo, BunkerInfo } from "../../src/lib/nip46.ts";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import * as path from "std/path/mod.ts";
import { ensureDirSync } from "std/fs/ensure_dir.ts";
import { Confirm } from "cliffy/prompt/mod.ts";

// Helper function to capture console output
function captureConsoleOutput(fn: () => Promise<void> | void): Promise<string> {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  
  let output = "";
  
  console.log = (...args: unknown[]) => {
    output += args.join(" ") + "\n";
  };
  
  console.error = (...args: unknown[]) => {
    output += "ERROR: " + args.join(" ") + "\n";
  };
  
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        return output;
      });
    } else {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      return Promise.resolve(output);
    }
  } catch (error) {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    throw error;
  }
}

// Mock implementation of SecretsManager for testing
class MockSecretsManager {
  private static mockInstance: MockSecretsManager;
  private secrets: Record<string, string> = {};
  
  private constructor() {}
  
  public static getMockInstance(): MockSecretsManager {
    if (!MockSecretsManager.mockInstance) {
      MockSecretsManager.mockInstance = new MockSecretsManager();
    }
    return MockSecretsManager.mockInstance;
  }
  
  public storeNbunk(pubkey: string, nbunk: string): boolean {
    this.secrets[pubkey] = nbunk;
    return true;
  }
  
  public getNbunk(pubkey: string): string | null {
    return this.secrets[pubkey] || null;
  }
  
  public getAllPubkeys(): string[] {
    return Object.keys(this.secrets);
  }
  
  public deleteNbunk(pubkey: string): boolean {
    if (!(pubkey in this.secrets)) {
      return false;
    }
    
    delete this.secrets[pubkey];
    return true;
  }
  
  public resetMock(): void {
    this.secrets = {};
  }
}

// Override the SecretsManager.getInstance method to return our mock
const originalGetInstanceMethod = SecretsManager.getInstance;
const mockSecrets = MockSecretsManager.getMockInstance();

// Create type for mocked Confirm
interface MockedConfirm {
  prompt: (options?: unknown) => Promise<boolean>;
}

describe("Bunker Command", () => {
  const originalConfirmPrompt = Confirm.prompt;

  beforeEach(() => {
    mockSecrets.resetMock();
    
    // Override the SecretsManager.getInstance to return our mock
    SecretsManager.getInstance = () => mockSecrets as unknown as SecretsManager;
    
    // Create mock Deno.exit
    const originalExit = Deno.exit;
    // @ts-ignore - Override Deno.exit for testing
    Deno.exit = (code?: number) => {
      // Do nothing in tests
      return undefined as never;
    };

    // Stub Confirm.prompt to avoid interactive blocking (default "no")
    // @ts-ignore - Override for testing
    Confirm.prompt = () => Promise.resolve(false);
  });
  
  afterEach(() => {
    // Restore original getInstance method
    SecretsManager.getInstance = originalGetInstanceMethod;

    // Restore original Confirm.prompt
    // @ts-ignore - Restore
    Confirm.prompt = originalConfirmPrompt;
  });
  
  describe("showBunkerHelp", () => {
    it("should show help information", async () => {
      const output = await captureConsoleOutput(() => showBunkerHelp());
      
      assertStringIncludes(output, "Bunker Command Help");
      assertStringIncludes(output, "list");
      assertStringIncludes(output, "import");
      assertStringIncludes(output, "export");
      assertStringIncludes(output, "connect");
      assertStringIncludes(output, "use");
      assertStringIncludes(output, "remove");
    });
  });
  
  describe("importNbunk", () => {
    it("should import a valid nbunk string", async () => {
      // Create a valid nbunk string for testing
      const testInfo: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      };
      
      const nbunkString = encodeBunkerInfo(testInfo);
      
      // Mock Deno.exit to prevent the function from exiting the test
      const originalExit = Deno.exit;
      let exitCode = -1;
      
      // @ts-ignore - Override Deno.exit for testing
      Deno.exit = (code?: number) => {
        exitCode = code ?? 0;
        return undefined as never;
      };
      
      try {
        await importNbunk(nbunkString);
        
        // Verify the nbunk was stored
        const storedNbunk = mockSecrets.getNbunk(testInfo.pubkey);
        assertExists(storedNbunk);
        assertEquals(storedNbunk, nbunkString);
        assertEquals(exitCode, 0); // Should exit with success
      } finally {
        Deno.exit = originalExit;
      }
    });
    
    it("should handle invalid nbunk string", async () => {
      const invalidNbunk = "invalid-nbunk";
      
      // Mock Deno.exit to prevent the function from exiting the test
      const originalExit = Deno.exit;
      let exitCode = -1;
      
      // @ts-ignore - Override Deno.exit for testing
      Deno.exit = (code?: number) => {
        exitCode = code ?? 0;
        return undefined as never;
      };
      
      try {
        const output = await captureConsoleOutput(() => importNbunk(invalidNbunk));
        
        assertStringIncludes(output, "Failed to import nbunk");
        assertEquals(exitCode, 1); // Should exit with error
      } finally {
        Deno.exit = originalExit;
      }
    });
  });
  
  describe("exportNbunk", () => {
    it("should export a stored nbunk", async () => {
      // Store a test nbunk first
      const testInfo: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      };
      
      const nbunkString = encodeBunkerInfo(testInfo);
      mockSecrets.storeNbunk(testInfo.pubkey, nbunkString);
      
      const output = await captureConsoleOutput(() => exportNbunk(testInfo.pubkey));
      
      assertStringIncludes(output, "Nbunk string for selected bunker:");
      assertStringIncludes(output, nbunkString);
    });
    
    it("should handle non-existent pubkey", async () => {
      const nonExistentPubkey = "0000000000000000000000000000000000000000000000000000000000000000";
      
      const output = await captureConsoleOutput(() => exportNbunk(nonExistentPubkey));
      
      assertStringIncludes(output, "No bunker found with pubkey");
    });
  });
  
  describe("removeBunker", () => {
    it("should remove a stored bunker", async () => {
      // First store a test nbunk
      const testInfo: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      };
      
      const nbunkString = encodeBunkerInfo(testInfo);
      mockSecrets.storeNbunk(testInfo.pubkey, nbunkString);
      
      // Override Confirm.prompt temporarily to simulate confirmation
      const originalConfirm = Confirm.prompt;
      // @ts-ignore - Override for testing
      Confirm.prompt = () => Promise.resolve(true);
      
      try {
        const output = await captureConsoleOutput(() => removeBunker(testInfo.pubkey));
        
        assertStringIncludes(output, "Bunker");
        assertStringIncludes(output, "removed from system storage");
        
        // Verify the nbunk was removed
        const storedNbunk = mockSecrets.getNbunk(testInfo.pubkey);
        assertEquals(storedNbunk, null);
      } finally {
        // @ts-ignore - Restore original override back to stubbed value
        Confirm.prompt = originalConfirm;
      }
    });
  });
}); 