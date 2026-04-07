import { colors } from "@cliffy/ansi/colors";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { hexToBytes } from "@noble/hashes/utils";
import { join } from "@std/path";
import { getOutboxes, naddrEncode, npubEncode, relaySet } from "applesauce-core/helpers";
import { loadAsyncMap } from "applesauce-loaders/helpers";
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
import { NSITE_NAME_SITE_KIND } from "../lib/manifest.ts";
import { MessageCategory, MessageCollector } from "../lib/message-collector.ts";
import { publishMetadata } from "../lib/metadata/publisher.ts";
import { getNbunkString, importFromNbunk, initiateNostrConnect } from "../lib/nip46.ts";
import { encodePubkeyBase36, validateDTag } from "../lib/nip5a.ts";
import {
  createSiteManifestEvent,
  type EventPublishResult,
  fetchUserRelayList,
  type FileEntry,
  getUserDisplayName,
  getUserOutboxes,
  publishEventsToRelaysDetailed,
  type RelayPublishResult,
} from "../lib/nostr.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { normalizeSiteIdentifier, resolveSiteIdentifier } from "../lib/site-identifier.ts";
import { listTrustedRemoteFiles } from "../lib/site-manifest.ts";
import { processUploads, type UploadResponse } from "../lib/upload.ts";
import { detectSourceUrl, parseRelayInput, truncateString } from "../lib/utils.ts";
import {
  formatConfigValue,
  formatFilePath,
  formatFileSize,
  formatFileSummary,
  formatRelayList,
  formatRelayPublishResults,
  formatSectionHeader,
  formatSuccessRatio,
  formatTable,
  formatTitle,
} from "../ui/formatters.ts";
import { ProgressRenderer } from "../ui/progress.ts";
import { getServerSymbol, SERVER_COLORS } from "../ui/source-indicators.ts";
import { StatusDisplay } from "../ui/status.ts";
import nsyte from "./root.ts";

import { collectDeployEvents, handleDryRunOutput } from "../lib/dry-run/mod.ts";
import { scanFileList, type ScanLevel } from "../lib/scanner/mod.ts";
import { displayScanReport } from "./scan.ts";

// LOGGER
const log = createLogger("deploy");

// TYPES ----------------------------------------------------------------------------------------------------- //

/**
 * Deploy command options
 */
