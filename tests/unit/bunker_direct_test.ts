import { assertEquals, assertExists } from "std/assert/mod.ts";
import { restore, spy, stub } from "std/testing/mock.ts";
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
  stubExit, 
  createMockSecretsManager, 
  captureConsole,
  createTestConfig,
} from "../mocks/index.ts";

Deno.test("Bunker Command - showBunkerHelp", async (t) => {
  await t.step("should display help information", async () => {
    const consoleLogSpy = spy(console, "log");

    try {
      await showBunkerHelp();

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));

      // Check for various sections of help
      const hasUsage = logCalls.some((log) => log.includes("Usage: nsyte bunker"));
      const hasDescription = logCalls.some((log) =>
        log.includes("manage NIP-46 bunker connections")
      );
      const hasActions = logCalls.some((log) => log.includes("Available actions:"));
      const hasExamples = logCalls.some((log) => log.includes("Connection examples:"));
      const hasCICD = logCalls.some((log) => log.includes("CI/CD Usage:"));

      assertEquals(hasUsage, true);
      assertEquals(hasDescription, true);
      assertEquals(hasActions, true);
      assertEquals(hasExamples, true);
      assertEquals(hasCICD, true);
    } finally {
      restore();
    }
  });
});

Deno.test("Bunker Command - listBunkers", async (t) => {
  await t.step("should handle no bunkers found", async () => {
    const consoleLogSpy = spy(console, "log");
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

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasNoBunkersMessage = logCalls.some((log) =>
        log.includes("No bunkers found in system storage")
      );

      assertEquals(hasNoBunkersMessage, true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    } finally {
      restore();
    }
  });

  await t.step("should list bunkers with project config", async () => {
    const consoleLogSpy = spy(console, "log");

    // Mock SecretsManager
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

    // Mock readProjectFile
    const configModule = await import("../../src/lib/config.ts");
    const readProjectFileStub = stub(configModule, "readProjectFile", () => ({
      bunkerPubkey: "pubkey123abc",
      relays: [],
      servers: [],
    }));

    try {
      await listBunkers();

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));

      const hasStoredBunkers = logCalls.some((log) => log.includes("Stored Bunkers:"));
      const hasPubkey1 = logCalls.some((log) => log.includes("pubkey123abc"));
      const hasPubkey2 = logCalls.some((log) => log.includes("pubkey456def"));
      const hasRelays = logCalls.some((log) => log.includes("wss://relay1.com"));
      const hasCurrentProject = logCalls.some((log) =>
        log.includes("Current project uses bunker:")
      );

      assertEquals(hasStoredBunkers, true);
      assertEquals(hasPubkey1, true);
      assertEquals(hasPubkey2, true);
      assertEquals(hasRelays, true);
      assertEquals(hasCurrentProject, true);
    } finally {
      restore();
    }
  });
});

