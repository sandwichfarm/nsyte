/**
 * Direct bunker command implementation
 * 
 * This is a direct command handler that bypasses the Cliffy command framework.
 * It was created because the bunker command requires complex URL parsing and
 * argument handling that is difficult to implement with Cliffy's command framework.
 * 
 * Specifically:
 * 1. Complex URL parsing for bunker:// URLs with query parameters
 * 2. Interactive prompts for connection details
 * 3. Special handling of shell escaping for URLs with ? and & characters
 * 4. Direct control over command exit timing
 * 
 * The command is registered in cli.ts and intercepts all bunker commands
 * before they reach the Cliffy command framework.
 */

import { colors } from "@cliffy/ansi/colors";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { readProjectFile, writeProjectFile } from "../lib/config.ts";
import { createLogger } from "../lib/logger.ts";
import { decodeBunkerInfo, getNbunkString, initiateNostrConnect, parseBunkerUrl } from "../lib/nip46.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { NostrConnectSigner } from "npm:applesauce-signers@^1.0.0";

const log = createLogger("bunker-direct");

/**
 * Handle bunker commands directly without going through setupProject
 */
export async function handleBunkerCommand(showHeader = true): Promise<void> {
  try {
    if (Deno.args.length === 1 || Deno.args.includes("-h") || Deno.args.includes("--help")) {
      await showBunkerHelp();
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
          // Check if --no-persist is in remaining args
          const noPersist = args.includes("--no-persist");
          await connectBunker(args[0], false, noPersist);
        } else {
          let pubkey = "";
          let relay = "";
          let secret = "";
          let noPersist = false;
          
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
            } else if (args[i] === "--no-persist") {
              noPersist = true;
            }
          }
          
          if (pubkey && relay) {
            const url = `bunker://${pubkey}?relay=${encodeURIComponent(relay)}${secret ? `&secret=${secret}` : ''}`;
            await connectBunker(url, false, noPersist);
          } else {
            await connectBunker(undefined, false, noPersist);
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
  console.log("  import <nbunksec>        Import a bunker from an nbunksec string");
  console.log("  export <pubkey>          Export a bunker as an nbunksec string");
  console.log("  connect <url>            Connect to a bunker URL and store as nbunksec");
  console.log("  connect --pubkey <key> --relay <url> [--secret <secret>] [--no-persist]");
  console.log("                           Connect using separate parameters (avoids shell escaping issues)");
  console.log("                           --no-persist: Display nbunksec without storing it");
  console.log("  use <pubkey>             Configure current project to use a bunker");
  console.log("  remove <pubkey>          Remove a bunker from storage");
  console.log("  help                     Show this help information\n");

  console.log(colors.cyan("Connection examples:"));
  console.log("  nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'");
  console.log("  nsyte bunker connect --pubkey pubkey --relay wss://relay.example --secret xxx");
  console.log("  nsyte bunker connect --pubkey pubkey --relay wss://relay.example --no-persist\n");

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
  const pubkeys = await secretsManager.getAllPubkeys();

  if (pubkeys.length === 0) {
    console.log(colors.yellow("No bunkers found in system storage."));
    Deno.exit(0);
    return;
  }

  console.log(colors.cyan("\nStored Bunkers:"));
  for (const pubkey of pubkeys) {
    const nbunkString = await secretsManager.getNbunk(pubkey);
    if (!nbunkString) continue;

    try {
      const info = decodeBunkerInfo(nbunkString);
      console.log(`- ${colors.green(pubkey)}`);
      console.log(`  Relays: ${info.relays.join(", ")}`);
    } catch (error) {
      console.log(`- ${colors.yellow(pubkey.slice(0, 8) + "..." + pubkey.slice(-4))} (Error decoding nbunksec)`);
    }
  }

  const config = readProjectFile();
  if (config?.bunkerPubkey) {
    console.log(colors.cyan("\nCurrent project uses bunker:"));
    console.log(`- ${colors.green(config.bunkerPubkey)}`);
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
    await secretsManager.storeNbunk(info.pubkey, nbunkString);

    console.log(colors.green(`Successfully imported bunker with pubkey ${info.pubkey.slice(0, 8)}...`));

    const useForProject = await Confirm.prompt({
      message: "Would you like to use this bunker for the current project?",
      default: true,
    });

    if (useForProject) {
      await useBunkerForProject(info.pubkey);
    }
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
    const pubkeys = await secretsManager.getAllPubkeys();

    if (pubkeys.length === 0) {
      console.log(colors.yellow("No bunkers found in system storage."));
      Deno.exit(0);
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
    Deno.exit(0);
    return;
  }

  const nbunkString = await secretsManager.getNbunk(pubkey);
  if (!nbunkString) {
    console.log(colors.red(`No bunker found with pubkey ${pubkey.slice(0, 8)}...`));
    Deno.exit(0);
    return;
  }

  console.log(colors.cyan("\nNbunk string for selected bunker:"));
  console.log(nbunkString);
  console.log(colors.yellow("\nStore this securely. It contains sensitive key material."));
}

/**
 * Connect to a bunker URL and store credentials
 */
export async function connectBunker(bunkerUrl?: string, skipProjectInteraction = false, noPersist = false): Promise<void> {
  let signer: NostrConnectSigner | null = null;
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
          chosenRelays = relayInput.split(",").map((r: string) => r.trim()).filter((r: string) => r.length > 0);
        }

        if (chosenRelays.length === 0) {
          console.log(colors.yellow("No relays provided. Using default relays."));
          chosenRelays = defaultRelays;
        }

        console.log(colors.cyan(`Initiating Nostr Connect as '${appName}' on relays: ${chosenRelays.join(', ')}`));
        signer = await initiateNostrConnect(appName, chosenRelays);
        log.debug("connectBunker: initiateNostrConnect returned, attempting signer.getPublicKey()");

        const getPubkeyPromise = signer.getPublicKey();
        const pubkeyTimeoutMs = 30000; // 30 seconds
        const pubkeyTimeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error(`signer.getPublicKey() timed out after ${pubkeyTimeoutMs / 1000} seconds`)), pubkeyTimeoutMs)
        );

        try {
          bunkerPubkey = await Promise.race([getPubkeyPromise, pubkeyTimeoutPromise]);
          log.debug(`connectBunker: signer.getPublicKey() returned: ${bunkerPubkey}`);
        } catch (e) {
          log.error(`connectBunker: Error or timeout during signer.getPublicKey(): ${e}`);
          throw e; // Re-throw to be caught by the outer try/catch in connectBunker
        }
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
      signer = await NostrConnectSigner.fromBunkerURI(bunkerUrl);
    }

    if (!signer || !bunkerPubkey) {
      console.log(colors.red("Failed to establish a signer connection."));
      Deno.exit(1);
      return;
    }

    const nbunkString = getNbunkString(signer);
    log.debug("connectBunker: nbunkString generated");

    if (noPersist) {
      console.log(colors.green(`Successfully connected to bunker ${bunkerPubkey.slice(0, 8)}...`));
      console.log(colors.yellow("\n⚠️  --no-persist flag used. The nbunksec will NOT be stored.\n"));
      console.log(colors.cyan("Your nbunksec string (copy it now, it won't be shown again):"));
      console.log(colors.bold(nbunkString));
      console.log(colors.yellow("\nStore this securely. It contains sensitive key material."));
      
      // Skip project interaction when using --no-persist
      log.debug("connectBunker: nbunkString displayed but not stored due to --no-persist flag");
    } else {
      const secretsManager = SecretsManager.getInstance();
      await secretsManager.storeNbunk(bunkerPubkey, nbunkString);
      log.debug("connectBunker: nbunkString stored");

      console.log(colors.green(`Successfully connected to bunker ${bunkerPubkey.slice(0, 8)}...\nGenerated and stored nbunksec string.`));

      if (!skipProjectInteraction) {
        const useForProject = await Confirm.prompt({
          message: "Would you like to use this bunker for the current project?",
          default: true,
        });

        if (useForProject) {
          await useBunkerForProject(bunkerPubkey);
        }
      }
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
        log.debug("connectBunker: In finally block, attempting signer.close()");
        console.log(colors.cyan("Disconnecting from bunker..."));
        await signer.close();
        log.debug("connectBunker: signer.close() completed");
        console.log(colors.green("Disconnected from bunker."));
      } catch (err) {
        log.error(`connectBunker: Error during signer.close(): ${err}`);
        console.error(colors.red(`Error during disconnect: ${err}`));
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
    const pubkeys = await secretsManager.getAllPubkeys();

    if (pubkeys.length === 0) {
      console.log(colors.yellow("No bunkers found in system storage."));
      Deno.exit(0);
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
    Deno.exit(0);
    return;
  }

  const nbunkString = await secretsManager.getNbunk(pubkey);
  if (!nbunkString) {
    console.log(colors.red(`No bunker found with pubkey ${pubkey.slice(0, 8)}...`));
    Deno.exit(0);
    return;
  }

  const config = readProjectFile();
  if (!config) {
    console.log(colors.red("No project configuration found. Initialize a project first with 'nsyte init'."));
    Deno.exit(0);
    return;
  }

  config.bunkerPubkey = pubkey;
  writeProjectFile(config);

  console.log(colors.green(`Project configured to use bunker with pubkey ${pubkey.slice(0, 8)}...`));
}