export interface DeployCommandOptions {
  config?: string | false;
  force: boolean;
  verbose: boolean;
  sync: boolean;
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
  publishProfile: boolean;
  publishRelayList: boolean;
  publishServerList: boolean;
  handlerKinds?: string;
  nonInteractive: boolean;
  name?: string;
  /** Preview what would be deployed without uploading or publishing */
  dryRun: boolean;
  /** Custom output directory for dry-run event previews */
  dryRunOutput?: string;
  /** Comma-separated event kinds to also print to stdout during dry-run */
  dryRunShowKinds?: string;
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

/** Result from publishing the site manifest event */
export interface ManifestPublishResult {
  /** Whether the manifest event was created (signed) successfully */
  created: boolean;
  /** Whether the manifest was published to at least one relay */
  published: boolean;
  /** The manifest event ID if created */
  eventId?: string;
  /** Per-relay publish results */
  relayResults?: RelayPublishResult[];
  /** Error message if creation or publishing failed */
  error?: string;
  /** Number of relays that accepted the manifest */
  successCount: number;
  /** Number of relays that rejected the manifest */
  failureCount: number;
}

/** Result from the upload phase (file uploads + manifest publish) */
export interface UploadPhaseResult {
  uploadResponses: UploadResponse[];
  manifestResult: ManifestPublishResult | null;
}

/** Result from the full deploy phase */
export interface DeployPhaseResult {
  /** Number of files that needed uploading */
  filesRequiringUpload: number;
  /** Number of files successfully uploaded */
  filesUploaded: number;
  /** Number of files that failed to upload */
  filesFailed: number;
  /** Manifest publish result */
  manifestResult: ManifestPublishResult | null;
}

/**
 * Register the deploy command
 */
export function registerDeployCommand(): void {
  nsyte
    .command("deploy")
    .alias("upload")
    .alias("dpl")
    .description("Deploy files from a directory")
    .arguments("<folder:string>")
    .option("-f, --force", "Force re-upload all files, bypassing server preflight checks.", {
      default: false,
    })
    .option("-s, --servers <servers:string>", "The blossom servers to use (comma separated).")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option("--sync", "Check all servers and upload missing blobs.", {
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
    .option("--publish-profile", "Publish profile metadata (Kind 0) - root sites only.", {
      default: false,
    })
    .option("--publish-relay-list", "Publish relay list (Kind 10002) - root sites only.", {
      default: false,
    })
    .option(
      "--publish-server-list",
      "Publish Blossom server list (Kind 10063) - root sites only.",
      {
        default: false,
      },
    )
    .option(
      "--fallback <file:string>",
      "An HTML file to reference as 404.html (creates path mapping with same hash)",
    )
    .option(
      "-d, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, deploys root site (kind 15128).",
    )
    .option(
      "--no-config",
      "Ignore config file and use only CLI arguments.",
      { default: false },
    )
    .option(
      "-i, --non-interactive", 
      "Run in non-interactive mode", 
      { default: false }
    )
    .option(
      "--dry-run", 
      "Preview what would be deployed without uploading or publishing.", 
      { default: false }
    )
    .option(
      "--dry-run-output <dir:string>",
      "Output directory for dry-run event previews (default: /tmp/nsyte-dry-run-{timestamp}/).",
    )
    .option(
      "--dry-run-show-kinds <kinds:string>",
      "Also print events of these kinds to stdout (comma-separated kind numbers, e.g. '35128,31990')."
    )
    .option(
      "--skip-secrets-scan",
      "Skip the pre-deploy secrets scan.",
      { default: false },
    )
    .option(
      "--scan-level <level:string>",
      "Secrets scan sensitivity level (low, medium, high).",
      { default: "medium" },
    )
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
    const configPath = typeof options.config === "string" ? options.config : undefined;

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

    // CLI --name overrides config.id
    if (options.name !== undefined) {
      config.id = resolveSiteIdentifier(options.name);
    }

    // Hint: suggest --non-interactive when CLI override flags are used in interactive mode
    if (
      !options.nonInteractive && options.config !== false &&
      (options.servers || options.relays || options.name !== undefined)
    ) {
      console.log(
        colors.blue(
          "  Tip: Use -i/--non-interactive to skip interactive prompts when using CLI flags.\n",
        ),
      );
    }

    // Validate named site identifier against NIP-5A rules
    const siteId = normalizeSiteIdentifier(config.id);
    if (siteId) {
      const validation = validateDTag(siteId);
      if (!validation.valid) {
        const suggestionHint = options.name !== undefined
          ? `Use "--name ${validation.suggestion}" instead.`
          : `Update .nsite/config.json: "id": "${validation.suggestion}"`;
        const errorMsg = validation.suggestion
          ? `${validation.error}\n\n  Suggestion: ${suggestionHint}`
          : validation.error || "Invalid site identifier";
        statusDisplay.error(errorMsg);
        log.error(`dTag validation failed: ${validation.error}`);
        return Deno.exit(1);
      }
    }

    // Dry-run: preview what would be deployed without signing, uploading, or publishing
    if (options.dryRun) {
      log.debug("Dry-run mode: scanning files and collecting event previews");

      // Scan local files (read-only, no signer needed)
      statusDisplay.update(`Scanning files in ${formatFilePath(targetDir)}...`);
      const { includedFiles } = await getLocalFiles(targetDir);

      // Collect event templates (no signing)
      const events = collectDeployEvents(config, includedFiles, {
        publishAppHandler: options.publishAppHandler,
        publishProfile: options.publishProfile,
        publishRelayList: options.publishRelayList,
        publishServerList: options.publishServerList,
        handlerKinds: options.handlerKinds,
        servers: options.servers,
        relays: options.relays,
      });

      // Parse --dry-run-show-kinds
      const showKinds = options.dryRunShowKinds
        ? options.dryRunShowKinds.split(",").map((k) => parseInt(k.trim())).filter((k) =>
          !isNaN(k)
        )
        : undefined;

      // Handle output (banner, files, optional stdout)
      await handleDryRunOutput(events, {
        outputDir: options.dryRunOutput,
        showKinds,
        interactive: !options.nonInteractive && Deno.stdin.isTerminal(),
      }, {
        totalFiles: includedFiles.length,
      });

      return Deno.exit(0);
    }

    const signerResult = await initSigner(authKeyHex, config, options, configPath);

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
    }, 5000);
    const resolvedRelays = relaySet(userPreferences.outboxes, manifestRelays);
    // For uploads, use only the servers from CLI --servers or config (source of truth).
    // Do not augment this with servers discovered from the user's kind 10063 preferences.
    const resolvedServers = manifestServers;

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

    // --- Secrets scan pre-check ---
    if (!options.skipSecretsScan && includedFiles.length > 0) {
      const scanLevel = validateDeployScanLevel(options.scanLevel);
      statusDisplay.update("Scanning for secrets...");

      const scanResult = await scanFileList(
        includedFiles.map((f) => ({
          path: f.path,
          absolutePath: join(
            targetDir,
            f.path.startsWith("/") ? f.path.slice(1) : f.path,
          ),
        })),
        { level: scanLevel },
      );

      if (scanResult.findings.length > 0) {
        displayScanReport(scanResult, false, options.verbose);

        if (options.nonInteractive) {
          // SCAN-06: Hard block in non-interactive mode
          console.error(
            colors.red(
              `\nSecrets detected (${scanResult.findings.length} finding(s)). Aborting deploy in non-interactive mode.`,
            ),
          );
          console.error(
            colors.yellow("Use --skip-secrets-scan to bypass this check."),
          );
          return Deno.exit(1);
        } else {
          // SCAN-04 / D-11: Interactive prompt — default No
          const proceed = await Confirm.prompt({
            message: "Secrets detected. Continue deploy?",
            default: false,
          });
          if (!proceed) {
            console.log("Deploy cancelled.");
            return Deno.exit(1);
          }
        }
      } else {
        if (!options.nonInteractive) {
          statusDisplay.update(
            `Scanned ${scanResult.filesScanned} files (${scanResult.filesSkipped} skipped as binary). No secrets detected.`,
          );
        }
      }
    }
    // --- End secrets scan pre-check ---

    // Find fallback file in scanned files if configured
    state.fallbackFileEntry = findFallbackFile(state as DeploymentState, includedFiles);

    const remoteFileEntries = await fetchRemoteFiles(state as DeploymentState, publisherPubkey);
    const { toTransfer, toDelete } = await compareAndPrepareFiles(
      state as DeploymentState,
      includedFiles,
      remoteFileEntries,
    );

    const deployResult = await maybeProcessFiles(
      state as DeploymentState,
      toTransfer,
      includedFiles,
    );
    await maybePublishMetadata(state as DeploymentState, publisherPubkey);

    if (includedFiles.length === 0 && toDelete.length === 0 && toTransfer.length === 0) {
      log.info("No effective operations performed.");
    }

    flushQueuedLogs();
    displayGatewayUrl(config, publisherPubkey);

    const exitCode = computeExitCode(deployResult);
    return Deno.exit(exitCode);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    statusDisplay.error(`Deploy command failed: ${errorMessage}`);
    log.error(`Deploy command failed: ${errorMessage}`);
    return Deno.exit(1);
  }
}

