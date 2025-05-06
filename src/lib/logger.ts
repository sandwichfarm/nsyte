import { colors } from "@cliffy/ansi/colors";
import { getDisplayManager, DisplayMode } from "./display-mode.ts";

let inProgressMode = false;

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
      if (shouldLog("debug") && shouldShowLog("debug")) {
        console.log(formatLogMessage("debug", namespace, message));
      }
    },
    
    info(message: string): void {
      if (shouldLog("info")) {
        if (inProgressMode) {
          queuedLogs.push({ level: "info", namespace, message });
        } else if (shouldShowLog("info")) {
          console.log(formatLogMessage("info", namespace, message));
        }
      }
    },
    
    warn(message: string): void {
      if (shouldLog("warn")) {
        if (inProgressMode) {
          queuedLogs.push({ level: "warn", namespace, message });
        } else if (shouldShowLog("warn")) {
          console.log(formatLogMessage("warn", namespace, message));
        }
      }
    },
    
    error(message: string): void {
      if (shouldLog("error")) {
        if (inProgressMode) {
          queuedLogs.push({ level: "error", namespace, message });
        } else if (shouldShowLog("error")) {
          console.error(formatLogMessage("error", namespace, message));
        }
      }
    },
    
    success(message: string): void {
      if (shouldShowLog("success")) {
        console.log(formatLogMessage("success", namespace, message));
      }
    },
  };
}

export const log = createLogger("nsite"); 