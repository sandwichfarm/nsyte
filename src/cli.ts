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
import { setupProject } from "./lib/config.ts";
import { createLogger } from "./lib/logger.ts";
import { header } from "./ui/header.ts";
import { version } from "./version.ts";

import { 
  bunkerCommand as bunkerCommandHandler, 
  listBunkers, 
  importNbunk, 
  exportNbunk, 
  connectBunker, 
  useBunkerForProject, 
  removeBunker, 
  showBunkerHelp 
} from "./commands/bunker.ts";

const log = createLogger("cli");

const nsite = new Command()
  .name("nsyte")
  .version(version)
  .description("Publish your site to nostr and blossom servers");

registerUploadCommand(nsite);
registerLsCommand(nsite);
registerDownloadCommand(nsite);

const bunkerCommand = new Command()
  .name("bunker")
  .description("Manage nostr bunker connections and nbunks")
  .action(async () => {
    await showBunkerHelp();
  });

bunkerCommand
  .command("list", "List all stored bunkers in the system")
  .action(async () => {
    await listBunkers();
  });

bunkerCommand
  .command("import [nbunksec:string]", "Import a bunker from an nbunksec string")
  .action(async (_: unknown, nbunksec: string | undefined) => {
    await importNbunk(nbunksec);
  });

bunkerCommand
  .command("export [pubkey:string]", "Export a bunker as an nbunksec string")
  .action(async (_: unknown, pubkey: string | undefined) => {
    await exportNbunk(pubkey);
  });

bunkerCommand
  .command("connect [url:string]", "Connect to a bunker URL and store as nbunksec")
  .action(async (_: unknown, url: string | undefined) => {
    await connectBunker(url);
  });

bunkerCommand
  .command("use [pubkey:string]", "Configure current project to use a bunker")
  .action(async (_: unknown, pubkey: string | undefined) => {
    await useBunkerForProject(pubkey);
  });

bunkerCommand
  .command("remove [pubkey:string]", "Remove a bunker from storage")
  .action(async (_: unknown, pubkey: string | undefined) => {
    await removeBunker(pubkey);
  });

bunkerCommand
  .command("help", "Show detailed help information")
  .action(async () => {
    await showBunkerHelp();
  });

nsite.command("bunker", bunkerCommand);

nsite.action(async () => {
  try {
    if (Deno.args.includes("-h") || Deno.args.includes("--help") || 
        Deno.args.includes("-V") || Deno.args.includes("--version")) {
      await nsite.showHelp();
      return;
    }
    
    const { config, privateKey } = await setupProject();
    
    if (privateKey || config.bunkerPubkey) {
      const keyType = privateKey ? "private key" : "bunker connection";
      const relayCount = config.relays.length;
      const serverCount = config.servers.length;
      
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

/**
 * Handle bunker commands directly without going through setupProject
 */
async function handleBunkerCommand(showHeader = true): Promise<void> {
  try {
    if (showHeader) {
      displayColorfulHeader();
    }
    
    if (Deno.args.length === 1 || Deno.args.includes("-h") || Deno.args.includes("--help")) {
      showBunkerHelp();
      Deno.exit(0);
      return;
    }
    
    const subcommand = Deno.args[1];
    const args = Deno.args.slice(2);
    
    switch (subcommand) {
      case "list":
        await listBunkers();
        Deno.exit(0);
        break;
      case "import":
        await importNbunk(args[0]);
        break;
      case "export":
        await exportNbunk(args[0]);
        Deno.exit(0);
        break;
      case "connect":
        if (args.length > 0 && !args[0].startsWith("-")) {
          await connectBunker(args[0]);
        } else {
          let pubkey = "";
          let relay = "";
          let secret = "";
          
          for (let i = 0; i < args.length; i++) {
            if (args[i] === "--pubkey" && i + 1 < args.length) {
              pubkey = args[i + 1];
              i++;
            } else if (args[i] === "--relay" && i + 1 < args.length) {
              relay = args[i + 1];
              i++;
            } else if (args[i] === "--secret" && i + 1 < args.length) {
              secret = args[i + 1];
              i++;
            }
          }
          
          if (pubkey && relay) {
            const url = `bunker://${pubkey}?relay=${encodeURIComponent(relay)}${secret ? `&secret=${secret}` : ''}`;
            await connectBunker(url);
          } else {
            await connectBunker();
          }
        }
        break;
      case "use":
        await useBunkerForProject(args[0]);
        Deno.exit(0);
        break;
      case "remove":
        await removeBunker(args[0]);
        Deno.exit(0);
        break;
      case "help":
        showBunkerHelp();
        Deno.exit(0);
        break;
      default:
        console.log(colors.red(`Unknown bunker subcommand: ${subcommand}`));
        showBunkerHelp();
        Deno.exit(1);
        break;
    }
    
    setTimeout(() => {
      Deno.exit(0);
    }, 500);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error in bunker command: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));
    Deno.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  Deno.exit(1);
}); 