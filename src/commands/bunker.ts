import { Input, Confirm, Select, Secret } from "@cliffy/prompt";
import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { createLogger } from "../lib/logger.ts";
import { decodeBunkerInfo, BunkerSigner, parseBunkerUrl } from "../lib/nip46.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { readProjectFile, writeProjectFile } from "../lib/config.ts";

const log = createLogger("bunker-cmd");

/**
 * Register the bunker command with the CLI
 */
export function registerBunkerCommand(program: Command): void {
  program
    .command("bunker")
    .description("Manage nostr bunker connections and nbunks")
    .action(() => {
      showBunkerHelp();
    })
    .command("list", "List all stored bunkers in the system")
    .action(() => {
      listBunkers();
    })
    .reset()
    .command("import [nbunksec:string]", "Import a bunker from an nbunksec string")
    .action((_: unknown, nbunksec: string | undefined) => {
      if (nbunksec !== undefined) {
        importNbunk(nbunksec);
      } else {
        importNbunk();
      }
    })
    .reset()
    .command("export [pubkey:string]", "Export a bunker as an nbunksec string")
    .action((_: unknown, pubkey: string | undefined) => {
      exportNbunk(pubkey);
    })
    .reset()
    .command("connect [url:string]", "Connect to a bunker URL and store as nbunksec")
    .action((_: unknown, url: string | undefined) => {
      if (url !== undefined) {
        connectBunker(url);
      } else {
        connectBunker();
      }
    })
    .reset()
    .command("use [pubkey:string]", "Configure current project to use a bunker")
    .action((_: unknown, pubkey: string | undefined) => {
      useBunkerForProject(pubkey);
    })
    .reset()
    .command("remove [pubkey:string]", "Remove a bunker from storage")
    .action((_: unknown, pubkey: string | undefined) => {
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
  console.log("  a nostr bunker. They can be used for CI/CD workflows or shared access.\n");
  
  console.log(colors.cyan("Available actions:"));
  console.log("  list                     List all stored bunkers in the system");
  console.log("  import <nbunksec>           Import a bunker from an nbunksec string");
  console.log("  export <pubkey>          Export a bunker as an nbunksec string");
  console.log("  connect <url>            Connect to a bunker URL and store as nbunksec");
  console.log("  connect --pubkey <key> --relay <url> [--secret <secret>]");
  console.log("                           Connect using separate parameters (avoids shell escaping issues)");
  console.log("  use <pubkey>             Configure current project to use a bunker");
  console.log("  remove <pubkey>          Remove a bunker from storage");
  console.log("  help                     Show this help information\n");
  
  console.log(colors.cyan("Connection examples:"));
  console.log("  nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'");
  console.log("  nsyte bunker connect --pubkey pubkey --relay wss://relay.example --secret xxx\n");
  
  console.log(colors.cyan("CI/CD Usage:"));
  console.log("  1. Use 'nsyte bunker export' to get an nbunksec string");
  console.log("  2. Add the nbunksec as a secret in your CI system");
  console.log("  3. Use the nbunksec in CI with: nsyte upload ./dist --nbunksec ${NBUNK_SECRET}\n");
  
  console.log(colors.cyan("More examples:"));
  console.log("  nsyte bunker list");
  console.log("  nsyte bunker import nbunksec1q...");
  console.log("  nsyte bunker export");
  console.log("  nsyte bunker use 3bf0c63...");
  console.log("  nsyte bunker remove 3bf0c63...");
  console.log("  nsyte upload ./dist --nbunksec nbunksec1q...");
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
      console.log(`- ${colors.green(pubkey)}`);
      console.log(`  Relays: ${info.relays.join(", ")}`);
    } catch (error) {
      console.log(`- ${colors.yellow(pubkey.slice(0, 8) + "..." + pubkey.slice(-4))} (Error decoding nbunksec)`);
    }
  }
  
  const projectData = readProjectFile();
  if (projectData?.bunkerPubkey) {
    console.log(colors.cyan("\nCurrent project uses bunker:"));
    console.log(`- ${colors.green(projectData.bunkerPubkey)}`);
  } else {
    console.log(colors.yellow("\nCurrent project is not configured to use any bunker."));
  }
}

/**
 * Import a bunker from an nbunksec string
 */
export async function importNbunk(nbunkString?: string): Promise<void> {
  try {
    if (!nbunkString) {
      nbunkString = await Input.prompt({
        message: "Enter the nbunksec string to import:",
        validate: (input: string) => {
          return input.trim().startsWith("nbunksec") || 
                "Invalid nbunksec string. Must start with 'nbunksec'";
        }
      });
    }

    if (!nbunkString) {
      console.log(colors.yellow("Import cancelled."));
      Deno.exit(0);
      return;
    }
    
    const info = decodeBunkerInfo(nbunkString);
    
    const secretsManager = SecretsManager.getInstance();
    secretsManager.storeNbunk(info.pubkey, nbunkString);
    
    console.log(colors.green(`Successfully imported bunker with pubkey ${info.pubkey.slice(0, 8)}...`));
    
    const useForProject = await Confirm.prompt({
      message: "Would you like to use this bunker for the current project?",
      default: true,
    });
    
    if (useForProject) {
      await useBunkerForProject(info.pubkey);
    }
    
    Deno.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(colors.red(`Failed to import nbunksec: ${errorMessage}`));
    Deno.exit(1);
  }
}

/**
 * Export a bunker as an nbunksec string
 */
