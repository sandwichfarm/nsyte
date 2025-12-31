import { assertEquals, assertExists } from "std/assert/mod.ts";
import { restore, spy, stub } from "std/testing/mock.ts";
import {
  getErrorMessage,
  handleError,
  logError,
  withErrorHandling,
} from "../../src/lib/error-utils.ts";
import { createLogger } from "../../src/lib/logger.ts";

Deno.test("Error Utils - Comprehensive Coverage", async (t) => {
  await t.step("getErrorMessage - edge cases", () => {
    // Test with Error subclasses
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "CustomError";
      }
    }

    const customError = new CustomError("Custom error message");
    assertEquals(getErrorMessage(customError), "Custom error message");

    // Test with objects that have toString
    const objWithToString = {
      toString() {
        return "Object with custom toString";
      },
    };
    assertEquals(getErrorMessage(objWithToString), "Object with custom toString");

    // Test with symbols
    const symbol = Symbol("test");
    assertEquals(getErrorMessage(symbol), "Symbol(test)");

    // Test with arrays
    assertEquals(getErrorMessage([1, 2, 3]), "1,2,3");
    assertEquals(getErrorMessage([]), "");

    // Test with functions
    const fn = function testFunction() {};
    assertEquals(getErrorMessage(fn).includes("function"), true);

    // Test with BigInt
    assertEquals(getErrorMessage(BigInt(123)), "123");

    // Test with boolean
    assertEquals(getErrorMessage(true), "true");
    assertEquals(getErrorMessage(false), "false");

    // Test with Error with no message
    const emptyError = new Error();
    assertEquals(getErrorMessage(emptyError), "");

    // Test with objects without toString
    const objWithoutToString = Object.create(null);
    objWithoutToString.prop = "value";
    assertEquals(getErrorMessage(objWithoutToString), "[object Object]");

    // Test with circular references
    const circularObj: any = { a: 1 };
    circularObj.circular = circularObj;
    const circularResult = getErrorMessage(circularObj);
    assertEquals(typeof circularResult, "string");
    assertEquals(circularResult.includes("[object Object]"), true);
  });

  await t.step("logError - with custom logger", () => {
    const mockLogger = {
      error: spy(() => {}),
      info: spy(() => {}),
      debug: spy(() => {}),
      warn: spy(() => {}),
    };

    const consoleErrorSpy = spy(console, "error");

    try {
      const error = new Error("Test with custom logger");
      const result = logError("Custom context", error, {
        logger: mockLogger as any,
        showConsole: true,
      });

      assertEquals(result, "Test with custom logger");
      assertEquals(mockLogger.error.calls.length, 1);
      assertEquals(mockLogger.error.calls[0].args[0], "Custom context: Test with custom logger");
      assertEquals(consoleErrorSpy.calls.length, 1);
    } finally {
      restore();
    }
  });

  await t.step("logError - various error types", () => {
    const mockLogger = {
      error: spy(() => {}),
      info: spy(() => {}),
      debug: spy(() => {}),
      warn: spy(() => {}),
    };

    const consoleErrorSpy = spy(console, "error");

    try {
      // Test with string error
      logError("String error context", "Simple string error", {
        logger: mockLogger as any,
      });
      assertEquals(mockLogger.error.calls[0].args[0], "String error context: Simple string error");

      // Test with number error
      logError("Number error context", 404, {
        logger: mockLogger as any,
      });
      assertEquals(mockLogger.error.calls[1].args[0], "Number error context: 404");

      // Test with object error
      const objError = { code: "ERR_001", detail: "Something went wrong" };
      logError("Object error context", objError, {
        logger: mockLogger as any,
      });
      assertEquals(mockLogger.error.calls[2].args[0], "Object error context: [object Object]");

      // Test with null/undefined
      logError("Null error context", null, {
        logger: mockLogger as any,
      });
      assertEquals(mockLogger.error.calls[3].args[0], "Null error context: null");
    } finally {
      restore();
    }
  });

  await t.step("logError - console color output", () => {
    const consoleErrorSpy = spy(console, "error");

    try {
      // Test colored console output (default)
      logError("Color test", new Error("Colored error"), {
        showConsole: true,
      });

      // Find the console error call
      const coloredCall = consoleErrorSpy.calls.find((call) =>
        String(call.args[0]).includes("Error:")
      );
      assertExists(coloredCall);
      const coloredMessage = coloredCall.args[0] as string;
      // Should contain ANSI color codes
      assertEquals(coloredMessage.includes("\x1b["), true);

      // Test uncolored console output
      logError("No color test", new Error("Uncolored error"), {
        showConsole: true,
        color: false,
      });

      // Find the uncolored console error call
      const uncoloredCall = consoleErrorSpy.calls.find((call) =>
        call.args[0] === "Error: No color test: Uncolored error"
      );
      assertExists(uncoloredCall);
      const uncoloredMessage = uncoloredCall.args[0] as string;
      // Should not contain ANSI color codes
      assertEquals(uncoloredMessage, "Error: No color test: Uncolored error");
      assertEquals(uncoloredMessage.includes("\x1b["), false);
    } finally {
      restore();
    }
  });

  await t.step("handleError - all option combinations", () => {
    const exitStub = stub(Deno, "exit", () => {});
    const consoleErrorSpy = spy(console, "error");

    try {
      // Test exit with default code
      handleError("Exit default", new Error("exit error"), {
        exit: true,
      });
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1);

      // Test exit with custom code 0
      handleError("Exit zero", new Error("exit error"), {
        exit: true,
        exitCode: 0,
      });
      assertEquals(exitStub.calls.length, 2);
      assertEquals(exitStub.calls[1].args[0], 0);

      // Test with all options
      handleError("All options", new Error("full error"), {
        exit: true,
        exitCode: 255,
        showConsole: true,
        color: false,
      });
      assertEquals(exitStub.calls.length, 3);
      assertEquals(exitStub.calls[2].args[0], 255);
      assertEquals(consoleErrorSpy.calls.length, 1);
      assertEquals(consoleErrorSpy.calls[0].args[0], "Error: All options: full error");
    } finally {
      restore();
    }
  });

  await t.step("handleError - with custom logger", () => {
    const mockLogger = {
      error: spy(() => {}),
      info: spy(() => {}),
      debug: spy(() => {}),
      warn: spy(() => {}),
    };

    const exitStub = stub(Deno, "exit", () => {});

    try {
      handleError("Custom logger context", new Error("logger error"), {
        logger: mockLogger as any,
        showConsole: false,
      });

      assertEquals(mockLogger.error.calls.length, 1);
      assertEquals(mockLogger.error.calls[0].args[0], "Custom logger context: logger error");
      assertEquals(exitStub.calls.length, 0);
    } finally {
      restore();
    }
  });

  await t.step("withErrorHandling - success cases", async () => {
    // Test with different return types
    const stringResult = await withErrorHandling("String context", async () => {
      return "test string";
    });
    assertEquals(stringResult, "test string");

    const numberResult = await withErrorHandling("Number context", async () => {
      return 42;
    });
    assertEquals(numberResult, 42);

    const objectResult = await withErrorHandling("Object context", async () => {
      return { key: "value" };
    });
    assertEquals(objectResult, { key: "value" });

    const nullResult = await withErrorHandling("Null context", async () => {
      return null;
    });
    assertEquals(nullResult, null);
  });

  await t.step("withErrorHandling - error cases with options", async () => {
    const exitStub = stub(Deno, "exit", () => {});
    const consoleErrorSpy = spy(console, "error");

    try {
      // Test basic error
      const result1 = await withErrorHandling("Basic error", async () => {
        throw new Error("Async error");
      });
      assertEquals(result1, undefined);

      // Test with console output
      const result2 = await withErrorHandling("Console error", async () => {
        throw "String error thrown";
      }, {
        showConsole: true,
        color: false,
      });
      assertEquals(result2, undefined);
      assertEquals(consoleErrorSpy.calls.length, 1);
      assertEquals(consoleErrorSpy.calls[0].args[0], "Error: Console error: String error thrown");

      // Test with exit
      const result3 = await withErrorHandling("Exit error", async () => {
        throw new Error("Fatal error");
      }, {
        exit: true,
        exitCode: 99,
      });
      assertEquals(result3, undefined);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 99);
    } finally {
      restore();
    }
  });

  await t.step("withErrorHandling - with custom logger", async () => {
    const mockLogger = {
      error: spy(() => {}),
      info: spy(() => {}),
      debug: spy(() => {}),
      warn: spy(() => {}),
    };

    try {
      const result = await withErrorHandling("Logger error", async () => {
        throw new TypeError("Type mismatch");
      }, {
        logger: mockLogger as any,
      });

      assertEquals(result, undefined);
      assertEquals(mockLogger.error.calls.length, 1);
      assertEquals(mockLogger.error.calls[0].args[0], "Logger error: Type mismatch");
    } finally {
      restore();
    }
  });

  await t.step("withErrorHandling - nested errors", async () => {
    const exitStub = stub(Deno, "exit", () => {});

    try {
      const result = await withErrorHandling("Outer", async () => {
        return await withErrorHandling("Inner", async () => {
          throw new Error("Inner error");
        }, {
          exit: false, // Don't exit on inner error
        });
      });

      assertEquals(result, undefined); // Inner error returns undefined
      assertEquals(exitStub.calls.length, 0); // No exit called
    } finally {
      restore();
    }
  });

  await t.step("Integration - error flow with all components", async () => {
    const mockLogger = {
      error: spy(() => {}),
      info: spy(() => {}),
      debug: spy(() => {}),
      warn: spy(() => {}),
    };

    const exitStub = stub(Deno, "exit", () => {});
    const consoleErrorSpy = spy(console, "error");

    try {
      // Simulate a complex error scenario
      const complexError = new Error("Network timeout");
      complexError.cause = new Error("Socket closed");

      // First, just log it
      const message = logError("API call failed", complexError, {
        logger: mockLogger as any,
      });
      assertEquals(message, "Network timeout");

      // Then handle it without exit
      handleError("Retry mechanism", complexError, {
        logger: mockLogger as any,
        showConsole: true,
        color: true,
      });
      assertEquals(exitStub.calls.length, 0);
      assertEquals(consoleErrorSpy.calls.length, 1);

      // Finally, use withErrorHandling
      const finalResult = await withErrorHandling("Final attempt", async () => {
        // Simulate some async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw complexError;
      }, {
        logger: mockLogger as any,
        exit: true,
        exitCode: 3,
        showConsole: true,
      });

      assertEquals(finalResult, undefined);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 3);

      // Verify logger was called for all operations
      assertEquals(mockLogger.error.calls.length, 3);
    } finally {
      restore();
    }
  });
});
