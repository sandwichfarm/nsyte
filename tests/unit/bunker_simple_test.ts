import { assertEquals } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { restore, type Stub, stub } from "std/testing/mock.ts";

// Set environment variable to disable keychain
Deno.env.set("NSYTE_DISABLE_KEYCHAIN", "true");

import { showBunkerHelp } from "../../src/commands/bunker.ts";

describe("Bunker Simple Tests", () => {
  let consoleOutput: { logs: string[]; errors: string[] };
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

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
  });

  afterEach(() => {
    // Restore console
    console.log = originalLog;
    console.error = originalError;

    // Restore all stubs
    restore();
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
});
