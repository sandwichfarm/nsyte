import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { copy } from "@std/fs/copy";
import { existsSync } from "@std/fs/exists";
import { join } from "@std/path";
import { mergeBlossomServers } from "applesauce-common/helpers";
import { getOutboxes, npubEncode, relaySet } from "applesauce-core/helpers";
import { NostrConnectSigner } from "applesauce-signers";
import { createSigner as createSignerFromFactory } from "../lib/auth/signer-factory.ts";
import {
  defaultConfig,
  type ProjectConfig,
  type ProjectContext,
  readProjectFile,
  setupProject,
  writeProjectFile,
} from "../lib/config.ts";
import { NSYTE_BROADCAST_RELAYS } from "../lib/constants.ts";
import { type DisplayManager, getDisplayManager } from "../lib/display-mode.ts";
import { getErrorMessage } from "../lib/error-utils.ts";
import { compareFiles, getLocalFiles, loadFileData } from "../lib/files.ts";
import { createLogger, flushQueuedLogs, setProgressMode } from "../lib/logger.ts";
import { MessageCategory, MessageCollector } from "../lib/message-collector.ts";
import { getNbunkString, importFromNbunk, initiateNostrConnect } from "../lib/nip46.ts";
import {
  createAppHandlerEvent,
  createSiteManifestEvent,
  fetchUserRelayList,
  type FileEntry,
  getUserOutboxes,
  getUserServers,
  listRemoteFiles,
  publishEventsToRelays,
  purgeRemoteFiles,
} from "../lib/nostr.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { processUploads, type Signer, type UploadResponse } from "../lib/upload.ts";
import { parseRelayInput, truncateString } from "../lib/utils.ts";
import {
  formatConfigValue,
  formatFilePath,
  formatFileSize,
  formatFileSummary,
  formatRelayList,
  formatSectionHeader,
  formatServerResults,
  formatTitle,
} from "../ui/formatters.ts";
import { ProgressRenderer } from "../ui/progress.ts";
import { StatusDisplay } from "../ui/status.ts";

// LOCAL STATE ------------------------------------------------------------------------------------------------ //
const log = createLogger("upload");

let displayManager!: DisplayManager;
let statusDisplay!: StatusDisplay;
let messageCollector!: MessageCollector;
let signer!: Signer;
let progressRenderer!: ProgressRenderer;

let config!: ProjectConfig;
let options!: UploadCommandOptions;

let resolvedRelays: string[] = [];
let resolvedServers: string[] = [];

const currentWorkingDir = Deno.cwd();
let targetDir!: string;
let context!: ProjectContext;

// TYPES ----------------------------------------------------------------------------------------------------- //

export interface UploadCommandOptions {
  force: boolean;
  verbose: boolean;
  purge: boolean;
  useFallbackRelays?: boolean;
  useFallbackServers?: boolean;
  useFallbacks?: boolean;
  servers?: string;
  relays?: string;
  /** Unified secret parameter (auto-detects format: nsec, nbunksec, bunker URL, or hex) */
  sec?: string;
  concurrency: number;
  fallback?: string;
  publishAppHandler: boolean;
  handlerKinds?: string;
  nonInteractive: boolean;
}

export interface FilePreparationResult {
  toTransfer: FileEntry[];
  existing: FileEntry[];
  toDelete: FileEntry[];
}

/**
 * Register the deploy command
 */
export function registerDeployCommand(program: Command): void {
  program
    .command("deploy")
    .alias("upload")
    .alias("dpl")
    .description("Deploy files from a directory")
    .arguments("<folder:string>")
    .option("-f, --force", "Force publishing even if no changes were detected.", { default: false })
    .option("-s, --servers <servers:string>", "The blossom servers to use (comma separated).")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option("-p, --purge", "After upload, delete remote file events not in current deployment.", {
      default: false,
    })
    .option(
      "--use-fallback-relays",
      "Include default nsyte relays in addition to configured relays when fetching/publishing.",
      { default: false },
    )
    .option(
      "--use-fallback-servers",
      "Include default blossom servers in addition to configured servers.",
      { default: false },
    )
    .option(
      "--use-fallbacks",
      "Enable both fallback relays and servers (same as enabling both fallback flags).",
      { default: false },
    )
    .option("-v, --verbose", "Verbose output.", { default: false })
    .option("-c, --concurrency <number:number>", "Number of parallel uploads.", { default: 4 })
    .option("--publish-app-handler", "Publish NIP-89 app handler announcement (Kind 31990).", {
      default: false,
    })
    .option(
      "--handler-kinds <kinds:string>",
      "Event kinds this nsite can handle (comma separated).",
    )
    .option("--fallback <file:string>", "An HTML file to copy and publish as 404.html")
    .option("-i, --non-interactive", "Run in non-interactive mode", { default: false })
    .action(async (options: UploadCommandOptions, folder: string) => {
      // Show deprecation notice if using upload alias
      const cmdName = Deno.args[0];
      if (cmdName === "upload") {
        console.log(
          colors.yellow("⚠️  The 'upload' command is deprecated. Please use 'deploy' instead.\n"),
        );
      }
      await uploadCommand(folder, options);
    });
}

// ------------------------------------------------------------------------------------------------ //

/**
 * Implements the primary upload command functionality for nsyte
 *
 * This function handles the entire upload workflow including:
 * - Initializing state and configuration
 * - Resolving project context and authentication
 * - Setting up signing capabilities
 * - Scanning local files
 * - Fetching and comparing remote files
 * - Processing file uploads/deletions
 * - Publishing metadata
 * - Displaying results
 *
 * @param fileOrFolder: string - Path to the file or folder to upload, relative to current working directory
 * @param options<UploadCommandOptions> - Upload command options
 *
 * @returns Promise that resolves when upload completes, process exits with status code
 */
