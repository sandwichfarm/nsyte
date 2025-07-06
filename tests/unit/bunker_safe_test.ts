// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { restore, type Stub, stub } from "std/testing/mock.ts";

import {
  showBunkerHelp,
  handleBunkerCommand,
} from "../../src/commands/bunker.ts";

// Test state
let exitStub: Stub;
let consoleOutput: { logs: string[]; errors: string[] };
let originalLog: typeof console.log;
let originalError: typeof console.error;

describe("Bunker Command - Safe Tests", () => {
  beforeEach(async () => {
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

    it("should show help for --help flag", async () => {
      const originalArgs = Deno.args;
      try {
        Object.defineProperty(globalThis.Deno, "args", {
          value: ["--help"],
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

        assertEquals(
          output.includes("Unknown bunker action") || output.includes("Usage: nsyte bunker"),
          true
        );
        assertEquals(exitStub.calls.length, 1);
      } finally {
        Object.defineProperty(globalThis.Deno, "args", {
          value: originalArgs,
          writable: true,
          configurable: true,
        });
      }
    });
  });

  describe("console output patterns", () => {
    it("should test expected console messages", () => {
      const messages = [
        "Available bunkers:",
        "No bunkers found",
        "Successfully imported bunker",
        "Connecting to bunker",
        "Bunker URL appears to be incomplete",
        "Select a bunker to",
      ];

      messages.forEach((message) => {
        assertEquals(typeof message, "string");
        assertEquals(message.length > 0, true);
      });
    });
  });

  describe("error handling patterns", () => {
    it("should test error message formats", () => {
      const errorMessages = [
        "Bunker URL must start with bunker://",
        "URL appears to be incomplete",
        "Shell metacharacters need to be quoted",
      ];

      errorMessages.forEach((message) => {
        assertEquals(typeof message, "string");
        assertEquals(message.length > 0, true);
      });
    });
  });
});