/**
 * Determine the exit code based on deploy results
 *
 * Exit 1 (failure) when:
 * - Zero files uploaded when uploads were needed
 * - Manifest couldn't be created (signing error)
 * - Manifest published to zero relays
 *
 * Exit 0 (success) when:
 * - Some files failed but manifest was published (site is functional)
 * - Everything succeeded
 * - No operations were needed
 */
/**
 * Format server summary with failure counts, retries, and error breakdown
 */
function formatServerSummary(
  serverStats: Record<
    string,
    { success: number; total: number; failed: number; retries: number; errors: Map<string, number> }
  >,
  serverTimings?: Record<string, number | undefined>,
): string {
  const displayManager = getDisplayManager();

  if (Object.keys(serverStats).length === 0) {
    return "No server results available";
  }

  if (displayManager.isNonInteractive()) {
    return Object.entries(serverStats)
      .map(([server, stats]) => {
        const pct = stats.total === 0 ? 100 : Math.round((stats.success / stats.total) * 100);
        const failStr = stats.failed > 0 ? `, ${stats.failed} failed` : "";
        const retryStr = stats.retries > 0 ? `, ${stats.retries} retries` : "";
        return `${server}: ${stats.success}/${stats.total} (${pct}%)${failStr}${retryStr}`;
      })
      .join(", ");
  }

  const lines: string[] = [];
  const tableRows: [string, string, string][] = [];
  const errorLines: Map<number, string[]> = new Map();

  const entries = Object.entries(serverStats);
  for (let idx = 0; idx < entries.length; idx++) {
    const [server, stats] = entries[idx];
    const ratio = formatSuccessRatio(stats.success, stats.total);
    const status = stats.success === stats.total
      ? colors.green("✓")
      : (stats.success === 0 ? colors.red("✗") : colors.yellow("!"));

    const details: string[] = [];
    if (stats.failed > 0) {
      details.push(colors.red(`${stats.failed} failed`));
    }
    if (stats.retries > 0) {
      details.push(colors.yellow(`${stats.retries} retries`));
    }
    const elapsed = serverTimings?.[server];
    if (elapsed != null) {
      details.push(colors.dim(`${elapsed}s`));
    }
    const detailStr = details.length > 0 ? " " + details.join(", ") : "";

    tableRows.push([status, server, ratio + detailStr]);

    // Collect error breakdown lines per row
    const rowErrors: string[] = [];
    if (stats.errors.size > 1) {
      const sortedErrors = [...stats.errors.entries()].sort((a, b) => b[1] - a[1]);
      for (const [errMsg, count] of sortedErrors) {
        const truncated = errMsg.length > 60 ? errMsg.substring(0, 57) + "..." : errMsg;
        rowErrors.push(`     ${colors.yellow(`${count}×`)} ${colors.gray(truncated)}`);
      }
    } else if (stats.errors.size === 1) {
      const [[errMsg]] = stats.errors;
      if (errMsg !== "unknown error") {
        const truncated = errMsg.length > 50 ? errMsg.substring(0, 47) + "..." : errMsg;
        rowErrors.push(`     ${colors.gray(truncated)}`);
      }
    }
    if (rowErrors.length > 0) {
      errorLines.set(idx, rowErrors);
    }
  }

  // Format all rows together so column widths align
  const formattedRows = formatTable(tableRows).split("\n");
  for (let idx = 0; idx < formattedRows.length; idx++) {
    lines.push(formattedRows[idx]);
    const errs = errorLines.get(idx);
    if (errs) {
      lines.push(...errs);
    }
  }

  return lines.join("\n");
}

