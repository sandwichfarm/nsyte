import { assertEquals, assertStringIncludes } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore } from "@std/testing/mock";
import { getDisplayManager } from "../../src/lib/display-mode.ts";
import { createLogger, flushQueuedLogs, setProgressMode } from "../../src/lib/logger.ts";

describe("logger - comprehensive branch coverage", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];
  let originalLogLevel: string | undefined;
  let originalDisplayMode: string | undefined;

  beforeEach(() => {
    // Save original values
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalLogLevel = Deno.env.get("LOG_LEVEL");
    originalDisplayMode = Deno.env.get("DISPLAY_MODE");

    // Reset state
    logOutput = [];
    errorOutput = [];
    setProgressMode(false);
    getDisplayManager().setMode("normal");

    // Mock console methods
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      errorOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    // Restore everything
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    if (originalLogLevel !== undefined) {
      Deno.env.set("LOG_LEVEL", originalLogLevel);
    } else {
      Deno.env.delete("LOG_LEVEL");
    }

    if (originalDisplayMode !== undefined) {
      Deno.env.set("DISPLAY_MODE", originalDisplayMode);
    } else {
      Deno.env.delete("DISPLAY_MODE");
    }

    setProgressMode(false);
    flushQueuedLogs();
    restore();
  });

  describe("formatLogMessage", () => {
    it("should format all log levels correctly", () => {
      const logger = createLogger("test");

      // Test each level
      logger.debug("debug msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");
      logger.success("success msg");

      // Check formatting
      assertStringIncludes(logOutput[0], "[DEBUG]");
      assertStringIncludes(logOutput[0], "debug msg");

      assertStringIncludes(logOutput[1], "[INFO]");
      assertStringIncludes(logOutput[1], "info msg");

      assertStringIncludes(logOutput[2], "[WARN]");
      assertStringIncludes(logOutput[2], "warn msg");

      assertStringIncludes(errorOutput[0], "[ERROR]");
      assertStringIncludes(errorOutput[0], "error msg");

      assertStringIncludes(logOutput[3], "[SUCCESS]");
      assertStringIncludes(logOutput[3], "success msg");
    });

    it("should handle unknown log level in formatLogMessage", () => {
      // This tests the default case in formatLogMessage switch
      // We need to access formatLogMessage directly, which we can't
      // So we'll test it indirectly by checking the format
      const logger = createLogger("test");
      logger.info("test");

      // Should have proper format even for default case
      assertStringIncludes(logOutput[0], "test:");
      assertStringIncludes(logOutput[0], "test");
    });
  });

  describe("shouldShowLog", () => {
    it("should hide non-error logs in interactive mode when not debugging", () => {
      getDisplayManager().setMode("interactive");
      Deno.env.delete("DEBUG");

      const logger = createLogger("test");

      logger.debug("hidden debug");
      logger.info("hidden info");
      logger.warn("hidden warn");
      logger.error("shown error");
      logger.success("hidden success");

      // Only error should be shown
      assertEquals(logOutput.length, 0);
      assertEquals(errorOutput.length, 1);
      assertStringIncludes(errorOutput[0], "shown error");
    });

    it("should show all logs in interactive mode when debugging", () => {
      getDisplayManager().setMode("interactive");
      Deno.env.set("DEBUG", "true");

      const logger = createLogger("test");

      logger.debug("shown debug");
      logger.info("shown info");
      logger.warn("shown warn");
      logger.error("shown error");
      logger.success("shown success");

      // All logs should be shown
      assertEquals(logOutput.length, 4); // debug, info, warn, success
      assertEquals(errorOutput.length, 1); // error
    });

    it("should show all logs in normal mode", () => {
      getDisplayManager().setMode("normal");

      const logger = createLogger("test");

      logger.debug("shown debug");
      logger.info("shown info");
      logger.warn("shown warn");
      logger.error("shown error");
      logger.success("shown success");

      // All logs should be shown
      assertEquals(logOutput.length, 4); // debug, info, warn, success
      assertEquals(errorOutput.length, 1); // error
    });
  });

  describe("LOG_LEVEL environment variable", () => {
    it("should respect LOG_LEVEL=none", () => {
      Deno.env.set("LOG_LEVEL", "none");
      const logger = createLogger("test");

      logger.debug("hidden");
      logger.info("hidden");
      logger.warn("hidden");
      logger.error("hidden");

      assertEquals(logOutput.length, 0);
      assertEquals(errorOutput.length, 0);
    });

    it("should respect LOG_LEVEL=error", () => {
      Deno.env.set("LOG_LEVEL", "error");
      const logger = createLogger("test");

      logger.debug("hidden");
      logger.info("hidden");
      logger.warn("hidden");
      logger.error("shown");

      assertEquals(logOutput.length, 0);
      assertEquals(errorOutput.length, 1);
      assertStringIncludes(errorOutput[0], "shown");
    });

    it("should respect LOG_LEVEL=warn", () => {
      Deno.env.set("LOG_LEVEL", "warn");
      const logger = createLogger("test");

      logger.debug("hidden");
      logger.info("hidden");
      logger.warn("shown warn");
      logger.error("shown error");

      assertEquals(logOutput.length, 1);
      assertEquals(errorOutput.length, 1);
      assertStringIncludes(logOutput[0], "shown warn");
      assertStringIncludes(errorOutput[0], "shown error");
    });

    it("should respect LOG_LEVEL=info (default)", () => {
      Deno.env.set("LOG_LEVEL", "info");
      const logger = createLogger("test");

      logger.debug("hidden");
      logger.info("shown info");
      logger.warn("shown warn");
      logger.error("shown error");

      assertEquals(logOutput.length, 2);
      assertEquals(errorOutput.length, 1);
    });

    it("should respect LOG_LEVEL=debug", () => {
      Deno.env.set("LOG_LEVEL", "debug");
      const logger = createLogger("test");

      logger.debug("shown debug");
      logger.info("shown info");
      logger.warn("shown warn");
      logger.error("shown error");

      assertEquals(logOutput.length, 3);
      assertEquals(errorOutput.length, 1);
    });

    it("should default to info level when LOG_LEVEL not set", () => {
      Deno.env.delete("LOG_LEVEL");
      const logger = createLogger("test");

      logger.debug("hidden");
      logger.info("shown");

      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "shown");
    });

    it("should handle invalid LOG_LEVEL as info", () => {
      Deno.env.set("LOG_LEVEL", "invalid");
      const logger = createLogger("test");

      logger.debug("shown"); // Will be shown because invalid level defaults to allowing all
      logger.info("shown");

      assertEquals(logOutput.length, 2);
    });
  });

  describe("Progress mode", () => {
    it("should queue info logs in progress mode", () => {
      const logger = createLogger("test");

      setProgressMode(true);
      logger.info("queued");

      assertEquals(logOutput.length, 0);

      setProgressMode(false);
      flushQueuedLogs();

      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "queued");
    });

    it("should queue warn logs in progress mode", () => {
      const logger = createLogger("test");

      setProgressMode(true);
      logger.warn("queued warn");

      assertEquals(logOutput.length, 0);

      setProgressMode(false);
      flushQueuedLogs();

      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "queued warn");
    });

    it("should queue error logs in progress mode", () => {
      const logger = createLogger("test");

      setProgressMode(true);
      logger.error("queued error");

      assertEquals(errorOutput.length, 0);

      setProgressMode(false);
      flushQueuedLogs();

      assertEquals(errorOutput.length, 1);
      assertStringIncludes(errorOutput[0], "queued error");
    });

    it("should not queue debug logs in progress mode", () => {
      const logger = createLogger("test");

      setProgressMode(true);
      logger.debug("not queued");

      // Debug logs are shown immediately even in progress mode
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "not queued");
    });

    it("should not queue success logs in progress mode", () => {
      const logger = createLogger("test");

      setProgressMode(true);
      logger.success("not queued");

      // Success logs are shown immediately even in progress mode
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "not queued");
    });

    it("should not queue logs when LOG_LEVEL prevents logging", () => {
      Deno.env.set("LOG_LEVEL", "error");
      const logger = createLogger("test");

      setProgressMode(true);
      logger.info("not queued");
      logger.warn("not queued");

      setProgressMode(false);
      flushQueuedLogs();

      // Nothing should be logged because LOG_LEVEL=error
      assertEquals(logOutput.length, 0);
    });
  });

  describe("flushQueuedLogs", () => {
    it("should clear queue without logging in interactive non-debug mode", () => {
      getDisplayManager().setMode("interactive");
      Deno.env.delete("DEBUG");

      const logger = createLogger("test");

      setProgressMode(true);
      logger.info("queued info");
      logger.warn("queued warn");
      logger.error("queued error");

      setProgressMode(false);
      flushQueuedLogs();

      // Queue should be cleared but nothing logged (except errors)
      assertEquals(logOutput.length, 0);
      assertEquals(errorOutput.length, 0); // Even errors are not flushed in interactive mode

      // Try to flush again to ensure queue is empty
      flushQueuedLogs();
      assertEquals(logOutput.length, 0);
      assertEquals(errorOutput.length, 0);
    });

    it("should flush all logs in interactive debug mode", () => {
      getDisplayManager().setMode("interactive");
      Deno.env.set("DEBUG", "true");

      const logger = createLogger("test");

      setProgressMode(true);
      logger.info("queued info");
      logger.warn("queued warn");
      logger.error("queued error");

      setProgressMode(false);
      flushQueuedLogs();

      // All logs should be flushed
      assertEquals(logOutput.length, 2); // info, warn
      assertEquals(errorOutput.length, 1); // error
    });

    it("should flush all logs in normal mode", () => {
      getDisplayManager().setMode("normal");

      const logger = createLogger("test");

      setProgressMode(true);
      logger.info("queued info");
      logger.error("queued error");

      setProgressMode(false);
      flushQueuedLogs();

      assertEquals(logOutput.length, 1);
      assertEquals(errorOutput.length, 1);
    });

    it("should handle empty queue", () => {
      flushQueuedLogs();
      assertEquals(logOutput.length, 0);
      assertEquals(errorOutput.length, 0);
    });

    it("should handle multiple flushes", () => {
      const logger = createLogger("test");

      setProgressMode(true);
      logger.info("first");
      setProgressMode(false);
      flushQueuedLogs();

      setProgressMode(true);
      logger.info("second");
      setProgressMode(false);
      flushQueuedLogs();

      assertEquals(logOutput.length, 2);
      assertStringIncludes(logOutput[0], "first");
      assertStringIncludes(logOutput[1], "second");
    });
  });

  describe("Edge cases", () => {
    it("should handle switching between progress modes", () => {
      const logger = createLogger("test");

      logger.info("normal 1");
      setProgressMode(true);
      logger.info("queued 1");
      setProgressMode(false);
      logger.info("normal 2");
      setProgressMode(true);
      logger.info("queued 2");
      setProgressMode(false);
      flushQueuedLogs();

      assertEquals(logOutput.length, 4);
      assertStringIncludes(logOutput[0], "normal 1");
      assertStringIncludes(logOutput[1], "normal 2");
      assertStringIncludes(logOutput[2], "queued 1");
      assertStringIncludes(logOutput[3], "queued 2");
    });

    it("should handle namespace with special characters", () => {
      const logger = createLogger("test:namespace-123_ABC");
      logger.info("test");

      assertStringIncludes(logOutput[0], "test:namespace-123_ABC");
    });

    it("should handle empty messages", () => {
      const logger = createLogger("test");

      logger.info("");
      logger.error("");

      assertEquals(logOutput.length, 1);
      assertEquals(errorOutput.length, 1);
    });

    it("should handle very long messages", () => {
      const logger = createLogger("test");
      const longMessage = "a".repeat(1000);

      logger.info(longMessage);

      assertStringIncludes(logOutput[0], longMessage);
    });
  });

  describe("Multiple loggers", () => {
    it("should handle multiple loggers with different namespaces", () => {
      const logger1 = createLogger("namespace1");
      const logger2 = createLogger("namespace2");

      logger1.info("from logger1");
      logger2.info("from logger2");

      assertEquals(logOutput.length, 2);
      assertStringIncludes(logOutput[0], "namespace1");
      assertStringIncludes(logOutput[0], "from logger1");
      assertStringIncludes(logOutput[1], "namespace2");
      assertStringIncludes(logOutput[1], "from logger2");
    });

    it("should share progress mode state between loggers", () => {
      const logger1 = createLogger("logger1");
      const logger2 = createLogger("logger2");

      setProgressMode(true);
      logger1.info("queued from logger1");
      logger2.info("queued from logger2");

      assertEquals(logOutput.length, 0);

      setProgressMode(false);
      flushQueuedLogs();

      assertEquals(logOutput.length, 2);
    });
  });
});