Deno.test("Bunker Command - useBunkerForProject", async (t) => {
  await t.step("should configure project with provided pubkey", async () => {
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    // Mock SecretsManager
    const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
    const mockInstance = {
      getNbunk: (pubkey: string) => Promise.resolve("nbunksec1valid"),
    };
    const getInstanceStub = stub(
      SecretsManagerModule.SecretsManager,
      "getInstance",
      () => mockInstance,
    );

    // Mock config functions
    const configModule = await import("../../src/lib/config.ts");
    const mockConfig = { relays: [], servers: [] };
    const readProjectFileStub = stub(configModule, "readProjectFile", () => mockConfig);
    const writeProjectFileStub = stub(configModule, "writeProjectFile", (config) => {
      mockConfig.bunkerPubkey = config.bunkerPubkey;
    });

    try {
      await useBunkerForProject("pubkey123");

      assertEquals(mockConfig.bunkerPubkey, "pubkey123");

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasSuccessMessage = logCalls.some((log) =>
        log.includes("Project configured to use bunker") && log.includes("pubkey123")
      );

      assertEquals(hasSuccessMessage, true);
      assertEquals(writeProjectFileStub.calls.length, 1);
    } finally {
      restore();
    }
  });

  await t.step("should handle missing project config", async () => {
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    // Mock SecretsManager
    const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
    const mockInstance = {
      getNbunk: (pubkey: string) => Promise.resolve("nbunksec1valid"),
    };
    const getInstanceStub = stub(
      SecretsManagerModule.SecretsManager,
      "getInstance",
      () => mockInstance,
    );

    // Mock config to return null
    const configModule = await import("../../src/lib/config.ts");
    const readProjectFileStub = stub(configModule, "readProjectFile", () => null);

    try {
      await useBunkerForProject("pubkey123");

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasErrorMessage = logCalls.some((log) =>
        log.includes("No project configuration found") && log.includes("nsyte init")
      );

      assertEquals(hasErrorMessage, true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    } finally {
      restore();
    }
  });
});

Deno.test("Bunker Command - exportNbunk", async (t) => {
  await t.step("should export bunker with provided pubkey", async () => {
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    const nbunkString = "nbunksec1validexportstring";

    // Mock SecretsManager
    const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
    const mockInstance = {
      getNbunk: (pubkey: string) => Promise.resolve(nbunkString),
    };
    const getInstanceStub = stub(
      SecretsManagerModule.SecretsManager,
      "getInstance",
      () => mockInstance,
    );

    try {
      await exportNbunk("pubkey123");

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));

      const hasNbunkString = logCalls.some((log) => log.includes(nbunkString));
      const hasSecurityWarning = logCalls.some((log) => log.includes("Store this securely"));

      assertEquals(hasNbunkString, true);
      assertEquals(hasSecurityWarning, true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    } finally {
      restore();
    }
  });

  await t.step("should handle missing bunker", async () => {
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    // Mock SecretsManager to return null
    const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
    const mockInstance = {
      getNbunk: (pubkey: string) => Promise.resolve(null),
    };
    const getInstanceStub = stub(
      SecretsManagerModule.SecretsManager,
      "getInstance",
      () => mockInstance,
    );

    try {
      await exportNbunk("pubkey123");

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasErrorMessage = logCalls.some((log) => log.includes("No bunker found with pubkey"));

      assertEquals(hasErrorMessage, true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    } finally {
      restore();
    }
  });
});

Deno.test("Bunker Command - handleBunkerCommand", async (t) => {
  await t.step("should show help for -h flag", async () => {
    const originalArgs = Deno.args;
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    try {
      // Mock Deno.args
      Object.defineProperty(Deno, "args", {
        value: ["bunker", "-h"],
        configurable: true,
      });

      await handleBunkerCommand();

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasHelpText = logCalls.some((log) => log.includes("Bunker Command Help"));

      assertEquals(hasHelpText, true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    } finally {
      Object.defineProperty(Deno, "args", {
        value: originalArgs,
        configurable: true,
      });
      restore();
    }
  });

  await t.step("should handle unknown subcommand", async () => {
    const originalArgs = Deno.args;
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    try {
      // Mock Deno.args
      Object.defineProperty(Deno, "args", {
        value: ["bunker", "unknown"],
        configurable: true,
      });

      await handleBunkerCommand();

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasErrorMessage = logCalls.some((log) =>
        log.includes("Unknown bunker subcommand: unknown")
      );
      const hasHelpText = logCalls.some((log) => log.includes("Bunker Command Help"));

      assertEquals(hasErrorMessage, true);
      assertEquals(hasHelpText, true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1);
    } finally {
      Object.defineProperty(Deno, "args", {
        value: originalArgs,
        configurable: true,
      });
      restore();
    }
  });

  await t.step("should handle list subcommand", async () => {
    const originalArgs = Deno.args;
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    // Mock SecretsManager
    const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
    const mockInstance = {
      getAllPubkeys: () => Promise.resolve([]),
    };
    const getInstanceStub = stub(
      SecretsManagerModule.SecretsManager,
      "getInstance",
      () => mockInstance,
    );

    // Mock readProjectFile
    const configModule = await import("../../src/lib/config.ts");
    const readProjectFileStub = stub(configModule, "readProjectFile", () => null);

    try {
      Object.defineProperty(Deno, "args", {
        value: ["bunker", "list"],
        configurable: true,
      });

      await handleBunkerCommand();

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasNoBunkersMessage = logCalls.some((log) =>
        log.includes("No bunkers found in system storage")
      );

      assertEquals(hasNoBunkersMessage, true);
      assertEquals(exitStub.calls.length, 2); // Once in listBunkers, once in handleBunkerCommand
    } finally {
      Object.defineProperty(Deno, "args", {
        value: originalArgs,
        configurable: true,
      });
      restore();
    }
  });
});

Deno.test("Bunker Command - removeBunker", async (t) => {
  await t.step("should remove bunker with confirmation", async () => {
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    // Mock SecretsManager
    const SecretsManagerModule = await import("../../src/lib/secrets/mod.ts");
    const mockInstance = {
      deleteNbunk: (pubkey: string) => Promise.resolve(true),
    };
    const getInstanceStub = stub(
      SecretsManagerModule.SecretsManager,
      "getInstance",
      () => mockInstance,
    );

    // Mock Confirm prompt
    const promptModule = await import("@cliffy/prompt");
    const confirmStub = stub(promptModule.Confirm, "prompt", () => Promise.resolve(true));

    // Mock readProjectFile
    const configModule = await import("../../src/lib/config.ts");
    const readProjectFileStub = stub(configModule, "readProjectFile", () => ({
      bunkerPubkey: "otherpubkey",
      relays: [],
      servers: [],
    }));

    try {
      await removeBunker("pubkey123");

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasSuccessMessage = logCalls.some((log) => log.includes("removed from system storage"));

      assertEquals(hasSuccessMessage, true);
      assertEquals(mockInstance.deleteNbunk.calls.length, 1);
      assertEquals(mockInstance.deleteNbunk.calls[0].args[0], "pubkey123");
    } finally {
      restore();
    }
  });

  await t.step("should handle cancellation", async () => {
    const consoleLogSpy = spy(console, "log");
    const exitStub = stubExit();

    // Mock Confirm prompt to return false
    const promptModule = await import("@cliffy/prompt");
    const confirmStub = stub(promptModule.Confirm, "prompt", () => Promise.resolve(false));

    try {
      await removeBunker("pubkey123");

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasCancelMessage = logCalls.some((log) => log.includes("Operation cancelled"));

      assertEquals(hasCancelMessage, true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
    } finally {
      restore();
    }
  });
});
