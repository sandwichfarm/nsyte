/**
 * Bunker command implementation
 *
 * Manages NIP-46 bunker connections and nbunks (encoded bunker credentials).
 * This module provides functions for connecting to, importing, exporting, and
 * managing bunker signers for the nsyte CLI.
 */

import { colors } from "@cliffy/ansi/colors";
import { Command } from "@cliffy/command";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { join } from "@std/path";
import { npubEncode } from "applesauce-core/helpers";
import { NostrConnectSigner } from "applesauce-signers";
import { readProjectFile, writeProjectFile } from "../lib/config.ts";
import { createLogger } from "../lib/logger.ts";
import {
  decodeBunkerInfo,
  getNbunkString,
  initiateNostrConnect,
  parseBunkerUrl,
} from "../lib/nip46.ts";
import { getUserDisplayName } from "../lib/nostr.ts";
import { EncryptedStorage } from "../lib/secrets/encrypted-storage.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { truncateHash } from "../ui/browse/renderer.ts";
import nsyte from "./root.ts";

const log = createLogger("bunker");
const SERVICE_NAME = "nsyte";

/**
 * Options for the connect subcommand
 */
export interface ConnectBunkerOptions {
  pubkey?: string;
  relay?: string;
  secret?: string;
  persist: boolean;
  forceEncryptedStorage: boolean;
}

/**
 * Register the bunker command with Cliffy
 */
export function registerBunkerCommand(): void {
  const bunker = new Command()
    .description("Manage NIP-46 bunker connections and nbunks")
    .action(async () => {
      // Show help when no subcommand is provided
      await bunker.showHelp();
    })
    // List subcommand
    .command("list", "List all stored bunkers in the system")
    .action(async () => {
      await listBunkers();
    })
    .reset()
    // Import subcommand
    .command("import [nbunksec:string]", "Import a bunker from an nbunksec string")
    .action(async (_options, nbunksec?: string) => {
      await importNbunk(nbunksec);
    })
    .reset()
    // Export subcommand
    .command("export [pubkey:string]", "Export a bunker as an nbunksec string")
    .action(async (_options, pubkey?: string) => {
      await exportNbunk(pubkey);
    })
    .reset()
    // Connect subcommand with complex URL handling
    .command("connect [url:string]", "Connect to a bunker URL and store as nbunksec")
    .option("--pubkey <pubkey:string>", "Bunker public key")
    .option("--relay <relay:string>", "Relay URL")
    .option("--secret <secret:string>", "Connection secret")
    .option("--persist", "Store the nbunksec (default behavior)", { default: true })
    .option(
      "--force-encrypted-storage",
      "Force use of encrypted file storage instead of OS keychain",
      { default: false },
    )
    .action(async (options, url?: string) => {
      await connectBunkerAction(options, url);
    })
    .reset()
    // Use subcommand
    .command("use [pubkey:string]", "Configure current project to use a bunker")
    .action(async (_options, pubkey?: string) => {
      await useBunkerForProject(pubkey);
    })
    .reset()
    // Remove subcommand
    .command("remove [pubkey:string]", "Remove a bunker from storage")
    .action(async (_options, pubkey?: string) => {
      await removeBunker(pubkey);
    })
    .reset()
    // Migrate subcommand
    .command("migrate [...pubkeys:string]", "Rebuild index for existing keychain bunkers")
    .action(async (_options, ...pubkeys: string[]) => {
      await migrateBunkers(...pubkeys);
    });

  // Register the bunker command to the main program
  nsyte.command("bunker", bunker);
}

