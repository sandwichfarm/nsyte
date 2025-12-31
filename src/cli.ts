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

import { Command } from "@cliffy/command";
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
import { validateCommand } from "./commands/validate.ts";
import { cleanupConfigFiles } from "./lib/config-cleanup.ts";
import { createLogger } from "./lib/logger.ts";
import { version } from "./version.ts";

import { registerBunkerCommand } from "./commands/bunker-cliffy.ts";
import { handleBunkerCommand } from "./commands/bunker.ts";

const log = createLogger("cli");

const nsite = new Command()
  .name("nsyte")
  .version(version)
  .description("Publish your site to nostr and blossom servers")
  .action(async () => {
    // Just show help when no command is provided
    await nsite.showHelp();
  });

// Register all commands
registerInitCommand(nsite);
registerDeployCommand(nsite);
registerListCommand(nsite);
registerBrowseCommand(nsite);
registerDownloadCommand(nsite);
registerCICommand(nsite);
registerRunCommand(nsite);
registerServeCommand(nsite);
registerPurgeCommand(nsite);
validateCommand(nsite);
registerDebugCommand(nsite);
registerAnnounceCommand(nsite);
registerConfigCommand(nsite);
registerBunkerCommand(nsite);

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
      await handleBunkerCommand(false);
      return;
    }

    await nsite.parse(Deno.args);
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