function computeExitCode(result: DeployPhaseResult): number {
  // No operations needed — nothing to do is success
  if (result.filesRequiringUpload === 0 && result.manifestResult === null) {
    return 0;
  }

  // Total upload failure: files needed uploading but none succeeded
  if (result.filesRequiringUpload > 0 && result.filesUploaded === 0) {
    console.log(colors.red("\nDeploy failed: no files were uploaded successfully."));
    return 1;
  }

  // Check manifest results
  if (result.manifestResult) {
    const mr = result.manifestResult;

    // Manifest creation failed (signing error)
    if (!mr.created) {
      console.log(
        colors.red(
          `\nDeploy failed: manifest event could not be created${
            mr.error ? ` (${mr.error})` : ""
          }.`,
        ),
      );
      return 1;
    }

    // Manifest published to zero relays
    if (mr.successCount === 0) {
      console.log(colors.red("\nDeploy failed: manifest was not accepted by any relay."));
      return 1;
    }
  }

  // Some files failed but manifest was published — site is functional (partial success)
  if (result.filesFailed > 0 && result.manifestResult?.published) {
    log.warn(
      `${result.filesFailed} file(s) failed to upload, but manifest was published. Site may be partially available.`,
    );
  }

  return 0;
}

/**
 * Display gateway URLs where the deployed site is available
 */
function displayGatewayUrl(config: ProjectConfig, publisherPubkey: string): void {
  const npub = npubEncode(publisherPubkey);
  const pubkeyB36 = encodePubkeyBase36(hexToBytes(publisherPubkey));
  const { gatewayHostnames, id } = config;
  const siteId = normalizeSiteIdentifier(id);
  const isNamedSite = !!siteId;

  console.log(colors.green(`\nThe nsite is now available on any nsite gateway, for example:`));
  for (const gatewayHostname of gatewayHostnames || []) {
    if (isNamedSite) {
      console.log(colors.blue.underline(`https://${pubkeyB36}${siteId}.${gatewayHostname}/`));
    } else {
      console.log(colors.blue.underline(`https://${npub}.${gatewayHostname}/`));
    }
  }
  console.log(colors.green(`\nYou can also run the command:`));

  if (isNamedSite) {
    const naddr = naddrEncode({
      pubkey: publisherPubkey,
      kind: NSITE_NAME_SITE_KIND,
      identifier: siteId,
    });
    console.log(colors.magenta.bold(`nsyte run ${naddr}`));
  } else {
    console.log(colors.magenta.bold(`nsyte run ${npub}`));
  }
}

/**
 * Resolve project context (configuration and authentication)
 */
