#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env

// Global error handler for uncaught promise rejections and exceptions
// This will prevent rate-limiting errors from crashing the entire process
self.addEventListener("unhandledrejection", (event) => {
  // Check if it's a rate limiting error
  if (event.reason && 
      event.reason.message && 
      (event.reason.message.includes("rate-limit") || 
       event.reason.message.includes("noting too much"))) {
    
    console.warn(`Rate limiting detected: ${event.reason.message}`);
    
    // Prevent the error from crashing the process
    event.preventDefault();
  }
});

import { Command } from "cliffy/command/mod.ts";
import { colors } from "cliffy/ansi/colors.ts";
import { registerUploadCommand } from "./commands/upload.ts";
import { registerLsCommand } from "./commands/ls.ts";
import { registerDownloadCommand } from "./commands/download.ts";
import { setupProject } from "./lib/config.ts";
import { createLogger } from "./lib/logger.ts";
import { header } from "./lib/header.ts";
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

// Create the main command
const nsite = new Command()
  .name("nsyte")
  .version("0.2.0") // Hard-coded for now - should come from version.ts
  .description("Publish your site to NOSTR and blossom servers");

// Register standard commands
registerUploadCommand(nsite);
registerLsCommand(nsite);
registerDownloadCommand(nsite);

// Create bunker as a separate command object, then add it to nsite
const bunkerCommand = new Command()
  .name("bunker")
  .description("Manage NOSTR bunker connections and nbunks")
  .action(async () => {
    showBunkerHelp();
  });

// Add subcommands to the bunker command
bunkerCommand
  .command("list", "List all stored bunkers in the system")
  .action(async () => {
    listBunkers();
  });

bunkerCommand
  .command("import [nbunksec:string]", "Import a bunker from an nbunksec string")
  .action(async (_, nbunksec) => {
    importNbunk(nbunksec);
  });

bunkerCommand
  .command("export [pubkey:string]", "Export a bunker as an nbunksec string")
  .action(async (_, pubkey) => {
    exportNbunk(pubkey);
  });

bunkerCommand
  .command("connect [url:string]", "Connect to a bunker URL and store as nbunksec")
  .action(async (_, url) => {
    connectBunker(url);
  });

bunkerCommand
  .command("use [pubkey:string]", "Configure current project to use a bunker")
  .action(async (_, pubkey) => {
    useBunkerForProject(pubkey);
  });

bunkerCommand
  .command("remove [pubkey:string]", "Remove a bunker from storage")
  .action(async (_, pubkey) => {
    removeBunker(pubkey);
  });

bunkerCommand
  .command("help", "Show detailed help information")
  .action(async () => {
    showBunkerHelp();
  });

// Add the bunker command to the main program
nsite.command("bunker", bunkerCommand);

// Main action for root command - only runs when no subcommand is specified
nsite.action(async () => {
  // This action only runs when no valid subcommand is given
  try {
    // Skip setup if we're showing help or version
    if (Deno.args.includes("-h") || Deno.args.includes("--help") || 
        Deno.args.includes("-V") || Deno.args.includes("--version")) {
      await nsite.showHelp();
      return;
    }
    
    const { projectData, privateKey } = await setupProject();
    
    if (privateKey || projectData.bunkerPubkey) {
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

/**
 * Display the nsyte header in a random color
 */
function displayColorfulHeader() {
  // List of available color functions
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
  
  // Select a random color function
  const randomColorFn = colorFunctions[Math.floor(Math.random() * colorFunctions.length)];
  
  // Display the header in the random color
  console.log(randomColorFn(header));
}

/**
 * Main function - the entry point for the command line
 */
async function main() {
  try {
    // Display the colorful header
    displayColorfulHeader();
    
    // Handle bunker command specially to avoid setup
    if (Deno.args.length > 0 && Deno.args[0] === "bunker") {
      // Use bunkerCommand directly without triggering setup
      await handleBunkerCommand(false); // Pass false to skip header display
      return;
    }
    
    // For help flags, skip the setup
    const isHelp = Deno.args.includes("-h") || Deno.args.includes("--help") || 
                  Deno.args.includes("-V") || Deno.args.includes("--version");
    
    // For other commands, we need to initialize the project
    if (!isHelp) {
      const { projectData, privateKey } = await setupProject(isHelp);
    }
    
    // Parse arguments and run command
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
    // Display the colorful header for bunker commands if not already shown
    if (showHeader) {
      displayColorfulHeader();
    }
    
    if (Deno.args.length === 1 || Deno.args.includes("-h") || Deno.args.includes("--help")) {
      // Just show bunker help
      showBunkerHelp();
      // Force exit for help command
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
        // importNbunk already handles its own exit
        break;
      case "export":
        await exportNbunk(args[0]);
        Deno.exit(0);
        break;
      case "connect":
        // Handle special case for connect to support separate parameters
        if (args.length > 0 && !args[0].startsWith("-")) {
          // Standard URL approach
          await connectBunker(args[0]);
          // connectBunker has its own exit handling
        } else {
          // Allow for separate parameters to avoid shell escaping issues
          let pubkey = "";
          let relay = "";
          let secret = "";
          
          // Extract parameters
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
          
          // Construct the URL if we have the required parts
          if (pubkey && relay) {
            const url = `bunker://${pubkey}?relay=${encodeURIComponent(relay)}${secret ? `&secret=${secret}` : ''}`;
            await connectBunker(url);
            // connectBunker has its own exit handling
          } else {
            // Not enough parameters, use interactive mode
            await connectBunker();
            // connectBunker has its own exit handling
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
    
    // Default exit at the end as a fallback
    setTimeout(() => {
      Deno.exit(0);
    }, 500);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error in bunker command: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));
    // Exit with error code on exceptions
    Deno.exit(1);
  }
}

// Run the CLI
main().catch((err) => {
  console.error("Unexpected error:", err);
  Deno.exit(1);
}); 