export async function uploadCommand(
  fileOrFolder: string,
  options_: UploadCommandOptions,
): Promise<void> {
  initState(options_);
  log.debug("begin nstye upload");

  try {
    targetDir = join(currentWorkingDir, fileOrFolder);
    context = await resolveContext(options);

    if (context.error) {
      statusDisplay.error(context.error);
      log.error(`Configuration error: ${context.error}`);
      return Deno.exit(1);
    }

    const { authKeyHex } = context;
    config = context.config;

    if (!config) {
      statusDisplay.error("Critical error: Project data could not be resolved.");
      log.error(
        "Critical error: Project data is null after context resolution without error (interactive mode).",
      );
      return Deno.exit(1);
    }

    signer = (await initSigner(authKeyHex)) as Signer;

    if ("error" in signer) {
      statusDisplay.error(`Signer: ${signer.error}`);
      log.error(`Signer initialization failed: ${signer.error}`);
      return Deno.exit(1);
    }

    const publisherPubkey = await signer.getPublicKey();

    // Get config values for manifest metadata (these are recommendations for others)
    const manifestRelays = options.relays?.split(",").filter((r) => r.trim()) || config.relays ||
      [];
    const manifestServers = options.servers?.split(",").filter((s) => s.trim()) || config.servers ||
      [];

    // Fetch kind 10002 and 10063 to get user's preferred relays/servers for operations
    statusDisplay.update("Discovering user preferences...");
    resolvedRelays = relaySet(await getUserOutboxes(publisherPubkey), manifestRelays);
    resolvedServers = mergeBlossomServers(await getUserServers(publisherPubkey), manifestServers);

    // If no servers discovered, fall back to config/options
    if (resolvedServers.length === 0) {
      resolvedServers = manifestServers;
      if (resolvedServers.length === 0) {
        log.warn("No servers configured or discovered - uploads will fail");
      }
    }

    // If no relays discovered, fall back to config/options
    if (resolvedRelays.length === 0) {
      resolvedRelays = manifestRelays;
      if (resolvedRelays.length === 0) {
        log.warn("No relays configured or discovered - publishing will fail");
      }
    }

    displayConfig(publisherPubkey);

    // Copy fallback file to 404.html if configured
    await copyFallbackFile();

    const includedFiles = await scanLocalFiles();
    const remoteFileEntries = await fetchRemoteFiles(publisherPubkey);
    const { toTransfer, toDelete } = await compareAndPrepareFiles(
      includedFiles,
      remoteFileEntries,
    );

    await maybeProcessFiles(toTransfer, toDelete);
    await maybePublishMetadata(includedFiles);

    // Handle smart purge AFTER upload
    if (options.purge) {
      await handleSmartPurgeOperation(includedFiles, remoteFileEntries);
    }

    if (
      includedFiles.length === 0 && toDelete.length === 0 && toTransfer.length === 0
    ) {
      log.info("No effective operations performed.");
    }

    flushQueuedLogs();

    displayGatewayUrl(publisherPubkey);

    return Deno.exit(0);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    statusDisplay.error(`Upload command failed: ${errorMessage}`);
    log.error(`Upload command failed: ${errorMessage}`);
    return Deno.exit(1);
  }
}

function displayGatewayUrl(publisherPubkey: string) {
  const npub = npubEncode(publisherPubkey);
  const { gatewayHostnames } = config;
  console.log(colors.green(`\nThe nsite is now available on any nsite gateway, for example:`));
  for (const gatewayHostname of gatewayHostnames || []) {
    console.log(colors.blue.underline(`https://${npub}.${gatewayHostname}/`));
  }
  console.log(colors.green(`\nYou can also run the command:`));
  console.log(colors.bgMagenta.bold(`nsyte run ${npub}`));
}

export function initState(options_: UploadCommandOptions) {
  options = options_;
  displayManager = getDisplayManager();
  displayManager.configureFromOptions(options);
  messageCollector = new MessageCollector(displayManager.isInteractive());
  statusDisplay = new StatusDisplay();
}

async function resolveContext(
  options: UploadCommandOptions,
): Promise<ProjectContext> {
  let config: ProjectConfig | null = null;
  let authKeyHex: string | null | undefined = options.sec || undefined;

  if (options.nonInteractive) {
    log.debug("Resolving project context in non-interactive mode.");
    let existingProjectData: ProjectConfig | null = null;

    try {
      existingProjectData = readProjectFile();
    } catch {
      // Configuration exists but is invalid
      console.error(colors.red("\nConfiguration file exists but contains errors."));
      console.error(
        colors.yellow("Please fix the errors above or delete .nsite/config.json to start fresh.\n"),
      );
      return {
        config: defaultConfig,
        authKeyHex,
        error: "Configuration validation failed",
      };
    }

    if (!existingProjectData) {
      existingProjectData = defaultConfig;
    }

    if (
      !options.servers &&
      (!existingProjectData?.servers || existingProjectData.servers.length === 0)
    ) {
      return {
        config: existingProjectData,
        authKeyHex,
        error: "Missing servers: Provide --servers or configure in .nsite/config.json.",
      };
    }
    if (
      !options.relays && (!existingProjectData?.relays || existingProjectData.relays.length === 0)
    ) {
      return {
        config: existingProjectData,
        authKeyHex,
        error: "Missing relays: Provide --relays or configure in .nsite/config.json.",
      };
    }

    if (!authKeyHex && !options.sec) {
      if (!existingProjectData?.bunkerPubkey) {
        return {
          config: existingProjectData,
          authKeyHex,
          error:
            "Missing signing key: For non-interactive mode, provide --sec, or ensure a bunker is configured in .nsite/config.json.",
        };
      } else {
        log.info(
          "No direct key/nsec on CLI. Will attempt to use configured bunker for non-interactive mode.",
        );
      }
    }

    config = {
      servers: (options.servers
        ? options.servers.split(",").filter((s) =>
          s.trim()
        )
        : existingProjectData?.servers) || [],
      relays: (options.relays
        ? options.relays.split(",").filter((r) => r.trim())
        : existingProjectData?.relays) || [],
      bunkerPubkey: existingProjectData?.bunkerPubkey,
      fallback: options.fallback || existingProjectData?.fallback,
      gatewayHostnames: existingProjectData?.gatewayHostnames || ["nsite.lol"],
    };
  } else {
    log.debug("Resolving project context in interactive mode.");
    let currentProjectData: ProjectConfig | null = null;
    let keyFromInteractiveSetup: string | undefined;

    try {
      currentProjectData = readProjectFile();
    } catch {
      // Configuration exists but is invalid
      console.error(colors.red("\nConfiguration file exists but contains errors."));
      console.error(
        colors.yellow("Please fix the errors above or delete .nsite/config.json to start fresh.\n"),
      );
      return {
        config: defaultConfig,
        authKeyHex: undefined,
        error: "Configuration validation failed",
      };
    }

    if (!currentProjectData) {
      log.info("No .nsite/config.json found, running initial project setup.");
      const setupResult = await setupProject(false);
      if (!setupResult.config) {
        return {
          config: defaultConfig,
          authKeyHex: undefined,
          error: "Project setup failed or was aborted.",
        };
      }
      config = setupResult.config;
      keyFromInteractiveSetup = setupResult.privateKey;
    } else {
      config = currentProjectData;
      if (!options.sec && !config?.bunkerPubkey) {
        log.info(
          "Project is configured but no signing method found (CLI key, CLI bunker, or configured bunker). Running key setup...",
        );
        const keySetupResult = await setupProject(false);
        if (!keySetupResult.config) {
          return {
            config,
            authKeyHex: undefined,
            error: "Key setup for existing project failed or was aborted.",
          };
        }
        config = keySetupResult.config;
        keyFromInteractiveSetup = keySetupResult.privateKey;
      }
    }

    if (!config?.gatewayHostnames) {
      config.gatewayHostnames = ["nsite.lol"];
    }

    if (options.sec) {
      authKeyHex = options.sec;
    } else if (keyFromInteractiveSetup) {
      authKeyHex = keyFromInteractiveSetup;
    }
  }

  if (!config || !config.servers || config.servers.length === 0) {
    return { config, authKeyHex, error: "Servers configuration is missing or empty." };
  }
  if (!config.relays || config.relays.length === 0) {
    return { config, authKeyHex, error: "Relays configuration is missing or empty." };
  }

  return { config, authKeyHex };
}

