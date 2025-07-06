// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { restore, type Stub, stub } from "std/testing/mock.ts";

import { registerDownloadCommand } from "../../src/commands/download.ts";
import { Command } from "@cliffy/command";

// Test state
let consoleOutput: { logs: string[]; errors: string[] };
let originalLog: typeof console.log;
let originalError: typeof console.error;
let exitStub: Stub;

describe("Download Command - Comprehensive Tests", () => {
  beforeEach(() => {
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

    // Setup exit stub
    exitStub = stub(
      Deno,
      "exit",
      ((code?: number) => {
        (exitStub as any).lastExitCode = code;
        return undefined as never;
      }) as any,
    );
  });

  afterEach(() => {
    // Restore all stubs
    restore();

    // Restore console
    console.log = originalLog;
    console.error = originalError;
  });

  describe("downloadCommand function", () => {
    it("should handle basic download workflow", async () => {
      // Mock all dependencies
      const resolverUtilsModule = await import("../../src/lib/resolver-utils.ts");
      const nostrModule = await import("../../src/lib/nostr.ts");
      const configModule = await import("../../src/lib/config.ts");
      const displayModeModule = await import("../../src/lib/display-mode.ts");
      const fsModule = await import("@std/fs/ensure-dir");

      // Mock resolvePubkey to return a test pubkey
      stub(
        resolverUtilsModule,
        "resolvePubkey",
        () => Promise.resolve("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"),
      );

      // Mock resolveRelays and resolveServers
      stub(resolverUtilsModule, "resolveRelays", () => ["wss://relay1.com", "wss://relay2.com"]);
      stub(
        resolverUtilsModule,
        "resolveServers",
        () => ["https://server1.com", "https://server2.com"],
      );

      // Mock config
      stub(configModule, "readProjectFile", () => null);

      // Mock display manager
      const mockDisplayManager = {
        configureFromOptions: () => {},
      };
      stub(displayModeModule, "getDisplayManager", () => mockDisplayManager as any);

      // Mock ensureDir
      stub(fsModule, "ensureDir", () => Promise.resolve());

      // Mock listRemoteFiles to return empty array (no files found path)
      stub(nostrModule, "listRemoteFiles", () => Promise.resolve([]));

      // Get the internal downloadCommand function by importing and calling registerDownloadCommand
      const program = new Command();
      registerDownloadCommand(program);

      // Find the registered command
      const commands = program.getCommands();
      const downloadCommand = commands.find((cmd) => cmd.getName() === "download");
      assertExists(downloadCommand);

      // Execute the command action with test options
      try {
        await downloadCommand.parse(["download", "--output", "./test-downloads"]);
      } catch {
        // Expected to fail in test environment, but we can check console output
      }

      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");
      assertEquals(output.includes("Downloading files for: 12345678..."), true);
      assertEquals(output.includes("No files found for this public key"), true);
    });

    it("should handle files found scenario", async () => {
      // Mock all dependencies for files found path
      const resolverUtilsModule = await import("../../src/lib/resolver-utils.ts");
      const nostrModule = await import("../../src/lib/nostr.ts");
      const configModule = await import("../../src/lib/config.ts");
      const displayModeModule = await import("../../src/lib/display-mode.ts");
      const fsModule = await import("@std/fs/ensure-dir");

      // Mock resolvePubkey
      stub(
        resolverUtilsModule,
        "resolvePubkey",
        () => Promise.resolve("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"),
      );

      // Mock resolveRelays and resolveServers
      stub(resolverUtilsModule, "resolveRelays", () => ["wss://relay1.com"]);
      stub(resolverUtilsModule, "resolveServers", () => ["https://server1.com"]);

      // Mock config
      stub(configModule, "readProjectFile", () => null);

      // Mock display manager
      const mockDisplayManager = {
        configureFromOptions: () => {},
      };
      stub(displayModeModule, "getDisplayManager", () => mockDisplayManager as any);

      // Mock ensureDir
      stub(fsModule, "ensureDir", () => Promise.resolve());

      // Mock listRemoteFiles to return some files
      const mockFiles = [
        {
          hash: "abc123",
          name: "test1.txt",
          size: 100,
          url: "https://server1.com/abc123",
          eventId: "event1",
          created: Date.now(),
        },
        {
          hash: "def456",
          name: "test2.txt",
          size: 200,
          url: "https://server1.com/def456",
          eventId: "event2",
          created: Date.now(),
        },
      ];
      stub(nostrModule, "listRemoteFiles", () => Promise.resolve(mockFiles));

      // Mock the ProgressRenderer
      const progressModule = await import("../../src/ui/progress.ts");
      const mockProgressRenderer = {
        start: () => {},
        updateProgress: () => {},
        complete: () => {},
      };
      stub(progressModule, "ProgressRenderer", () => mockProgressRenderer as any);

      // Mock fetch to simulate downloads
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: string | Request | URL) => {
        if (String(input).includes("abc123")) {
          return new Response("test content 1", {
            status: 200,
            headers: { "content-length": "100" },
          });
        }
        if (String(input).includes("def456")) {
          return new Response("test content 2", {
            status: 200,
            headers: { "content-length": "200" },
          });
        }
        return new Response("Not found", { status: 404 });
      };

      // Mock Deno.writeFile
      const originalWriteFile = Deno.writeFile;
      Deno.writeFile = async (
        path: string | URL,
        data: Uint8Array | ReadableStream<Uint8Array>,
      ) => {
        // Just simulate successful write
        return Promise.resolve();
      };

      try {
        const program = new Command();
        registerDownloadCommand(program);

        const commands = program.getCommands();
        const downloadCommand = commands.find((cmd) => cmd.getName() === "download");
        assertExists(downloadCommand);

        // This will likely fail due to the complex download logic, but we can test parts
        try {
          await downloadCommand.parse(["download", "--output", "./test-downloads"]);
        } catch {
          // Expected in test environment
        }

        const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");
        assertEquals(output.includes("Found 2 files to download"), true);
      } finally {
        // Restore global functions
        globalThis.fetch = originalFetch;
        Deno.writeFile = originalWriteFile;
      }
    });
  });

  describe("error handling", () => {
    it("should handle resolver errors gracefully", async () => {
      const resolverUtilsModule = await import("../../src/lib/resolver-utils.ts");

      // Mock resolvePubkey to throw an error
      stub(resolverUtilsModule, "resolvePubkey", () => {
        throw new Error("Failed to resolve pubkey");
      });

      const program = new Command();
      registerDownloadCommand(program);

      const commands = program.getCommands();
      const downloadCommand = commands.find((cmd) => cmd.getName() === "download");
      assertExists(downloadCommand);

      // Should handle the error gracefully via handleError wrapper
      try {
        await downloadCommand.parse(["download"]);
      } catch {
        // Expected
      }

      // Should have called exit due to error
      assertEquals(exitStub.calls.length >= 1, true);
    });
  });

  describe("integration with dependencies", () => {
    it("should call all required modules", async () => {
      // Test that the download command properly integrates with all its dependencies
      const resolverUtilsModule = await import("../../src/lib/resolver-utils.ts");
      const configModule = await import("../../src/lib/config.ts");
      const displayModeModule = await import("../../src/lib/display-mode.ts");

      // Create spies to verify calls
      const resolvePubkeySpy = stub(
        resolverUtilsModule,
        "resolvePubkey",
        () => Promise.resolve("test-pubkey"),
      );
      const resolveRelaysSpy = stub(resolverUtilsModule, "resolveRelays", () => ["wss://test.com"]);
      const resolveServersSpy = stub(
        resolverUtilsModule,
        "resolveServers",
        () => ["https://test.com"],
      );
      const readProjectFileSpy = stub(configModule, "readProjectFile", () => null);

      const mockDisplayManager = { configureFromOptions: stub() };
      const getDisplayManagerSpy = stub(
        displayModeModule,
        "getDisplayManager",
        () => mockDisplayManager as any,
      );

      const program = new Command();
      registerDownloadCommand(program);

      try {
        const commands = program.getCommands();
        const downloadCommand = commands.find((cmd) => cmd.getName() === "download");
        await downloadCommand?.parse(["download", "--output", "./test"]);
      } catch {
        // Expected to fail in test environment
      }

      // Verify that dependencies were called
      assertEquals(resolvePubkeySpy.calls.length, 1);
      assertEquals(resolveRelaysSpy.calls.length, 1);
      assertEquals(resolveServersSpy.calls.length, 1);
      assertEquals(readProjectFileSpy.calls.length >= 1, true);
      assertEquals(getDisplayManagerSpy.calls.length, 1);
    });
  });
});
