import { colors } from "@cliffy/ansi/colors";
import { getDisplayManager } from "./display-mode.ts";
import { join } from "@std/path";

let inProgressMode = false;

// File logging setup
const LOG_LEVEL = Deno.env.get("LOG_LEVEL") || "info";
const FILE_LOGGING_ENABLED = LOG_LEVEL === "debug";
let logFile: string | null = null;
let logFileHandle: Deno.FsFile | null = null;

// Initialize log file if debug logging is enabled
if (FILE_LOGGING_ENABLED) {
  const tempDir = Deno.env.get("TMPDIR") || Deno.env.get("TMP") || Deno.env.get("TEMP") || "/tmp";
  logFile = join(tempDir, "nsyte.log");
  
  try {
    // Create or truncate the log file
    logFileHandle = await Deno.open(logFile, {
      create: true,
      write: true,
      truncate: true,
    });
    
    // Write initial log entry
    const timestamp = new Date().toISOString();
    const initialMessage = `${timestamp} [INFO] logger: Debug logging enabled - writing to ${logFile}\n`;
    await logFileHandle.write(new TextEncoder().encode(initialMessage));
    console.log(colors.gray(`Debug logging enabled - writing to ${logFile}`));
  } catch (error) {
    console.error(colors.red(`Failed to initialize log file: ${error}`));
    logFile = null;
    logFileHandle = null;
  }
}

/**
 * Write a log message to the file if file logging is enabled
 */
async function writeToLogFile(level: string, namespace: string, message: string): Promise<void> {
  if (!logFileHandle || !logFile) return;
  
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${level.toUpperCase()}] ${namespace}: ${message}\n`;
    await logFileHandle.write(new TextEncoder().encode(logEntry));
    await logFileHandle.sync(); // Ensure it's written to disk
  } catch (error) {
    // Silently fail to avoid recursive logging issues
  }
}

/**
 * Set whether we're in progress mode
 * When in progress mode, INFO and ERROR logs will be collected but not immediately displayed
 */
export function setProgressMode(enabled: boolean): void {
  inProgressMode = enabled;
}

/**
 * Store logs that occur during progress mode
 */
const queuedLogs: Array<{ level: string; namespace: string; message: string }> = [];

/**
 * Flush queued logs
 */
export function flushQueuedLogs(): void {
  const displayManager = getDisplayManager();

  if (displayManager.isInteractive() && !displayManager.isDebug()) {
    queuedLogs.length = 0;
    return;
  }

  for (const log of queuedLogs) {
    if (log.level === "error") {
      console.error(formatLogMessage(log.level, log.namespace, log.message));
    } else {
      console.log(formatLogMessage(log.level, log.namespace, log.message));
    }
  }
  queuedLogs.length = 0;
}

/**
 * Format a log message
 */
function formatLogMessage(level: string, namespace: string, message: string): string {
  switch (level) {
    case "debug":
      return `[${colors.gray("DEBUG")}] ${colors.gray(namespace)}: ${message}`;
    case "info":
      return `[${colors.green("INFO")}] ${colors.cyan(namespace)}: ${message}`;
    case "warn":
      return `[${colors.yellow("WARN")}] ${colors.yellow(namespace)}: ${message}`;
    case "error":
      return `[${colors.red("ERROR")}] ${colors.red(namespace)}: ${message}`;
    case "success":
      return `[${colors.green("SUCCESS")}] ${colors.green(namespace)}: ${message}`;
    default:
      return `[${level.toUpperCase()}] ${namespace}: ${message}`;
  }
}

/**
 * Check if we should show the log based on display mode
 */
function shouldShowLog(level: string): boolean {
  const displayManager = getDisplayManager();

  if (displayManager.isInteractive() && !displayManager.isDebug() && level !== "error") {
    return false;
  }

  return true;
}

/**
 * Create a logger for a specific namespace
 */
export function createLogger(namespace: string) {
  const logLevel = Deno.env.get("LOG_LEVEL") || "info";

  const shouldLog = (level: string): boolean => {
    const levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      none: 4,
    };

    return levels[level as keyof typeof levels] >= levels[logLevel as keyof typeof levels];
  };

  return {
    debug(message: string): void {
      if (shouldLog("debug")) {
        // Always write debug messages to file if file logging is enabled
        writeToLogFile("debug", namespace, message);
        
        if (shouldShowLog("debug")) {
          console.log(formatLogMessage("debug", namespace, message));
        }
      }
    },

    info(message: string): void {
      if (shouldLog("info")) {
        // Always write to file if file logging is enabled
        writeToLogFile("info", namespace, message);
        
        if (inProgressMode) {
          queuedLogs.push({ level: "info", namespace, message });
        } else if (shouldShowLog("info")) {
          console.log(formatLogMessage("info", namespace, message));
        }
      }
    },

    warn(message: string): void {
      if (shouldLog("warn")) {
        // Always write to file if file logging is enabled
        writeToLogFile("warn", namespace, message);
        
        if (inProgressMode) {
          queuedLogs.push({ level: "warn", namespace, message });
        } else if (shouldShowLog("warn")) {
          console.log(formatLogMessage("warn", namespace, message));
        }
      }
    },

    error(message: string): void {
      if (shouldLog("error")) {
        // Always write to file if file logging is enabled
        writeToLogFile("error", namespace, message);
        
        if (inProgressMode) {
          queuedLogs.push({ level: "error", namespace, message });
        } else if (shouldShowLog("error")) {
          console.error(formatLogMessage("error", namespace, message));
        }
      }
    },

    success(message: string): void {
      // Always write to file if file logging is enabled
      writeToLogFile("success", namespace, message);
      
      if (shouldShowLog("success")) {
        console.log(formatLogMessage("success", namespace, message));
      }
    },
  };
}

export const log = createLogger("nsite");

/**
 * Get the current log file path (if file logging is enabled)
 */
export function getLogFilePath(): string | null {
  return logFile;
}

/**
 * Cleanup function to close the log file handle
 */
export async function cleanupLogger(): Promise<void> {
  if (logFileHandle) {
    try {
      await logFileHandle.close();
    } catch (error) {
      // Silently ignore errors during cleanup
    }
    logFileHandle = null;
  }
}
