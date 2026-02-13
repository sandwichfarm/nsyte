import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { join } from "@std/path";
import { mergeBlossomServers } from "applesauce-common/helpers";
import { getOutboxes, npubEncode, relaySet } from "applesauce-core/helpers";
import { type ISigner, NostrConnectSigner } from "applesauce-signers";
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
import { getErrorMessage, handleError } from "../lib/error-utils.ts";
import { compareFiles, getLocalFiles, loadFileData } from "../lib/files.ts";
import { createLogger, flushQueuedLogs, setProgressMode } from "../lib/logger.ts";
import { MessageCategory, MessageCollector } from "../lib/message-collector.ts";
import { publishMetadata } from "../lib/metadata/publisher.ts";
import { getNbunkString, importFromNbunk, initiateNostrConnect } from "../lib/nip46.ts";
import {
  createSiteManifestEvent,
  fetchUserRelayList,
  type FileEntry,
  getUserBlossomServers,
  getUserDisplayName,
  getUserOutboxes,
  listRemoteFiles,
  publishEventsToRelays,
  purgeRemoteFiles,
} from "../lib/nostr.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { processUploads, type UploadResponse } from "../lib/upload.ts";
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
import { loadAsyncMap } from "applesauce-loaders/helpers";

// LOGGER
const log = createLogger("deploy");

// TYPES ----------------------------------------------------------------------------------------------------- //

/**
 * Deploy command options
 */