async function initSigner(
  _authKeyHex: string | null | undefined,
): Promise<Signer | { error: string }> {
  // Use the unified signer factory for CLI-provided secrets or interactively-provided secrets
  // Priority: CLI option > interactive input > config bunker
  const signerResult = await createSignerFromFactory({
    sec: options.sec || _authKeyHex || undefined,
    bunkerPubkey: config?.bunkerPubkey,
  });

  // If signer factory succeeded, return it
  if (!("error" in signerResult)) {
    return signerResult.signer;
  }

  // If signer factory failed but we have a stored bunker, try to use it
  if (config?.bunkerPubkey) {
    // Only access SecretsManager if we actually need it (no CLI auth provided)
    log.info(
      `Attempting to use configured bunker (pubkey: ${
        config.bunkerPubkey.substring(0, 8)
      }...) for signing...`,
    );
    const secretsManager = SecretsManager.getInstance();
    const nbunkString = await secretsManager.getNbunk(config.bunkerPubkey);
    if (nbunkString) {
      try {
        log.debug("Found stored nbunksec for configured bunker. Importing...");
        const bunkerSigner = await importFromNbunk(nbunkString);
        log.debug("importFromNbunk completed, about to call getPublicKey()...");

        // Add timeout to getPublicKey as it might hang too
        const getPublicKeyPromise = bunkerSigner.getPublicKey();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("getPublicKey timeout after 15s")), 15000);
        });

        log.debug("Waiting for getPublicKey or timeout...");
        const pubkey = await Promise.race([getPublicKeyPromise, timeoutPromise]) as string;
        log.debug(`getPublicKey completed: ${truncateString(pubkey)}`);
        return bunkerSigner;
      } catch (e: unknown) {
        const baseMsg = `Failed to use stored nbunksec for configured bunker ${
          truncateString(config.bunkerPubkey)
        }: ${getErrorMessage(e)}`;
        if (options.nonInteractive) {
          return {
            error:
              `${baseMsg} In non-interactive mode, cannot re-prompt. Please check bunker or provide key via CLI.`,
          };
        } else {
          return {
            error:
              `${baseMsg} The stored secret may be invalid. Consider re-configuring the bunker connection.`,
          };
        }
      }
    } else {
      const baseMsg = `No stored secret (nbunksec) found for configured bunker: ${
        config.bunkerPubkey.substring(0, 8)
      }...`;

      if (options.nonInteractive) {
        return {
          error:
            `${baseMsg} In non-interactive mode, cannot prompt for new bunker details. Please run interactively or provide key/nbunksec via CLI.`,
        };
      } else {
        // In interactive mode, attempt to reconnect to the bunker
        log.info(`${baseMsg} Attempting to reconnect...`);
        console.log(colors.yellow(`\n${baseMsg}`));
        console.log(colors.cyan("Let's reconnect to your bunker:\n"));

        try {
          // Reconnect to the bunker
          const bunkerSigner = await reconnectToBunker(config.bunkerPubkey);
          if (bunkerSigner) {
            return bunkerSigner;
          } else {
            return {
              error:
                `Failed to reconnect to bunker. Please provide a key/nbunksec via CLI or run 'nsyte init' to reconfigure.`,
            };
          }
        } catch (e: unknown) {
          return {
            error: `Failed to reconnect to bunker: ${
              getErrorMessage(e)
            }. Please provide a key/nbunksec via CLI.`,
          };
        }
      }
    }
  }
  return {
    error:
      "No valid signing method could be initialized. Please provide --sec with nsec, nbunksec, bunker URL, or hex key, or configure a bunker in .nsite/config.json.",
  };
}

/**
 * Reconnect to an existing bunker that has lost its stored secret
 */
