import { Input, Confirm, Select, Secret } from "cliffy/prompt/mod.ts";
import { Command } from "cliffy/command/mod.ts";
import { colors } from "cliffy/ansi/colors.ts";
import { createLogger } from "../lib/logger.ts";
import { encodeBunkerInfo, decodeBunkerInfo, BunkerKeyManager, BunkerSigner, parseBunkerUrl } from "../lib/nip46.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { readProjectFile, writeProjectFile } from "../lib/config.ts";

const log = createLogger("bunker-cmd");

/**
 * Register the bunker command with the CLI
 */
export function registerBunkerCommand(program: Command): void {
  // Add the main bunker command with its own action
  program
    .command("bunker")
    .description("Manage NOSTR bunker connections and nbunks")
    .action(() => {
      showBunkerHelp();
    })
    // Add subcommands as child commands
    .command("list", "List all stored bunkers in the system")
    .action(() => {
      listBunkers();
    })
    .reset()
    .command("import [nbunk:string]", "Import a bunker from an nbunk string")
    .action((_, nbunk) => {
      importNbunk(nbunk);
    })
    .reset()
    .command("export [pubkey:string]", "Export a bunker as an nbunk string")
    .action((_, pubkey) => {
      exportNbunk(pubkey);
    })
    .reset()
    .command("connect [url:string]", "Connect to a bunker URL and store as nbunk")
    .action((_, url) => {
      connectBunker(url);
    })
    .reset()
    .command("use [pubkey:string]", "Configure current project to use a bunker")
    .action((_, pubkey) => {
      useBunkerForProject(pubkey);
    })
    .reset()
    .command("remove [pubkey:string]", "Remove a bunker from storage")
    .action((_, pubkey) => {
      removeBunker(pubkey);
    })
    .reset()
    .command("help", "Show detailed help information")
    .action(() => {
      showBunkerHelp();
    });
}

/**
 * Command handler for bunker subcommand
 */
export async function bunkerCommand(action: string | undefined, ...args: string[]): Promise<void> {
  if (!action) {
    await showBunkerHelp();
    return;
  }

  switch (action.toLowerCase()) {
    case "list":
      await listBunkers();
      break;
    case "import":
      await importNbunk(args[0]);
      break;
    case "export":
      await exportNbunk(args[0]);
      break;
    case "connect":
      await connectBunker(args[0]);
      break;
    case "use":
      await useBunkerForProject(args[0]);
      break;
    case "remove":
      await removeBunker(args[0]);
      break;
    case "help":
    default:
      await showBunkerHelp();
      break;
  }
}

/**
 * Show help information for the bunker command
 */
export async function showBunkerHelp(): Promise<void> {
  console.log(colors.cyan("\nBunker Command Help"));
  console.log("Usage: nsyte bunker <action> [arguments]\n");
  console.log(colors.cyan("Description:"));
  console.log("  The bunker command allows you to manage NIP-46 bunker connections and nbunks.");
  console.log("  Nbunks are encoded strings that contain all necessary information to connect to"); 
  console.log("  a NOSTR bunker. They can be used for CI/CD workflows or shared access.\n");
  
  console.log(colors.cyan("Available actions:"));
  console.log("  list                     List all stored bunkers in the system");
  console.log("  import <nbunk>           Import a bunker from an nbunk string");
  console.log("  export <pubkey>          Export a bunker as an nbunk string");
  console.log("  connect <url>            Connect to a bunker URL and store as nbunk");
  console.log("  connect --pubkey <key> --relay <url> [--secret <secret>]");
  console.log("                           Connect using separate parameters (avoids shell escaping issues)");
  console.log("  use <pubkey>             Configure current project to use a bunker");
  console.log("  remove <pubkey>          Remove a bunker from storage");
  console.log("  help                     Show this help information\n");
  
  console.log(colors.cyan("Connection examples:"));
  console.log("  nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'");
  console.log("  nsyte bunker connect --pubkey pubkey --relay wss://relay.example --secret xxx\n");
  
  console.log(colors.cyan("CI/CD Usage:"));
  console.log("  1. Use 'nsyte bunker export' to get an nbunk string");
  console.log("  2. Add the nbunk as a secret in your CI system");
  console.log("  3. Use the nbunk in CI with: nsyte upload ./dist --nbunk ${NBUNK_SECRET}\n");
  
  console.log(colors.cyan("More examples:"));
  console.log("  nsyte bunker list");
  console.log("  nsyte bunker import nbunk1q...");
  console.log("  nsyte bunker export");
  console.log("  nsyte bunker use 3bf0c63...");
  console.log("  nsyte bunker remove 3bf0c63...");
  console.log("  nsyte upload ./dist --nbunk nbunk1q...");
  console.log("");
}

/**
 * List all stored bunkers
 */