export interface DeployCommandOptions {
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

/**
 * Deployment state container
 */
interface DeploymentState {
  displayManager: DisplayManager;
  statusDisplay: StatusDisplay;
  messageCollector: MessageCollector;
  signer: ISigner;
  progressRenderer: ProgressRenderer;
  config: ProjectConfig;
  options: DeployCommandOptions;
  resolvedRelays: string[];
  resolvedServers: string[];
  targetDir: string;
  fallbackFileEntry: FileEntry | null;
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
    .option(
      "--fallback <file:string>",
      "An HTML file to reference as 404.html (creates path mapping with same hash)",
    )
    .option("-i, --non-interactive", "Run in non-interactive mode", { default: false })
    .action(async (options: DeployCommandOptions, folder: string) => {
      // Show deprecation notice if using upload alias
      const cmdName = Deno.args[0];
      if (cmdName === "upload") {
        console.log(
          colors.yellow("⚠️  The 'upload' command is deprecated. Please use 'deploy' instead.\n"),
        );
      }
      await deployCommand(folder, options);
    })
    .error((error) => {
      handleError("Error deploying site", error, {
        showConsole: true,
        exit: true,
        exitCode: 1,
      });
    });
}

// ------------------------------------------------------------------------------------------------ //

/**
 * Implements the primary deploy command functionality for nsyte
 *
 * This function handles the entire deployment workflow including:
 * - Initializing state and configuration
 * - Resolving project context and authentication
 * - Setting up signing capabilities
 * - Scanning local files
 * - Fetching and comparing remote files
 * - Processing file uploads/deletions
 * - Publishing metadata
 * - Displaying results
 *
 * @param fileOrFolder - Path to the file or folder to deploy, relative to current working directory
 * @param options - Deploy command options
 */
export async function deployCommand(
  fileOrFolder: string,
  options: DeployCommandOptions,
): Promise<void> {
  log.debug("Begin nsyte deployment");

  // Initialize display and state
  const displayManager = getDisplayManager();
  displayManager.configureFromOptions(options);
  const statusDisplay = new StatusDisplay();
  const messageCollector = new MessageCollector(displayManager.isInteractive());

  try {
    const currentWorkingDir = Deno.cwd();
    const targetDir = join(currentWorkingDir, fileOrFolder);
    const context = await resolveContext(options);

    if (context.error) {
      statusDisplay.error(context.error);
      log.error(`Configuration error: ${context.error}`);
      return Deno.exit(1);
    }

    const { authKeyHex, config } = context;

    if (!config) {
      statusDisplay.error("Critical error: Project data could not be resolved.");
      log.error("Critical error: Project data is null after context resolution.");
      return Deno.exit(1);
    }

    const signerResult = await initSigner(authKeyHex, config, options);

    if ("error" in signerResult) {
      statusDisplay.error(`Signer: ${signerResult.error}`);
      log.error(`Signer initialization failed: ${signerResult.error}`);
      return Deno.exit(1);
    }

    const signer = signerResult;
    const publisherPubkey = await signer.getPublicKey();

    // Get config values for manifest metadata (these are recommendations for others)
    const manifestRelays = options.relays?.split(",").filter((r) => r.trim()) || config.relays ||
      [];
    const manifestServers = options.servers?.split(",").filter((s) => s.trim()) || config.servers ||
      [];

    // Fetch kind 10002 and 10063 to get user's preferred relays/servers for operations
    statusDisplay.update("Discovering user preferences...");
    const userPreferences = await loadAsyncMap({
      displayName: getUserDisplayName(publisherPubkey),
      outboxes: getUserOutboxes(publisherPubkey),
      servers: getUserBlossomServers(publisherPubkey),
    }, 5000);
    const resolvedRelays = relaySet(userPreferences.outboxes, manifestRelays);
    const resolvedServers = mergeBlossomServers(
      userPreferences.servers,
      manifestServers,
    );

    // Validate resolved configuration
    if (resolvedServers.length === 0 && manifestServers.length === 0) {
      log.warn("No servers configured or discovered - uploads will fail");
    }
    if (resolvedRelays.length === 0 && manifestRelays.length === 0) {
      log.warn("No relays configured or discovered - publishing will fail");
    }

    // Create deployment state
    const state: Partial<DeploymentState> = {
      displayManager,
      statusDisplay,
      messageCollector,
      signer,
      config,
      options,
      resolvedRelays: resolvedRelays.length > 0 ? resolvedRelays : manifestRelays,
      resolvedServers: resolvedServers.length > 0 ? resolvedServers : manifestServers,
      targetDir,
      progressRenderer: new ProgressRenderer(0), // Will be updated later
      fallbackFileEntry: null,
    };

    displayConfig(state as DeploymentState, publisherPubkey, userPreferences.displayName);

    const includedFiles = await scanLocalFiles(state as DeploymentState);

    // Find fallback file in scanned files if configured
    state.fallbackFileEntry = findFallbackFile(state as DeploymentState, includedFiles);

    const remoteFileEntries = await fetchRemoteFiles(state as DeploymentState, publisherPubkey);
    const { toTransfer, toDelete } = await compareAndPrepareFiles(
      state as DeploymentState,
      includedFiles,
      remoteFileEntries,
    );

    await maybeProcessFiles(
      state as DeploymentState,
      toTransfer,
      toDelete,
      includedFiles,
      remoteFileEntries,
    );
    await maybePublishMetadata(state as DeploymentState, publisherPubkey);

    // Handle smart purge AFTER upload
    if (options.purge) {
      await handleSmartPurgeOperation(state as DeploymentState, includedFiles, remoteFileEntries);
    }

    if (includedFiles.length === 0 && toDelete.length === 0 && toTransfer.length === 0) {
      log.info("No effective operations performed.");
    }

    flushQueuedLogs();
    displayGatewayUrl(config, publisherPubkey);

    return Deno.exit(0);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    statusDisplay.error(`Deploy command failed: ${errorMessage}`);
    log.error(`Deploy command failed: ${errorMessage}`);
    return Deno.exit(1);
  }
}

/**
 * Display gateway URLs where the deployed site is available
 */
function displayGatewayUrl(config: ProjectConfig, publisherPubkey: string): void {
  const npub = npubEncode(publisherPubkey);
  const { gatewayHostnames, id } = config;
  const siteId = id === null || id === "" ? undefined : id;
  const isNamedSite = !!siteId;

  console.log(colors.green(`\nThe nsite is now available on any nsite gateway, for example:`));
  for (const gatewayHostname of gatewayHostnames || []) {
    if (isNamedSite) {
      console.log(colors.blue.underline(`https://${siteId}.${npub}.${gatewayHostname}/`));
    } else {
      console.log(colors.blue.underline(`https://${npub}.${gatewayHostname}/`));
    }
  }
  console.log(colors.green(`\nYou can also run the command:`));

  console.log(
    colors.magenta.bold(isNamedSite ? `nsyte run ${siteId}.${npub}` : `nsyte run ${npub}`),
  );
}

/**
 * Resolve project context (configuration and authentication)
 */
async function resolveContext(
  options: DeployCommandOptions,
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

/**
 * Initialize signer from available authentication options
 */
async function initSigner(
  authKeyHex: string | null | undefined,
  config: ProjectConfig,
  options: DeployCommandOptions,
): Promise<ISigner | { error: string }> {
  // Use the unified signer factory for CLI-provided secrets or interactively-provided secrets
  // Priority: CLI option > interactive input > config bunker
  const signerResult = await createSignerFromFactory({
    sec: options.sec || authKeyHex || undefined,
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
          const bunkerSigner = await reconnectToBunker(config);
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
async function reconnectToBunker(config: ProjectConfig): Promise<ISigner | null> {
  const bunkerPubkey = config.bunkerPubkey;
  if (!bunkerPubkey) {
    return null;
  }
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

/**
 * Display deployment configuration
 */
function displayConfig(
  state: DeploymentState,
  publisherPubkey: string,
  displayName?: string,
): void {
  const { displayManager, config, options, resolvedRelays, resolvedServers } = state;
  const userDisplay = displayName || publisherPubkey;

  if (displayManager.isInteractive()) {
    console.log(formatTitle("Deployment Configuration"));
    console.log(formatConfigValue("User", userDisplay, false));

    // Display site type (root site vs named site)
    const siteId = config.id === null || config.id === "" ? undefined : config.id;
    const siteType = siteId ? `Named site: ${siteId}` : "Root site";
    console.log(formatConfigValue("Site Type", siteType, false));

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
    console.log(colors.cyan(`User: ${userDisplay}`));

    // Display site type (root site vs named site)
    const siteId = config.id === null || config.id === "" ? undefined : config.id;
    const siteType = siteId ? `Named site: ${siteId}` : "Root site";
    console.log(colors.cyan(`Site Type: ${siteType}`));

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
 * Find fallback file in included files by exact path match
 */
function findFallbackFile(state: DeploymentState, includedFiles: FileEntry[]): FileEntry | null {
  const { options, config } = state;
  const fallbackPath = options.fallback || config.fallback;

  if (!fallbackPath) {
    return null;
  }

  // Normalize the fallback path to match FileEntry path format (leading slash)
  const normalizedFallbackPath = fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`;

  // Find the file by exact path match
  const found = includedFiles.find((file) => file.path === normalizedFallbackPath);

  if (!found) {
    log.warn(
      `Configured fallback file '${fallbackPath}' (normalized: ${normalizedFallbackPath}) not found in scanned files.`,
    );
    if (!options.nonInteractive) {
      console.log(
        colors.yellow(
          `Warning: Fallback file '${fallbackPath}' not found in scanned files. 404.html will not be created.`,
        ),
      );
    }
    return null;
  }

  log.info(`Found fallback file: ${found.path}`);
  return found;
}

/**
 * Scan local files in the target directory
 */
async function scanLocalFiles(state: DeploymentState): Promise<FileEntry[]> {
  const { statusDisplay, displayManager, options, config, targetDir } = state;

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
async function fetchRemoteFiles(
  state: DeploymentState,
  publisherPubkey: string,
): Promise<FileEntry[]> {
  const { statusDisplay, displayManager, options, resolvedRelays } = state;
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
  state: DeploymentState,
  localFiles: FileEntry[],
  remoteEntries: FileEntry[],
): Promise<void> {
  const { statusDisplay, displayManager, options, resolvedRelays, signer } = state;

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
  state: DeploymentState,
  localFiles: FileEntry[],
  remoteFiles: FileEntry[],
): Promise<FilePreparationResult> {
  const { statusDisplay, displayManager, options, config } = state;

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
async function deleteRemovedFiles(
  state: DeploymentState,
  filesToDelete: FileEntry[],
): Promise<void> {
  if (filesToDelete.length === 0) {
    return;
  }

  const { statusDisplay, resolvedRelays, signer } = state;

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
async function prepareFilesForUpload(
  state: DeploymentState,
  filesToTransfer: FileEntry[],
): Promise<FileEntry[]> {
  const { messageCollector, targetDir } = state;
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

/**
 * Process file uploads and deletions
 */
async function maybeProcessFiles(
  state: DeploymentState,
  toTransfer: FileEntry[],
  toDelete: FileEntry[],
  includedFiles: FileEntry[],
  remoteFileEntries: FileEntry[],
): Promise<void> {
  const { statusDisplay, resolvedRelays } = state;

  if (toTransfer.length > 0) {
    log.info("Processing files for upload...");

    try {
      const preparedFiles = await prepareFilesForUpload(state, toTransfer);

      await uploadFiles(state, preparedFiles, includedFiles, remoteFileEntries);
    } catch (e: unknown) {
      const errMsg = `Error during upload process: ${getErrorMessage(e)}`;
      statusDisplay.error(errMsg);
      log.error(errMsg);
    }
  } else {
    // Even if no files to upload, we may need to publish manifest with existing files
    // (e.g., when files were deleted or metadata changed)
    if (includedFiles.length > 0 && resolvedRelays.length > 0) {
      await publishSiteManifest(state, includedFiles, remoteFileEntries, []);
    }
  }

  if (toDelete.length > 0) {
    await deleteRemovedFiles(state, toDelete);
  }
}

/**
 * Publish site manifest event with all files in the site
 * According to NIP-XX, the manifest MUST include ALL path mappings, not just changed files
 */
async function publishSiteManifest(
  state: DeploymentState,
  includedFiles: FileEntry[],
  remoteFileEntries: FileEntry[],
  uploadResponses: UploadResponse[],
): Promise<void> {
  const {
    statusDisplay,
    signer,
    config,
    options,
    resolvedRelays,
    messageCollector,
    fallbackFileEntry,
  } = state;

  // Build a complete file mapping from all local files
  // This ensures the manifest includes ALL files, not just newly uploaded ones
  const fileMappingsMap = new Map<string, { path: string; sha256: string }>();

  // First, add all files from upload responses (newly uploaded or re-uploaded files)
  for (const response of uploadResponses) {
    if (response.success && response.file.sha256) {
      fileMappingsMap.set(response.file.path, {
        path: response.file.path,
        sha256: response.file.sha256,
      });
    }
  }

  // Then, add unchanged files from remote entries (files that weren't uploaded)
  // Use the sha256 from remote entries for files that exist locally but weren't uploaded
  // Normalize paths for comparison (same logic as compareFiles)
  const normalizePath = (path: string) => path.replace(/^\/+/, "/").toLowerCase();

  for (const localFile of includedFiles) {
    const normalizedLocalPath = normalizePath(localFile.path);

    // Check if this file was already added from upload responses
    const alreadyInMap = Array.from(fileMappingsMap.keys()).some(
      (mappedPath) => normalizePath(mappedPath) === normalizedLocalPath,
    );

    if (!alreadyInMap) {
      // Find the corresponding remote file entry to get its sha256
      const remoteFile = remoteFileEntries.find(
        (r) => normalizePath(r.path) === normalizedLocalPath,
      );

      if (remoteFile?.sha256) {
        fileMappingsMap.set(localFile.path, {
          path: localFile.path,
          sha256: remoteFile.sha256,
        });
      } else if (localFile.sha256) {
        // Fallback: use local file's sha256 if available
        // This can happen for new files that weren't uploaded yet (shouldn't happen in normal flow)
        fileMappingsMap.set(localFile.path, {
          path: localFile.path,
          sha256: localFile.sha256,
        });
      }
    }
  }

  // Add 404.html entry if fallback file was found
  if (fallbackFileEntry) {
    const normalizedFallbackPath = normalizePath(fallbackFileEntry.path);

    // Find the hash for the fallback file from the mappings we just built
    let fallbackHash: string | undefined;

    // First, try to find it in upload responses
    const fallbackUploadResponse = uploadResponses.find(
      (r) => r.success && r.file.sha256 && normalizePath(r.file.path) === normalizedFallbackPath,
    );
    if (fallbackUploadResponse?.file.sha256) {
      fallbackHash = fallbackUploadResponse.file.sha256;
    } else {
      // Try to find it in remote entries
      const fallbackRemoteFile = remoteFileEntries.find(
        (r) => normalizePath(r.path) === normalizedFallbackPath,
      );
      if (fallbackRemoteFile?.sha256) {
        fallbackHash = fallbackRemoteFile.sha256;
      } else if (fallbackFileEntry.sha256) {
        // Use the hash from the file entry itself if available
        fallbackHash = fallbackFileEntry.sha256;
      }
    }

    if (fallbackHash) {
      fileMappingsMap.set("/404.html", {
        path: "/404.html",
        sha256: fallbackHash,
      });
      log.info(
        `Added 404.html entry pointing to fallback file hash: ${fallbackHash.substring(0, 8)}...`,
      );
    } else {
      log.warn(
        `Fallback file found but no hash available. 404.html will not be added to manifest.`,
      );
      if (!options.nonInteractive) {
        console.log(
          colors.yellow(
            `Warning: Fallback file found but no hash available. 404.html will not be added to manifest.`,
          ),
        );
      }
    }
  }

  const fileMappings = Array.from(fileMappingsMap.values());

  if (fileMappings.length === 0) {
    log.warn("No files with hashes to include in manifest");
    return;
  }

  statusDisplay.update("Creating site manifest event...");

  try {
    const publisherPubkey = await signer.getPublicKey();

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

    // Display manifest event information before creating
    console.log(formatSectionHeader("Site Manifest Event (nostr)"));
    console.log(colors.cyan(`Creating site manifest event with:`));
    console.log(colors.cyan(`  Files: ${fileMappings.length}`));
    console.log(colors.cyan(`  Relays: ${manifestRelays.length}`));
    console.log(colors.cyan(`  Servers: ${manifestServers.length}`));
    console.log("");

    // Create manifest event
    const manifestEvent = await createSiteManifestEvent(
      signer,
      publisherPubkey,
      fileMappings,
      siteId,
      metadata,
    );

    // Display event ID after signing
    console.log(colors.green(`✓ Site manifest event signed`));
    console.log(colors.cyan(`  Event ID: ${manifestEvent.id}`));
    console.log("");

    // Publish manifest event using discovered relays (from kind 10002)
    statusDisplay.update("Publishing site manifest event...");
    const success = await publishEventsToRelays(resolvedRelays, [manifestEvent]);

    if (success) {
      console.log(colors.green(`✓ Site manifest event successfully published to relays`));
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
    console.log(colors.red(`✗ Error: ${errorMessage}`));
    console.log("");
  }
}

/**
 * Upload prepared files to servers and publish to relays
 */
async function uploadFiles(
  state: DeploymentState,
  preparedFiles: FileEntry[],
  includedFiles: FileEntry[],
  remoteFileEntries: FileEntry[],
): Promise<UploadResponse[]> {
  const {
    statusDisplay,
    messageCollector,
    targetDir,
    resolvedServers,
    signer,
    resolvedRelays,
    options,
  } = state;

  if (preparedFiles.length === 0) {
    statusDisplay.error("No files could be loaded for upload.");
    return [];
  }

  statusDisplay.update(`Uploading ${preparedFiles.length} files...`);

  setProgressMode(true);
  const progressRenderer = new ProgressRenderer(preparedFiles.length);
  state.progressRenderer = progressRenderer;
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
    // Always publish manifest if there are any files, even if no uploads occurred
    // (e.g., when only metadata needs updating or files were deleted)
    if (includedFiles.length > 0 && resolvedRelays.length > 0) {
      await publishSiteManifest(
        state,
        includedFiles,
        remoteFileEntries,
        uploadResponses.filter((r) => r.success),
      );
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
 * Publish metadata to relays (app handler, etc.)
 */
async function maybePublishMetadata(
  state: DeploymentState,
  publisherPubkey: string,
): Promise<void> {
  const { statusDisplay, signer, config, options, resolvedRelays, messageCollector } = state;

  log.debug("maybePublishMetadata called");

  const usermeta_relays = ["wss://user.kindpag.es", "wss://purplepag.es"];

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

  // Combine all relays for publishing
  const publishToRelays = Array.from(
    new Set([...resolvedRelays, ...usermeta_relays, ...discoveredRelayList]),
  );

  // Use the centralized metadata publisher
  await publishMetadata(config, signer, publishToRelays, statusDisplay, {
    publishAppHandler: shouldPublishAppHandler,
    handlerKinds: options.handlerKinds,
  });

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

    for (const [relay, result] of Object.entries(relayResults)) {
      const status = result.success === result.total
        ? colors.green("✓")
        : result.success === 0
        ? colors.red("✗")
        : colors.yellow("⚠");
      log.info(`  ${status} ${relay}: ${result.success}/${result.total} events`);
    }
  }
}