async function reconnectToBunker(bunkerPubkey: string): Promise<Signer | null> {
  const choice = await Select.prompt<string>({
    message: "How would you like to reconnect to your bunker?",
    options: [
      { name: "Scan QR Code (Nostr Connect)", value: "qr" },
      { name: "Enter Bunker URL manually", value: "url" },
      { name: "Cancel", value: "cancel" },
    ],
  });

  if (choice === "cancel") {
    return null;
  }

  let signer: NostrConnectSigner | null = null;

  try {
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
        chosenRelays = parseRelayInput(relayInput);
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
    } else {
      const bunkerUrl = await Input.prompt({
        message: "Enter the bunker URL (bunker://...):",
        validate: (input: string) => {
          return input.trim().startsWith("bunker://") ||
            "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
        },
      });

      console.log(colors.cyan("Connecting to bunker via URL..."));
      signer = await NostrConnectSigner.fromBunkerURI(bunkerUrl);

      // Wait for the signer to connect
      if (signer) {
        await signer.waitForSigner();
      }
    }

    if (!signer) {
      throw new Error("Failed to establish signer connection");
    }

    // Verify the bunker pubkey matches what we expect
    const connectedPubkey = await signer.getPublicKey();
    if (connectedPubkey !== bunkerPubkey) {
      console.log(colors.yellow(
        `Warning: Connected bunker pubkey (${
          truncateString(connectedPubkey)
        }) does not match configured pubkey (${truncateString(bunkerPubkey)}).`,
      ));
      const proceed = await Confirm.prompt({
        message: "Do you want to continue with this different bunker?",
        default: false,
      });

      if (!proceed) {
        await signer.close();
        return null;
      }

      // Update the configuration with the new bunker pubkey
      config.bunkerPubkey = connectedPubkey;
      writeProjectFile(config);
    }

    // Store the bunker info for future use
    const secretsManager = SecretsManager.getInstance();
    const nbunkString = getNbunkString(signer);
    await secretsManager.storeNbunk(connectedPubkey, nbunkString);

    console.log(colors.green("✓ Successfully reconnected to bunker and saved credentials."));
    log.info(`Reconnected to bunker with pubkey: ${truncateString(connectedPubkey)}`);

    return signer;
  } catch (error) {
    log.error(`Failed to reconnect to bunker: ${error}`);
    console.error(
      colors.red(
        `Failed to reconnect to bunker: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );

    if (signer) {
      try {
        await signer.close();
      } catch (err) {
        log.error(`Error during disconnect: ${err}`);
      }
    }

    return null;
  }
}

export function displayConfig(publisherPubkey: string) {
  if (displayManager.isInteractive()) {
    console.log(formatTitle("Upload Configuration"));
    console.log(formatConfigValue("User", publisherPubkey, false));
    console.log(
      formatConfigValue(
        "Relays",
        formatRelayList(resolvedRelays),
        !options.relays && !config.relays,
      ),
    );
    console.log(
      formatConfigValue(
        "Servers",
        formatRelayList(resolvedServers),
        !options.servers && !config.servers,
      ),
    );
    console.log(formatConfigValue("Force Upload", options.force, options.force === false));
    console.log(formatConfigValue("Purge Old Files", options.purge, options.purge === false));
    console.log(formatConfigValue("Concurrency", options.concurrency, options.concurrency === 4));
    console.log(
      formatConfigValue(
        "404 Fallback",
        options.fallback || config.fallback || "none",
        !options.fallback && !config.fallback,
      ),
    );
    console.log("");
  } else if (!options.nonInteractive) {
    console.log(colors.cyan(`User: ${publisherPubkey}`));
    console.log(
      colors.cyan(
        `Relays: ${resolvedRelays.join(", ") || "none"}${
          !options.relays && !config.relays ? " (default)" : ""
        }`,
      ),
    );
    console.log(
      colors.cyan(
        `Servers: ${resolvedServers.join(", ") || "none"}${
          !options.servers && !config.servers ? " (default)" : ""
        }`,
      ),
    );
    console.log(
      colors.cyan(
        `Concurrency: ${options.concurrency}${options.concurrency === 4 ? " (default)" : ""}`,
      ),
    );
    if (options.force) console.log(colors.yellow("Force Upload: true"));
    if (options.purge) console.log(colors.yellow("Purge Old Files: true"));
    if (options.fallback || config.fallback) {
      console.log(
        colors.cyan(
          `404 Fallback: ${options.fallback || config.fallback}${
            !options.fallback && !config.fallback ? " (default)" : ""
          }`,
        ),
      );
    }
    if (options.publishAppHandler || config.publishAppHandler) {
      const kinds = options.handlerKinds?.split(",").map((k) => k.trim()) ||
        config.appHandler?.kinds?.map((k) => k.toString()) || [];
      console.log(
        colors.cyan(
          `Publish App Handler: true${
            !options.publishAppHandler && !config.publishAppHandler ? " (default)" : ""
          } (kinds: ${kinds.join(", ") || "none"})`,
        ),
      );
    }
  }
}

/**
 * Copy fallback file to 404.html if configured
 */
async function copyFallbackFile(): Promise<void> {
  const fallbackPath = options.fallback || config.fallback;

  if (!fallbackPath) {
    return;
  }

  try {
    const fallbackSource = join(targetDir, fallbackPath.replace(/^\//, ""));
    const fallbackDest = join(targetDir, "404.html");

    // Check if source file exists
    if (!existsSync(fallbackSource)) {
      log.warn(`Configured fallback file '${fallbackPath}' not found at ${fallbackSource}`);
      return;
    }

    // Copy the file
    await Deno.copyFile(fallbackSource, fallbackDest);
    log.info(`Copied fallback file ${fallbackPath} to 404.html`);

    if (!options.nonInteractive) {
      console.log(colors.cyan(`Copied fallback file ${fallbackPath} to 404.html`));
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    log.error(`Failed to copy fallback file: ${errorMessage}`);
    if (!options.nonInteractive) {
      console.error(colors.yellow(`Warning: Failed to copy fallback file: ${errorMessage}`));
    }
  }
}

/**
 * Scan local files in the target directory
 */
async function scanLocalFiles(_targetDir?: string): Promise<FileEntry[]> {
  targetDir = _targetDir || targetDir;
  statusDisplay.update(`Scanning files in ${formatFilePath(targetDir)}...`);
  const { includedFiles, ignoredFilePaths } = await getLocalFiles(targetDir);

  if (ignoredFilePaths.length > 0) {
    const ignoreMsg =
      `Ignored ${ignoredFilePaths.length} files/directories based on .nsiteignore rules (or default ignores).`;
    if (displayManager.isInteractive()) log.info(ignoreMsg);
    else console.log(colors.yellow(ignoreMsg));
    if (options.verbose) {
      ignoredFilePaths.forEach((p: string) => log.debug(`  Ignored: ${p}`));
    }
  }

  // Check both command-line options AND config settings
  const shouldPublishAppHandler = options.publishAppHandler ||
    (config.publishAppHandler ?? false);
  const shouldPublishAny = shouldPublishAppHandler;

  if (includedFiles.length === 0) {
    const noFilesMsg = "No files to upload after ignore rules.";
    if (displayManager.isInteractive()) statusDisplay.success(noFilesMsg);
    else console.log(colors.yellow(noFilesMsg));
    if (options.purge || shouldPublishAny) {
      log.info("Proceeding with purge/publish operations as requested despite no files to upload.");
    } else {
      return Deno.exit(0);
    }
  }

  if (includedFiles.length > 0) {
    const foundFilesMsg = `Found ${includedFiles.length} files to process for upload.`;
    if (displayManager.isInteractive()) statusDisplay.update(foundFilesMsg);
    else console.log(colors.green(foundFilesMsg));
  }

  return includedFiles;
}

/**
 * Fetch remote file entries from relays
 */
async function fetchRemoteFiles(publisherPubkey: string): Promise<FileEntry[]> {
  let remoteFileEntries: FileEntry[] = [];

  // We still need remote file info when purging, even if we're forcing uploads
  const shouldFetchRemote = !options.force || options.purge;
  const allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;

  if (shouldFetchRemote) {
    // Prefer configured relays but fall back to broadcast relays for reliability
    const primaryRelays = resolvedRelays.length > 0
      ? resolvedRelays
      : (allowFallbackRelays ? NSYTE_BROADCAST_RELAYS : []);

    if (primaryRelays.length > 0) {
      const reason = options.force && options.purge ? " (required for purge)" : "";
      statusDisplay.update(`Checking for existing files on remote relays${reason}...`);
      try {
        remoteFileEntries = await listRemoteFiles(primaryRelays, publisherPubkey);

        // If nothing found on the configured relays, retry with a broader relay set
        if (remoteFileEntries.length === 0 && resolvedRelays.length > 0 && allowFallbackRelays) {
          const fallbackRelays = Array.from(
            new Set([...resolvedRelays, ...NSYTE_BROADCAST_RELAYS]),
          );
          statusDisplay.update(
            `No files found on configured relays, retrying with default broadcast relays...`,
          );
          remoteFileEntries = await listRemoteFiles(fallbackRelays, publisherPubkey);
        }

        const remoteFoundMsg = remoteFileEntries.length > 0
          ? `Found ${remoteFileEntries.length} existing remote file entries.`
          : "No existing remote file entries found (could be relay availability).";

        if (displayManager.isInteractive()) {
          remoteFileEntries.length > 0
            ? statusDisplay.success(remoteFoundMsg)
            : statusDisplay.update(colors.yellow(remoteFoundMsg));
        } else {
          remoteFileEntries.length > 0
            ? console.log(colors.green(remoteFoundMsg))
            : console.log(colors.yellow(remoteFoundMsg));
        }
      } catch (e: unknown) {
        const errMsg = `Could not fetch remote file list: ${
          getErrorMessage(e)
        }. Proceeding as if no files exist remotely.`;
        if (displayManager.isInteractive()) statusDisplay.update(colors.yellow(errMsg));
        else console.log(colors.yellow(errMsg));
        log.warn(errMsg);
      }
    } else {
      const noRelayWarn =
        "No relays configured. Cannot check for existing remote files. Will upload all local files.";
      if (displayManager.isInteractive()) statusDisplay.update(colors.yellow(noRelayWarn));
      else console.log(colors.yellow(noRelayWarn));
    }
  } else {
    log.debug("Skipping remote file check because --force was provided without --purge");
  }
  return remoteFileEntries;
}

/**
 * Handle smart purge operations - only purge files not in current deployment
 */
async function handleSmartPurgeOperation(
  localFiles: FileEntry[],
  remoteEntries: FileEntry[],
): Promise<void> {
  // Find remote files that are not in the current local deployment
  const localFilePaths = new Set(localFiles.map((f) => f.path));
  const filesToPurge = remoteEntries.filter((remote) => !localFilePaths.has(remote.path));

  if (filesToPurge.length === 0) {
    const noPurgeMsg = "No unused remote files to purge.";
    if (displayManager.isInteractive()) statusDisplay.success(noPurgeMsg);
    else console.log(colors.green(noPurgeMsg));
    return;
  }

  const purgeList = filesToPurge.map((f) => f.path).join("\n  - ");
  // If --purge flag is provided, skip confirmation. Otherwise, ask interactively.
  let confirmPurge = true;
  if (!options.purge && !options.nonInteractive) {
    confirmPurge = await Confirm.prompt({
      message: `Purge ${filesToPurge.length} unused remote files?\n  - ${purgeList}\n\nContinue?`,
      default: false,
    });
  }

  if (!confirmPurge) {
    log.info("Purge cancelled.");
    return;
  }

  if (resolvedRelays.length === 0) {
    const noRelayErr = "Cannot purge remote files: No relays specified.";
    displayManager.isInteractive()
      ? statusDisplay.error(noRelayErr)
      : console.error(colors.red(noRelayErr));
    log.error(noRelayErr);
    return;
  }

  statusDisplay.update(`Purging ${filesToPurge.length} unused remote files...`);
  try {
    await purgeRemoteFiles(resolvedRelays, filesToPurge, signer);
    statusDisplay.success(`Purged ${filesToPurge.length} unused remote files.`);
  } catch (e: unknown) {
    const errMsg = `Error during purge operation: ${getErrorMessage(e)}`;
    statusDisplay.error(errMsg);
    log.error(errMsg);
  }
}

/**
 * Compare local and remote files to determine what needs to be transferred
 */
async function compareAndPrepareFiles(
  localFiles: FileEntry[],
  remoteFiles: FileEntry[],
): Promise<FilePreparationResult> {
  statusDisplay.update("Comparing local and remote files...");
  const { toTransfer: initialToTransfer, existing, toDelete } = compareFiles(
    localFiles,
    remoteFiles,
  );

  // When forcing uploads, re-upload unchanged files too
  const toTransfer = [...initialToTransfer];
  let unchanged = existing;

  if (options.force && existing.length > 0) {
    log.info(`--force enabled: re-uploading ${existing.length} unchanged files.`);
    toTransfer.push(...existing);
    unchanged = [];
  }

  const compareMsg = formatFileSummary(toTransfer.length, unchanged.length, toDelete.length);

  if (displayManager.isInteractive()) {
    statusDisplay.success(compareMsg);
  } else {
    console.log(colors.cyan(compareMsg));
  }

  log.info(
    `Comparison result: ${toTransfer.length} to upload, ${existing.length} unchanged, ${toDelete.length} to delete.`,
  );

  // Check both command-line options AND config settings
  const shouldPublishAppHandler = options.publishAppHandler ||
    (config.publishAppHandler ?? false);
  const shouldPublishAny = shouldPublishAppHandler;

  if (toTransfer.length === 0 && !options.force && !options.purge) {
    log.info("No new files to upload.");

    if (displayManager.isInteractive()) {
      const forceUpload = await Confirm.prompt({
        message: "No new files detected. Force upload anyway?",
        default: false,
      });

      if (!forceUpload) {
        log.info("Upload cancelled by user.");

        if (!shouldPublishAny) {
          await flushQueuedLogs();
          return Deno.exit(0);
        }
      } else {
        log.info("Forcing upload as requested by user.");
        statusDisplay.update("Forcing upload of all files...");
        toTransfer.push(...existing);
      }
    } else {
      const errMsg = "No new files to upload. Use --force to upload anyway.";
      console.error(colors.red(errMsg));
      log.error(errMsg);

      if (!shouldPublishAny) {
        await flushQueuedLogs();
        return Deno.exit(1);
      } else {
        log.info("Continuing with metadata publishing operations despite no files to upload.");
      }
    }
  }

  return { toTransfer, existing: unchanged, toDelete };
}

/**
 * Delete files marked for deletion
 */
async function deleteRemovedFiles(filesToDelete: FileEntry[]): Promise<void> {
  if (filesToDelete.length === 0) {
    return;
  }

  log.info(`Requesting deletion of ${filesToDelete.length} files from remote events`);

  statusDisplay.update(`Deleting ${filesToDelete.length} files...`);

  try {
    const deletedCount = await purgeRemoteFiles(
      resolvedRelays,
      filesToDelete,
      signer,
    );

    if (deletedCount > 0) {
      statusDisplay.success(`Deleted ${deletedCount} files`);
    } else {
      statusDisplay.error("Failed to delete any files");
    }
  } catch (e: unknown) {
    const errMsg = `Error during file deletion: ${getErrorMessage(e)}`;
    statusDisplay.error(errMsg);
    log.error(errMsg);
  }
}

/**
 * Load and prepare files for upload
 */
async function prepareFilesForUpload(filesToTransfer: FileEntry[]): Promise<FileEntry[]> {
  const preparedFiles: FileEntry[] = [];
  for (const file of filesToTransfer) {
    try {
      const fileWithData = await loadFileData(targetDir, file);
      preparedFiles.push(fileWithData);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(colors.red(`Failed to load file ${file.path}: ${errorMessage}`));
      messageCollector.addFileError(file.path, errorMessage);
    }
  }

  return preparedFiles;
}

export async function maybeProcessFiles(
  toTransfer: FileEntry[],
  toDelete: FileEntry[],
) {
  if (toTransfer.length > 0) {
    log.info("Processing files for upload...");

    try {
      const preparedFiles = await prepareFilesForUpload(toTransfer);

      await uploadFiles(preparedFiles);
    } catch (e: unknown) {
      const errMsg = `Error during upload process: ${getErrorMessage(e)}`;
      statusDisplay.error(errMsg);
      log.error(errMsg);
    }
  }

  if (toDelete.length > 0) {
    await deleteRemovedFiles(toDelete);
  }
}

/**
 * Publish site manifest event with all uploaded files
 */
async function publishSiteManifest(successfulUploads: UploadResponse[]): Promise<void> {
  if (successfulUploads.length === 0) {
    return;
  }

  statusDisplay.update("Creating site manifest event...");

  try {
    const publisherPubkey = await signer.getPublicKey();

    // Collect all file path mappings
    const fileMappings = successfulUploads
      .filter((r) => r.file.sha256)
      .map((r) => ({
        path: r.file.path,
        sha256: r.file.sha256!,
      }));

    if (fileMappings.length === 0) {
      log.warn("No files with hashes to include in manifest");
      return;
    }

    // Get site identifier from config (for named sites)
    // Use id from config, or empty string/null for root site
    const siteId = config.id === null || config.id === "" ? undefined : config.id;

    // Prepare metadata - use config values (these are recommendations for others)
    // Operational relays/servers (from kind 10002/10063) are used for publishing, not in metadata
    const manifestRelays = options.relays?.split(",").filter((r) => r.trim()) || config.relays ||
      [];
    const manifestServers = options.servers?.split(",").filter((s) => s.trim()) || config.servers ||
      [];

    const metadata = {
      title: config.title,
      description: config.description,
      servers: manifestServers, // Use config values for metadata (recommendations)
      relays: manifestRelays, // Use config values for metadata (recommendations)
    };

    // Create manifest event
    const manifestEvent = await createSiteManifestEvent(
      signer,
      publisherPubkey,
      fileMappings,
      siteId,
      metadata,
    );

    // Publish manifest event using discovered relays (from kind 10002)
    statusDisplay.update("Publishing site manifest event...");
    const success = await publishEventsToRelays(resolvedRelays, [manifestEvent]);

    if (success) {
      statusDisplay.success(`Site manifest event published (${fileMappings.length} files)`);
      console.log(formatSectionHeader("Site Manifest Event (nostr)"));
      console.log(colors.green(`✓ Site manifest event successfully published to relays`));
      console.log(colors.cyan(`  Event ID: ${manifestEvent.id.substring(0, 16)}...`));
      console.log(colors.cyan(`  Files: ${fileMappings.length}`));
      if (siteId) {
        console.log(colors.cyan(`  Site: ${siteId} (named site)`));
      } else {
        console.log(colors.cyan(`  Site: root site`));
      }
      console.log("");

      // Add to message collector
      messageCollector.addEventSuccess("site manifest", manifestEvent.id);
    } else {
      statusDisplay.error("Failed to publish site manifest event");
      console.log(formatSectionHeader("Site Manifest Event (nostr)"));
      console.log(colors.red(`✗ Failed to publish site manifest event to relays`));
      console.log(
        colors.yellow("Files are uploaded but may not be immediately visible in the nsite."),
      );
      console.log(
        colors.yellow("Try running the deploy command again to republish the manifest."),
      );
      console.log("");
    }
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    statusDisplay.error(`Failed to create/publish manifest: ${errorMessage}`);
    log.error(`Error creating/publishing site manifest: ${errorMessage}`);
    console.log(formatSectionHeader("Site Manifest Event (𓅦 nostr)"));
    console.log(colors.red(`✗ Error: ${errorMessage}`));
    console.log("");
  }
}

/**
 * Upload prepared files to servers and publish to relays
 */
async function uploadFiles(preparedFiles: FileEntry[]): Promise<UploadResponse[]> {
  if (preparedFiles.length === 0) {
    statusDisplay.error("No files could be loaded for upload.");
    return [];
  }

  statusDisplay.update(`Uploading ${preparedFiles.length} files...`);

  const { fallback } = options;

  const totalFiles = fallback ? preparedFiles.length + 1 : preparedFiles.length;

  setProgressMode(true);
  progressRenderer = new ProgressRenderer(totalFiles);
  progressRenderer.start();

  if (resolvedServers.length === 0) {
    throw new Error("No servers configured for upload");
  }

  const uploadResponses = await processUploads(
    preparedFiles,
    targetDir,
    resolvedServers,
    signer,
    resolvedRelays,
    options.concurrency,
    (progress) => {
      progressRenderer.update(progress);
    },
  );

  progressRenderer.stop();
  setProgressMode(false);

  if (uploadResponses.length > 0) {
    const uploadedCount = uploadResponses.filter((r) => r.success).length;
    const uploadedSize = uploadResponses.reduce((sum, r) => sum + (r.file.size || 0), 0);

    for (const result of uploadResponses) {
      if (result.success) {
        if (result.file.sha256) {
          messageCollector.addFileSuccess(result.file.path, result.file.sha256);
        }
      } else if (result.error) {
        messageCollector.addFileError(result.file.path, result.error);
      }
    }

    flushQueuedLogs();
    console.log("");

    if (uploadedCount === preparedFiles.length) {
      const msg = `${uploadedCount} files uploaded successfully (${formatFileSize(uploadedSize)})`;
      progressRenderer.complete(true, msg);
    } else if (uploadedCount > 0) {
      const msg = `${uploadedCount}/${preparedFiles.length} files uploaded successfully (${
        formatFileSize(uploadedSize)
      })`;
      progressRenderer.complete(false, msg);
    } else {
      const msg = "Failed to upload any files";
      progressRenderer.complete(false, msg);
    }

    console.log("");

    if (
      messageCollector.hasMessageType("relay-rejection") ||
      messageCollector.hasMessageType("connection-error")
    ) {
      console.log(formatSectionHeader("Relay Issues"));
      messageCollector.printRelayIssuesSummary();
    }

    if (messageCollector.hasMessageType("error")) {
      console.log(formatSectionHeader("Errors"));
      messageCollector.printErrorSummary();
    }

    if (uploadedCount > 0) {
      console.log(formatSectionHeader("Blobs Upload Results (Blossom)"));
      if (uploadedCount === preparedFiles.length) {
        console.log(colors.green(`✓ All ${uploadedCount} files successfully uploaded`));
      } else {
        console.log(
          colors.yellow(`${uploadedCount}/${preparedFiles.length} files successfully uploaded`),
        );
      }
      messageCollector.printFileSuccessSummary();
      console.log("");
    }

    console.log(formatSectionHeader("Blossom Server Summary"));
    const serverResults: Record<string, { success: number; total: number }> = {};
    for (const server of resolvedServers) {
      serverResults[server] = { success: 0, total: 0 };
    }
    for (const result of uploadResponses) {
      if (result.success) {
        for (const [server, status] of Object.entries(result.serverResults)) {
          if (!serverResults[server]) {
            serverResults[server] = { success: 0, total: 0 };
          }
          serverResults[server].total++;
          if (status.success) {
            serverResults[server].success++;
          }
        }
      }
    }
    console.log(formatServerResults(serverResults));
    console.log("");

    // Create and publish site manifest event after all files are uploaded
    if (uploadedCount > 0 && resolvedRelays.length > 0) {
      await publishSiteManifest(uploadResponses.filter((r) => r.success));
    }
  } else {
    progressRenderer.stop();
    console.log(colors.red("No upload responses received from servers."));
  }

  if (messageCollector.hasMessageCategory(MessageCategory.SERVER)) {
    console.log(formatSectionHeader("Server Messages"));
    for (
      const { type, target, content } of messageCollector.getMessagesByCategory(
        MessageCategory.SERVER,
      )
    ) {
      const prefix = type === "error" ? colors.red("Error") : colors.yellow("Warning");
      log.info(`${prefix} from ${target}: ${content}`);
    }
  }

  return uploadResponses;
}

/**
 * Process and upload fallback file
 */
async function processFallbackFile(): Promise<void> {
  const fallbackPath = options.fallback || config.fallback;

  if (!fallbackPath) {
    return;
  }

  try {
    const fallbackFile = join(targetDir, fallbackPath);
    const destFile = join(targetDir, "404.html");

    statusDisplay.update(`Copying fallback file ${formatFilePath(fallbackPath)} to 404.html...`);

    await copy(fallbackFile, destFile, { overwrite: true });

    const fallbackFileEntry: FileEntry = {
      path: "404.html",
      contentType: "text/html",
    };

    const fallbackFileData = await loadFileData(targetDir, fallbackFileEntry);

    statusDisplay.update("Uploading 404.html fallback file...");
    const fallbackUploads = await processUploads(
      [fallbackFileData],
      targetDir,
      resolvedServers,
      signer,
      resolvedRelays,
      1,
      (progress) => {
        progressRenderer.update(progress);
      },
    );

    if (fallbackUploads[0]?.success) {
      statusDisplay.success(`Fallback file uploaded as 404.html`);
    } else {
      if (fallbackUploads[0]?.error) {
        statusDisplay.error(`Failed to upload fallback file: ${fallbackUploads[0].error}`);
      } else {
        statusDisplay.error(`Failed to upload fallback file`);
      }
    }
  } catch (e: unknown) {
    const errMsg = `Error processing fallback file: ${getErrorMessage(e)}`;
    if (displayManager.isInteractive()) {
      statusDisplay.error(errMsg);
    } else {
      console.error(colors.red(errMsg));
    }
    log.error(errMsg);
  }
}

/**
 * Publish metadata to relays (profile, relay list, server list, app handler, file metadata)
 */
async function maybePublishMetadata(includedFiles: FileEntry[]): Promise<void> {
  log.debug("maybePublishMetadata called");

  const usermeta_relays = ["wss://user.kindpag.es", "wss://purplepag.es", "wss://relay.nostr.band"];
  // const nsite_relays = ['wss://relay.nsite.lol']

  // Check both command-line options AND config settings
  const shouldPublishAppHandler = options.publishAppHandler ||
    (config.publishAppHandler ?? false);

  log.debug(
    `Publish flags - from options: appHandler=${options.publishAppHandler}`,
  );
  log.debug(
    `Publish flags - from config: appHandler=${config.publishAppHandler}`,
  );
  log.debug(
    `Publish flags - combined: appHandler=${shouldPublishAppHandler}`,
  );

  if (!shouldPublishAppHandler) {
    log.debug("No metadata events requested for publishing, returning early");
    return;
  }

  console.log(formatSectionHeader("Metadata Events Publish Results"));

  // Get relays from the user's 10002 list if present
  const publisherPubkey = await signer.getPublicKey();
  let discoveredRelayList: string[] = [];
  try {
    const relayListEvent = await fetchUserRelayList(usermeta_relays, publisherPubkey);
    if (relayListEvent) {
      discoveredRelayList = getOutboxes(relayListEvent);
      log.debug(`Discovered ${discoveredRelayList.length} relays from user's relay list`);
    }
  } catch (e) {
    log.debug(`Failed to fetch relay list: ${getErrorMessage(e)}`);
  }

  try {
    if (shouldPublishAppHandler) {
      statusDisplay.update("Publishing NIP-89 app handler...");

      try {
        // Get event kinds from command line or config
        let kinds: number[] = [];
        if (options.handlerKinds) {
          kinds = options.handlerKinds.split(",").map((k) => parseInt(k.trim())).filter((k) =>
            !isNaN(k)
          );
        } else if (config.appHandler?.kinds) {
          kinds = config.appHandler.kinds;
        }

        if (kinds.length === 0) {
          statusDisplay.error("No event kinds specified for app handler");
          log.error("App handler requires event kinds to be specified");
        } else {
          // Get the gateway URL - use the first configured hostname or default
          const gatewayHostname = config.gatewayHostnames?.[0] || "nsite.lol";
          const publisherPubkey = await signer.getPublicKey();
          const npub = npubEncode(publisherPubkey);
          const gatewayUrl = `https://${npub}.${gatewayHostname}`;

          // Get metadata from config if available
          const metadata = config.appHandler?.name || config.appHandler?.description
            ? {
              name: config.appHandler.name,
              description: config.appHandler.description,
            }
            : undefined;

          // Prepare handlers object
          const handlers: any = {
            web: {
              url: gatewayUrl,
              patterns: config.appHandler?.platforms?.web?.patterns,
            },
          };

          // Add other platform handlers if configured
          if (config.appHandler?.platforms) {
            const { android, ios, macos, windows, linux } = config.appHandler.platforms;
            if (android) handlers.android = android;
            if (ios) handlers.ios = ios;
            if (macos) handlers.macos = macos;
            if (windows) handlers.windows = windows;
            if (linux) handlers.linux = linux;
          }

          const handlerEvent = await createAppHandlerEvent(
            signer,
            kinds,
            handlers,
            metadata,
          );
          log.debug(`Created app handler event: ${JSON.stringify(handlerEvent)}`);
          const appHandlerPublishRelays = Array.from(
            new Set([...resolvedRelays, ...usermeta_relays, ...discoveredRelayList]),
          );
          await publishEventsToRelays(appHandlerPublishRelays, [handlerEvent]);
          statusDisplay.success(
            `App handler published for kinds: ${
              kinds.join(", ")
            } to ${appHandlerPublishRelays.length} relays`,
          );
        }
      } catch (e: unknown) {
        statusDisplay.error(`Failed to publish app handler: ${getErrorMessage(e)}`);
        log.error(`App handler publication error: ${getErrorMessage(e)}`);
      }
    }
  } catch (e: unknown) {
    const errMsg = `Error during metadata publishing: ${getErrorMessage(e)}`;
    statusDisplay.error(errMsg);
    log.error(errMsg);
  }

  if (messageCollector.hasMessageCategory(MessageCategory.RELAY)) {
    log.info(formatSectionHeader("Relay Messages"));

    const relayResults: Record<string, { success: number; total: number }> = {};
    const relayMessages = messageCollector.getMessagesByCategory(MessageCategory.RELAY);

    for (const message of relayMessages) {
      const relayUrl = message.target;
      if (!relayResults[relayUrl]) {
        relayResults[relayUrl] = { success: 0, total: 0 };
      }

      relayResults[relayUrl].total++;
      if (message.type === "success") {
        relayResults[relayUrl].success++;
      }
    }

    console.log(formatServerResults(relayResults));
  }

  log.debug("Metadata publishing completed");
}
