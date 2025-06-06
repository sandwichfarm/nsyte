#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env

self.addEventListener("unhandledrejection", (event) => {
  if (event.reason && 
      event.reason.message && 
      (event.reason.message.includes("rate-limit") || 
       event.reason.message.includes("noting too much"))) {
    
    console.warn(`Rate limiting detected: ${event.reason.message}`);
    
    event.preventDefault();
  }
});

import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { registerUploadCommand } from "./commands/upload.ts";
import { registerLsCommand } from "./commands/ls.ts";
import { registerDownloadCommand } from "./commands/download.ts";
import { registerCICommand } from "./commands/ci.ts";
import { registerInitCommand } from "./commands/init.ts";
import { registerRunCommand } from "./commands/run.ts";
import { setupProject } from "./lib/config.ts";
import { createLogger } from "./lib/logger.ts";
import { header } from "./ui/header.ts";
import { version } from "./version.ts";

// import { 
//   // bunkerCommand as bunkerCommandHandler, 
//   listBunkers, 
//   importNbunk, 
//   exportNbunk, 
//   connectBunker, 
//   useBunkerForProject, 
//   removeBunker, 
//   showBunkerHelp 
// } from "./commands/bunker.backup.ts";

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
registerUploadCommand(nsite);
registerLsCommand(nsite);
registerDownloadCommand(nsite);
registerCICommand(nsite);
registerRunCommand(nsite);

/**
 * Display the nsyte header in a random color
 */
function displayColorfulHeader() {
  const colorFunctions = [
    colors.red,
    colors.green,
    colors.blue,
    colors.yellow,
    colors.magenta,
    colors.cyan,
    colors.brightRed,
    colors.brightGreen,
    colors.brightBlue,
    colors.brightYellow,
    colors.brightMagenta,
    colors.brightCyan
  ];
  
  const randomColorFn = colorFunctions[Math.floor(Math.random() * colorFunctions.length)];
  
  console.log(randomColorFn(header));
}

/**
 * Main function - the entry point for the command line
 */
async function main() {
  try {
    displayColorfulHeader();
    
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