/**  Helper to load display names for multiple pubkeys */
async function loadDisplayNames(pubkeys: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const pubkey of pubkeys) {
    try {
      // Validate pubkey length before encoding (should be 64 hex chars = 32 bytes)
      if (pubkey.length === 64) {
        map.set(pubkey, truncateHash(npubEncode(pubkey)));
      } else {
        // Invalid pubkey, just use truncated hex
        log.debug(`Invalid pubkey length (${pubkey.length}): ${pubkey}`);
        map.set(pubkey, pubkey.slice(0, 16) + "...");
      }
    } catch (error) {
      log.debug(`Failed to encode pubkey ${pubkey}: ${error}`);
      map.set(pubkey, pubkey.slice(0, 16) + "...");
    }
  }

  // Load all display names in parallel, but only for valid pubkeys
  const validPubkeys = pubkeys.filter((pk) => pk.length === 64);
  await Promise.all(
    validPubkeys.map((pk) =>
      getUserDisplayName(pk, 1000).then((name) => map.set(pk, name)).catch(() => {
        // Ignore errors fetching display names
      })
    ),
  );

  return map;
}

/**
 * Action handler for list subcommand - Cliffy compatible
 */
export async function listBunkers(): Promise<void> {
  try {
    log.debug("listBunkers: Starting");
    const secretsManager = SecretsManager.getInstance();
    log.debug("listBunkers: Got SecretsManager instance");
    await secretsManager.initialize();
    log.debug("listBunkers: SecretsManager initialized");
    const pubkeys = await secretsManager.getAllPubkeys();
    log.debug(`listBunkers: Got ${pubkeys.length} pubkeys`);

    if (pubkeys.length === 0) {
      console.log(colors.yellow("No bunkers found in system storage."));
      return;
    }

    // Load display names for all pubkeys in parallel
    const displayNamesMap = await loadDisplayNames(pubkeys);

    console.log(colors.cyan("\nStored Bunkers:"));
    for (const pubkey of pubkeys) {
      const nbunkString = await secretsManager.getNbunk(pubkey);
      if (!nbunkString) continue;

      const displayName = displayNamesMap.get(pubkey) || pubkey;

      try {
        const info = decodeBunkerInfo(nbunkString);
        console.log(`- ${colors.green(displayName)}`);
        if (displayName !== pubkey) {
          console.log(`  ${colors.gray(`Pubkey: ${pubkey.slice(0, 16)}...${pubkey.slice(-8)}`)}`);
        }
        console.log(`  Relays: ${info.relays.join(", ")}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.debug(`Failed to decode nbunksec for ${pubkey.slice(0, 8)}...: ${errorMsg}`);
        console.log(
          `- ${colors.yellow(displayName)} ${colors.dim("(Corrupted or invalid nbunksec)")}`,
        );
      }
    }

    // Try to read project config, but don't fail if it's invalid
    try {
      const config = readProjectFile();
      if (config?.bunkerPubkey) {
        const currentDisplayName = displayNamesMap.get(config.bunkerPubkey) || config.bunkerPubkey;
        console.log(colors.cyan("\nCurrent project uses bunker:"));
        console.log(`- ${colors.green(currentDisplayName)}`);
        if (currentDisplayName !== config.bunkerPubkey) {
          console.log(
            `  ${
              colors.gray(
                `Pubkey: ${config.bunkerPubkey.slice(0, 16)}...${config.bunkerPubkey.slice(-8)}`,
              )
            }`,
          );
        }
      } else {
        console.log(colors.yellow("\nCurrent project is not configured to use any bunker."));
      }
    } catch (configError) {
      // Config file might be invalid, that's okay for listing bunkers
      log.debug(`Could not read project config: ${configError}`);
      console.log(
        colors.yellow("\nCurrent project configuration could not be read (may be invalid)."),
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error listing bunkers: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));
    Deno.exit(1);
  }
}

/**
 * Action handler for import subcommand - Cliffy compatible
 */
export async function importNbunk(nbunkString?: string): Promise<void> {
  try {
    if (!nbunkString) {
      nbunkString = await Input.prompt({
        message: "Enter the nbunksec string to import:",
        validate: (input: string) => {
          return input.trim().startsWith("nbunksec") ||
            "Invalid nbunksec string. Must start with 'nbunksec'";
        },
      });
    }

    if (!nbunkString) {
      console.log(colors.yellow("Import cancelled."));
      return;
    }

    const info = decodeBunkerInfo(nbunkString);

    const secretsManager = SecretsManager.getInstance();
    await secretsManager.storeNbunk(info.pubkey, nbunkString);

    console.log(
      colors.green(`Successfully imported bunker with pubkey ${info.pubkey.slice(0, 8)}...`),
    );

    const useForProject = await Confirm.prompt({
      message: "Would you like to use this bunker for the current project?",
      default: true,
    });

    if (useForProject) {
      await useBunkerForProject(info.pubkey);
    }

    // Exit with delay to allow async cleanup
    setTimeout(() => {
      Deno.exit(0);
    }, 500);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to import nbunksec: ${errorMessage}`);
    console.error(colors.red(`Failed to import nbunksec: ${errorMessage}`));
    Deno.exit(1);
  }
}

/**
 * Action handler for export subcommand - Cliffy compatible
 */
export async function exportNbunk(pubkey?: string): Promise<void> {
  try {
    const secretsManager = SecretsManager.getInstance();

    if (!pubkey) {
      const pubkeys = await secretsManager.getAllPubkeys();

      if (pubkeys.length === 0) {
        console.log(colors.yellow("No bunkers found in system storage."));
        return;
      }

      // Load display names for better UX
      const displayNamesMap = await loadDisplayNames(pubkeys);

      const options = pubkeys.map((key) => ({
        name: displayNamesMap.get(key) || `${key.slice(0, 8)}...${key.slice(-4)}`,
        value: key,
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

    const nbunkString = await secretsManager.getNbunk(pubkey);
    if (!nbunkString) {
      console.log(colors.red(`No bunker found with pubkey ${pubkey.slice(0, 8)}...`));
      return;
    }

    console.log(colors.cyan("\nNbunk string for selected bunker:"));
    console.log(nbunkString);
    console.log(colors.yellow("\nStore this securely. It contains sensitive key material."));
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error exporting nbunk: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));
    Deno.exit(1);
  }
}

/**
 * Action handler for connect subcommand - Cliffy compatible
 */
export async function connectBunkerAction(
  options: ConnectBunkerOptions,
  url?: string,
): Promise<void> {
  try {
    // Handle --force-encrypted-storage flag
    if (options.forceEncryptedStorage) {
      Deno.env.set("NSYTE_FORCE_ENCRYPTED_STORAGE", "true");
    }

    // If pubkey and relay are provided, construct bunker URL
    if (options.pubkey && options.relay) {
      url = `bunker://${options.pubkey}?relay=${encodeURIComponent(options.relay)}${
        options.secret ? `&secret=${options.secret}` : ""
      }`;
    }

    // Call the core connect function
    await connectBunker(url, false, !options.persist);

    // Exit with delay to allow async cleanup
    setTimeout(() => {
      Deno.exit(0);
    }, 500);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error connecting to bunker: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));
    Deno.exit(1);
  }
}

/**
 * Connect to a bunker URL and store credentials
 */
export async function connectBunker(
  bunkerUrl?: string,
  skipProjectInteraction = false,
  noPersist = false,
): Promise<void> {
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
          message: `Enter relays (comma-separated), or press Enter for default (${
            defaultRelays.join(", ")
          }):`,
          default: defaultRelays.join(", "),
        });

        let chosenRelays: string[];
        if (relayInput.trim() === "" || relayInput.trim() === defaultRelays.join(", ")) {
          chosenRelays = defaultRelays;
        } else {
          chosenRelays = relayInput.split(",").map((r: string) => r.trim()).filter((r: string) =>
            r.length > 0
          );
        }

        if (chosenRelays.length === 0) {
          console.log(colors.yellow("No relays provided. Using default relays."));
          chosenRelays = defaultRelays;
        }

        console.log(
          colors.cyan(
            `Initiating Nostr Connect as '${appName}' on relays: ${chosenRelays.join(", ")}`,
          ),
        );
        signer = await initiateNostrConnect(appName, chosenRelays);
        log.debug("connectBunker: initiateNostrConnect returned, attempting signer.getPublicKey()");

        const getPubkeyPromise = await signer.getPublicKey();
        const pubkeyTimeoutMs = 30000; // 30 seconds
        const pubkeyTimeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `signer.getPublicKey() timed out after ${pubkeyTimeoutMs / 1000} seconds`,
                ),
              ),
            pubkeyTimeoutMs,
          )
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
          },
        });
      } else {
        console.log(colors.yellow("Invalid choice. Exiting."));
        return;
      }
    }

    if (bunkerUrl && !signer) {
      if (!bunkerUrl.includes("?relay=") && !bunkerUrl.includes("&secret=")) {
        console.log(
          colors.yellow(
            "The bunker URL appears to be incomplete. Shell metacharacters like ? and & need to be quoted.",
          ),
        );
        console.log(
          colors.yellow(
            "Example: nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'",
          ),
        );
        console.log(
          colors.yellow(
            "You can also enter the URL interactively to avoid shell escaping issues.\n",
          ),
        );

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
      log.debug(
        `Parsed bunker URL - pubkey: ${bunkerPubkey}, relays: ${parsedPointer.relays.join(", ")}`,
      );
      log.debug(`NostrConnectSigner.subscriptionMethod: ${NostrConnectSigner.subscriptionMethod}`);
      log.debug(`NostrConnectSigner.publishMethod: ${NostrConnectSigner.publishMethod}`);
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
      console.log(
        colors.yellow("\n⚠️  --no-persist flag used. The nbunksec will NOT be stored.\n"),
      );
      console.log(colors.cyan("Your nbunksec string (copy it now, it won't be shown again):"));
      console.log(colors.bold(nbunkString));
      console.log(colors.yellow("\nStore this securely. It contains sensitive key material."));

      // Skip project interaction when using --no-persist
      log.debug("connectBunker: nbunkString displayed but not stored due to --no-persist flag");
    } else {
      const secretsManager = SecretsManager.getInstance();
      await secretsManager.storeNbunk(bunkerPubkey, nbunkString);
      log.debug("connectBunker: nbunkString stored");

      console.log(
        colors.green(
          `Successfully connected to bunker ${
            bunkerPubkey.slice(0, 8)
          }...\nGenerated and stored nbunksec string.`,
        ),
      );

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
      console.log(
        colors.yellow("\nRemember to properly quote URLs with special characters in the shell:"),
      );
      console.log(
        colors.cyan(
          "  nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'",
        ),
      );
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
 * Action handler for use subcommand - Cliffy compatible
 */
export async function useBunkerForProject(pubkey?: string): Promise<void> {
  try {
    const secretsManager = SecretsManager.getInstance();

    if (!pubkey) {
      const pubkeys = await secretsManager.getAllPubkeys();

      if (pubkeys.length === 0) {
        console.log(colors.yellow("No bunkers found in system storage."));
        return;
      }

      // Load display names for better UX
      const displayNamesMap = await loadDisplayNames(pubkeys);

      const options = pubkeys.map((key) => ({
        name: displayNamesMap.get(key) || `${key.slice(0, 8)}...${key.slice(-4)}`,
        value: key,
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

    const nbunkString = await secretsManager.getNbunk(pubkey);
    if (!nbunkString) {
      console.log(colors.red(`No bunker found with pubkey ${pubkey.slice(0, 8)}...`));
      return;
    }

    const config = readProjectFile();
    if (!config) {
      console.log(
        colors.red("No project configuration found. Initialize a project first with 'nsyte init'."),
      );
      return;
    }

    config.bunkerPubkey = pubkey;
    writeProjectFile(config);

    // Show friendly name in confirmation message
    const displayName = await getUserDisplayName(pubkey, 1000);
    console.log(
      colors.green(`Project configured to use bunker: ${displayName}`),
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error configuring bunker for project: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));
    Deno.exit(1);
  }
}

/**
 * Action handler for remove subcommand - Cliffy compatible
 */
export async function removeBunker(pubkey?: string): Promise<void> {
  try {
    const secretsManager = SecretsManager.getInstance();

    if (!pubkey) {
      const pubkeys = await secretsManager.getAllPubkeys();

      if (pubkeys.length === 0) {
        console.log(colors.yellow("No bunkers found in system storage."));
        return;
      }

      // Load display names for better UX
      const displayNamesMap = await loadDisplayNames(pubkeys);

      const options = pubkeys.map((key) => ({
        name: displayNamesMap.get(key) || `${key.slice(0, 8)}...${key.slice(-4)}`,
        value: key,
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

    // Get display name for confirmation message
    const displayName = await getUserDisplayName(pubkey, 1000);

    const confirm = await Confirm.prompt({
      message: `Are you sure you want to remove bunker: ${displayName}?`,
      default: false,
    });

    if (!confirm) {
      console.log(colors.yellow("Operation cancelled."));
      return;
    }

    const deleted = await secretsManager.deleteNbunk(pubkey);

    if (deleted) {
      console.log(colors.green(`Bunker ${displayName} removed from system storage.`));

      const config = readProjectFile();
      if (config?.bunkerPubkey === pubkey) {
        const removeFromProject = await Confirm.prompt({
          message:
            "This bunker is used by the current project. Remove it from project configuration?",
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error removing bunker: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));
    Deno.exit(1);
  }
}

/**
 * Discover bunker pubkeys in the macOS keychain
 */
async function discoverKeychainBunkers(): Promise<string[]> {
  const pubkeys: string[] = [];

  // macOS doesn't provide a way to list accounts for a specific service
  // without dumping the entire keychain, so we scan known locations
  console.log(colors.dim("Scanning project configs for bunker pubkeys..."));

  try {
    // Look for .nsite/config.json files and test if they exist in keychain
    const configPubkeys = await findConfigPubkeys();

    if (configPubkeys.length > 0) {
      console.log(colors.dim(`Testing ${configPubkeys.length} pubkey(s) from configs...`));
    }

    // Test each one to see if it exists in keychain
    for (const pubkey of configPubkeys) {
      try {
        const cmd = new Deno.Command("security", {
          args: ["find-generic-password", "-s", "nsyte", "-a", pubkey, "-w"],
          stdout: "piped",
          stderr: "piped",
        });

        const result = await cmd.output();
        if (result.code === 0) {
          pubkeys.push(pubkey);
        }
      } catch {
        // Skip if not found
      }
    }
  } catch {
    console.log(colors.dim("Failed to scan configs, continuing..."));
  }

  return [...new Set(pubkeys)]; // Remove duplicates
}

/**
 * Find bunker pubkeys from project config files
 */
async function findConfigPubkeys(): Promise<string[]> {
  const pubkeys: string[] = [];

  try {
    // Search for .nsite/config.json files in current directory and subdirectories
    for await (const entry of Deno.readDir(".")) {
      if (entry.isDirectory && entry.name === ".nsite") {
        try {
          const configPath = ".nsite/config.json";
          const configText = await Deno.readTextFile(configPath);
          const config = JSON.parse(configText);

          if (config.bunkerPubkey && typeof config.bunkerPubkey === "string") {
            pubkeys.push(config.bunkerPubkey);
          }
        } catch {
          // Skip invalid config files
        }
      }
    }
  } catch {
    // Skip if can't read directory
  }

  return pubkeys;
}

/**
 * Action handler for migrate subcommand - Cliffy compatible
 */
export async function migrateBunkers(...pubkeys: string[]): Promise<void> {
  // Convert rest params to array or undefined for legacy compatibility
  const pubkeyArray = pubkeys.length > 0 ? pubkeys : undefined;
  return migrateBunkersImpl(pubkeyArray);
}

/**
 * Migrate existing keychain bunkers to the new indexed system (implementation)
 */
async function migrateBunkersImpl(pubkeys?: string[]): Promise<void> {
  const secretsManager = SecretsManager.getInstance();
  await secretsManager.initialize();

  console.log(colors.cyan("Bunker Migration"));
  console.log("\nRebuilding index for bunkers stored in your keychain...\n");

  if (pubkeys && pubkeys.length > 0) {
    console.log(colors.cyan(`Migrating ${pubkeys.length} specified pubkey(s)...`));
  } else {
    console.log("Discovering all nsyte bunkers in keychain...");
    pubkeys = await discoverKeychainBunkers();

    if (!pubkeys || pubkeys.length === 0) {
      console.log(colors.yellow("No nsyte bunkers found in keychain."));
      console.log(
        "\nIf you have bunkers but they're not being found, you can specify them manually:",
      );
      console.log(colors.dim("  nsyte bunker migrate <pubkey1> [pubkey2] ..."));
      return;
    }

    console.log(colors.green(`Found ${pubkeys.length} bunker(s) in keychain`));
  }

  console.log(colors.cyan("Migrating bunkers to indexed storage...\n"));

  // First, check which pubkeys exist in keychain (this will prompt for password once)
  const existingBunkers: { pubkey: string; nbunkString: string }[] = [];

  console.log("Checking keychain for bunkers (you may be prompted for your password)...");

  for (const pubkey of pubkeys) {
    try {
      const nbunkString = await secretsManager.getNbunk(pubkey);
      if (nbunkString) {
        existingBunkers.push({ pubkey, nbunkString });
        console.log(colors.dim(`  Found ${pubkey.slice(0, 8)}...`));
      } else {
        console.log(colors.yellow(`  Not found: ${pubkey.slice(0, 8)}...`));
      }
    } catch (error) {
      console.log(colors.red(`  Error checking ${pubkey.slice(0, 8)}...: ${error}`));
    }
  }

  if (existingBunkers.length === 0) {
    console.log(colors.yellow("\nNo bunkers found in keychain."));
    return;
  }

  // Now migrate them all at once (should not require additional password prompts)
  console.log(`\nMigrating ${existingBunkers.length} bunkers to index...`);

  let migrated = 0;
  for (const { pubkey } of existingBunkers) {
    try {
      // Just update the index, don't re-store in keychain
      const encryptedStorage = new EncryptedStorage();
      if (await encryptedStorage.initialize()) {
        const success = await encryptedStorage.store(SERVICE_NAME, pubkey, "stored-in-keychain");
        if (success) {
          console.log(colors.green(`✓ Indexed ${pubkey.slice(0, 8)}...`));
          migrated++;
        } else {
          console.log(colors.red(`✗ Failed to index ${pubkey.slice(0, 8)}...`));
        }
      }
    } catch (error) {
      console.log(colors.red(`✗ Error indexing ${pubkey.slice(0, 8)}...: ${error}`));
    }
  }

  console.log(colors.cyan(`\nMigration complete:`));
  console.log(`  ${colors.green(migrated.toString())} bunkers indexed`);
  const notFound = pubkeys.length - existingBunkers.length;
  if (notFound > 0) {
    console.log(`  ${colors.yellow(notFound.toString())} pubkeys not found in keychain`);
  }

  if (migrated > 0) {
    // Create migration completion marker
    try {
      const migrationMarkerPath = join(
        Deno.env.get("HOME") || "",
        "Library",
        "Application Support",
        "nsyte",
        ".index-migration-done",
      );
      await Deno.writeTextFile(migrationMarkerPath, new Date().toISOString());
      log.debug("Created migration completion marker");
    } catch (error) {
      log.warn(`Failed to create migration marker: ${error}`);
    }

    console.log(colors.green("\n✓ Your bunkers are now indexed for faster access"));
    console.log("Run 'nsyte bunker list' to see all bunkers");
  }
}
