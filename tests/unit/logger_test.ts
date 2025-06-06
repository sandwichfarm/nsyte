import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { 
  createLogger, 
  setProgressMode, 
  flushQueuedLogs
} from "../../src/lib/logger.ts";

Deno.test("Logger", async (t) => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  const setupTest = () => {
    // Mock console methods
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    logOutput = [];
    errorOutput = [];
    
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    };
    
    console.error = (...args: unknown[]) => {
      errorOutput.push(args.map(String).join(" "));
    };
    
    // Reset progress mode
    setProgressMode(false);
  };

  const cleanupTest = () => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    setProgressMode(false);
    flushQueuedLogs();
  };

  await t.step("createLogger", async (t) => {
    await t.step("should create a logger with namespace", () => {
      setupTest();
      const logger = createLogger("test-namespace");
      assertEquals(typeof logger.debug, "function");
      assertEquals(typeof logger.info, "function");
      assertEquals(typeof logger.warn, "function");
      assertEquals(typeof logger.error, "function");
      cleanupTest();
    });
  });

  await t.step("Log Levels", async (t) => {
    await t.step("should log debug messages", () => {
      setupTest();
      const logger = createLogger("test");
      
      logger.debug("debug message");
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "DEBUG");
      assertStringIncludes(logOutput[0], "debug message");
      cleanupTest();
    });

    await t.step("should log info messages", () => {
      setupTest();
      const logger = createLogger("test");
      
      logger.info("info message");
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "INFO");
      assertStringIncludes(logOutput[0], "info message");
      cleanupTest();
    });

    await t.step("should log warning messages", () => {
      setupTest();
      const logger = createLogger("test");
      
      logger.warn("warning message");
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "WARN");
      assertStringIncludes(logOutput[0], "warning message");
      cleanupTest();
    });

    await t.step("should log error messages", () => {
      setupTest();
      const logger = createLogger("test");
      
      logger.error("error message");
      assertEquals(errorOutput.length, 1);
      assertStringIncludes(errorOutput[0], "ERROR");
      assertStringIncludes(errorOutput[0], "error message");
      cleanupTest();
    });

    await t.step("should log different message types", () => {
      setupTest();
      const logger = createLogger("test");
      
      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");
      
      assertEquals(logOutput.length, 3); // debug, info, warn
      assertEquals(errorOutput.length, 1); // error
      assertStringIncludes(logOutput.find(log => log.includes("warn")) || "", "warn");
      assertStringIncludes(errorOutput[0], "error");
      cleanupTest();
    });
  });

  await t.step("Progress Mode", async (t) => {
    await t.step("should queue logs in progress mode", () => {
      setupTest();
      const logger = createLogger("test");
      
      setProgressMode(true);
      logger.info("queued info");
      logger.error("queued error");
      
      // Logs should be queued, not output
      assertEquals(logOutput.length, 0);
      assertEquals(errorOutput.length, 0);
      cleanupTest();
    });

    await t.step("should flush queued logs when progress mode ends", () => {
      setupTest();
      const logger = createLogger("test");
      
      setProgressMode(true);
      logger.info("queued info");
      logger.error("queued error");
      
      setProgressMode(false);
      flushQueuedLogs();
      
      // Now logs should be output
      assertEquals(logOutput.length, 1);
      assertEquals(errorOutput.length, 1);
      assertStringIncludes(logOutput[0], "queued info");
      assertStringIncludes(errorOutput[0], "queued error");
      cleanupTest();
    });

    await t.step("should handle debug logs in progress mode", () => {
      setupTest();
      const logger = createLogger("test");
      
      setProgressMode(true);
      logger.debug("debug in progress");
      
      setProgressMode(false);
      // Debug logs should not be queued in progress mode
      assertEquals(logOutput.length, 1); // Debug logs still get printed immediately
      cleanupTest();
    });
  });

  await t.step("Namespace Filtering", async (t) => {
    await t.step("should include namespace in log output", () => {
      setupTest();
      const logger = createLogger("my-namespace");
      
      logger.info("test message");
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "my-namespace");
      cleanupTest();
    });
  });
});