/**
 * Remove a bunker from storage
 */
export async function removeBunker(pubkey?: string): Promise<void> {
  const secretsManager = SecretsManager.getInstance();

  if (!pubkey) {
    const pubkeys = await secretsManager.getAllPubkeys();

    if (pubkeys.length === 0) {
      console.log(colors.yellow("No bunkers found in system storage."));
      Deno.exit(0);
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
    Deno.exit(0);
    return;
  }

  const confirm = await Confirm.prompt({
    message: `Are you sure you want to remove bunker ${pubkey.slice(0, 8)}...?`,
    default: false,
  });

  if (!confirm) {
    console.log(colors.yellow("Operation cancelled."));
    Deno.exit(0);
    return;
  }

  const deleted = await secretsManager.deleteNbunk(pubkey);

  if (deleted) {
    console.log(colors.green(`Bunker ${pubkey.slice(0, 8)}... removed from system storage.`));

    const config = readProjectFile();
    if (config?.bunkerPubkey === pubkey) {
      const removeFromProject = await Confirm.prompt({
        message: "This bunker is used by the current project. Remove it from project configuration?",
        default: true,
      });

      if (removeFromProject) {
        delete config.bunkerPubkey;
        writeProjectFile(config);
        console.log(colors.green("Bunker removed from project configuration."));
      }
    }
  } else {
    console.log(colors.yellow(`No bunker found with pubkey ${pubkey.slice(0, 8)}...`));
  }
} 