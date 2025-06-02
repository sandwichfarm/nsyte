import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import { nip19 } from "npm:nostr-tools";
import { copy } from "std/fs/copy.ts";
import { join, normalize, dirname } from "std/path/mod.ts";
import { defaultConfig, readProjectFile, setupProject, type ProjectConfig, type ProjectContext } from "../lib/config.ts";
import { type DisplayManager, getDisplayManager } from "../lib/display-mode.ts";
import { compareFiles, getLocalFiles, loadFileData } from "../lib/files.ts";
import { createLogger, flushQueuedLogs, setProgressMode } from "../lib/logger.ts";
import { MessageCollector, MessageCategory } from "../lib/message-collector.ts";
import { decodeBunkerInfo, importFromNbunk } from "../lib/nip46.ts";
import {
  createNip46ClientFromUrl,
  listRemoteFiles,
  type NostrEvent,
  type NostrEventTemplate,
  type FileEntry,
  NSITE_KIND,
  createProfileEvent,
  createRelayListEvent,
  createServerListEvent,
  purgeRemoteFiles,
  createDeleteEvent,
  publishEventsToRelays
} from "../lib/nostr.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { PrivateKeySigner } from "../lib/signer.ts";
import { processUploads, type Signer, type UploadResponse } from "../lib/upload.ts";
import { getErrorMessage, logError, handleError } from "../lib/error-utils.ts";
import {
  formatConfigValue,
  formatFilePath,
  formatFileSize,
  formatFileSummary,
  formatRelayList,
  formatSectionHeader,
  formatServerResults,
  formatTitle
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
  servers?: string;
  relays?: string;
  privatekey?: string;
  bunker?: string;
  nbunksec?: string;
  concurrency: number;
  fallback?: string;
  publishServerList: boolean;
  publishRelayList: boolean;
  publishProfile: boolean;
  nonInteractive: boolean;
}

export interface FilePreparationResult { 
  toTransfer: FileEntry[]; 
  existing: FileEntry[]; 
  toDelete: FileEntry[] 
}

/**
 * Register the upload command
 */
