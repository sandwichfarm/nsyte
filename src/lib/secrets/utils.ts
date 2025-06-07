import { join } from "@std/path";
import { ensureDirSync } from "@std/fs/ensure-dir";
import { createLogger } from "../logger.ts";

const log = createLogger("secrets");

/**
 * Get the user home directory in a cross-platform way
 */
export function getHomeDir(): string | null {
  if (Deno.build.os === "windows") {
    return Deno.env.get("USERPROFILE") || null;
  } else {
    return Deno.env.get("HOME") || null;
  }
}

/**
 * Get the appropriate system directory for storing application data
 * This follows platform conventions:
 * - Linux: ~/.config/nsite
 * - macOS: ~/Library/Application Support/nsite
 * - Windows: %APPDATA%\nsite
 */
export function getSystemConfigDir(): string | null {
  const home = getHomeDir();
  if (!home) return null;

  switch (Deno.build.os) {
    case "linux":
      const xdgConfig = Deno.env.get("XDG_CONFIG_HOME");
      return xdgConfig ? join(xdgConfig, "nsite") : join(home, ".config", "nsite");
    case "darwin":
      return join(home, "Library", "Application Support", "nsyte");
    case "windows":
      const appData = Deno.env.get("APPDATA");
      return appData ? join(appData, "nsite") : join(home, "AppData", "Roaming", "nsite");
    default:
      return join(home, ".nsite");
  }
}

/**
 * Ensures the system config directory exists
 */
export function ensureSystemConfigDir(): string | null {
  const configDir = getSystemConfigDir();
  if (!configDir) {
    log.error("Could not determine system config directory");
    return null;
  }

  try {
    ensureDirSync(configDir);
    return configDir;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to create system config directory: ${errorMessage}`);
    return null;
  }
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  try {
    const stats = Deno.statSync(filePath);
    return stats.isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
} 