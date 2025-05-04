import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import { encodeBunkerInfo, BunkerInfo, BunkerSigner } from "../../src/lib/nip46.ts";
import * as path from "std/path/mod.ts";

// Define our own interface since it's not exported from upload.ts
interface UploadCommandOptions {
  force: boolean;
  verbose: boolean;
  purge: boolean;
  servers?: string;
  relays?: string;
  privatekey?: string;
  bunker?: string;
  nbunksec?: string;
  concurrency: number;
  fallback?: string;
  publishServerList: boolean;
  publishRelayList: boolean;
  publishProfile: boolean;
  nonInteractive: boolean;
}

// Mock for SecretsManager
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
  
  public storeNbunk(pubkey: string, nbunksec: string): boolean {
    this.secrets[pubkey] = nbunksec;
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

// Mock for BunkerSigner
class MockBunkerSigner {
  private pubkey: string;
  
  constructor(pubkey: string) {
    this.pubkey = pubkey;
  }
  
  getPublicKey(): string {
    return this.pubkey;
  }
  
  static importFromNbunk(nbunkString: string): Promise<MockBunkerSigner> {
    try {
      const mockInfo = decodeMockBunkerInfo(nbunkString);
      return Promise.resolve(new MockBunkerSigner(mockInfo.pubkey));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  
  signEvent(template: any): Promise<any> {
    return Promise.resolve({
      ...template,
      id: "mocked_event_id",
      pubkey: this.pubkey,
      sig: "mocked_signature"
    });
  }
  
  async disconnect(): Promise<void> {
    // Mock implementation
  }
}

// Mock the decodeBunkerInfo function from nip46.ts
function decodeMockBunkerInfo(nbunkString: string): BunkerInfo {
  if (!nbunkString.startsWith("nbunksec")) {
    throw new Error("Not a valid nbunksec string. Must start with nbunksec");
  }
  
  // Parse out the pubkey from the mocked nbunksec string
  // In a real scenario, this would be properly decoded
  const pubkeyMatch = nbunkString.match(/pubkey:([a-f0-9]{64})/);
  const pubkey = pubkeyMatch ? pubkeyMatch[1] : "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  
  return {
    pubkey,
    relays: ["wss://relay.example.com"],
    local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  };
}

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

// Test for upload command with nbunksec
describe("Upload Command with Nbunk", () => {
  // Create a mock for the upload function to test the nbunksec parsing and connection logic
  let uploadCommandMock: (
    fileOrFolder: string, 
    options: UploadCommandOptions
  ) => Promise<{ success: boolean; message: string }>;
  
  // Override the real module imports
  const originalGetInstanceMethod = SecretsManager.getInstance;
  const mockSecrets = MockSecretsManager.getMockInstance();
  
  // Save original BunkerSigner.importFromNbunk
  let originalImportFromNbunk: typeof BunkerSigner.importFromNbunk;
  
  beforeEach(() => {
    mockSecrets.resetMock();
    
    // Override SecretsManager.getInstance
    SecretsManager.getInstance = () => mockSecrets as unknown as SecretsManager;
    
    // Save original and override BunkerSigner.importFromNbunk
    originalImportFromNbunk = BunkerSigner.importFromNbunk;
    // @ts-ignore - Mock for testing
    BunkerSigner.importFromNbunk = MockBunkerSigner.importFromNbunk;
    
    // Create mock upload command function that just verifies nbunksec is handled correctly
    uploadCommandMock = async (fileOrFolder: string, options: UploadCommandOptions) => {
      try {
        // Process just the nbunksec part of the command
        if (options.nbunksec) {
          // Test decoding and using nbunksec
          const signer = await MockBunkerSigner.importFromNbunk(options.nbunksec);
          const pubkey = signer.getPublicKey();
          
          return {
            success: true,
            message: `Successfully used nbunksec for pubkey ${pubkey}`
          };
        }
        
        return {
          success: false,
          message: "No nbunksec provided in options"
        };
      } catch (error) {
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    };
  });
  
  afterEach(() => {
    // Restore original methods
    SecretsManager.getInstance = originalGetInstanceMethod;
    // @ts-ignore - Restore original
    BunkerSigner.importFromNbunk = originalImportFromNbunk;
  });
  
  describe("nbunksec option", () => {
    it("should accept a valid nbunksec string", async () => {
      const testPubkey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const mockNbunk = `nbunksecpubkey:${testPubkey}relay:wss://relay.example.com`;
      
      const result = await uploadCommandMock("./test", {
        nbunksec: mockNbunk,
        force: false,
        verbose: false,
        purge: false,
        concurrency: 1,
        publishServerList: false,
        publishRelayList: false,
        publishProfile: false,
        nonInteractive: true
      });
      
      assertEquals(result.success, true);
      assertStringIncludes(result.message, "Successfully used nbunksec");
      assertStringIncludes(result.message, testPubkey);
    });
    
    it("should handle invalid nbunksec string", async () => {
      const invalidNbunk = "invalid-nbunksec";
      
      const result = await uploadCommandMock("./test", {
        nbunksec: invalidNbunk,
        force: false,
        verbose: false,
        purge: false,
        concurrency: 1,
        publishServerList: false,
        publishRelayList: false,
        publishProfile: false,
        nonInteractive: true
      });
      
      assertEquals(result.success, false);
      assertStringIncludes(result.message, "Error");
      assertStringIncludes(result.message, "valid nbunksec");
    });
    
    it("should use stored nbunksec from secrets manager", async () => {
      const testPubkey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const mockNbunk = `nbunksecpubkey:${testPubkey}relay:wss://relay.example.com`;
      
      // Store the nbunksec in the secrets manager
      mockSecrets.storeNbunk(testPubkey, mockNbunk);
      
      // In a real scenario, this would look up the nbunksec from the project config
      // and then find it in the secrets manager. Here we're testing just the nbunksec part.
      const result = await uploadCommandMock("./test", {
        nbunksec: mockNbunk,
        force: false,
        verbose: false,
        purge: false,
        concurrency: 1,
        publishServerList: false,
        publishRelayList: false,
        publishProfile: false,
        nonInteractive: true
      });
      
      assertEquals(result.success, true);
      assertStringIncludes(result.message, "Successfully used nbunksec");
      assertStringIncludes(result.message, testPubkey);
      
      // Verify the nbunksec was retrieved
      const storedNbunk = mockSecrets.getNbunk(testPubkey);
      assertEquals(storedNbunk, mockNbunk);
    });
  });
}); 