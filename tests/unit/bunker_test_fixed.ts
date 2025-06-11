import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { describe, it } from "std/testing/bdd.ts";
import { restore, spy, type Stub, stub } from "std/testing/mock.ts";

import {
  exportNbunk,
  handleBunkerCommand,
  importNbunk,
  listBunkers,
  removeBunker,
  showBunkerHelp,
  useBunkerForProject,
} from "../../src/commands/bunker.ts";

// Helper to create exit stub
function stubExit(): Stub {
  return stub(
    Deno,
    "exit",
    ((code?: number) => {
      (stubExit as any).lastExitCode = code;
      return undefined as never;
    }) as any,
  );
}

// Helper to capture console output
function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
    getOutput: () => [...logs, ...errors].join("\n"),
  };
}

// Helper to create mock SecretsManager
function createMockSecretsManager(data: Record<string, string> = {}) {
  const storage = new Map(Object.entries(data));

  return {
    storeNbunk: async (pubkey: string, nbunk: string) => {
      storage.set(pubkey, nbunk);
      return true;
    },
    getNbunk: async (pubkey: string) => {
      return storage.get(pubkey) || null;
    },
    getAllPubkeys: async () => {
      return Array.from(storage.keys());
    },
    deleteNbunk: async (pubkey: string) => {
      return storage.delete(pubkey);
    },
    initialize: async () => true,
  };
}

// Helper to create test config
function createTestConfig(overrides: any = {}) {
  return {
    relays: [],
    servers: [],
    publishServerList: false,
    publishRelayList: false,
    ...overrides,
  };
}

