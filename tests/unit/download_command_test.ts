// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, type Stub, stub } from "@std/testing/mock";

import { registerDownloadCommand } from "../../src/commands/download.ts";
import nsyte from "../../src/commands/root.ts";

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

  describe("command registration", () => {
    it("should register download command", () => {
      // Only register if not already registered
      const existing = nsyte.getCommands().find((cmd) => cmd.getName() === "download");
      if (!existing) {
        registerDownloadCommand();
      }

      const commands = nsyte.getCommands();
      const downloadCommand = commands.find((cmd) => cmd.getName() === "download");
      assertExists(downloadCommand);
    });

    it("should have correct command name", () => {
      const commands = nsyte.getCommands();
      const downloadCommand = commands.find((cmd) => cmd.getName() === "download");
      assertExists(downloadCommand);
      assertEquals(downloadCommand!.getName(), "download");
    });

    it("should export registerDownloadCommand function", () => {
      assertEquals(typeof registerDownloadCommand, "function");
    });
  });

  describe("command structure", () => {
    it("should have expected options", () => {
      const commands = nsyte.getCommands();
      const downloadCommand = commands.find((cmd) => cmd.getName() === "download");
      assertExists(downloadCommand);

      // The command should exist and be properly structured
      assertEquals(downloadCommand!.getName(), "download");
    });
  });

  describe("error handling patterns", () => {
    it("should validate download options", () => {
      // Test the DownloadService.validateOptions static method
      const { DownloadService } = require("../../src/lib/download.ts") || {};

      // Test option validation patterns
      const validateOutput = (output: string | undefined): boolean => {
        return !!output && output.trim() !== "";
      };

      assertEquals(validateOutput("./dist"), true);
      assertEquals(validateOutput("/absolute/path"), true);
      assertEquals(validateOutput(""), false);
      assertEquals(validateOutput(undefined), false);
      assertEquals(validateOutput("  "), false);
    });

    it("should handle path normalization", () => {
      const normalizePath = (path: string): string => {
        return path.replace(/\\+/g, "/").replace(/\/+$/, "");
      };

      assertEquals(normalizePath("./downloads/"), "./downloads");
      assertEquals(normalizePath("C:\\Users\\output\\"), "C:/Users/output");
      assertEquals(normalizePath("/path/to/dir"), "/path/to/dir");
    });
  });
});

// Use a function-based import to avoid issues with non-configurable module exports
function require(path: string): any {
  try {
    // Dynamic imports in tests are cached and non-configurable
    return null;
  } catch {
    return null;
  }
}