async function resolveContext(
  options: DeployCommandOptions,
): Promise<ProjectContext> {
  let config: ProjectConfig | null = null;
  let authKeyHex: string | null | undefined = options.sec || undefined;
  const configPath = typeof options.config === "string" ? options.config : undefined;

  // --no-config: ignore config file entirely, build config from CLI args only
  if (options.config === false) {
    log.debug("Resolving project context with --no-config (ignoring config file).");
    config = {
      servers: options.servers
        ? options.servers.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      relays: options.relays ? options.relays.split(",").map((r) => r.trim()).filter(Boolean) : [],
      fallback: options.fallback,
      gatewayHostnames: ["nsite.lol"],
    };

    if (!authKeyHex && !options.sec) {
      return {
        config,
        authKeyHex,
        error: "Missing signing key: --no-config requires --sec for authentication.",
      };
    }
  } else if (options.nonInteractive) {
    log.debug("Resolving project context in non-interactive mode.");
    let existingProjectData: ProjectConfig | null = null;

    try {
      existingProjectData = readProjectFile(configPath);
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
      ...existingProjectData,
      servers: (options.servers
        ? options.servers.split(",").filter((s) =>
          s.trim()
        )
        : existingProjectData?.servers) || [],
      relays: (options.relays
        ? options.relays.split(",").filter((r) => r.trim())
        : existingProjectData?.relays) || [],
      bunkerPubkey: existingProjectData?.bunkerPubkey,
      id: existingProjectData?.id,
      fallback: options.fallback || existingProjectData?.fallback,
      gatewayHostnames: existingProjectData?.gatewayHostnames || ["nsite.lol"],
    };
  } else {
    log.debug("Resolving project context in interactive mode.");
    let currentProjectData: ProjectConfig | null = null;
    let keyFromInteractiveSetup: string | undefined;

    try {
      currentProjectData = readProjectFile(configPath);
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
      const setupResult = await setupProject(false, configPath);
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
        const keySetupResult = await setupProject(false, configPath);
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

    // Apply CLI flag overrides to config (interactive mode)
    if (options.servers) {
      config.servers = options.servers.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    }
    if (options.relays) {
      config.relays = options.relays.split(",").map((r) => r.trim()).filter((r) => r.length > 0);
    }
    if (options.fallback) {
      config.fallback = options.fallback;
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
  configPath?: string,
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
          const bunkerSigner = await reconnectToBunker(config, configPath);
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
async function reconnectToBunker(
  config: ProjectConfig,
  configPath?: string,
): Promise<ISigner | null> {
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
      writeProjectFile(config, configPath);
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
    const siteId = normalizeSiteIdentifier(config.id);
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
    console.log(formatConfigValue("Sync Servers", options.sync, options.sync === false));
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
    const siteId = normalizeSiteIdentifier(config.id);
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
    if (options.sync) console.log(colors.yellow("Sync Servers: true"));
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
      `Ignored ${ignoredFilePaths.length} files/directories based on .nsyte-ignore rules (or default ignores).`;
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
    if (shouldPublishAny) {
      log.info("Proceeding with publish operations as requested despite no files to upload.");
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
  const { statusDisplay, displayManager, options, resolvedRelays, config } = state;
  let remoteFileEntries: FileEntry[] = [];

  // Must match publishSiteManifest / createSiteManifestEvent: named sites use kind 35128 + #d.
  // Omitting this always fetched the root (15128) manifest and reused root path hashes on
  // named-site deploys (e.g. /index.html from root on a named site).
  const manifestSiteId = config.id === null || config.id === "" ? undefined : config.id;

  // We need remote file info for sync mode, and when not forcing uploads
  const shouldFetchRemote = !options.force || options.sync;
  const allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;

  if (shouldFetchRemote) {
    // Prefer configured relays but fall back to broadcast relays for reliability
    const primaryRelays = resolvedRelays.length > 0
      ? resolvedRelays
      : (allowFallbackRelays ? NSYTE_BROADCAST_RELAYS : []);

    if (primaryRelays.length > 0) {
      const reason = options.force && options.sync ? " (required for sync)" : "";
      const remoteLabel = manifestSiteId ? `named site "${manifestSiteId}"` : "root site";
      statusDisplay.update(
        `Checking for existing files on remote relays (${remoteLabel})${reason}...`,
      );
      try {
        remoteFileEntries = await listTrustedRemoteFiles(
          primaryRelays,
          publisherPubkey,
          manifestSiteId,
        );

        // If nothing found on the configured relays, retry with a broader relay set
        if (remoteFileEntries.length === 0 && resolvedRelays.length > 0 && allowFallbackRelays) {
          const fallbackRelays = relaySet(resolvedRelays, NSYTE_BROADCAST_RELAYS);
          statusDisplay.update(
            `No files found on configured relays, retrying with default broadcast relays...`,
          );
          remoteFileEntries = await listTrustedRemoteFiles(
            fallbackRelays,
            publisherPubkey,
            manifestSiteId,
          );
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
    log.debug("Skipping remote file check because --force was provided without --sync");
  }
  return remoteFileEntries;
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

  // Handle --sync: move existing files to toTransfer so they get uploaded.
  // HEAD preflight stays active, so servers that already have the blob will skip.
  if (options.sync && existing.length > 0) {
    log.info(`--sync enabled: checking ${existing.length} existing files across all servers.`);
    toTransfer.push(...existing);
    unchanged = [];
  }

  if (toTransfer.length === 0 && !options.force && !options.sync) {
    log.info("No new files to upload.");

    if (displayManager.isInteractive()) {
      const action = await Select.prompt({
        message: "No new files detected. What would you like to do?",
        options: [
          { name: "Sync to all servers (backfill missing blobs)", value: "sync" },
          { name: "Force re-upload everything", value: "force" },
          { name: "Cancel", value: "cancel" },
        ],
      });

      if (action === "cancel") {
        log.info("Upload cancelled by user.");

        if (!shouldPublishAny) {
          await flushQueuedLogs();
          return Deno.exit(0);
        }
      } else if (action === "sync") {
        log.info("Syncing files to all servers as requested by user.");
        statusDisplay.update("Syncing files to all servers...");
        toTransfer.push(...existing);
        unchanged = [];
      } else if (action === "force") {
        log.info("Forcing upload as requested by user.");
        statusDisplay.update("Forcing upload of all files...");
        options.force = true;
        toTransfer.push(...existing);
        unchanged = [];
      }
    } else {
      const errMsg =
        "No new files to upload. Use --sync to backfill servers, --force to re-upload all.";
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
  includedFiles: FileEntry[],
): Promise<DeployPhaseResult> {
  const { statusDisplay, resolvedRelays } = state;

  let filesUploaded = 0;
  let filesFailed = 0;
  let manifestResult: ManifestPublishResult | null = null;

  if (toTransfer.length > 0) {
    log.info("Processing files for upload...");

    try {
      const preparedFiles = await prepareFilesForUpload(state, toTransfer);
      const uploadResult = await uploadFiles(
        state,
        preparedFiles,
        includedFiles,
      );

      filesUploaded = uploadResult.uploadResponses.filter((r) => r.success).length;
      filesFailed = uploadResult.uploadResponses.filter((r) => !r.success).length;
      manifestResult = uploadResult.manifestResult;
    } catch (e: unknown) {
      const errMsg = `Error during upload process: ${getErrorMessage(e)}`;
      statusDisplay.error(errMsg);
      log.error(errMsg);
      // All files failed due to thrown error
      filesFailed = toTransfer.length;
    }
  } else {
    // Even if no files to upload, we may need to publish manifest with existing files
    // (e.g., when files were deleted or metadata changed)
    if (includedFiles.length > 0 && resolvedRelays.length > 0) {
      manifestResult = await publishSiteManifest(state, includedFiles, []);
    }
  }

  return {
    filesRequiringUpload: toTransfer.length,
    filesUploaded,
    filesFailed,
    manifestResult,
  };
}

/**
 * Publish site manifest event with all files in the site
 * According to NIP-XX, the manifest MUST include ALL path mappings, not just changed files
 */
async function publishSiteManifest(
  state: DeploymentState,
  includedFiles: FileEntry[],
  uploadResponses: UploadResponse[],
): Promise<ManifestPublishResult> {
  const {
    statusDisplay,
    signer,
    config,
    options,
    resolvedRelays,
    messageCollector,
    fallbackFileEntry,
  } = state;

  // Build a complete file mapping from all local files (hashes from disk at scan + this run's uploads)
  const fileMappingsMap = new Map<string, { path: string; sha256: string }>();

  // Paths from successful uploads (hashes from the upload pipeline; should match local content)
  for (const response of uploadResponses) {
    if (response.success) {
      fileMappingsMap.set(response.file.path, {
        path: response.file.path,
        sha256: response.file.sha256,
      });
    }
  }

  // Files not uploaded this run: use SHA-256 from the directory scan (never from remote manifest)
  const normalizePath = (path: string) => path.replace(/^\/+/, "/").toLowerCase();

  for (const localFile of includedFiles) {
    const normalizedLocalPath = normalizePath(localFile.path);

    const alreadyInMap = Array.from(fileMappingsMap.keys()).some(
      (mappedPath) => normalizePath(mappedPath) === normalizedLocalPath,
    );

    if (!alreadyInMap) {
      fileMappingsMap.set(localFile.path, {
        path: localFile.path,
        sha256: localFile.sha256,
      });
    }
  }

  // Add 404.html entry if fallback file was found (hash from scan or upload response only)
  if (fallbackFileEntry) {
    const normalizedFallbackPath = normalizePath(fallbackFileEntry.path);

    const fallbackUploadResponse = uploadResponses.find(
      (r) => r.success && normalizePath(r.file.path) === normalizedFallbackPath,
    );
    const fallbackHash = fallbackUploadResponse?.file.sha256 ?? fallbackFileEntry.sha256;

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
    return {
      created: false,
      published: false,
      error: "No files with hashes to include",
      successCount: 0,
      failureCount: 0,
    };
  }

  statusDisplay.update("Creating site manifest event...");

  try {
    const publisherPubkey = await signer.getPublicKey();

    // Get site identifier from config (for named sites)
    // Use id from config, or empty string/null for root site
    const siteId = normalizeSiteIdentifier(config.id);

    // Prepare metadata - use config values (these are recommendations for others)
    // Operational relays/servers (from kind 10002/10063) are used for publishing, not in metadata
    const manifestRelays = options.relays?.split(",").filter((r) => r.trim()) || config.relays ||
      [];
    const manifestServers = options.servers?.split(",").filter((s) => s.trim()) || config.servers ||
      [];

    // Detect source URL (config > git remote auto-detect)
    const sourceUrl = await detectSourceUrl(config.source);

    const metadata = {
      title: config.title,
      description: config.description,
      servers: manifestServers, // Use config values for metadata (recommendations)
      relays: manifestRelays, // Use config values for metadata (recommendations)
      source: sourceUrl,
    };

    // Display manifest event information before creating
    console.log(formatSectionHeader("Site Manifest Event (nostr)"));
    console.log(colors.cyan(`Creating site manifest event with:`));
    console.log(colors.cyan(`  Files: ${fileMappings.length}`));
    console.log(colors.cyan(`  Relays: ${manifestRelays.length}`));
    console.log(colors.cyan(`  Servers: ${manifestServers.length}`));
    if (sourceUrl) {
      console.log(colors.cyan(`  Source: ${sourceUrl}`));
    }
    console.log("");

    // Tip for missing title/description (treat whitespace-only as missing)
    const hasTitle = !!config.title?.trim();
    const hasDescription = !!config.description?.trim();
    if (!hasTitle && !hasDescription) {
      console.log(
        colors.dim(
          "  Tip: Add title and description to your config for richer manifests:",
        ),
      );
      console.log(
        colors.dim(
          '    nsyte config set title "My Site"',
        ),
      );
      console.log(
        colors.dim(
          '    nsyte config set description "My description"',
        ),
      );
      console.log("");
    }

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

    // Publish manifest event using discovered relays (from kind 10002) with detailed results
    statusDisplay.update("Publishing site manifest event...");
    const publishResult = await publishEventsToRelaysDetailed(resolvedRelays, [manifestEvent]);

    // Extract per-relay results from the first (only) event result
    const eventResult: EventPublishResult | undefined = publishResult.eventResults[0];
    const relayResults = eventResult?.relayResults ?? [];
    const successCount = eventResult?.successCount ?? 0;
    const failureCount = eventResult?.failureCount ?? 0;

    // Display per-relay results table
    if (relayResults.length > 0) {
      console.log(formatSectionHeader("Relay Manifest Publish Results"));
      console.log(formatRelayPublishResults(relayResults));
      console.log("");
    }

    if (publishResult.allEventsPublished) {
      console.log(colors.green(`✓ Site manifest event successfully published to relays`));
      if (siteId) {
        console.log(colors.cyan(`  Site: ${siteId} (named site)`));
      } else {
        console.log(colors.cyan(`  Site: root site`));
      }
      console.log("");

      // Add to message collector
      messageCollector.addEventSuccess("site manifest", manifestEvent.id);

      return {
        created: true,
        published: true,
        eventId: manifestEvent.id,
        relayResults,
        successCount,
        failureCount,
      };
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

      return {
        created: true,
        published: successCount > 0,
        eventId: manifestEvent.id,
        relayResults,
        successCount,
        failureCount,
      };
    }
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    statusDisplay.error(`Failed to create/publish manifest: ${errorMessage}`);
    log.error(`Error creating/publishing site manifest: ${errorMessage}`);
    console.log(colors.red(`✗ Error: ${errorMessage}`));
    console.log("");

    return {
      created: false,
      published: false,
      error: errorMessage,
      successCount: 0,
      failureCount: 0,
    };
  }
}

/**
 * Upload prepared files to servers and publish to relays
 */
async function uploadFiles(
  state: DeploymentState,
  preparedFiles: FileEntry[],
  includedFiles: FileEntry[],
): Promise<UploadPhaseResult> {
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
    return { uploadResponses: [], manifestResult: null };
  }

  statusDisplay.update(`Uploading ${preparedFiles.length} files...`);

  setProgressMode(true);
  const progressRenderer = new ProgressRenderer(
    preparedFiles.length * resolvedServers.length,
    resolvedServers,
  );
  state.progressRenderer = progressRenderer;
  progressRenderer.start();

  if (resolvedServers.length === 0) {
    throw new Error("No servers configured for upload");
  }

  const uploadStartTime = Date.now();
  let lastServerProgress: Record<string, { finishedAt?: number }> = {};
  const uploadResponses = await processUploads(
    preparedFiles,
    targetDir,
    resolvedServers,
    signer,
    resolvedRelays,
    options.concurrency,
    (progress) => {
      progressRenderer.update(progress);
      lastServerProgress = progress.serverProgress;
    },
    options.force,
  );

  progressRenderer.stop();
  setProgressMode(false);

  let manifestResult: ManifestPublishResult | null = null;

  if (uploadResponses.length > 0) {
    const uploadedCount = uploadResponses.filter((r) => r.success).length;
    const uploadedSize = uploadResponses.reduce((sum, r) => sum + (r.file.size || 0), 0);

    for (const result of uploadResponses) {
      if (result.success) {
        messageCollector.addFileSuccess(result.file.path, result.file.sha256);
      } else if (result.error) {
        messageCollector.addFileError(result.file.path, result.error);
      }
    }

    flushQueuedLogs();
    console.log("");

    const allSucceeded = uploadedCount === preparedFiles.length &&
      uploadResponses.length === preparedFiles.length;
    if (allSucceeded) {
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
      if (allSucceeded) {
        console.log(colors.green(`✓ All ${uploadedCount} files successfully uploaded`));
      } else {
        const failedCount = preparedFiles.length - uploadedCount;
        console.log(
          colors.yellow(
            `${uploadedCount}/${preparedFiles.length} blobs uploaded, ${failedCount} failed`,
          ),
        );
      }

      // Build server color map and legend (like browse command)
      // Use resolvedServers order (not sorted) to match progress bar symbol/color assignment
      const sortedServers = [...resolvedServers];
      const serverColorMap = new Map<string, (str: string) => string>();
      const legendItems: string[] = [];
      sortedServers.forEach((server, i) => {
        const colorFn = SERVER_COLORS[i % SERVER_COLORS.length];
        serverColorMap.set(server, colorFn);
        const shortServer = server.replace(/^https?:\/\//, "");
        legendItems.push(`${colorFn(getServerSymbol(i))} ${shortServer}`);
      });
      console.log(legendItems.join("  "));
      console.log("");

      // Separate uploaded, skipped, and failed responses
      const uploadedResponses = uploadResponses.filter((r) => r.success && !r.skipped);
      const skippedResponses = uploadResponses.filter((r) => r.success && r.skipped);
      const failedResponses = uploadResponses.filter((r) => !r.success);

      // Print uploaded files with server indicators, type, and size
      for (const result of uploadedResponses) {
        let indicators = "";
        for (let si = 0; si < sortedServers.length; si++) {
          const server = sortedServers[si];
          const serverResult = result.serverResults[server];
          if (serverResult?.success) {
            const colorFn = serverColorMap.get(server) || colors.white;
            indicators += colorFn(getServerSymbol(si));
          } else {
            indicators += colors.gray("·");
          }
        }

        const contentType = result.file.contentType || "unknown";
        const fileType = contentType.includes("/")
          ? contentType.split("/").pop() || contentType
          : contentType;

        const size = formatFileSize(result.file.size);
        console.log(
          `  ${indicators} ${result.file.path} ${colors.gray(fileType)} ${colors.gray(size)}`,
        );
      }

      // Show failed files
      for (const result of failedResponses) {
        const indicators = colors.red("·".repeat(sortedServers.length));
        const contentType = result.file.contentType || "unknown";
        const fileType = contentType.includes("/")
          ? contentType.split("/").pop() || contentType
          : contentType;
        const size = formatFileSize(result.file.size);
        console.log(
          `  ${indicators} ${colors.red(result.file.path)} ${colors.gray(fileType)} ${
            colors.gray(size)
          } ${colors.red("✗ " + (result.error || "failed"))}`,
        );
      }
      console.log("");

      // Show skipped files in a separate section
      if (skippedResponses.length > 0) {
        console.log(formatSectionHeader("Skipped Blobs (Already on Servers)"));
        console.log(
          colors.gray(
            `${skippedResponses.length} blob${
              skippedResponses.length === 1 ? "" : "s"
            } already present on all servers`,
          ),
        );
        for (const result of skippedResponses) {
          const contentType = result.file.contentType || "unknown";
          const fileType = contentType.includes("/")
            ? contentType.split("/").pop() || contentType
            : contentType;
          const size = formatFileSize(result.file.size);
          console.log(
            `  ${colors.gray("⊘")} ${colors.gray(result.file.path)} ${colors.gray(fileType)} ${
              colors.gray(size)
            }`,
          );
        }
        console.log("");
      }
    }

    console.log(formatSectionHeader("Blossom Server Summary"));
    const serverStats: Record<
      string,
      {
        success: number;
        total: number;
        failed: number;
        retries: number;
        errors: Map<string, number>;
      }
    > = {};
    for (const server of resolvedServers) {
      serverStats[server] = { success: 0, total: 0, failed: 0, retries: 0, errors: new Map() };
    }
    for (const result of uploadResponses) {
      for (const [server, status] of Object.entries(result.serverResults)) {
        if (!serverStats[server]) {
          serverStats[server] = { success: 0, total: 0, failed: 0, retries: 0, errors: new Map() };
        }
        serverStats[server].total++;
        serverStats[server].retries += status.retries || 0;
        if (status.success) {
          serverStats[server].success++;
        } else {
          serverStats[server].failed++;
          const errMsg = status.error || "unknown error";
          serverStats[server].errors.set(
            errMsg,
            (serverStats[server].errors.get(errMsg) || 0) + 1,
          );
        }
      }
    }
    // Compute per-server elapsed seconds from upload start
    const serverTimings: Record<string, number | undefined> = {};
    for (const server of resolvedServers) {
      const sp = lastServerProgress[server];
      if (sp?.finishedAt) {
        serverTimings[server] = Math.floor((sp.finishedAt - uploadStartTime) / 1000);
      }
    }
    console.log(formatServerSummary(serverStats, serverTimings));

    const totalBlobs = uploadResponses.length;
    const successBlobs = uploadResponses.filter((r) => r.success).length;
    const skippedBlobs = uploadResponses.filter((r) => r.skipped).length;
    const backfilledBlobs = successBlobs - skippedBlobs;
    const pct = totalBlobs === 0 ? 100 : Math.round((successBlobs / totalBlobs) * 100);
    const colorFn = pct === 100 ? colors.green : pct > 0 ? colors.yellow : colors.red;
    console.log(
      colorFn(`Overall: ${successBlobs}/${totalBlobs} blobs on at least one server (${pct}%)`),
    );

    // Show sync/force specific summary
    if (options.sync && !options.force) {
      console.log(
        colors.cyan(`Sync: ${skippedBlobs} already on all servers, ${backfilledBlobs} backfilled`),
      );
    } else if (options.force) {
      console.log(
        colors.cyan(`Force: ${totalBlobs} files re-uploaded to ${resolvedServers.length} servers`),
      );
    }
    console.log("");

    // Create and publish site manifest event after all files are uploaded
    // Always publish manifest if there are any files, even if no uploads occurred
    // (e.g., when only metadata needs updating or files were deleted)
    if (includedFiles.length > 0 && resolvedRelays.length > 0) {
      manifestResult = await publishSiteManifest(
        state,
        includedFiles,
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

  return { uploadResponses, manifestResult };
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
    publishProfile: options.publishProfile || config.publishProfile || false,
    publishRelayList: options.publishRelayList || config.publishRelayList || false,
    publishServerList: options.publishServerList || config.publishServerList || false,
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

/**
 * Validate scan level for deploy command.
 * Defaults to "medium" for invalid input.
 */
function validateDeployScanLevel(input?: string): ScanLevel {
  const level = (input || "medium").toLowerCase();
  if (level === "low" || level === "medium" || level === "high") {
    return level as ScanLevel;
  }
  return "medium";
}
