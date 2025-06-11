import {
  assertEquals,
  assertExists,
  describe,
  it,
  spy,
  stub,
  restore,
  stubExit,
  createMockSecretsManager,
  createTestConfig,
  captureConsole,
} from "../setup.ts";

import {
  exportNbunk,
  handleBunkerCommand,
  importNbunk,
  listBunkers,
  removeBunker,
  showBunkerHelp,
  useBunkerForProject,
} from "../../src/commands/bunker.ts";

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

      // Mock SecretsManager to return empty list
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager();
      const getInstanceStub = stub(
        SecretsManagerModule.SecretsManager,
        "getInstance",
        () => mockSecretsManager as any,
      );

      // Mock readProjectFile to return null
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

  describe("useBunkerForProject", () => {
    it("should configure project with provided pubkey", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": "nbunksec1valid"
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

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": "nbunksec1valid"
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

  describe("exportNbunk", () => {
    it("should export bunker with provided pubkey", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      const nbunkString = "nbunksec1validexportstring";

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": nbunkString
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

  describe("removeBunker", () => {
    it("should remove bunker with confirmation", async () => {
      const capture = captureConsole();
      const exitStub = stubExit();

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": "nbunksec1test"
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

      // Mock SecretsManager
      const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
      const mockSecretsManager = createMockSecretsManager({
        "pubkey123": "nbunksec1test"
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
});