export async function exportNbunk(pubkey?: string): Promise<void> {
  const secretsManager = SecretsManager.getInstance();
  
  if (!pubkey) {
    const pubkeys = secretsManager.getAllPubkeys();
    
    if (pubkeys.length === 0) {
      console.log(colors.yellow("No bunkers found in system storage."));
      return;
    }
    
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
  let signer: BunkerSigner | null = null;
  let bunkerPubkey: string | null = null;
  let operationError: Error | null = null;

  try {
    if (!bunkerUrl) {
      const choice = await Select.prompt<string>({
        message: "How would you like to connect to the bunker?",
        options: [
          { name: "Scan QR Code (Nostr Connect)", value: "qr" },
          { name: "Enter Bunker URL manually", value: "url" },
        ],
      });

      if (choice === "qr") {
        const appName = "nsyte";
        const defaultRelays = ["wss://relay.nsec.app"];
        
        const relayInput = await Input.prompt({
          message: `Enter relays (comma-separated), or press Enter for default (${defaultRelays.join(", ")}):`,
          default: defaultRelays.join(", "),
        });

        let chosenRelays: string[];
        if (relayInput.trim() === "" || relayInput.trim() === defaultRelays.join(", ")) {
          chosenRelays = defaultRelays;
        } else {
          chosenRelays = relayInput.split(",").map(r => r.trim()).filter(r => r.length > 0);
        }

        if (chosenRelays.length === 0) {
          console.log(colors.yellow("No relays provided. Using default relays."));
          chosenRelays = defaultRelays;
        }

        console.log(colors.cyan(`Initiating Nostr Connect as '${appName}' on relays: ${chosenRelays.join(', ')}`));
        signer = await BunkerSigner.initiateNostrConnect(appName, chosenRelays);
        bunkerPubkey = signer.getPublicKey();
      } else if (choice === "url") {
        bunkerUrl = await Input.prompt({
          message: "Enter the bunker URL (bunker://...):",
          validate: (input: string) => {
            return input.trim().startsWith("bunker://") ||
                  "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
          }
        });
      } else {
        console.log(colors.yellow("Invalid choice. Exiting."));
        return;
      }
    }

    if (bunkerUrl && !signer) {
      if (!bunkerUrl.includes("?relay=") && !bunkerUrl.includes("&secret=")) {
        console.log(colors.yellow("The bunker URL appears to be incomplete. Shell metacharacters like ? and & need to be quoted."));
        console.log(colors.yellow("Example: nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'"));
        console.log(colors.yellow("You can also enter the URL interactively to avoid shell escaping issues.\n"));
        
        const retry = await Confirm.prompt({
          message: "Would you like to enter the bunker URL again interactively?",
          default: true,
        });
        
        if (retry) {
          return connectBunker();
        } else {
          return;
        }
      }
      
      console.log(colors.cyan("Connecting to bunker via URL..."));
      
      const parsedPointer = parseBunkerUrl(bunkerUrl);
      bunkerPubkey = parsedPointer.pubkey;
      signer = await BunkerSigner.connect(bunkerUrl);
    }

    if (!signer || !bunkerPubkey) {
      console.log(colors.red("Failed to establish a signer connection."));
      Deno.exit(1);
      return;
    }
    
    const nbunkString = signer.getNbunkString();
    
    const secretsManager = SecretsManager.getInstance();
    secretsManager.storeNbunk(bunkerPubkey, nbunkString);
    
    console.log(colors.green(`Successfully connected to bunker ${bunkerPubkey.slice(0, 8)}... 
Generated and stored nbunksec string.`));
    
    const useForProject = await Confirm.prompt({
      message: "Would you like to use this bunker for the current project?",
      default: true,
    });
    
    if (useForProject) {
      await useBunkerForProject(bunkerPubkey);
    }
  } catch (error: unknown) {
    operationError = error instanceof Error ? error : new Error(String(error));
    const errorMessage = operationError.message;
    console.log(colors.red(`Failed to connect to bunker: ${errorMessage}`));
    
    if (errorMessage.includes("URL format") || errorMessage.includes("invalid URL")) {
      console.log(colors.yellow("\nRemember to properly quote URLs with special characters in the shell:"));
      console.log(colors.cyan("  nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'"));
    }
  } finally {
    if (signer) {
      try {
        console.log(colors.cyan("Disconnecting from bunker..."));
        await signer.disconnect();
        console.log(colors.green("Disconnected from bunker."));
      } catch (err) {
        console.error(colors.red(`Error during disconnect: ${err}`));
      }
      
      if (!operationError) {
         Deno.exit(0);
      } else {
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
  
  const projectData = readProjectFile();
  if (!projectData) {
    console.log(colors.red("No project configuration found. Initialize a project first with 'nsyte init'."));
    return;
  }
  
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
  
  const confirm = await Confirm.prompt({
    message: `Are you sure you want to remove bunker ${pubkey.slice(0, 8)}...?`,
    default: false,
  });
  
  if (!confirm) {
    console.log(colors.yellow("Operation cancelled."));
    return;
  }
  
  const deleted = secretsManager.deleteNbunk(pubkey);
  
  if (deleted) {
    console.log(colors.green(`Bunker ${pubkey.slice(0, 8)}... removed from system storage.`));
    
    const projectData = readProjectFile();
    if (projectData?.bunkerPubkey === pubkey) {
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

if (import.meta.main) {
  if (Deno.args.length > 0) {
    await bunkerCommand(Deno.args[0], ...Deno.args.slice(1));
  } else {
    await showBunkerHelp();
  }
} 