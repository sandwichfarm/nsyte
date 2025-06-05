import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://jsr.io/@std/testing/1.0.12/bdd.ts";
import { 
  createLogger, 
  setProgressMode, 
  flushQueuedLogs,
  setGlobalLogLevel,
  LogLevel 
} from "../../src/lib/logger.ts";

describe("Logger", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
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
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    setProgressMode(false);
    flushQueuedLogs();
  });

  describe("createLogger", () => {
    it("should create a logger with namespace", () => {
      const logger = createLogger("test-namespace");
      assertEquals(typeof logger.debug, "function");
      assertEquals(typeof logger.info, "function");
      assertEquals(typeof logger.warn, "function");
      assertEquals(typeof logger.error, "function");
    });
  });

  describe("Log Levels", () => {
    it("should log debug messages when debug level is enabled", () => {
      setGlobalLogLevel(LogLevel.DEBUG);
      const logger = createLogger("test");
      
      logger.debug("debug message");
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "DEBUG");
      assertStringIncludes(logOutput[0], "debug message");
    });

    it("should not log debug messages when info level is set", () => {
      setGlobalLogLevel(LogLevel.INFO);
      const logger = createLogger("test");
      
      logger.debug("debug message");
      assertEquals(logOutput.length, 0);
    });

    it("should log info messages", () => {
      setGlobalLogLevel(LogLevel.INFO);
      const logger = createLogger("test");
      
      logger.info("info message");
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "INFO");
      assertStringIncludes(logOutput[0], "info message");
    });

    it("should log warning messages", () => {
      setGlobalLogLevel(LogLevel.WARN);
      const logger = createLogger("test");
      
      logger.warn("warning message");
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "WARN");
      assertStringIncludes(logOutput[0], "warning message");
    });

    it("should log error messages", () => {
      setGlobalLogLevel(LogLevel.ERROR);
      const logger = createLogger("test");
      
      logger.error("error message");
      assertEquals(errorOutput.length, 1);
      assertStringIncludes(errorOutput[0], "ERROR");
      assertStringIncludes(errorOutput[0], "error message");
    });

    it("should respect log level hierarchy", () => {
      setGlobalLogLevel(LogLevel.WARN);
      const logger = createLogger("test");
      
      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");
      
      assertEquals(logOutput.length, 1); // Only warn
      assertEquals(errorOutput.length, 1); // Only error
      assertStringIncludes(logOutput[0], "warn");
      assertStringIncludes(errorOutput[0], "error");
    });
  });

  describe("Progress Mode", () => {
    it("should queue logs in progress mode", () => {
      const logger = createLogger("test");
      
      setProgressMode(true);
      logger.info("queued info");
      logger.error("queued error");
      
      // Logs should be queued, not output
      assertEquals(logOutput.length, 0);
      assertEquals(errorOutput.length, 0);
    });

    it("should flush queued logs when progress mode ends", () => {
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
    });

    it("should handle debug logs in progress mode", () => {
      setGlobalLogLevel(LogLevel.DEBUG);
      const logger = createLogger("test");
      
      setProgressMode(true);
      logger.debug("debug in progress");
      
      setProgressMode(false);
      // Debug logs should not be queued in progress mode
      assertEquals(logOutput.length, 0);
    });
  });

  describe("Namespace Filtering", () => {
    it("should include namespace in log output", () => {
      const logger = createLogger("my-namespace");
      
      logger.info("test message");
      assertEquals(logOutput.length, 1);
      assertStringIncludes(logOutput[0], "my-namespace");
    });
  });
});