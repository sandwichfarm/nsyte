import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { Confirm, Input } from "@cliffy/prompt";
import { nip19 } from "npm:nostr-tools";
import { copy } from "std/fs/copy.ts";
import { join, normalize, dirname } from "std/path/mod.ts";
import { readProjectFile, setupProject, type ProjectData, type ProjectContext } from "../lib/config.ts";
import { DisplayManager, getDisplayManager } from "../lib/display-mode.ts";
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

const log = createLogger("upload");

interface UploadCommandOptions {
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

let displayManager!: DisplayManager;
let statusDisplay!: StatusDisplay;
let messageCollector!: MessageCollector;
let signer!: Signer;

/**
 * Implementation of the upload command
 */
export async function uploadCommand(
  fileOrFolder: string,
  options: UploadCommandOptions
): Promise<void> {

  log.debug("nstye upload");
  initState(options);

  try {
    const currentWorkingDir = Deno.cwd();
    const targetDir = join(currentWorkingDir, fileOrFolder);

    const contextResult = await resolveContext(options);
    
    if (contextResult.error) {
      statusDisplay.error(contextResult.error);
      log.error(`Configuration error: ${contextResult.error}`);
      return Deno.exit(1);
    }
    
    const { projectData, authKeyHex } = contextResult;

    if (!projectData) {
      statusDisplay.error("Critical error: Project data could not be resolved.");
      log.error("Critical error: Project data is null after context resolution without error (interactive mode).");
      return Deno.exit(1);
    }
    
    signer = (await initSigner(options, authKeyHex, projectData)) as Signer;
    
    if ("error" in signer) {
      statusDisplay.error(`Signer: ${signer.error}`);
      log.error(`Signer initialization failed: ${signer.error}`);
      return Deno.exit(1);
    }
    
    const publisherPubkey = await signer.getPublicKey();
    const resolvedServers = options.servers?.split(",") || projectData.servers || [];
    const resolvedRelays = options.relays?.split(",") || projectData.relays || [];
    
    displayConfig(
      publisherPubkey, 
      resolvedRelays, 
      resolvedServers, 
      options, 
      projectData
    );


    const includedFiles = await scanLocalFiles(
      targetDir, 
      options
    );
    
    const remoteFileEntries = await fetchRemoteFiles(
      resolvedRelays, 
      publisherPubkey, 
      options
    );
    
    const updatedRemoteFiles = await handlePurgeOperation(
      options.purge, 
      resolvedRelays, 
      remoteFileEntries, 
      options
    );
    
    const { toTransfer, toDelete } = await compareAndPrepareFiles(
      includedFiles, 
      updatedRemoteFiles, 
      options
    );
    
    await maybeProcessFiles(
      toTransfer, 
      toDelete,
      targetDir, 
      resolvedServers, 
      resolvedRelays, 
      options,
      projectData
    );
    
    await maybePublishMetadata(
      options, 
      projectData, 
      resolvedRelays
    );
    
    if (includedFiles.length === 0 && toDelete.length === 0 && toTransfer.length === 0 && 
        !(options.publishProfile || options.publishRelayList || options.publishServerList)) {
      log.info("No effective operations performed.");
    }
    
    flushQueuedLogs();
    
    return Deno.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    statusDisplay.error(`Upload command failed: ${errorMessage}`);
    log.error(`Upload command failed: ${errorMessage}`);
    return Deno.exit(1);
  }
}

async function resolveContext(
  options: UploadCommandOptions,
): Promise<{ projectData: ProjectData | null; authKeyHex: string | null | undefined; error?: string }> {
  let projectData: ProjectData | null = null;
  let authKeyHex: string | null | undefined = options.privatekey || undefined;

    if (options.nonInteractive) {
    log.debug("Resolving project context in non-interactive mode.");
      const existingProjectData = readProjectFile();

    if (!options.servers && (!existingProjectData?.servers || existingProjectData.servers.length === 0)) {
      return { projectData: existingProjectData, authKeyHex, error: "Missing servers: Provide --servers or configure in .nsite/config.json." };
    }
    if (!options.relays && (!existingProjectData?.relays || existingProjectData.relays.length === 0)) {
      return { projectData: existingProjectData, authKeyHex, error: "Missing relays: Provide --relays or configure in .nsite/config.json." };
    }

    if (!authKeyHex && !options.nbunksec && !options.bunker) {
      if (!existingProjectData?.bunkerPubkey) {
        return { projectData: existingProjectData, authKeyHex, error: "Missing signing key: For non-interactive mode, provide --privatekey, --nbunksec, --bunker, or ensure a bunker is configured in .nsite/config.json." };
      } else {
        log.info("No direct key/nsec on CLI. Will attempt to use configured bunker for non-interactive mode.");
      }
    }
    
    projectData = {
      servers: options.servers ? options.servers.split(",") : existingProjectData?.servers || [],
      relays: options.relays ? options.relays.split(",") : existingProjectData?.relays || [],
      publishServerList: options.publishServerList !== undefined ? options.publishServerList : existingProjectData?.publishServerList || false,
      publishRelayList: options.publishRelayList !== undefined ? options.publishRelayList : existingProjectData?.publishRelayList || false,
      publishProfile: options.publishProfile !== undefined ? options.publishProfile : existingProjectData?.publishProfile || false,
      profile: existingProjectData?.profile,
      bunkerPubkey: existingProjectData?.bunkerPubkey, 
      fallback: options.fallback || existingProjectData?.fallback,
    };

    } else {
    log.debug("Resolving project context in interactive mode.");
    const currentProjectData = readProjectFile();
    let keyFromInteractiveSetup: string | undefined;

    if (!currentProjectData) {
      log.info("No .nsite/config.json found, running initial project setup.");
      const setupResult = await setupProject(false); 
      if (!setupResult.projectData) {
        return { projectData: null, authKeyHex: undefined, error: "Project setup failed or was aborted." };
      }
      projectData = setupResult.projectData;
      keyFromInteractiveSetup = setupResult.privateKey;
    } else {
      projectData = currentProjectData;
      if (!options.privatekey && !options.nbunksec && !options.bunker && !projectData.bunkerPubkey) {
        log.info("Project is configured but no signing method found (CLI key, CLI bunker, or configured bunker). Running key setup...");
        const keySetupResult = await setupProject(false);
        if (!keySetupResult.projectData) {
          return { projectData, authKeyHex: undefined, error: "Key setup for existing project failed or was aborted." };
        }
        projectData = keySetupResult.projectData;
        keyFromInteractiveSetup = keySetupResult.privateKey;
      }
    }
    
    if (options.privatekey) {
        authKeyHex = options.privatekey;
    } else if (keyFromInteractiveSetup) {
        authKeyHex = keyFromInteractiveSetup;
    }
  }
  
  if (!projectData || !projectData.servers || projectData.servers.length === 0) {
    return { projectData, authKeyHex, error: "Servers configuration is missing or empty." };
  }
  if (!projectData.relays || projectData.relays.length === 0) {
    return { projectData, authKeyHex, error: "Relays configuration is missing or empty." };
  }

  return { projectData, authKeyHex };
}

async function initSigner(
  options: UploadCommandOptions,
  authKeyHex: string | null | undefined,
  projectData: ProjectData | null
): Promise<Signer | { error: string }> {
  if (options.nbunksec) {
    try {
      log.info("Using NostrBunker (nbunksec from CLI) for signing...");
        const bunkerSigner = await importFromNbunk(options.nbunksec);
      await bunkerSigner.getPublicKey();
      return bunkerSigner;
    } catch (e: unknown) {
      return { error: `Failed to import nbunksec from CLI: ${(e as Error).message}` };
      }
    } else if (options.bunker) {
    try {
      log.info(`Using NostrBunker (URL from CLI: ${options.bunker}) for signing...`);
      const { client } = await createNip46ClientFromUrl(options.bunker);
      return client;
    } catch (e: unknown) {
      return { error: `Failed to connect to bunker URL from CLI: ${(e as Error).message}` };
    }
  } else if (authKeyHex) {
    log.info("Using private key for signing (from CLI or interactive setup)...");
    try {
      return new PrivateKeySigner(authKeyHex);
    } catch (e: unknown) {
      return { error: `Invalid private key provided: ${(e as Error).message}` };
    }
  } else if (projectData?.bunkerPubkey) {
    log.info(`Attempting to use configured bunker (pubkey: ${projectData.bunkerPubkey.substring(0,8)}...) for signing...`);
      const secretsManager = SecretsManager.getInstance();
      const nbunkString = secretsManager.getNbunk(projectData.bunkerPubkey);
      if (nbunkString) {
        try {
        log.info("Found stored nbunksec for configured bunker. Importing...");
          const bunkerSigner = await importFromNbunk(nbunkString);
        await bunkerSigner.getPublicKey();
        return bunkerSigner;
      } catch (e: unknown) {
        const baseMsg = `Failed to use stored nbunksec for configured bunker ${projectData.bunkerPubkey.substring(0,8)}...: ${(e as Error).message}`;
          if (options.nonInteractive) {
          return { error: `${baseMsg} In non-interactive mode, cannot re-prompt. Please check bunker or provide key via CLI.` };
        } else {
          return { error: `${baseMsg} The stored secret may be invalid. Consider re-configuring the bunker connection.` };
        }
        }
      } else {
      const baseMsg = `No stored secret (nbunksec) found for configured bunker: ${projectData.bunkerPubkey.substring(0,8)}...`;
        if (options.nonInteractive) {
        return { error: `${baseMsg} In non-interactive mode, cannot prompt for new bunker details. Please run interactively or provide key/nbunksec via CLI.` };
      } else {
        return { error: `${baseMsg} Please re-configure the bunker connection or provide a key/nbunksec via CLI.` };
      }
    }
  }
  return { error: "No valid signing method could be initialized (private key, nbunksec, or bunker). Please check your configuration or CLI arguments." };
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

export function displayConfig(publisherPubkey: string, resolvedRelays: string[], resolvedServers: string[], options: UploadCommandOptions, projectData: ProjectData){
    if (displayManager.isInteractive()) {
      console.log(formatTitle("Upload Configuration"));
      console.log(formatConfigValue("User", publisherPubkey, false));
    console.log(formatConfigValue("Relays", formatRelayList(resolvedRelays), !options.relays && !projectData.relays));
    console.log(formatConfigValue("Servers", formatRelayList(resolvedServers), !options.servers && !projectData.servers));
      console.log(formatConfigValue("Force Upload", options.force, options.force === false));
      console.log(formatConfigValue("Purge Old Files", options.purge, options.purge === false));
      console.log(formatConfigValue("Concurrency", options.concurrency, options.concurrency === 4));
      console.log(formatConfigValue("404 Fallback", options.fallback || projectData.fallback || "none", !options.fallback && !projectData.fallback));
      console.log(formatConfigValue("Publish Relay List (Kind 10002)", options.publishRelayList || projectData.publishRelayList || false, !options.publishRelayList && !projectData.publishRelayList));
      console.log(formatConfigValue("Publish Server List (Kind 10063)", options.publishServerList || projectData.publishServerList || false, !options.publishServerList && !projectData.publishServerList));
      console.log(formatConfigValue("Publish Profile (Kind 0)", options.publishProfile || !!projectData.profile, !options.publishProfile && !projectData.profile));
      console.log("");
  } else if (!options.nonInteractive) {
      console.log(colors.cyan(`User: ${publisherPubkey}`));
    console.log(colors.cyan(`Relays: ${resolvedRelays.join(", ") || "none"}${!options.relays && !projectData.relays ? " (default)" : ""}`));
    console.log(colors.cyan(`Servers: ${resolvedServers.join(", ") || "none"}${!options.servers && !projectData.servers ? " (default)" : ""}`));
      console.log(colors.cyan(`Concurrency: ${options.concurrency}${options.concurrency === 4 ? " (default)" : ""}`));
      if (options.force) console.log(colors.yellow("Force Upload: true"));
      if (options.purge) console.log(colors.yellow("Purge Old Files: true"));
      if (options.fallback || projectData.fallback) console.log(colors.cyan(`404 Fallback: ${options.fallback || projectData.fallback}${!options.fallback && !projectData.fallback ? " (default)" : ""}`));
      if (options.publishRelayList || projectData.publishRelayList) console.log(colors.cyan(`Publish Relay List: true${!options.publishRelayList && !projectData.publishRelayList ? " (default)" : ""}`));
      if (options.publishServerList || projectData.publishServerList) console.log(colors.cyan(`Publish Server List: true${!options.publishServerList && !projectData.publishServerList ? " (default)" : ""}`));
      if (options.publishProfile && projectData.profile) console.log(colors.cyan(`Publish Profile: true${!options.publishProfile && !projectData.profile ? " (default)" : ""}`));
  }
}

/**
 * Scan local files in the target directory
 */
async function scanLocalFiles(
  targetDir: string, 
  options: UploadCommandOptions
): Promise<FileEntry[]> {
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

  if (includedFiles.length === 0) {
    const noFilesMsg = "No files to upload after ignore rules.";
    if (displayManager.isInteractive()) { statusDisplay.success(noFilesMsg); } else { console.log(colors.yellow(noFilesMsg)); }
    if (options.purge || options.publishProfile || options.publishRelayList || options.publishServerList) {
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
  relays: string[],
  publisherPubkey: string,
  options: UploadCommandOptions
): Promise<FileEntry[]> {
  let remoteFileEntries: FileEntry[] = [];
  
  if (!options.force && !options.purge) {
    if (relays.length > 0) {
      statusDisplay.update("Checking for existing files on remote relays...");
      try {
        remoteFileEntries = await listRemoteFiles(relays, publisherPubkey);
        const remoteFoundMsg = `Found ${remoteFileEntries.length} existing remote file entries.`;
        if (displayManager.isInteractive()) { statusDisplay.success(remoteFoundMsg); } else { console.log(colors.green(remoteFoundMsg)); }
      } catch (e: unknown) {
        const errMsg = `Could not fetch remote file list: ${(e as Error).message}. Proceeding as if no files exist remotely.`;
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
async function handlePurgeOperation(
  shouldPurge: boolean,
  relays: string[],
  remoteEntries: FileEntry[],
  options: UploadCommandOptions
): Promise<FileEntry[]> {
  if (!shouldPurge) {
    return remoteEntries;
  }
  
  const confirmPurge = options.nonInteractive ? true : await Confirm.prompt({ 
    message: `Are you sure you want to purge ALL remote files (nsite kind ${NSITE_KIND}) for pubkey ${await signer.getPublicKey()} before uploading?`, 
    default: false
  });
  
  if (confirmPurge) {
    if (relays.length > 0) {
      statusDisplay.update("Purging remote files...");
      try {
        await purgeRemoteFiles(relays, remoteEntries, signer, messageCollector);
        statusDisplay.success("Remote files purge command issued.");
        return [];
      } catch (e: unknown) {
        const errMsg = `Error during purge operation: ${(e as Error).message}`;
        statusDisplay.error(errMsg);
        log.error(errMsg);
      }
    } else {
      const noRelayErr = "Cannot purge remote files: No relays specified.";
      if (displayManager.isInteractive()) { statusDisplay.error(noRelayErr); } else { console.error(colors.red(noRelayErr)); }
      log.error(noRelayErr);
    }
  } else {
    log.info("Purge cancelled.");
    if (remoteEntries.length === 0 && !(options.publishProfile || options.publishRelayList || options.publishServerList)) {
      return Deno.exit(0);
    }
  }
  
  return remoteEntries;
}

/**
 * Compare local and remote files to determine what needs to be transferred
 */
async function compareAndPrepareFiles(
  localFiles: FileEntry[],
  remoteFiles: FileEntry[],
  options: UploadCommandOptions
): Promise<{ toTransfer: FileEntry[]; existing: FileEntry[]; toDelete: FileEntry[] }> {
  statusDisplay.update("Comparing local and remote files...");
  const { toTransfer, existing, toDelete } = compareFiles(localFiles, remoteFiles);
  const compareMsg = formatFileSummary(toTransfer.length, existing.length, toDelete.length);
  
  if (displayManager.isInteractive()) { 
    statusDisplay.success(compareMsg); 
  } else { 
    console.log(colors.cyan(compareMsg)); 
  }
  
  log.info(`Comparison result: ${toTransfer.length} to upload, ${existing.length} unchanged, ${toDelete.length} to delete.`);
  
  if (toTransfer.length === 0 && !options.force && !options.purge) {
    log.info("No new files to upload.");
    
    if (displayManager.isInteractive()) {
      const forceUpload = await Confirm.prompt({
        message: "No new files detected. Force upload anyway?",
        default: false
      });
      
      if (!forceUpload) {
        log.info("Upload cancelled by user.");
        
        if (!(options.publishProfile || options.publishRelayList || options.publishServerList)) {
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
      
      if (!(options.publishProfile || options.publishRelayList || options.publishServerList)) {
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
async function deleteRemovedFiles(
  filesToDelete: FileEntry[],
  relays: string[]
): Promise<void> {
  if (filesToDelete.length === 0) {
    return;
  }
  
  log.info(`Requesting deletion of ${filesToDelete.length} files from remote events`);
  
  statusDisplay.update(`Deleting ${filesToDelete.length} files...`);
  
  try {
    const deletedCount = await purgeRemoteFiles(
      relays, 
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
    const errMsg = `Error during file deletion: ${(e as Error).message}`;
    statusDisplay.error(errMsg);
    log.error(errMsg);
  }
}

/**
 * Load and prepare files for upload
 */
async function prepareFilesForUpload(
  filesToTransfer: FileEntry[],
  baseDir: string
): Promise<FileEntry[]> {
  const preparedFiles: FileEntry[] = [];
  
  for (const file of filesToTransfer) {
    try {
      const fileWithData = await loadFileData(baseDir, file);
      preparedFiles.push(fileWithData);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(colors.red(`Failed to load file ${file.path}: ${errorMessage}`));
      messageCollector.addFileError(file.path, errorMessage);
    }
  }
  
  return preparedFiles;
}

/**
 * Upload prepared files to servers and publish to relays
 */
async function uploadFiles(
  preparedFiles: FileEntry[],
  baseDir: string,
  servers: string[],
  relays: string[],
  options: UploadCommandOptions
): Promise<UploadResponse[]> {
  if (preparedFiles.length === 0) {
    statusDisplay.error("No files could be loaded for upload.");
    return [];
  }
  
  statusDisplay.update(`Uploading ${preparedFiles.length} files...`);
  
  setProgressMode(true);
  const progressRenderer = new ProgressRenderer(preparedFiles.length);
  progressRenderer.start();
  
  if (servers.length === 0) {
    throw new Error("No servers configured for upload");
  }
  
  const uploadResponses = await processUploads(
    preparedFiles,
    baseDir,
    servers,
    signer,
    relays,
    options.concurrency,
    (progress) => {
      progressRenderer.update(progress);
    }
  );
  
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
      console.log(formatSectionHeader("Upload Results"));
      if (uploadedCount === preparedFiles.length) {
        console.log(colors.green(`✓ All ${uploadedCount} files successfully uploaded`));
      } else {
        console.log(colors.yellow(`${uploadedCount}/${preparedFiles.length} files successfully uploaded`));
      }
      messageCollector.printFileSuccessSummary();
      console.log("");
    }
    
    const eventCount = uploadResponses.filter(r => r.eventPublished).length;
    if (eventCount > 0) {
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
    
    console.log(formatSectionHeader("Server Results"));
    const serverResults: Record<string, { success: number; total: number }> = {};
    
    for (const server of servers) {
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
async function processFallbackFile(
  fallbackPath: string | undefined,
  targetDir: string,
  servers: string[],
  relays: string[]
): Promise<void> {
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
      servers,
      signer,
      relays,
      1,
      (progress) => {}
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
    const errMsg = `Error processing fallback file: ${(e as Error).message}`;
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
async function maybePublishMetadata(
  options: UploadCommandOptions,
  projectData: ProjectData,
  relays: string[]
): Promise<void> {
  if (!(options.publishProfile || options.publishRelayList || options.publishServerList)) {
    return;
  }
  
  log.info(formatSectionHeader("Publishing Metadata"));
  
  try {
    if (options.publishProfile && projectData.profile) {
      statusDisplay.update("Publishing profile...");
      
      try {
        const profileEvent = await createProfileEvent(signer, projectData.profile);
        await publishEventsToRelays(relays, [profileEvent], signer, messageCollector);
        statusDisplay.success(`Profile published for ${projectData.profile.name || await signer.getPublicKey()}`);
      } catch (e: unknown) {
        statusDisplay.error(`Failed to publish profile: ${(e as Error).message}`);
      }
    }
    
    if (options.publishRelayList) {
      statusDisplay.update("Publishing relay list...");
      
      try {
        const relayListEvent = await createRelayListEvent(signer, relays);
        await publishEventsToRelays(relays, [relayListEvent], signer, messageCollector);
        statusDisplay.success(`Relay list published: ${formatRelayList(relays)}`);
      } catch (e: unknown) {
        statusDisplay.error(`Failed to publish relay list: ${(e as Error).message}`);
      }
    }
    
    if (options.publishServerList) {
      statusDisplay.update("Publishing server list...");
      
      try {
        const serverListEvent = await createServerListEvent(signer, options.servers?.split(",") || projectData.servers || []);
        await publishEventsToRelays(relays, [serverListEvent], signer, messageCollector);
        statusDisplay.success(`Server list published`);
      } catch (e: unknown) {
        statusDisplay.error(`Failed to publish server list: ${(e as Error).message}`);
      }
    }
  } catch (e: unknown) {
    const errMsg = `Error during metadata publishing: ${(e as Error).message}`;
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
}

export async function maybeProcessFiles(toTransfer: FileEntry[], toDelete: FileEntry[], targetDir: string, resolvedServers: string[], resolvedRelays: string[], options: UploadCommandOptions, projectData: ProjectData){
  if (toTransfer.length > 0) {
    log.info("Processing files for upload...");
    
    try {
      const preparedFiles = await prepareFilesForUpload(
        toTransfer, 
        targetDir
      );
      
      await uploadFiles(
        preparedFiles,
        targetDir, 
        resolvedServers, 
        resolvedRelays, 
        options
      );


    } catch (e: unknown) {
      const errMsg = `Error during upload process: ${(e as Error).message}`;
      statusDisplay.error(errMsg);
      log.error(errMsg);
    }
  } 
  
  if (toDelete.length > 0) {
    await deleteRemovedFiles(
      toDelete, 
      resolvedRelays
    );
  }

  if(projectData.fallback){
    await processFallbackFile(
      options.fallback || projectData.fallback, 
      targetDir, 
      resolvedServers, 
      resolvedRelays
    );
  }
}

export function initState(options: UploadCommandOptions){
  displayManager = getDisplayManager();
  displayManager.configureFromOptions(options);
  messageCollector = new MessageCollector(displayManager.isInteractive());
  statusDisplay = new StatusDisplay();
}