export async function listBunkers(): Promise<void> {
  const secretsManager = SecretsManager.getInstance();
  const pubkeys = secretsManager.getAllPubkeys();
  
  if (pubkeys.length === 0) {
    console.log(colors.yellow("No bunkers found in system storage."));
    return;
  }
  
  console.log(colors.cyan("\nStored Bunkers:"));
  for (const pubkey of pubkeys) {
    const nbunkString = secretsManager.getNbunk(pubkey);
    if (!nbunkString) continue;
    
    try {
      const info = decodeBunkerInfo(nbunkString);
      console.log(`- ${colors.green(pubkey.slice(0, 8) + "..." + pubkey.slice(-4))}`);
      console.log(`  Relays: ${info.relays.join(", ")}`);
    } catch (error) {
      console.log(`- ${colors.yellow(pubkey.slice(0, 8) + "..." + pubkey.slice(-4))} (Error decoding nbunk)`);
    }
  }
  
  // Check if current project is using any bunker
  const projectData = readProjectFile();
  if (projectData?.bunkerPubkey) {
    console.log(colors.cyan("\nCurrent project uses bunker:"));
    console.log(`- ${colors.green(projectData.bunkerPubkey.slice(0, 8) + "..." + projectData.bunkerPubkey.slice(-4))}`);
  } else {
    console.log(colors.yellow("\nCurrent project is not configured to use any bunker."));
  }
}

/**
 * Import a bunker from an nbunk string
 */
export async function importNbunk(nbunkString?: string): Promise<void> {
  try {
    if (!nbunkString) {
      nbunkString = await Input.prompt({
        message: "Enter the nbunk string to import:",
        validate: (input: string) => {
          return input.trim().startsWith("nbunk") || 
                "Invalid nbunk string. Must start with 'nbunk'";
        }
      });
    }
    
    // First verify the nbunk is valid by decoding it
    const info = decodeBunkerInfo(nbunkString);
    
    // Store the nbunk in the system-wide secrets
    const secretsManager = SecretsManager.getInstance();
    secretsManager.storeNbunk(info.pubkey, nbunkString);
    
    console.log(colors.green(`Successfully imported bunker with pubkey ${info.pubkey.slice(0, 8)}...`));
    
    // Ask if the user wants to use this bunker for the current project
    const useForProject = await Confirm.prompt({
      message: "Would you like to use this bunker for the current project?",
      default: true,
    });
    
    if (useForProject) {
      await useBunkerForProject(info.pubkey);
    }
    
    // Ensure process exits
    Deno.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(colors.red(`Failed to import nbunk: ${errorMessage}`));
    Deno.exit(1);
  }
}

/**
 * Export a bunker as an nbunk string
 */
export async function exportNbunk(pubkey?: string): Promise<void> {
  const secretsManager = SecretsManager.getInstance();
  
  if (!pubkey) {
    const pubkeys = secretsManager.getAllPubkeys();
    
    if (pubkeys.length === 0) {
      console.log(colors.yellow("No bunkers found in system storage."));
      return;
    }
    
    // Format pubkeys for selection
    const options = pubkeys.map(key => ({
      name: `${key.slice(0, 8)}...${key.slice(-4)}`,
      value: key
    }));
    
    const result = await Select.prompt<string>({
      message: "Select a bunker to export:",
      options,
    });
    
    pubkey = result;
  }
  
  if (!pubkey) {
    console.log(colors.red("No pubkey selected."));
    return;
  }
  
  const nbunkString = secretsManager.getNbunk(pubkey);
  if (!nbunkString) {
    console.log(colors.red(`No bunker found with pubkey ${pubkey.slice(0, 8)}...`));
    return;
  }
  
  console.log(colors.cyan("\nNbunk string for selected bunker:"));
  console.log(nbunkString);
  console.log(colors.yellow("\nStore this securely. It contains sensitive key material."));
}

/**
 * Connect to a bunker URL and store credentials
 */
