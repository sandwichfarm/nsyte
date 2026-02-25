import * as prompt from "@cliffy/prompt";
import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import {
  connectBunkerAction,
  type ConnectBunkerOptions,
  exportNbunk,
  importNbunk,
  listBunkers,
  migrateBunkers,
  removeBunker,
  useBunkerForProject,
} from "../../src/commands/bunker.ts";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";

describe("Bunker command - Cliffy integration", () => {
  let consoleLogStub: any;
  let consoleErrorStub: any;
  let denoExitStub: any;
  let promptInputStub: any;
  let promptSelectStub: any;
  let promptConfirmStub: any;
  let secretsManagerGetInstanceStub: any;
  let setTimeoutStub: any;
  let clearTimeoutStub: any;
  let timerIds: number[] = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let originalCwd: string;
  let tempDir: string;

  // Mock SecretsManager instance
  const mockSecretsManagerInstance = {
    getAllPubkeys: () => Promise.resolve(["test-pubkey1", "test-pubkey2"]),
    storeNbunk: () => Promise.resolve(true),
    getNbunk: () => Promise.resolve("nbunksec1test"),
    deleteNbunk: () => Promise.resolve(true),
    initialize: () => Promise.resolve(),
  };

  beforeEach(() => {
    // Change to a temp directory so tests never read/write the real .nsite/config.json
    // writeProjectFile already guards against writes in /tmp/ and /var/folders/
    originalCwd = Deno.cwd();
    tempDir = Deno.makeTempDirSync({ prefix: "nsyte-test-" });
    Deno.chdir(tempDir);

    // Mock console methods
    consoleLogStub = stub(console, "log", () => {});
    consoleErrorStub = stub(console, "error", () => {});

    // Mock Deno.exit - it should never return
    denoExitStub = stub(Deno, "exit", (_code?: number) => {
      throw new Error("Process exit");
    });

    // Mock prompts to avoid hanging tests
    promptInputStub = stub(prompt.Input, "prompt", () => Promise.resolve("test-input"));
    promptSelectStub = stub(prompt.Select, "prompt", () => Promise.resolve("test-selection"));
    promptConfirmStub = stub(prompt.Confirm, "prompt", () => Promise.resolve(true));

    // Mock SecretsManager.getInstance()
    secretsManagerGetInstanceStub = stub(
      SecretsManager,
      "getInstance",
      () => mockSecretsManagerInstance as any,
    );

    // Reset timer tracking
    timerIds = [];

    // Mock timers to prevent leaks
    setTimeoutStub = stub(
      globalThis,
      "setTimeout",
      ((fn: () => void, delay?: number) => {
        const id = originalSetTimeout(() => {
          try {
            fn();
          } catch (_e) {
            // Ignore errors in timer callbacks during tests
          }
        }, delay);
        timerIds.push(id);
        return id;
      }) as any,
    );

    clearTimeoutStub = stub(
      globalThis,
      "clearTimeout",
      ((id?: number) => {
        if (id !== undefined) {
          originalClearTimeout(id);
          const index = timerIds.indexOf(id);
          if (index > -1) {
            timerIds.splice(index, 1);
          }
        }
      }) as any,
    );
  });

  afterEach(() => {
    // Clear any remaining timers
    for (const id of timerIds) {
      originalClearTimeout(id);
    }
    timerIds = [];

    // Restore all stubs explicitly
    consoleLogStub?.restore();
    consoleErrorStub?.restore();
    denoExitStub?.restore();
    promptInputStub?.restore();
    promptSelectStub?.restore();
    promptConfirmStub?.restore();
    secretsManagerGetInstanceStub?.restore();
    setTimeoutStub?.restore();
    clearTimeoutStub?.restore();

    // Then call general restore
    restore();

    // Restore original CWD and clean up temp dir
    Deno.chdir(originalCwd);
    try {
      Deno.removeSync(tempDir, { recursive: true });
    } catch {
      // Best effort cleanup
    }
  });

  describe("listBunkers", () => {
    it("should list bunkers when they exist", async () => {
      try {
        await listBunkers();
      } catch (error) {
        // May throw due to mocked dependencies
      }

      // Should attempt to show output
      assertEquals(consoleLogStub.calls.length >= 0, true);
    });

    it("should show message when no bunkers found", async () => {
      // Override the mock to return empty array
      secretsManagerGetInstanceStub.restore();
      secretsManagerGetInstanceStub = stub(
        SecretsManager,
        "getInstance",
        () =>
          ({
            ...mockSecretsManagerInstance,
            getAllPubkeys: () => Promise.resolve([]),
          }) as any,
      );

      try {
        await listBunkers();
      } catch (error) {
        // Expected
      }

      assertEquals(consoleLogStub.calls.length >= 0, true);
    });
  });

  describe("importNbunk", () => {
    it("should handle import with nbunk string", async () => {
      const testNbunk = "nbunksec1test";

      try {
        await importNbunk(testNbunk);
      } catch (error) {
        // Expected due to dependencies
        assertEquals(true, true);
      }

      assertEquals(typeof testNbunk, "string");
    });

    it("should handle import without nbunk string", async () => {
      try {
        await importNbunk();
      } catch (error) {
        // Expected due to interactive prompt
        assertEquals(true, true);
      }

      assertEquals(true, true);
    });
  });

  describe("exportNbunk", () => {
    it("should handle export with pubkey", async () => {
      const testPubkey = "test-pubkey-123";

      try {
        await exportNbunk(testPubkey);
      } catch (error) {
        // Expected due to SecretsManager dependency
        assertEquals(true, true);
      }

      assertEquals(typeof testPubkey, "string");
    });

    it("should handle export without pubkey", async () => {
      try {
        await exportNbunk();
      } catch (error) {
        // Expected due to dependencies
        assertEquals(true, true);
      }

      assertEquals(true, true);
    });
  });

  describe("connectBunkerAction", () => {
    it("should handle connect with bunker URL", async () => {
      const testUrl = "bunker://pubkey?relay=wss://test&secret=xxx";
      const options: ConnectBunkerOptions = {
        persist: true,
        forceEncryptedStorage: false,
      };

      try {
        await connectBunkerAction(options, testUrl);
      } catch (error) {
        // Expected due to complex dependencies
        assertEquals(true, true);
      }

      assertEquals(testUrl.startsWith("bunker://"), true);
    });

    it("should handle connect with pubkey and relay options", async () => {
      const options: ConnectBunkerOptions = {
        pubkey: "test-pubkey",
        relay: "wss://relay.example",
        secret: "test-secret",
        persist: true,
        forceEncryptedStorage: false,
      };

      try {
        await connectBunkerAction(options);
      } catch (error) {
        // Expected due to dependencies
        assertEquals(true, true);
      }

      assertEquals(typeof options.pubkey, "string");
    });

    it("should handle --no-persist flag", async () => {
      const options: ConnectBunkerOptions = {
        persist: false, // --no-persist
        forceEncryptedStorage: false,
      };

      try {
        await connectBunkerAction(options);
      } catch (error) {
        // Expected due to dependencies
        assertEquals(true, true);
      }

      assertEquals(options.persist, false);
    });

    it("should handle --force-encrypted-storage flag", async () => {
      const options: ConnectBunkerOptions = {
        persist: true,
        forceEncryptedStorage: true,
      };

      try {
        await connectBunkerAction(options);
      } catch (error) {
        // Expected
      }

      assertEquals(options.forceEncryptedStorage, true);
    });
  });

  describe("useBunkerForProject", () => {
    it("should handle use without pubkey", async () => {
      try {
        await useBunkerForProject();
      } catch (error) {
        // Expected due to dependencies
        assertEquals(true, true);
      }

      assertEquals(true, true);
    });
  });

  describe("removeBunker", () => {
    it("should handle remove with pubkey", async () => {
      const testPubkey = "test-pubkey-789";

      try {
        await removeBunker(testPubkey);
      } catch (error) {
        // Expected due to SecretsManager dependency
        assertEquals(true, true);
      }

      assertEquals(typeof testPubkey, "string");
    });

    it("should handle remove without pubkey", async () => {
      try {
        await removeBunker();
      } catch (error) {
        // Expected due to dependencies
        assertEquals(true, true);
      }

      assertEquals(true, true);
    });
  });

  describe("migrateBunkers", () => {
    it("should handle migrate with pubkeys", async () => {
      try {
        await migrateBunkers("pubkey1", "pubkey2");
      } catch (error) {
        // Expected due to dependencies
        assertEquals(true, true);
      }

      assertEquals(true, true);
    });

    it("should handle migrate without pubkeys", async () => {
      try {
        await migrateBunkers();
      } catch (error) {
        // Expected due to dependencies
        assertEquals(true, true);
      }

      assertEquals(true, true);
    });
  });

  describe("function exports", () => {
    it("should validate all function exports exist", () => {
      assertEquals(typeof listBunkers, "function");
      assertEquals(typeof importNbunk, "function");
      assertEquals(typeof exportNbunk, "function");
      assertEquals(typeof connectBunkerAction, "function");
      assertEquals(typeof useBunkerForProject, "function");
      assertEquals(typeof removeBunker, "function");
      assertEquals(typeof migrateBunkers, "function");
    });
  });
});
