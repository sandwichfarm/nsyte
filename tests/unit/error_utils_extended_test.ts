import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { stub } from "std/testing/mock.ts";
import {
  getErrorMessage,
  handleError,
  logError,
  withErrorHandling,
} from "../../src/lib/error-utils.ts";

Deno.test("Error Utils Extended - getErrorMessage", async (t) => {
  await t.step("should handle Error instances", () => {
    const error = new Error("Test error message");
    assertEquals(getErrorMessage(error), "Test error message");
  });

  await t.step("should handle Error with no message", () => {
    const error = new Error();
    assertEquals(getErrorMessage(error), "");
  });

  await t.step("should handle custom error types", () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "CustomError";
      }
    }
    const error = new CustomError("Custom error occurred");
    assertEquals(getErrorMessage(error), "Custom error occurred");
  });

  await t.step("should handle non-Error objects", () => {
    assertEquals(getErrorMessage("string error"), "string error");
    assertEquals(getErrorMessage(123), "123");
    assertEquals(getErrorMessage(true), "true");
    assertEquals(getErrorMessage(null), "null");
    assertEquals(getErrorMessage(undefined), "undefined");
  });

  await t.step("should handle objects with toString", () => {
    const obj = {
      toString() {
        return "Object string representation";
      },
    };
    assertEquals(getErrorMessage(obj), "Object string representation");
  });

  await t.step("should handle objects without toString", () => {
    const obj = Object.create(null);
    obj.prop = "value";
    assertEquals(getErrorMessage(obj), "[object Object]");
  });

  await t.step("should handle circular references", () => {
    const obj: any = { a: 1 };
    obj.circular = obj;
    const result = getErrorMessage(obj);
    assertEquals(typeof result, "string");
    assertEquals(result.includes("[object Object]"), true);
  });
});

Deno.test("Error Utils Extended - logError", async (t) => {
  let consoleErrorStub: any;
  let consoleLogStub: any;

  await t.step("should log to console when showConsole is true", () => {
    consoleErrorStub = stub(console, "error", () => {});

    logError("Test context", new Error("Test error"), {
      showConsole: true,
      color: true,
    });

    assertEquals(consoleErrorStub.calls.length, 1);
    consoleErrorStub.restore();
  });

  await t.step("should not log to console when showConsole is false", () => {
    consoleErrorStub = stub(console, "error", () => {});

    logError("Test context", "Error message", {
      showConsole: false,
    });

    assertEquals(consoleErrorStub.calls.length, 0);
    consoleErrorStub.restore();
  });

  await t.step("should handle different error types", () => {
    consoleErrorStub = stub(console, "error", () => {});

    // Error instance
    logError("Context 1", new Error("Error 1"), { showConsole: true });

    // String error
    logError("Context 2", "String error", { showConsole: true });

    // Object error
    logError("Context 3", { code: "ERR001", message: "Object error" }, { showConsole: true });

    assertEquals(consoleErrorStub.calls.length, 3);
    consoleErrorStub.restore();
  });
});

Deno.test("Error Utils Extended - handleError", async (t) => {
  let consoleErrorStub: any;
  let exitStub: any;

  await t.step("should exit when exit option is true", () => {
    consoleErrorStub = stub(console, "error", () => {});
    exitStub = stub(Deno, "exit", () => {
      throw new Error("Process exit called"); // Mock exit behavior
    });

    try {
      handleError("Fatal error", new Error("Critical"), {
        exit: true,
        exitCode: 1,
      });
    } catch (e) {
      // Expected to throw from mocked exit
    }

    assertEquals(exitStub.calls.length, 1);
    assertEquals(exitStub.calls[0].args[0], 1);

    exitStub.restore();
    consoleErrorStub.restore();
  });

  await t.step("should use custom exit code", () => {
    consoleErrorStub = stub(console, "error", () => {});
    exitStub = stub(Deno, "exit", () => {
      throw new Error("Process exit called"); // Mock exit behavior
    });

    try {
      handleError("Custom exit", "Error", {
        exit: true,
        exitCode: 42,
      });
    } catch (e) {
      // Expected to throw from mocked exit
    }

    assertEquals(exitStub.calls[0].args[0], 42);

    exitStub.restore();
    consoleErrorStub.restore();
  });

  await t.step("should not exit when exit option is false", () => {
    consoleErrorStub = stub(console, "error", () => {});
    exitStub = stub(Deno, "exit", () => {
      throw new Error("Process exit called"); // Mock exit behavior
    });

    handleError("Non-fatal error", new Error("Warning"), {
      exit: false,
      showConsole: true,
    });

    assertEquals(exitStub.calls.length, 0);
    assertEquals(consoleErrorStub.calls.length, 1);

    exitStub.restore();
    consoleErrorStub.restore();
  });
});

Deno.test("Error Utils Extended - withErrorHandling", async (t) => {
  let consoleErrorStub: any;
  let exitStub: any;

  await t.step("should return result on success", async () => {
    const successFn = async () => "success";
    const result = await withErrorHandling(
      "Success context",
      successFn,
    );
    assertEquals(result, "success");
  });

  await t.step("should handle async functions", async () => {
    const asyncFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "async success";
    };
    const result = await withErrorHandling(
      "Async context",
      asyncFn,
    );
    assertEquals(result, "async success");
  });

  await t.step("should handle errors and return undefined", async () => {
    consoleErrorStub = stub(console, "error", () => {});

    const errorFn = async () => {
      throw new Error("Function error");
    };

    const result = await withErrorHandling(
      "Error context",
      errorFn,
      { showConsole: true },
    );

    assertEquals(result, undefined);
    assertEquals(consoleErrorStub.calls.length, 1);

    consoleErrorStub.restore();
  });

  await t.step("should exit on error when requested", async () => {
    consoleErrorStub = stub(console, "error", () => {});
    exitStub = stub(Deno, "exit", () => {
      throw new Error("Process exit called"); // Mock exit behavior
    });

    const errorFn = async () => {
      throw new Error("Fatal function error");
    };

    try {
      await withErrorHandling(
        "Fatal context",
        errorFn,
        { exit: true, exitCode: 99 },
      );
    } catch (e) {
      // Expected to throw from mocked exit
    }

    assertEquals(exitStub.calls.length, 1);
    assertEquals(exitStub.calls[0].args[0], 99);

    exitStub.restore();
    consoleErrorStub.restore();
  });

  await t.step("should handle async errors", async () => {
    consoleErrorStub = stub(console, "error", () => {});

    const asyncErrorFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("Async error");
    };

    const result = await withErrorHandling(
      "Async error context",
      asyncErrorFn,
      { showConsole: true },
    );

    assertEquals(result, undefined);
    assertEquals(consoleErrorStub.calls.length, 1);

    consoleErrorStub.restore();
  });
});