export async function connectBunker(bunkerUrl?: string): Promise<void> {
  let signer = null;
  
  try {
    if (!bunkerUrl) {
      bunkerUrl = await Input.prompt({
        message: "Enter the bunker URL (bunker://...):",
        validate: (input: string) => {
          return input.trim().startsWith("bunker://") || 
                "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
        }
      });
    }
    
    // Handle the case when the URL isn't properly quoted in the shell
    if (!bunkerUrl.includes("?relay=") && !bunkerUrl.includes("&secret=")) {
      console.log(colors.yellow("The bunker URL appears to be incomplete. Shell metacharacters like ? and & need to be quoted."));
      console.log(colors.yellow("Example: nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'"));
      console.log(colors.yellow("You can also enter the URL interactively to avoid shell escaping issues.\n"));
      
      const retry = await Confirm.prompt({
        message: "Would you like to enter the bunker URL again interactively?",
        default: true,
      });
      
      if (retry) {
        return connectBunker(); // Retry with interactive prompt
      } else {
        return;
      }
    }
    
    console.log(colors.cyan("Connecting to bunker..."));
    
    // Parse the URL and extract the pubkey
    const bunkerPointer = parseBunkerUrl(bunkerUrl);
    
    // Try to connect to the bunker
    signer = await BunkerSigner.connect(bunkerUrl);
    const nbunkString = signer.getNbunkString();
    
    // Store the connection
    const secretsManager = SecretsManager.getInstance();
    secretsManager.storeNbunk(bunkerPointer.pubkey, nbunkString);
    
    console.log(colors.green(`Successfully connected to bunker ${bunkerPointer.pubkey.slice(0, 8)}... 
Generated and stored nbunk string.`));
    
    // Ask if the user wants to use this bunker for the current project
    const useForProject = await Confirm.prompt({
      message: "Would you like to use this bunker for the current project?",
      default: true,
    });
    
    if (useForProject) {
      await useBunkerForProject(bunkerPointer.pubkey);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(colors.red(`Failed to connect to bunker: ${errorMessage}`));
    
    if (errorMessage.includes("URL format") || errorMessage.includes("invalid URL")) {
      console.log(colors.yellow("\nRemember to properly quote URLs with special characters in the shell:"));
      console.log(colors.cyan("  nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'"));
    }
  } finally {
    // Make sure to clean up and disconnect properly
    if (signer) {
      try {
        console.log(colors.cyan("Disconnecting from bunker..."));
        await signer.disconnect();
        console.log(colors.green("Disconnected from bunker."));
        
        // Force disconnect unresolved event listeners and WebSocket connections
        setTimeout(() => {
          // Force exit the process after a brief delay
          // This ensures any lingering connections are properly closed
          Deno.exit(0);
        }, 500);
      } catch (err) {
        console.error(colors.red(`Error during disconnect: ${err}`));
        // Force exit even if there's an error
        Deno.exit(1);
      }
    }
  }
}

/**
 * Configure the current project to use a specific bunker
 */
export async function useBunkerForProject(pubkey?: string): Promise<void> {
  const secretsManager = SecretsManager.getInstance();
  
  if (!pubkey) {
    const pubkeys = secretsManager.getAllPubkeys();
    
    if (pubkeys.length === 0) {
      console.log(colors.yellow("No bunkers found in system storage."));
      return;
    }
    
    // Format pubkeys for selection
    const options = pubkeys.map(key => ({
      name: `${key.slice(0, 8)}...${key.slice(-4)}`,
      value: key
    }));
    
    const result = await Select.prompt<string>({
      message: "Select a bunker to use for this project:",
      options,
    });
    
    pubkey = result;
  }
  
  if (!pubkey) {
    console.log(colors.red("No pubkey selected."));
    return;
  }
  
  const nbunkString = secretsManager.getNbunk(pubkey);
  if (!nbunkString) {
    console.log(colors.red(`No bunker found with pubkey ${pubkey.slice(0, 8)}...`));
    return;
  }
  
  // Read current project config
  const projectData = readProjectFile();
  if (!projectData) {
    console.log(colors.red("No project configuration found. Initialize a project first with 'nsyte init'."));
    return;
  }
  
  // Update project config with the bunker pubkey
  projectData.bunkerPubkey = pubkey;
  writeProjectFile(projectData);
  
  console.log(colors.green(`Project configured to use bunker with pubkey ${pubkey.slice(0, 8)}...`));
}

/**
 * Remove a bunker from storage
 */
export async function removeBunker(pubkey?: string): Promise<void> {
  const secretsManager = SecretsManager.getInstance();
  
  if (!pubkey) {
    const pubkeys = secretsManager.getAllPubkeys();
    
    if (pubkeys.length === 0) {
      console.log(colors.yellow("No bunkers found in system storage."));
      return;
    }
    
    // Format pubkeys for selection
    const options = pubkeys.map(key => ({
      name: `${key.slice(0, 8)}...${key.slice(-4)}`,
      value: key
    }));
    
    const result = await Select.prompt<string>({
      message: "Select a bunker to remove:",
      options,
    });
    
    pubkey = result;
  }
  
  if (!pubkey) {
    console.log(colors.red("No pubkey selected."));
    return;
  }
  
  // Confirm deletion
  const confirm = await Confirm.prompt({
    message: `Are you sure you want to remove bunker ${pubkey.slice(0, 8)}...?`,
    default: false,
  });
  
  if (!confirm) {
    console.log(colors.yellow("Operation cancelled."));
    return;
  }
  
  // Delete from system storage
  const deleted = secretsManager.deleteNbunk(pubkey);
  
  if (deleted) {
    console.log(colors.green(`Bunker ${pubkey.slice(0, 8)}... removed from system storage.`));
    
    // Check if current project is using this bunker
    const projectData = readProjectFile();
    if (projectData?.bunkerPubkey === pubkey) {
      // Ask if user wants to remove it from project config
      const removeFromProject = await Confirm.prompt({
        message: "This bunker is used by the current project. Remove it from project configuration?",
        default: true,
      });
      
      if (removeFromProject) {
        delete projectData.bunkerPubkey;
        writeProjectFile(projectData);
        console.log(colors.green("Bunker removed from project configuration."));
      }
    }
  } else {
    console.log(colors.yellow(`No bunker found with pubkey ${pubkey.slice(0, 8)}...`));
  }
}

// When the script is run directly, execute the bunker command with the arguments
if (import.meta.main) {
  if (Deno.args.length > 0) {
    await bunkerCommand(Deno.args[0], ...Deno.args.slice(1));
  } else {
    await showBunkerHelp();
  }
} 