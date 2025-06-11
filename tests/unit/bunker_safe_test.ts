// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { restore, type Stub, stub } from "std/testing/mock.ts";

import {
  exportNbunk,
  handleBunkerCommand,
  importNbunk,
  listBunkers,
  removeBunker,
  showBunkerHelp,
  useBunkerForProject,
} from "../../src/commands/bunker.ts";

import {
  createMockSecretsManager,
  type MockSecretsManagerData,
  mockSecretsManagerModule,
} from "../mocks/secrets-manager.ts";

// Test state
let exitStub: Stub;
let consoleOutput: { logs: string[]; errors: string[] };
let originalLog: typeof console.log;
let originalError: typeof console.error;
let mockSecretsManager: ReturnType<typeof createMockSecretsManager>;
let secretsManagerStub: Stub;

describe("Bunker Command - Safe Tests", () => {
  beforeEach(async () => {
    // Create fresh mock
    mockSecretsManager = createMockSecretsManager();

    // Mock the entire SecretsManager module
    const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
    secretsManagerStub = stub(
      SecretsManagerModule.SecretsManager,
      "getInstance",
      () => mockSecretsManager as any,
    );

    // Setup exit stub
    exitStub = stub(
      Deno,
      "exit",
      ((code?: number) => {
        (exitStub as any).lastExitCode = code;
        return undefined as never;
      }) as any,
    );

    // Setup console capture
    consoleOutput = { logs: [], errors: [] };
    originalLog = console.log;
    originalError = console.error;

    console.log = (...args: unknown[]) => {
      consoleOutput.logs.push(args.map(String).join(" "));
    };

    console.error = (...args: unknown[]) => {
      consoleOutput.errors.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    // Restore all stubs
    restore();

    // Restore console
    console.log = originalLog;
    console.error = originalError;
  });

  describe("showBunkerHelp", () => {
    it("should display help information", async () => {
      await showBunkerHelp();
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("Usage: nsyte bunker"), true);
      assertEquals(output.includes("Available actions:"), true);
      assertEquals(output.includes("Connection examples:"), true);
      assertEquals(output.includes("CI/CD Usage:"), true);
    });
  });

  describe("listBunkers", () => {
    it("should handle no bunkers found", async () => {
      // Mock config to return null
      const configModule = await import("../../src/lib/config.ts");
      stub(configModule, "readProjectFile", () => null);

      await listBunkers();
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("No bunkers found"), true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    });

    it("should list bunkers with data", async () => {
      // Setup test data in mock
      mockSecretsManager.setStorageContents({
        "pubkey123": "nbunksec1valid123",
        "pubkey456": "nbunksec1valid456",
      });

      // Mock decodeBunkerInfo
      const nip46Module = await import("../../src/lib/nip46.ts");
      stub(nip46Module, "decodeBunkerInfo", (nbunk: string) => ({
        pubkey: nbunk.includes("123") ? "pubkey123" : "pubkey456",
        relays: ["wss://relay.example"],
        secretKey: "secret",
      }));

      // Mock config with bunker selected
      const configModule = await import("../../src/lib/config.ts");
      stub(configModule, "readProjectFile", () => ({
        bunkerPubkey: "pubkey123",
        relays: [],
        servers: [],
        publishServerList: false,
        publishRelayList: false,
      }));

      await listBunkers();
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("Available bunkers:"), true);
      assertEquals(output.includes("pubkey123"), true);
      assertEquals(output.includes("Currently used in project"), true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    });
  });

  describe("importNbunk", () => {
    it("should import valid nbunk", async () => {
      // Mock decodeBunkerInfo
      const nip46Module = await import("../../src/lib/nip46.ts");
      stub(nip46Module, "decodeBunkerInfo", () => ({
        pubkey: "testpubkey",
        relays: ["wss://relay.example"],
        secretKey: "secret",
      }));

      await importNbunk("nbunksec1valid");
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("Successfully imported bunker"), true);
      assertEquals(await mockSecretsManager.getNbunk("testpubkey"), "nbunksec1valid");
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    });

    it("should handle invalid nbunk", async () => {
      // Mock decodeBunkerInfo to throw
      const nip46Module = await import("../../src/lib/nip46.ts");
      stub(nip46Module, "decodeBunkerInfo", () => {
        throw new Error("Invalid nbunk format");
      });

      await importNbunk("invalid");
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("Invalid nbunk"), true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1);
    });
  });

  describe("exportNbunk", () => {
    it("should export existing bunker", async () => {
      const nbunkString = "nbunksec1test";
      mockSecretsManager.setStorageContents({
        "pubkey123": nbunkString,
      });

      await exportNbunk("pubkey123");
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes(nbunkString), true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    });

    it("should handle missing bunker", async () => {
      await exportNbunk("nonexistent");
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("Bunker not found"), true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1);
    });
  });

  describe("useBunkerForProject", () => {
    it("should configure project with bunker", async () => {
      mockSecretsManager.setStorageContents({
        "pubkey123": "nbunksec1test",
      });

      const configModule = await import("../../src/lib/config.ts");
      let savedConfig: any = null;
      stub(configModule, "readProjectFile", () => ({
        relays: [],
        servers: [],
        publishServerList: false,
        publishRelayList: false,
      }));
      stub(configModule, "writeProjectFile", (config: any) => {
        savedConfig = config;
      });

      await useBunkerForProject("pubkey123");
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("Project configured to use bunker"), true);
      assertEquals(savedConfig?.bunkerPubkey, "pubkey123");
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    });

    it("should handle missing project config", async () => {
      mockSecretsManager.setStorageContents({
        "pubkey123": "nbunksec1test",
      });

      const configModule = await import("../../src/lib/config.ts");
      stub(configModule, "readProjectFile", () => null);

      await useBunkerForProject("pubkey123");
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("No project configuration found"), true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1);
    });
  });

  describe("removeBunker", () => {
    it("should remove bunker with confirmation", async () => {
      mockSecretsManager.setStorageContents({
        "pubkey123": "nbunksec1test",
      });

      // Mock confirm to return true
      const confirmModule = await import("@cliffy/prompt/confirm");
      stub(confirmModule.Confirm, "prompt", () => Promise.resolve(true));

      // Mock config that uses this bunker
      const configModule = await import("../../src/lib/config.ts");
      let savedConfig: any = null;
      stub(configModule, "readProjectFile", () => ({
        bunkerPubkey: "pubkey123",
        relays: [],
        servers: [],
        publishServerList: false,
        publishRelayList: false,
      }));
      stub(configModule, "writeProjectFile", (config: any) => {
        savedConfig = config;
      });

      await removeBunker("pubkey123");
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("removed successfully"), true);
      assertEquals(await mockSecretsManager.getNbunk("pubkey123"), null);
      assertEquals(savedConfig?.bunkerPubkey, undefined);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    });

    it("should handle cancellation", async () => {
      mockSecretsManager.setStorageContents({
        "pubkey123": "nbunksec1test",
      });

      // Mock confirm to return false
      const confirmModule = await import("@cliffy/prompt/confirm");
      stub(confirmModule.Confirm, "prompt", () => Promise.resolve(false));

      await removeBunker("pubkey123");
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("Removal cancelled"), true);
      assertEquals(await mockSecretsManager.getNbunk("pubkey123"), "nbunksec1test");
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    });
  });

  describe("handleBunkerCommand", () => {
    it("should show help for -h flag", async () => {
      const originalArgs = Deno.args;
      try {
        Object.defineProperty(globalThis.Deno, "args", {
          value: ["-h"],
          writable: true,
          configurable: true,
        });

        await handleBunkerCommand();
        const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

        assertEquals(output.includes("Usage: nsyte bunker"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 0);
      } finally {
        Object.defineProperty(globalThis.Deno, "args", {
          value: originalArgs,
          writable: true,
          configurable: true,
        });
      }
    });

    it("should handle unknown subcommand", async () => {
      const originalArgs = Deno.args;
      try {
        Object.defineProperty(globalThis.Deno, "args", {
          value: ["unknown"],
          writable: true,
          configurable: true,
        });

        await handleBunkerCommand();
        const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

        assertEquals(output.includes("Unknown bunker action"), true);
        assertEquals(exitStub.calls.length, 1);
        assertEquals(exitStub.calls[0].args[0], 1);
      } finally {
        Object.defineProperty(globalThis.Deno, "args", {
          value: originalArgs,
          writable: true,
          configurable: true,
        });
      }
    });
  });
});
