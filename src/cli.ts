#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env

import { Command } from "cliffy/command/mod.ts";
import { colors } from "cliffy/ansi/colors.ts";
import { registerUploadCommand } from "./commands/upload.ts";
import { registerLsCommand } from "./commands/ls.ts";
import { registerDownloadCommand } from "./commands/download.ts";
import { setupProject } from "./lib/config.ts";
import { version } from "../version.ts";
import { log } from "./lib/logger.ts";

// Create the main command
const nsite = new Command()
  .name("nsite-cli")
  .version(version)
  .description("Publish your site to NOSTR and blossom servers");

// Register all sub-commands
registerUploadCommand(nsite);
registerLsCommand(nsite);
registerDownloadCommand(nsite);

// Default action (shows help or project info)
nsite.action(async () => {
  try {
    const { projectData, privateKey } = await setupProject();
    
    if (privateKey || projectData.bunkerUrl) {
      const keyType = privateKey ? "private key" : "bunker connection";
      const relayCount = projectData.relays.length;
      const serverCount = projectData.servers.length;
      
      console.log(
        colors.green(`Project is set up with ${keyType}, ${relayCount} relays and ${serverCount} blossom servers.`)
      );
    }
    
    await nsite.showHelp();
  } catch (error) {
    log.error(`Error in main command: ${error}`);
    Deno.exit(1);
  }
});

// Parse command line arguments and run the appropriate command
try {
  await nsite.parse(Deno.args);
} catch (error) {
  log.error(`Failed to parse command: ${error}`);
  Deno.exit(1);
} 