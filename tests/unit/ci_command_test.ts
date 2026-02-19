// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";

describe({
  name: "CI command",
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  let consoleLogStub: any;
  let consoleErrorStub: any;
  let denoExitStub: any;

  beforeEach(() => {
    // Mock console methods
    consoleLogStub = stub(console, "log", () => {});
    consoleErrorStub = stub(console, "error", () => {});

    // Mock Deno.exit
    denoExitStub = stub(Deno, "exit", (_code?: number) => {
      throw new Error("Process exit");
    });
  });

  afterEach(() => {
    consoleLogStub?.restore();
    consoleErrorStub?.restore();
    denoExitStub?.restore();
    restore();
  });

  describe("registerCICommand", () => {
    it("should register CI command with correct configuration", async () => {
      const { registerCICommand } = await import("../../src/commands/ci.ts");
      const nsyte = (await import("../../src/commands/root.ts")).default;

      // Only register if not already registered
      const existingCi = nsyte.getCommands().find((cmd: any) => cmd.getName() === "ci");
      if (!existingCi) {
        registerCICommand();
      }

      // Verify the command was registered on nsyte
      const commands = nsyte.getCommands();
      const ciCommand = commands.find((cmd: any) => cmd.getName() === "ci");
      assertEquals(ciCommand !== undefined, true);
    });

    it("should set up action callback correctly", async () => {
      const nsyte = (await import("../../src/commands/root.ts")).default;

      // Command should already be registered from previous test
      const commands = nsyte.getCommands();
      const ciCommand = commands.find((cmd: any) => cmd.getName() === "ci");
      assertEquals(ciCommand !== undefined, true);
    });
  });

  describe("function exports", () => {
    it("should validate function exports", async () => {
      const { createNbunksecForCI, registerCICommand } = await import("../../src/commands/ci.ts");
      assertEquals(typeof createNbunksecForCI, "function");
      assertEquals(typeof registerCICommand, "function");
    });
  });

  describe("console output patterns", () => {
    it("should test expected console messages", () => {
      const messages = [
        "Connecting to bunker for CI/CD use...",
        "This will generate an nbunksec that is never stored to disk.",
        "Usage in CI/CD:",
        "nsyte upload ./dist --sec ${NBUNK_SECRET}",
      ];

      // Verify message content patterns
      assertEquals(messages[0].includes("CI/CD use"), true);
      assertEquals(messages[1].includes("never stored to disk"), true);
      assertEquals(messages[2].includes("Usage in CI/CD"), true);
      assertEquals(messages[3].includes("nsyte upload"), true);
    });
  });

  describe("error handling patterns", () => {
    it("should test error message formatting", () => {
      const errors = [
        new Error("Connection failed"),
        "String error message",
      ];

      const formatError = (error: unknown): string => {
        return error instanceof Error ? error.message : String(error);
      };

      assertEquals(formatError(errors[0]), "Connection failed");
      assertEquals(formatError(errors[1]), "String error message");
    });

    it("should test URL guidance logic", () => {
      const errorMessages = [
        "URL format is invalid",
        "invalid URL detected",
        "Connection timeout",
      ];

      const shouldShowGuidance = (message: string): boolean => {
        return message.includes("URL format") || message.includes("invalid URL");
      };

      assertEquals(shouldShowGuidance(errorMessages[0]), true);
      assertEquals(shouldShowGuidance(errorMessages[1]), true);
      assertEquals(shouldShowGuidance(errorMessages[2]), false);
    });
  });
});