export function registerUploadCommand(program: Command): void {
  program
    .command("upload")
    .description("Upload files from a directory")
    .arguments("<folder:string>")
    .option("-f, --force", "Force publishing even if no changes were detected.", { default: false })
    .option("-s, --servers <servers:string>", "The blossom servers to use (comma separated).")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("--nbunksec <nbunksec:string>", "The NIP-46 bunker encoded as nbunksec.")
    .option("-p, --purge", "Delete online file events that are not used anymore.", { default: false })
    .option("-v, --verbose", "Verbose output.", { default: false })
    .option("-c, --concurrency <number:number>", "Number of parallel uploads.", { default: 4 })
    .option("--publish-server-list", "Publish the list of blossom servers (Kind 10063).", { default: false })
    .option("--publish-relay-list", "Publish the list of nostr relays (Kind 10002).", { default: false })
    .option("--publish-profile", "Publish the app profile for the npub (Kind 0).", { default: false })
    .option("--fallback <file:string>", "An HTML file to copy and publish as 404.html")
    .option("-i, --non-interactive", "Run in non-interactive mode", { default: false })
    .action(async (options: UploadCommandOptions, folder: string) => {
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
export async function uploadCommand( fileOrFolder: string, options_: UploadCommandOptions ): Promise<void> {

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
      log.error("Critical error: Project data is null after context resolution without error (interactive mode).");
      return Deno.exit(1);
    }
    
    signer = (await initSigner(authKeyHex)) as Signer;
    
    if ("error" in signer) {
      statusDisplay.error(`Signer: ${signer.error}`);
      log.error(`Signer initialization failed: ${signer.error}`);
      return Deno.exit(1);
    }
    
    const publisherPubkey = await signer.getPublicKey();

    resolvedServers = options.servers?.split(",").filter(s => s.trim()) || config.servers || [];
    resolvedRelays = options.relays?.split(",").filter(r => r.trim()) || config.relays || [];
    
    displayConfig( publisherPubkey );

    const includedFiles = await scanLocalFiles();
    const remoteFileEntries = await fetchRemoteFiles(publisherPubkey)
    const updatedRemoteFiles = await handlePurgeOperation(remoteFileEntries);
    const { toTransfer, toDelete } = await compareAndPrepareFiles(includedFiles, updatedRemoteFiles)

    await maybeProcessFiles( toTransfer,  toDelete );
    await maybePublishMetadata();
    
    if (includedFiles.length === 0 && toDelete.length === 0 && toTransfer.length === 0 && 
        !(options.publishProfile || options.publishRelayList || options.publishServerList)) {
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
  const npub = nip19.npubEncode(publisherPubkey);
  const { gatewayHostnames } = config;
  console.log(colors.green(`\nThe website is now available on any nsite gateway, for example:`));
  for (const gatewayHostname of gatewayHostnames || []) {
    console.log(colors.blue.underline(`https://${npub}.${gatewayHostname}/`));
  }
}


export function initState(options_: UploadCommandOptions){
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
  let authKeyHex: string | null | undefined = options.privatekey || undefined;

  if (options.nonInteractive) {
    log.debug("Resolving project context in non-interactive mode.");
      const existingProjectData = readProjectFile() || defaultConfig;

    if (!options.servers && (!existingProjectData?.servers || existingProjectData.servers.length === 0)) {
      return { config: existingProjectData, authKeyHex, error: "Missing servers: Provide --servers or configure in .nsite/config.json." };
    }
    if (!options.relays && (!existingProjectData?.relays || existingProjectData.relays.length === 0)) {
      return { config: existingProjectData, authKeyHex, error: "Missing relays: Provide --relays or configure in .nsite/config.json." };
    }

    if (!authKeyHex && !options.nbunksec && !options.bunker) {
      if (!existingProjectData?.bunkerPubkey) {
        return { config: existingProjectData, authKeyHex, error: "Missing signing key: For non-interactive mode, provide --privatekey, --nbunksec, --bunker, or ensure a bunker is configured in .nsite/config.json." };
      } else {
        log.info("No direct key/nsec on CLI. Will attempt to use configured bunker for non-interactive mode.");
      }
    }
    
    config = {
      servers: (options.servers ? options.servers.split(",").filter(s => s.trim()) : existingProjectData?.servers) || [],
      relays: (options.relays ? options.relays.split(",").filter(r => r.trim()) : existingProjectData?.relays) || [],
      publishServerList: options.publishServerList !== undefined ? options.publishServerList : existingProjectData?.publishServerList || false,
      publishRelayList: options.publishRelayList !== undefined ? options.publishRelayList : existingProjectData?.publishRelayList || false,
      publishProfile: options.publishProfile !== undefined ? options.publishProfile : existingProjectData?.publishProfile || false,
      profile: existingProjectData?.profile,
      bunkerPubkey: existingProjectData?.bunkerPubkey, 
      fallback: options.fallback || existingProjectData?.fallback,
      gatewayHostnames: existingProjectData?.gatewayHostnames || [ 'nsite.lol' ]
    };

  } else {
    log.debug("Resolving project context in interactive mode.");
    const currentProjectData = readProjectFile();
    let keyFromInteractiveSetup: string | undefined;

    if (!currentProjectData) {
      log.info("No .nsite/config.json found, running initial project setup.");
      const setupResult = await setupProject(false); 
      if (!setupResult.config) {
        return { config: defaultConfig, authKeyHex: undefined, error: "Project setup failed or was aborted." };
      }
      config = setupResult.config;
      keyFromInteractiveSetup = setupResult.privateKey;
    } else {
      config = currentProjectData;
      if (!options.privatekey && !options.nbunksec && !options.bunker && !config.bunkerPubkey) {
        log.info("Project is configured but no signing method found (CLI key, CLI bunker, or configured bunker). Running key setup...");
        const keySetupResult = await setupProject(false);
        if (!keySetupResult.config) {
          return { config, authKeyHex: undefined, error: "Key setup for existing project failed or was aborted." };
        }
        config = keySetupResult.config;
        keyFromInteractiveSetup = keySetupResult.privateKey;
      }
    }

    if(!config?.gatewayHostnames) {
      config.gatewayHostnames = [ 'nsite.lol' ];
    }
    
    if (options.privatekey) {
        authKeyHex = options.privatekey;
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

async function initSigner( authKeyHex: string | null | undefined): Promise<Signer | { error: string }> {
  if (options.nbunksec) {
    try {
      log.info("Using NostrBunker (nbunksec from CLI) for signing...");
      const bunkerSigner = await importFromNbunk(options.nbunksec);
      await bunkerSigner.getPublicKey();
      return bunkerSigner;
    } catch (e: unknown) {
      return { error: `Failed to import nbunksec from CLI: ${getErrorMessage(e)}` };
      }
    } else if (options.bunker) {
    try {
      log.info(`Using NostrBunker (URL from CLI: ${options.bunker}) for signing...`);
      const { client } = await createNip46ClientFromUrl(options.bunker);
      return client;
    } catch (e: unknown) {
      return { error: `Failed to connect to bunker URL from CLI: ${getErrorMessage(e)}` };
    }
  } else if (authKeyHex) {
    log.info("Using private key for signing (from CLI or interactive setup)...");
    try {
      return new PrivateKeySigner(authKeyHex);
    } catch (e: unknown) {
      return { error: `Invalid private key provided: ${getErrorMessage(e)}` };
    }
  } else if (config?.bunkerPubkey) {
    log.info(`Attempting to use configured bunker (pubkey: ${config.bunkerPubkey.substring(0,8)}...) for signing...`);
      const secretsManager = SecretsManager.getInstance();
      const nbunkString = secretsManager.getNbunk(config.bunkerPubkey);
      if (nbunkString) {
        try {
        log.info("Found stored nbunksec for configured bunker. Importing...");
          const bunkerSigner = await importFromNbunk(nbunkString);
        await bunkerSigner.getPublicKey();
        return bunkerSigner;
      } catch (e: unknown) {
        const baseMsg = `Failed to use stored nbunksec for configured bunker ${config.bunkerPubkey.substring(0,8)}...: ${getErrorMessage(e)}`;
          if (options.nonInteractive) {
          return { error: `${baseMsg} In non-interactive mode, cannot re-prompt. Please check bunker or provide key via CLI.` };
        } else {
          return { error: `${baseMsg} The stored secret may be invalid. Consider re-configuring the bunker connection.` };
        }
        }
      } else {
      const baseMsg = `No stored secret (nbunksec) found for configured bunker: ${config.bunkerPubkey.substring(0,8)}...`;
        if (options.nonInteractive) {
        return { error: `${baseMsg} In non-interactive mode, cannot prompt for new bunker details. Please run interactively or provide key/nbunksec via CLI.` };
      } else {
        return { error: `${baseMsg} Please re-configure the bunker connection or provide a key/nbunksec via CLI.` };
      }
    }
  }
  return { error: "No valid signing method could be initialized (private key, nbunksec, or bunker). Please check your configuration or CLI arguments." };
}



export function displayConfig(publisherPubkey: string){
  if (displayManager.isInteractive()) {
    console.log(formatTitle("Upload Configuration"));
    console.log(formatConfigValue("User", publisherPubkey, false));
    console.log(formatConfigValue("Relays", formatRelayList(resolvedRelays), !options.relays && !config.relays));
    console.log(formatConfigValue("Servers", formatRelayList(resolvedServers), !options.servers && !config.servers));
    console.log(formatConfigValue("Force Upload", options.force, options.force === false));
    console.log(formatConfigValue("Purge Old Files", options.purge, options.purge === false));
    console.log(formatConfigValue("Concurrency", options.concurrency, options.concurrency === 4));
    console.log(formatConfigValue("404 Fallback", options.fallback || config.fallback || "none", !options.fallback && !config.fallback));
    console.log(formatConfigValue("Publish Relay List (Kind 10002)", options.publishRelayList || config.publishRelayList || false, !options.publishRelayList && !config.publishRelayList));
    console.log(formatConfigValue("Publish Server List (Kind 10063)", options.publishServerList || config.publishServerList || false, !options.publishServerList && !config.publishServerList));
    console.log(formatConfigValue("Publish Profile (Kind 0)", options.publishProfile || !!config.profile, !options.publishProfile && !config.profile));
    console.log("");
  } else if (!options.nonInteractive) {
    console.log(colors.cyan(`User: ${publisherPubkey}`));
    console.log(colors.cyan(`Relays: ${resolvedRelays.join(", ") || "none"}${!options.relays && !config.relays ? " (default)" : ""}`));
    console.log(colors.cyan(`Servers: ${resolvedServers.join(", ") || "none"}${!options.servers && !config.servers ? " (default)" : ""}`));
    console.log(colors.cyan(`Concurrency: ${options.concurrency}${options.concurrency === 4 ? " (default)" : ""}`));
    if (options.force) console.log(colors.yellow("Force Upload: true"));
    if (options.purge) console.log(colors.yellow("Purge Old Files: true"));
    if (options.fallback || config.fallback) console.log(colors.cyan(`404 Fallback: ${options.fallback || config.fallback}${!options.fallback && !config.fallback ? " (default)" : ""}`));
    if (options.publishRelayList || config.publishRelayList) console.log(colors.cyan(`Publish Relay List: true${!options.publishRelayList && !config.publishRelayList ? " (default)" : ""}`));
    if (options.publishServerList || config.publishServerList) console.log(colors.cyan(`Publish Server List: true${!options.publishServerList && !config.publishServerList ? " (default)" : ""}`));
    if (options.publishProfile && config.profile) console.log(colors.cyan(`Publish Profile: true${!options.publishProfile && !config.profile ? " (default)" : ""}`));
  }
}

/**
 * Scan local files in the target directory
 */
async function scanLocalFiles( _targetDir?: string ): Promise<FileEntry[]> {
  targetDir = _targetDir || targetDir;
  statusDisplay.update(`Scanning files in ${formatFilePath(targetDir)}...`);
  const { includedFiles, ignoredFilePaths } = await getLocalFiles(targetDir);

  if (ignoredFilePaths.length > 0) {
    const ignoreMsg = `Ignored ${ignoredFilePaths.length} files/directories based on .nsiteignore rules (or default ignores).`;
    if (displayManager.isInteractive()) { log.info(ignoreMsg); }
    else { console.log(colors.yellow(ignoreMsg)); }
    if (options.verbose) {
      ignoredFilePaths.forEach((p: string) => log.debug(`  Ignored: ${p}`));
    }
  }

  // Check both command-line options AND config settings
  const shouldPublishProfile = options.publishProfile || config.publishProfile || false;
  const shouldPublishRelayList = options.publishRelayList || config.publishRelayList || false;
  const shouldPublishServerList = options.publishServerList || config.publishServerList || false;
  const shouldPublishAny = shouldPublishProfile || shouldPublishRelayList || shouldPublishServerList;

  if (includedFiles.length === 0) {
    const noFilesMsg = "No files to upload after ignore rules.";
    if (displayManager.isInteractive()) { statusDisplay.success(noFilesMsg); } else { console.log(colors.yellow(noFilesMsg)); }
    if (options.purge || shouldPublishAny) {
        log.info("Proceeding with purge/publish operations as requested despite no files to upload.");
    } else {
        return Deno.exit(0);
    }
  }
  
  if (includedFiles.length > 0) {
    const foundFilesMsg = `Found ${includedFiles.length} files to process for upload.`;
    if (displayManager.isInteractive()) { statusDisplay.update(foundFilesMsg); }
    else { console.log(colors.green(foundFilesMsg)); }
  }

  return includedFiles;
}

/**
 * Fetch remote file entries from relays
 */
async function fetchRemoteFiles(
  publisherPubkey: string
): Promise<FileEntry[]> {
  let remoteFileEntries: FileEntry[] = [];
  
  if (!options.force && !options.purge) {
    if (resolvedRelays.length > 0) {
      statusDisplay.update("Checking for existing files on remote relays...");
      try {
        remoteFileEntries = await listRemoteFiles(resolvedRelays, publisherPubkey);
        const remoteFoundMsg = `Found ${remoteFileEntries.length} existing remote file entries.`;
        if (displayManager.isInteractive()) { statusDisplay.success(remoteFoundMsg); } else { console.log(colors.green(remoteFoundMsg)); }
      } catch (e: unknown) {
        const errMsg = `Could not fetch remote file list: ${getErrorMessage(e)}. Proceeding as if no files exist remotely.`;
        if (displayManager.isInteractive()) { statusDisplay.update(colors.yellow(errMsg)); } else { console.log(colors.yellow(errMsg)); }
        log.warn(errMsg);
      }
    } else {
      const noRelayWarn = "No relays configured. Cannot check for existing remote files. Will upload all local files.";
      if (displayManager.isInteractive()) { statusDisplay.update(colors.yellow(noRelayWarn)); } else { console.log(colors.yellow(noRelayWarn)); }
    }
  }
  return remoteFileEntries;
}

/**
 * Handle purge operations for remote files
 */
async function handlePurgeOperation( remoteEntries: FileEntry[] ): Promise<FileEntry[]> {

  const shouldPurge = options.purge;

  if (!shouldPurge) {
    return remoteEntries;
  }
  
  const confirmPurge = options.nonInteractive ? true : await Confirm.prompt({ 
    message: `Are you sure you want to purge ALL remote files (nsite kind ${NSITE_KIND}) for pubkey ${await signer.getPublicKey()} before uploading?`, 
    default: false
  });
  
  if (confirmPurge && resolvedRelays.length > 0) {
    statusDisplay.update("Purging remote files...");
    try {
      await purgeRemoteFiles(
        resolvedRelays, 
        remoteEntries, 
        signer, 
        messageCollector
      );
      statusDisplay.success("Remote files purge command issued.");
      return [];
    } catch (e: unknown) {
      const errMsg = `Error during purge operation: ${getErrorMessage(e)}`;
      statusDisplay.error(errMsg);
      log.error(errMsg);
    }
  }

  else if(resolvedRelays.length === 0) {
    const noRelayErr = "Cannot purge remote files: No relays specified.";
    displayManager.isInteractive()
      ? statusDisplay.error(noRelayErr)
      : console.error(colors.red(noRelayErr));
    log.error(noRelayErr);
  }
  
  else if(confirmPurge === false) {
    log.info("Purge cancelled.");
  }

  return remoteEntries;
}

/**
 * Compare local and remote files to determine what needs to be transferred
 */
async function compareAndPrepareFiles( localFiles: FileEntry[], remoteFiles: FileEntry[] ): Promise<FilePreparationResult> {
  statusDisplay.update("Comparing local and remote files...");
  const { toTransfer, existing, toDelete } = compareFiles(localFiles, remoteFiles);
  const compareMsg = formatFileSummary(toTransfer.length, existing.length, toDelete.length);
  
  if (displayManager.isInteractive()) { 
    statusDisplay.success(compareMsg); 
  } else { 
    console.log(colors.cyan(compareMsg)); 
  }
  
  log.info(`Comparison result: ${toTransfer.length} to upload, ${existing.length} unchanged, ${toDelete.length} to delete.`);
  
  // Check both command-line options AND config settings
  const shouldPublishProfile = options.publishProfile || config.publishProfile || false;
  const shouldPublishRelayList = options.publishRelayList || config.publishRelayList || false;
  const shouldPublishServerList = options.publishServerList || config.publishServerList || false;
  const shouldPublishAny = shouldPublishProfile || shouldPublishRelayList || shouldPublishServerList;
  
  if (toTransfer.length === 0 && !options.force && !options.purge) {
    log.info("No new files to upload.");
    
    if (displayManager.isInteractive()) {
      const forceUpload = await Confirm.prompt({
        message: "No new files detected. Force upload anyway?",
        default: false
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
  
  return { toTransfer, existing, toDelete };
}

/**
 * Delete files marked for deletion
 */
async function deleteRemovedFiles( filesToDelete: FileEntry[] ): Promise<void> {
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
      messageCollector
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
async function prepareFilesForUpload( filesToTransfer: FileEntry[] ): Promise<FileEntry[]> {
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
  toDelete: FileEntry[]
){
  if (toTransfer.length > 0) {
    log.info("Processing files for upload...");
    
    try {
      const preparedFiles = await prepareFilesForUpload(
        toTransfer
      );
      
      await uploadFiles(
        preparedFiles
      );


    } catch (e: unknown) {
      const errMsg = `Error during upload process: ${getErrorMessage(e)}`;
      statusDisplay.error(errMsg);
      log.error(errMsg);
    }
  } 
  
  if (toDelete.length > 0) {
    await deleteRemovedFiles(
      toDelete
    );
  }

}

/**
 * Upload prepared files to servers and publish to relays
 */
async function uploadFiles( preparedFiles: FileEntry[] ): Promise<UploadResponse[]> {
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
    }
  );

  if(fallback) {
    await processFallbackFile();
  } 

  progressRenderer.stop();
  setProgressMode(false);

  
  if (uploadResponses.length > 0) {
    const uploadedCount = uploadResponses.filter(r => r.success).length;
    const uploadedSize = uploadResponses.reduce((sum, r) => sum + (r.file.size || 0), 0);
    
    for (const result of uploadResponses) {
      if (result.success) {
        if (result.file.sha256) {
          messageCollector.addFileSuccess(result.file.path, result.file.sha256);
        }
        if (result.eventId) {
          messageCollector.addEventSuccess(result.file.path, result.eventId);
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
      const msg = `${uploadedCount}/${preparedFiles.length} files uploaded successfully (${formatFileSize(uploadedSize)})`;
      progressRenderer.complete(false, msg);
    } else {
      const msg = "Failed to upload any files";
      progressRenderer.complete(false, msg);
    }
    
    console.log("");
    
    if (messageCollector.hasMessageType("relay-rejection") ||
        messageCollector.hasMessageType("connection-error")) {
      console.log(formatSectionHeader("Relay Issues"));
      messageCollector.printRelayIssuesSummary();
    }

    if (messageCollector.hasMessageType("error")) {
      console.log(formatSectionHeader("Errors"));
      messageCollector.printErrorSummary();
    }

    if (uploadedCount > 0) {
      console.log(formatSectionHeader("Blobs Upload Results (🌸 Blossom)"));
      if (uploadedCount === preparedFiles.length) {
        console.log(colors.green(`✓ All ${uploadedCount} files successfully uploaded`));
      } else {
        console.log(colors.yellow(`${uploadedCount}/${preparedFiles.length} files successfully uploaded`));
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
    
    const eventCount = uploadResponses.filter(r => r.eventPublished).length;
    if (eventCount > 0) {
      console.log(formatSectionHeader("Nsite Events Publish Results (𓅦 nostr)"));
      if (eventCount === uploadedCount) {
        console.log(colors.green(`✓ All ${eventCount} file events successfully published to relays`));
      } else {
        console.log(colors.yellow(`${eventCount}/${uploadedCount} events published to relays`));
        console.log(colors.yellow("This means some files may not be immediately visible in the nsite."));
        console.log(colors.yellow("Try running the upload command again with only --publish-relay-list to republish events."));
      }
      messageCollector.printEventSuccessSummary();
      console.log("");
    }    
  } else {
    progressRenderer.stop();
    console.log(colors.red("No upload responses received from servers."));
  }
  
  if (messageCollector.hasMessageCategory(MessageCategory.SERVER)) {
    console.log(formatSectionHeader("Server Messages"));
    for (const { type, target, content } of messageCollector.getMessagesByCategory(MessageCategory.SERVER)) {
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
      contentType: "text/html"
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
      }
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
 * Publish metadata to relays (profile, relay list, server list)
 */
async function maybePublishMetadata(): Promise<void> {
  log.debug("maybePublishMetadata called"); 

  // Check both command-line options AND config settings
  const shouldPublishProfile = options.publishProfile || config.publishProfile || false;
  const shouldPublishRelayList = options.publishRelayList || config.publishRelayList || false;
  const shouldPublishServerList = options.publishServerList || config.publishServerList || false;

  log.debug(`Publish flags - from options: profile=${options.publishProfile}, relayList=${options.publishRelayList}, serverList=${options.publishServerList}`);
  log.debug(`Publish flags - from config: profile=${config.publishProfile}, relayList=${config.publishRelayList}, serverList=${config.publishServerList}`);
  log.debug(`Publish flags - combined: profile=${shouldPublishProfile}, relayList=${shouldPublishRelayList}, serverList=${shouldPublishServerList}`);

  if (!(shouldPublishProfile || shouldPublishRelayList || shouldPublishServerList)) {
    log.debug("No metadata events requested for publishing, returning early");
    return;
  }
  
  console.log(formatSectionHeader("Metadata Events Publish Results"));
  
  try {
    if (shouldPublishProfile && config.profile) {
      statusDisplay.update("Publishing profile...");
      
      try {
        const profileEvent = await createProfileEvent(signer, config.profile);
        log.debug(`Created profile event for publishing: ${JSON.stringify(profileEvent)}`);
        await publishEventsToRelays(resolvedRelays, [profileEvent], signer, messageCollector);
        statusDisplay.success(`Profile published for ${config.profile.name || await signer.getPublicKey()}`);
      } catch (e: unknown) {
        statusDisplay.error(`Failed to publish profile: ${getErrorMessage(e)}`);
        log.error(`Profile publication error: ${getErrorMessage(e)}`);
      }
    }
    
    if (shouldPublishRelayList) {
      statusDisplay.update("Publishing relay list...");
      try {
        const relayListEvent = await createRelayListEvent(signer, resolvedRelays);
        log.debug(`Created relay list event: ${JSON.stringify(relayListEvent)}`);
        await publishEventsToRelays(resolvedRelays, [relayListEvent], signer, messageCollector);
        statusDisplay.success(`Relay list published: ${formatRelayList(resolvedRelays)}`);
      } catch (e: unknown) {
        statusDisplay.error(`Failed to publish relay list: ${getErrorMessage(e)}`);
        log.error(`Relay list publication error: ${getErrorMessage(e)}`);
      }
    }
    
    if (shouldPublishServerList) {
      statusDisplay.update("Publishing server list...");
      
      try {
        const serverListEvent = await createServerListEvent(signer, options.servers?.split(",") || config.servers || []);
        log.debug(`Created server list event: ${JSON.stringify(serverListEvent)}`);
        await publishEventsToRelays(resolvedRelays, [serverListEvent], signer, messageCollector);
        statusDisplay.success(`Server list published`);
      } catch (e: unknown) {
        statusDisplay.error(`Failed to publish server list: ${getErrorMessage(e)}`);
        log.error(`Server list publication error: ${getErrorMessage(e)}`);
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




