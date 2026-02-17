#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env

self.addEventListener("unhandledrejection", (event) => {
  if (
    event.reason &&
    event.reason.message &&
    (event.reason.message.includes("rate-limit") ||
      event.reason.message.includes("noting too much"))
  ) {
    console.warn(`Rate limiting detected: ${event.reason.message}`);

    event.preventDefault();
  }
});

import { existsSync } from "@std/fs/exists";
import { join } from "@std/path";
import { registerAnnounceCommand } from "./commands/announce.ts";
import { registerBrowseCommand } from "./commands/browse.ts";
import { registerCICommand } from "./commands/ci.ts";
import { registerConfigCommand } from "./commands/config.ts";
import { registerDebugCommand } from "./commands/debug.ts";
import { registerDeployCommand } from "./commands/deploy.ts";
import { registerDownloadCommand } from "./commands/download.ts";
import { registerInitCommand } from "./commands/init.ts";
import { registerListCommand } from "./commands/list.ts";
import { registerPurgeCommand } from "./commands/purge.ts";
import { registerRunCommand } from "./commands/run.ts";
import { registerServeCommand } from "./commands/serve.ts";
import { registerSitesCommand } from "./commands/sites.ts";
import { registerValidateCommand } from "./commands/validate.ts";
import nsyte from "./commands/root.ts";
import { cleanupConfigFiles } from "./lib/config-cleanup.ts";
import { createLogger } from "./lib/logger.ts";
import { pool } from "./lib/nostr.ts";

import { registerBunkerCommand } from "./commands/bunker-cliffy.ts";
import { handleBunkerCommand } from "./commands/bunker.ts";

const log = createLogger("cli");

// Register all commands
registerInitCommand();
registerDeployCommand();
registerListCommand();
registerSitesCommand();
registerBrowseCommand();
registerDownloadCommand();
registerCICommand();
registerRunCommand();
registerServeCommand();
registerPurgeCommand();
registerValidateCommand();
registerDebugCommand();
registerAnnounceCommand();
registerConfigCommand();
registerBunkerCommand();

/**
 * Main function - the entry point for the command line
 */
async function main() {
  try {
    // Clean up any invalid config files on startup
    try {
      const currentDir = Deno.cwd();
      // Only run cleanup if we're in a project directory (has .nsite folder)
      if (existsSync(join(currentDir, ".nsite"))) {
        await cleanupConfigFiles(false); // Non-interactive cleanup
      }
    } catch (error) {
      log.debug(`Config cleanup check failed: ${error}`);
    }

    // Intercept bunker commands before cliffy to preserve control flow
    // The bunker command requires complex async handling that doesn't work well
    // with cliffy's execution model. We register it with cliffy for help display
    // but handle execution directly to maintain proper timeout and cleanup behavior.
    if (Deno.args.length > 0 && Deno.args[0] === "bunker") {
      await handleBunkerCommand();
      return;
    }

    await nsyte.parse(Deno.args);

    // Close relays after command execution
    log.debug("Closing relays");
    await Promise.all(Array.from(pool.relays.values()).map((r) => r.close()));
    log.debug("Relays closed");

    // TODO: This should be removed once we figure out what is keeping the process alive
    Deno.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`CLI error: ${errorMessage}`);
    console.error(`Error: ${errorMessage}`);
    Deno.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  Deno.exit(1);
});
