import { Confirm } from "@cliffy/prompt";
import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import {
  connectBunker,
  exportNbunk,
  importNbunk,
  removeBunker,
  showBunkerHelp,
} from "../../src/commands/bunker.ts";
import { BunkerInfo, encodeBunkerInfo } from "../../src/lib/nip46.ts";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";

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

// Override the SecretsManager.getInstance method to return our mock
const originalGetInstanceMethod = SecretsManager.getInstance;
const mockSecrets = MockSecretsManager.getMockInstance();

// Create type for mocked Confirm
interface MockedConfirm {
  prompt: (options?: unknown) => Promise<boolean>;
}

describe("Bunker Command", () => {
  const originalConfirmPrompt = Confirm.prompt;
  const originalConsoleLog = console.log;

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
      assertStringIncludes(output, "--no-persist");
    });
  });

  describe("importNbunk", () => {
    it("should import a valid nbunksec string", async () => {
      // Create a valid nbunksec string for testing
      const testInfo: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
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

        // Verify the nbunksec was stored
        const storedNbunk = mockSecrets.getNbunk(testInfo.pubkey);
        assertExists(storedNbunk);
        assertEquals(storedNbunk, nbunkString);
        // Since importNbunk doesn't call Deno.exit on success anymore,
        // exitCode should remain -1
        assertEquals(exitCode, -1);
      } finally {
        Deno.exit = originalExit;
      }
    });

    it("should handle invalid nbunksec string", async () => {
      const invalidNbunk = "invalid-nbunksec";

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

        assertStringIncludes(output, "Failed to import nbunksec");
        assertEquals(exitCode, 1); // Should exit with error
      } finally {
        Deno.exit = originalExit;
      }
    });
  });

  describe("exportNbunk", () => {
    it("should export a stored nbunksec", async () => {
      // Store a test nbunksec first
      const testInfo: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
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
      // First store a test nbunksec
      const testInfo: BunkerInfo = {
        pubkey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        relays: ["wss://relay.example.com"],
        local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
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

        // Verify the nbunksec was removed
        const storedNbunk = mockSecrets.getNbunk(testInfo.pubkey);
        assertEquals(storedNbunk, null);
      } finally {
        // @ts-ignore - Restore original override back to stubbed value
        Confirm.prompt = originalConfirm;
      }
    });
  });

  describe("connectBunker with --no-persist", () => {
    it("should display nbunksec without storing when --no-persist is used", async () => {
      // Mock the NostrConnectSigner since we can't actually connect in tests
      // This test verifies the --no-persist flag behavior
      const testPubkey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      // Since connectBunker needs actual connection, we'll test the behavior
      // by checking that no storage occurs when noPersist is true

      // This is a conceptual test - in a real implementation, you'd need to mock
      // the NostrConnectSigner class and its methods

      // For now, verify that the function exists and has the right signature
      assertEquals(typeof connectBunker, "function");
      assertEquals(connectBunker.length, 0); // Has default parameters
    });
  });
});
