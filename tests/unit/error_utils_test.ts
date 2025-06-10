import { assert, assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { restore, type Stub, stub } from "jsr:@std/testing/mock";
import {
  getErrorMessage,
  handleError,
  logError,
  withErrorHandling,
} from "../../src/lib/error-utils.ts";
import { createLogger } from "../../src/lib/logger.ts";

describe("error-utils", () => {
  let consoleErrorStub: Stub;
  let exitStub: Stub;

  beforeEach(() => {
    consoleErrorStub = stub(console, "error");
    exitStub = stub(Deno, "exit");
  });

  afterEach(() => {
    restore();
  });

  describe("getErrorMessage", () => {
    it("should extract message from Error instance", () => {
      const error = new Error("Test error message");
      assertEquals(getErrorMessage(error), "Test error message");
    });

    it("should convert non-Error to string", () => {
      assertEquals(getErrorMessage("string error"), "string error");
      assertEquals(getErrorMessage(42), "42");
      assertEquals(getErrorMessage(null), "null");
      assertEquals(getErrorMessage(undefined), "undefined");
    });

    it("should handle complex objects", () => {
      const obj = { message: "object error" };
      assertEquals(getErrorMessage(obj), "[object Object]");
    });
  });

  describe("logError", () => {
    it("should log error with context", () => {
      const error = new Error("Test error");
      const result = logError("Test context", error);

      assertEquals(result, "Test error");
    });

    it("should output to console when requested", () => {
      const error = new Error("Test error");
      logError("Test context", error, { showConsole: true });

      assertEquals(consoleErrorStub.calls.length, 1);
      const call = consoleErrorStub.calls[0];
      assertStringIncludes(call.args[0] as string, "Error: Test context: Test error");
    });

    it("should output colored console messages by default", () => {
      const error = new Error("Test error");
      logError("Test context", error, { showConsole: true });

      assertEquals(consoleErrorStub.calls.length, 1);
      const message = consoleErrorStub.calls[0].args[0] as string;
      // Should contain ANSI color codes
      assert(message.includes("\x1b["));
    });

    it("should output uncolored console messages when color is false", () => {
      const error = new Error("Test error");
      logError("Test context", error, { showConsole: true, color: false });

      assertEquals(consoleErrorStub.calls.length, 1);
      const message = consoleErrorStub.calls[0].args[0] as string;
      assertEquals(message, "Error: Test context: Test error");
    });
  });

  describe("handleError", () => {
    it("should log error without exiting by default", () => {
      const error = new Error("Test error");
      handleError("Test context", error);

      assertEquals(exitStub.calls.length, 0);
    });

    it("should exit when requested", () => {
      const error = new Error("Test error");
      handleError("Test context", error, { exit: true });

      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1); // Default exit code
    });

    it("should use custom exit code", () => {
      const error = new Error("Test error");
      handleError("Test context", error, { exit: true, exitCode: 42 });

      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 42);
    });

    it("should show console output when requested", () => {
      const error = new Error("Test error");
      handleError("Test context", error, { showConsole: true });

      assertEquals(consoleErrorStub.calls.length, 1);
    });
  });

  describe("withErrorHandling", () => {
    it("should return result on success", async () => {
      const result = await withErrorHandling("Test context", async () => {
        return "success";
      });

      assertEquals(result, "success");
    });

    it("should handle errors and return undefined", async () => {
      const result = await withErrorHandling("Test context", async () => {
        throw new Error("Test error");
      });

      assertEquals(result, undefined);
    });

    it("should exit on error when requested", async () => {
      await withErrorHandling("Test context", async () => {
        throw new Error("Test error");
      }, { exit: true });

      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1);
    });
  });
});