describe("Bunker Command - Direct Functions", () => {
  describe("showBunkerHelp", () => {
    it("should display help information", async () => {
      const capture = captureConsole();

      try {
        await showBunkerHelp();
        const output = capture.getOutput();

        // Check for various sections of help
        assertEquals(output.includes("Usage: nsyte bunker"), true);
        assertEquals(output.includes("manage NIP-46 bunker connections"), true);
        assertEquals(output.includes("Available actions:"), true);
        assertEquals(output.includes("Connection examples:"), true);
        assertEquals(output.includes("CI/CD Usage:"), true);
      } finally {
        capture.restore();
      }
    });
  });

  describe("listBunkers", () => {
    it("should handle no bunkers found", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock all required modules before importing
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager();
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock config
      const configModule = await import("../../src/lib/config.ts");
      const readProjectFileStub = stub(configModule, "readProjectFile", () => null);

      try {
        await listBunkers();
        const output = capture.getOutput();

        assertEquals(output.includes("No bunkers found"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        restore();
        capture.restore();
      }
    });

    it("should list bunkers with project config", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Setup test data
      const mockPubkeys = ["pubkey123abc", "pubkey456def"];
      const mockNbunks = new Map([
        ["pubkey123abc", "nbunksec1valid123"],
        ["pubkey456def", "nbunksec1valid456"],
      ]);

      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager(Object.fromEntries(mockNbunks));
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock decodeBunkerInfo
      const nip46Module = await import("../../src/lib/nip46.ts");
      const decodeBunkerInfoStub = stub(nip46Module, "decodeBunkerInfo", (nbunk: string) => ({
        pubkey: nbunk.includes("123") ? "pubkey123abc" : "pubkey456def",
        relays: ["wss://relay1.com", "wss://relay2.com"],
        secretKey: "secret",
      }));

      // Mock config with bunker selected
      const configModule = await import("../../src/lib/config.ts");
      const mockConfig = createTestConfig({ bunkerPubkey: "pubkey123abc" });
      const readProjectFileStub = stub(configModule, "readProjectFile", () => mockConfig);

      try {
        await listBunkers();
        const output = capture.getOutput();

        assertEquals(output.includes("Available bunkers:"), true);
        assertEquals(output.includes("pubkey123abc"), true);
        assertEquals(output.includes("pubkey456def"), true);
        assertEquals(output.includes("Currently used in project"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        restore();
        capture.restore();
      }
    });
  });

  describe("importNbunk", () => {
    it("should import valid nbunk", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager();
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock decodeBunkerInfo
      const nip46Module = await import("../../src/lib/nip46.ts");
      const decodeBunkerInfoStub = stub(nip46Module, "decodeBunkerInfo", () => ({
        pubkey: "testpubkey123",
        relays: ["wss://relay.example"],
        secretKey: "secret",
      }));

      try {
        await importNbunk("nbunksec1valid");
        const output = capture.getOutput();

        assertEquals(output.includes("Successfully imported bunker"), true);
        assertEquals(await mockSecretsManager.getNbunk("testpubkey123"), "nbunksec1valid");
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        restore();
        capture.restore();
      }
    });

    it("should handle invalid nbunk", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock decodeBunkerInfo to throw
      const nip46Module = await import("../../src/lib/nip46.ts");
      const decodeBunkerInfoStub = stub(nip46Module, "decodeBunkerInfo", () => {
        throw new Error("Invalid nbunk format");
      });

      try {
        await importNbunk("invalid");
        const output = capture.getOutput();

        assertEquals(output.includes("Invalid nbunk"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 1);
      } finally {
        restore();
        capture.restore();
      }
    });
  });

  describe("exportNbunk", () => {
    it("should export bunker with provided pubkey", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      const nbunkString = "nbunksec1validexportstring";

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": nbunkString,
      });
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      try {
        await exportNbunk("pubkey123");
        const output = capture.getOutput();

        assertEquals(output.includes(nbunkString), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        restore();
        capture.restore();
      }
    });

    it("should handle missing bunker", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager to return null
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager();
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      try {
        await exportNbunk("nonexistent");
        const output = capture.getOutput();

        assertEquals(output.includes("Bunker not found"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 1);
      } finally {
        restore();
        capture.restore();
      }
    });
  });

  describe("useBunkerForProject", () => {
    it("should configure project with provided pubkey", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": "nbunksec1valid",
      });
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock config functions
      const configModule = await import("../../src/lib/config.ts");
      const mockConfig = createTestConfig();
      const readProjectFileStub = stub(configModule, "readProjectFile", () => mockConfig);
      const writeProjectFileStub = stub(configModule, "writeProjectFile", () => {});

      try {
        await useBunkerForProject("pubkey123");
        const output = capture.getOutput();

        assertEquals(output.includes("Project configured to use bunker"), true);
        assertEquals(writeProjectFileStub.calls.length, 1);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        restore();
        capture.restore();
      }
    });

    it("should handle missing project config", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": "nbunksec1valid",
      });
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock config to return null
      const configModule = await import("../../src/lib/config.ts");
      const readProjectFileStub = stub(configModule, "readProjectFile", () => null);

      try {
        await useBunkerForProject("pubkey123");
        const output = capture.getOutput();

        assertEquals(output.includes("No project configuration found"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 1);
      } finally {
        restore();
        capture.restore();
      }
    });
  });

  describe("removeBunker", () => {
    it("should remove bunker with confirmation", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": "nbunksec1test",
      });
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock confirm to return true
      const confirmModule = await import("@cliffy/prompt/confirm");
      const confirmStub = stub(confirmModule.Confirm, "prompt", () => Promise.resolve(true));

      // Mock config that uses this bunker
      const configModule = await import("../../src/lib/config.ts");
      const mockConfig = createTestConfig({ bunkerPubkey: "pubkey123" });
      const readProjectFileStub = stub(configModule, "readProjectFile", () => mockConfig);
      const writeProjectFileStub = stub(configModule, "writeProjectFile", () => {});

      try {
        await removeBunker("pubkey123");
        const output = capture.getOutput();

        assertEquals(output.includes("removed successfully"), true);
        assertEquals(await mockSecretsManager.getNbunk("pubkey123"), null);
        assertEquals(writeProjectFileStub.calls.length, 1);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        restore();
        capture.restore();
      }
    });

    it("should handle cancellation", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": "nbunksec1test",
      });
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock confirm to return false
      const confirmModule = await import("@cliffy/prompt/confirm");
      const confirmStub = stub(confirmModule.Confirm, "prompt", () => Promise.resolve(false));

      try {
        await removeBunker("pubkey123");
        const output = capture.getOutput();

        assertEquals(output.includes("Removal cancelled"), true);
        assertEquals(await mockSecretsManager.getNbunk("pubkey123"), "nbunksec1test");
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        restore();
        capture.restore();
      }
    });
  });

  describe("handleBunkerCommand", () => {
    it("should show help for -h flag", async () => {
      const originalArgs = Deno.args;
      const capture = captureConsole();
      const exitStub = stubExit();

      try {
        Object.defineProperty(globalThis.Deno, "args", {
          value: ["-h"],
          writable: true,
          configurable: true,
        });

        await handleBunkerCommand();
        const output = capture.getOutput();

        assertEquals(output.includes("Usage: nsyte bunker"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        Object.defineProperty(globalThis.Deno, "args", {
          value: originalArgs,
          writable: true,
          configurable: true,
        });
        restore();
        capture.restore();
      }
    });

    it("should handle unknown subcommand", async () => {
      const originalArgs = Deno.args;
      const capture = captureConsole();
      const exitStub = stubExit();

      try {
        Object.defineProperty(globalThis.Deno, "args", {
          value: ["unknown"],
          writable: true,
          configurable: true,
        });

        await handleBunkerCommand();
        const output = capture.getOutput();

        assertEquals(output.includes("Unknown bunker action"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 1);
      } finally {
        Object.defineProperty(globalThis.Deno, "args", {
          value: originalArgs,
          writable: true,
          configurable: true,
        });
        restore();
        capture.restore();
      }
    });

    it("should handle list subcommand", async () => {
      const originalArgs = Deno.args;
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock keychain
      const keychainModule = await import("../../src/lib/secrets/keychain.ts");
      stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager();
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock config
      const configModule = await import("../../src/lib/config.ts");
      const readProjectFileStub = stub(configModule, "readProjectFile", () => null);

      try {
        Object.defineProperty(globalThis.Deno, "args", {
          value: ["list"],
          writable: true,
          configurable: true,
        });

        await handleBunkerCommand();
        const output = capture.getOutput();

        assertEquals(output.includes("No bunkers found"), true);
        assertEquals(exitStub.calls.length, 1);
      } finally {
        Object.defineProperty(globalThis.Deno, "args", {
          value: originalArgs,
          writable: true,
          configurable: true,
        });
        restore();
        capture.restore();
      }
    });
  });
});
