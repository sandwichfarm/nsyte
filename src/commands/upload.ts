import { Command } from "cliffy/command/mod.ts";
import { colors } from "cliffy/ansi/colors.ts";
import { copy } from "std/fs/copy.ts";
import { join, normalize } from "std/path/mod.ts";
import { createLogger, setProgressMode, flushQueuedLogs } from "../lib/logger.ts";
import { readProjectFile, setupProject } from "../lib/config.ts";
import { getLocalFiles, compareFiles, loadFileData } from "../lib/files.ts";
import { processUploads, Signer } from "../lib/upload.ts";
import { createNip46ClientFromUrl, NostrEventTemplate, NostrEvent, listRemoteFiles, connectToRelay } from "../lib/nostr.ts";
import { ProgressRenderer } from "../ui/progress.ts";
import { StatusDisplay } from "../ui/status.ts";
import { Confirm } from "cliffy/prompt/mod.ts";
import { PrivateKeySigner } from "../lib/signer.ts";
import { nip19 } from "npm:nostr-tools";
import { BunkerSigner, decodeBunkerInfo } from "../lib/nip46.ts";
import { Input } from "cliffy/prompt/mod.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { MessageCollector, MessageCategory } from "../lib/message-collector.ts";
import { DisplayManager, getDisplayManager, DisplayMode } from "../lib/display-mode.ts";
import { header } from "../lib/header.ts";
import { 
  formatTitle, 
  formatSectionHeader, 
  formatRelayList, 
  formatFilePath, 
  formatFileSize, 
  formatFileSummary, 
  formatServerResults,
  formatSummaryTitle
} from "../ui/formatters.ts";

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
    .option("-v, --verbose", "Verbose output.")
    .option("-c, --concurrency <number:number>", "Number of parallel uploads.", { default: 4 })
    .option("--publish-server-list", "Publish the list of blossom servers (Kind 10063).", { default: false })
    .option("--publish-relay-list", "Publish the list of nostr relays (Kind 10002).", { default: false })
    .option("--publish-profile", "Publish the app profile for the npub (Kind 0).", { default: false })
    .option("--fallback <file:string>", "An HTML file to copy and publish as 404.html")
    .option("--non-interactive", "Run in non-interactive mode", { default: false })
    .action(async (options, folder) => {
      await uploadCommand(folder, options as unknown as UploadCommandOptions);
    });
}

/**
 * Implementation of the upload command
 */
export async function uploadCommand(
  fileOrFolder: string,
  options: UploadCommandOptions
): Promise<void> {
  try {
    log.debug("Upload command started");
    
    // Set up the display manager based on command options
    const displayManager = getDisplayManager();
    displayManager.configureFromOptions(options);
    
    // Create a message collector for grouping similar messages
    const messageCollector = new MessageCollector(displayManager.isInteractive());
    
    // Note: The header is already displayed in the main CLI file, no need to show it again here
    
    const projectContext = options.nonInteractive
      ? { projectData: readProjectFile() || { relays: [], servers: [], publishRelayList: false, publishServerList: false } }
      : await setupProject();
    
    const projectData = projectContext.projectData;
    
    if (!projectData) {
      console.error(colors.red("No project configuration found. Please run the interactive setup first."));
      Deno.exit(1);
    }
    
    let signer: Signer;
    let publisherPubkey: string;
    
    if (options.privatekey) {
      const privateKeySigner = new PrivateKeySigner(options.privatekey);
      signer = privateKeySigner;
      publisherPubkey = privateKeySigner.getPublicKey();
      log.debug("Using private key from command line");
    } else if (options.nbunksec) {
      log.info("Using nbunksec from command line...");
      try {
        const bunkerInfo = decodeBunkerInfo(options.nbunksec);
        const bunkerSigner = await BunkerSigner.importFromNbunk(options.nbunksec);
        signer = bunkerSigner;
        publisherPubkey = bunkerSigner.getPublicKey();
        log.info(`Successfully connected to bunker from nbunksec, user pubkey: ${publisherPubkey}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Failed to use nbunksec from command line: ${errorMessage}`);
        console.error(colors.red(`Failed to use nbunksec: ${errorMessage}`));
        Deno.exit(1);
      }
    } else if (options.bunker) {
      log.info("Connecting to bunker from command line...");
      const { client, userPubkey } = await createNip46ClientFromUrl(options.bunker);
      signer = client;
      publisherPubkey = userPubkey;
      log.debug(`Connected to bunker, user pubkey: ${userPubkey}`);
    } else if (projectContext.privateKey) {
      const privateKeySigner = new PrivateKeySigner(projectContext.privateKey);
      signer = privateKeySigner;
      publisherPubkey = privateKeySigner.getPublicKey();
      log.debug("Using private key from prompt");
    } else if (projectData.bunkerPubkey) {
      // First try to get bunker info from system-wide secrets
      const secretsManager = SecretsManager.getInstance();
      const nbunkString = secretsManager.getNbunk(projectData.bunkerPubkey);
      
      if (nbunkString) {
        try {
          log.info("Using stored nbunksec for this bunker...");
          const bunkerSigner = await BunkerSigner.importFromNbunk(nbunkString);
          signer = bunkerSigner;
          publisherPubkey = bunkerSigner.getPublicKey();
          log.debug(`Connected to bunker using nbunksec, user pubkey: ${publisherPubkey}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.warn(`Failed to use stored nbunksec: ${errorMessage}`);
          
          // Fall back to asking for bunker URL
          log.info("Need a fresh bunker URL with secret to connect");
          
          const bunkerUrl = await Input.prompt({
            message: "Enter your NSEC bunker URL (bunker://...):",
            validate: (input: string) => {
              return input.trim().startsWith("bunker://") || 
                    "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
            }
          });
          
          log.info("Connecting to bunker...");
          const { client, userPubkey } = await createNip46ClientFromUrl(bunkerUrl);
          signer = client;
          publisherPubkey = userPubkey;
          log.debug(`Connected to bunker, user pubkey: ${userPubkey}`);
        }
      } else {
        // Fall back to asking for bunker URL
        log.info("Need a fresh bunker URL with secret to connect");
        
        const bunkerUrl = await Input.prompt({
          message: "Enter your NSEC bunker URL (bunker://...):",
          validate: (input: string) => {
            return input.trim().startsWith("bunker://") || 
                  "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
          }
        });
        
        log.info("Connecting to bunker...");
        const { client, userPubkey } = await createNip46ClientFromUrl(bunkerUrl);
        signer = client;
        publisherPubkey = userPubkey;
        log.debug(`Connected to bunker, user pubkey: ${userPubkey}`);
      }
    } else {
      console.error(colors.red("No private key or bunker pubkey available. Please provide a private key or configure a bunker."));
      Deno.exit(1);
    }
    
    const relays = options.relays
      ? options.relays.split(",")
      : projectData.relays;
    
    const servers = options.servers
      ? options.servers.split(",")
      : projectData.servers;
    
    // Display basic upload information
    if (displayManager.isInteractive()) {
      console.log(formatTitle("Upload Configuration"));
      console.log(`User:    ${colors.cyan(publisherPubkey)}`);
      console.log(`Relays:  ${formatRelayList(relays)}`);
      console.log(`Servers: ${formatRelayList(servers)}`);
      console.log("");
    } else {
      console.log(colors.cyan(`Upload for user: ${publisherPubkey}`));
      console.log(colors.cyan(`Using relays: ${relays.join(", ")}`));
      console.log(colors.cyan(`Using servers: ${servers.join(", ")}`));
    }
    
    // Create a status display for ephemeral messages
    const statusDisplay = new StatusDisplay();
    
    const fallbackFor404 = options.fallback || projectData.fallback;
    if (fallbackFor404) {
      const sourceFolder = normalize(fileOrFolder).replace(/\/$/, "");
      const htmlSourcePath = join(sourceFolder, fallbackFor404.replace(/^\/+/, ""));
      const fallback404Path = join(sourceFolder, "404.html");
      
      statusDisplay.update("Copying 404 fallback file...");
      
      log.debug(`Copying 404 fallback from '${htmlSourcePath}' to '${fallback404Path}'`);
      await copy(htmlSourcePath, fallback404Path, { overwrite: true });
      
      if (displayManager.isInteractive()) {
        statusDisplay.success(`Copied 404 fallback from ${formatFilePath(fallbackFor404)} to ${formatFilePath("404.html")}`);
      } else {
        console.log(colors.green(`Copied ${htmlSourcePath} to ${fallback404Path} for 404 fallback`));
      }
    }
    
    // Get local files
    statusDisplay.update("Scanning local files...");
    const localFiles = await getLocalFiles(fileOrFolder);
    if (localFiles.length === 0) {
      statusDisplay.error(`No files found in local source folder ${fileOrFolder}`);
      console.error(colors.red(`No files found in local source folder ${fileOrFolder}.`));
      Deno.exit(1);
    }
    
    if (displayManager.isInteractive()) {
      statusDisplay.success(`Found ${localFiles.length} files in ${formatFilePath(fileOrFolder)}`);
      
      if (displayManager.isVerbose()) {
        const fileTable = localFiles.map(file => [
          formatFilePath(file.path),
          file.contentType || "unknown",
          formatFileSize(file.size)
        ]);
        
        if (fileTable.length > 10 && !displayManager.isDebug()) {
          // Only show the first 10 files if there are many
          console.log(formatTitle("\nSample Files:"));
          for (let i = 0; i < 10; i++) {
            console.log(`  ${fileTable[i][0]} (${fileTable[i][1]}, ${fileTable[i][2]})`);
          }
          console.log(`  ... and ${localFiles.length - 10} more files`);
        } else {
          console.log(formatTitle("\nAll Files:"));
          for (const row of fileTable) {
            console.log(`  ${row[0]} (${row[1]}, ${row[2]})`);
          }
        }
        console.log("");
      }
    } else {
      console.log(colors.green(`${localFiles.length} files found locally in ${fileOrFolder}`));
      
      if (displayManager.isVerbose()) {
        localFiles.forEach(file => {
          console.log(`- ${file.path} (${file.contentType}, ${file.size || "unknown"} bytes)`);
        });
      }
    }
    
    // Get remote files
    statusDisplay.update("Fetching files from NOSTR relays...");
    
    const remoteFiles = await listRemoteFiles(relays, publisherPubkey);
    
    if (displayManager.isInteractive()) {
      statusDisplay.success(`Found ${remoteFiles.length} files online`);
      
      if (displayManager.isVerbose() && remoteFiles.length > 0) {
        const fileTable = remoteFiles.map(file => [
          formatFilePath(file.path),
          file.sha256 || "unknown hash"
        ]);
        
        if (fileTable.length > 10 && !displayManager.isDebug()) {
          console.log(formatTitle("\nSample Remote Files:"));
          for (let i = 0; i < 10; i++) {
            console.log(`  ${fileTable[i][0]} (${fileTable[i][1]})`);
          }
          console.log(`  ... and ${remoteFiles.length - 10} more files`);
        } else {
          console.log(formatTitle("\nAll Remote Files:"));
          for (const row of fileTable) {
            console.log(`  ${row[0]} (${row[1]})`);
          }
        }
        console.log("");
      }
    } else {
      console.log(colors.green(`${remoteFiles.length} files available online.`));
      
      if (displayManager.isVerbose() && remoteFiles.length > 0) {
        remoteFiles.forEach(file => {
          console.log(`- ${file.path} (${file.sha256 || "unknown hash"})`);
        });
      }
    }
    
    let fileComparisonMessage = "";
    if (remoteFiles.length === 0) {
      const checkFilePath = localFiles[0];
      
      if (checkFilePath && checkFilePath.sha256) {
        statusDisplay.update("Checking if files already exist on blossom servers...");
        
        let alreadyExists = false;
        
        for (const server of servers) {
          try {
            const serverUrl = server.endsWith("/") ? server : `${server}/`;
            const response = await fetch(`${serverUrl}${checkFilePath.sha256}`, {
              method: "HEAD"
            });
            
            if (response.ok) {
              if (displayManager.isInteractive()) {
                statusDisplay.update("Files may already exist on servers but relay data couldn't be retrieved.");
                fileComparisonMessage = "Files may already exist on servers. Use --force to override.";
              } else {
                console.log(colors.yellow(`Files may already exist on ${server} but relay data couldn't be retrieved.`));
                console.log(colors.yellow("To force re-upload, use --force flag."));
              }
              alreadyExists = true;
              break;
            }
          } catch (error) {
          }
        }
        
        if (alreadyExists && !options.force) {
          fileComparisonMessage = "Files may already exist on servers. Use --force to override.";
        }
      }
    }
    
    // Compare files
    statusDisplay.update("Comparing local and remote files...");
    const { toTransfer, existing, toDelete } = compareFiles(localFiles, remoteFiles);
    
    if (displayManager.isInteractive()) {
      // Use formatFileSummary to get a nicely formatted summary
      const summary = formatFileSummary(toTransfer.length, existing.length, toDelete.length);
      statusDisplay.success(summary);
      
      if (fileComparisonMessage) {
        console.log(colors.yellow(fileComparisonMessage));
      }
    } else {
      console.log(colors.green(
        `${toTransfer.length} new files to upload, ${existing.length} files unchanged, ${toDelete.length} files to delete online.`
      ));
      
      if (fileComparisonMessage) {
        console.log(colors.yellow(fileComparisonMessage));
      }
    }
    
    if ((toTransfer.length === 0 && (!options.purge || toDelete.length === 0)) || 
        (remoteFiles.length === 0 && fileComparisonMessage && !options.force)) {
      
      if (displayManager.isInteractive()) {
        // First display the status message as a permanent message (not ephemeral)
        console.log(colors.yellow("No changes detected. Use --force to upload all files anyway."));
      } else {
        console.log(colors.yellow("No files to upload or delete. Use --force to upload all files."));
      }
      
      if (!options.nonInteractive) {
        // Add an extra line break to ensure clean prompt display
        console.log("");
        
        const forceUpload = await Confirm.prompt({
          message: "Do you want to force upload all files anyway?",
          default: false,
        });
        
        if (forceUpload) {
          if (displayManager.isInteractive()) {
            statusDisplay.success("Forcing upload of all files...");
          } else {
            console.log(colors.cyan(`Force uploading all ${localFiles.length} files.`));
          }
          toTransfer.push(...existing);
        } else {
          if (existing.length > 0) {
            if (displayManager.isInteractive()) {
              console.log(`${colors.green("✓")} ${existing.length} files already up-to-date. Nothing to do.`);
            } else {
              console.log(colors.green(`${existing.length} files are already online and up-to-date. No need to re-publish.`));
            }
          }
          
          if (displayManager.isInteractive()) {
            console.log(colors.green("Upload process completed. No changes needed."));
          } else {
            console.log(colors.green("Nothing to do. Exiting."));
          }
          Deno.exit(0);
        }
      } else if (options.force) {
        if (displayManager.isInteractive()) {
          statusDisplay.success("Forcing upload of all files...");
        } else {
          console.log(colors.cyan(`Force uploading all ${localFiles.length} files.`));
        }
        toTransfer.push(...existing);
      } else {
        if (existing.length > 0) {
          if (displayManager.isInteractive()) {
            console.log(`${colors.green("✓")} ${existing.length} files already up-to-date. Nothing to do.`);
          } else {
            console.log(colors.green(`${existing.length} files are already online and up-to-date. No need to re-publish.`));
          }
        }
        
        if (displayManager.isInteractive()) {
          console.log(colors.green("Upload process completed. No changes needed."));
        } else {
          console.log(colors.green("Nothing to do. Exiting."));
        }
        Deno.exit(0);
      }
    }
    
    if (toTransfer.length > 0) {
      statusDisplay.update("Loading file data...");
      
      const filesToUpload: any[] = [];
      for (const file of toTransfer) {
        try {
          const fileWithData = await loadFileData(fileOrFolder, file);
          filesToUpload.push(fileWithData);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(colors.red(`Failed to load file ${file.path}: ${errorMessage}`));
          messageCollector.addFileError(file.path, errorMessage);
        }
      }
      
      if (filesToUpload.length === 0) {
        console.error(colors.red("No files could be loaded for upload."));
        Deno.exit(1);
      }

      console.log(""); //line break
      
      const progress = new ProgressRenderer();
      
      statusDisplay.success(`Uploading ${filesToUpload.length} files with concurrency ${options.concurrency}...`);
      
      setProgressMode(true);
      
      const results = await processUploads(
        filesToUpload,
        fileOrFolder,
        servers,
        signer,
        relays,
        options.concurrency,
        (progressData) => progress.update(progressData)
      );
      
      setProgressMode(false);
      
      const successCount = results.filter(r => r.success).length;
      const successRate = Math.round((successCount / results.length) * 100);
      
      const eventCount = results.filter(r => r.eventPublished).length;
      const eventRate = Math.round((eventCount / results.length) * 100);
      
      const totalServerOperations = results.length * servers.length;
      const successfulServerOperations = results.reduce((count, result) => {
        const successfulServerCount = Object.values(result.serverResults).filter(s => s.success).length;
        return count + successfulServerCount;
      }, 0);
      const serverSuccessRate = Math.round((successfulServerOperations / totalServerOperations) * 100);
      
      progress.complete(
        successCount === results.length,
        `Uploaded ${successCount}/${results.length} files (${successRate}%)`
      );
      
      flushQueuedLogs();
      
      // Add a line break for better visual separation
      console.log("");
      
      // Display formatted results
      if (displayManager.isInteractive()) {
        // Store file hashes and event IDs for each successful upload
        for (const result of results) {
          if (result.success) {
            if (result.file.sha256) {
              messageCollector.addFileSuccess(result.file.path, result.file.sha256);
            }
            if (result.eventId) {
              messageCollector.addEventSuccess(result.file.path, result.eventId);
            }
          }
        }
        
        // Display any rejection messages
        if (messageCollector.hasMessageType("relay-rejection") || 
            messageCollector.hasMessageType("connection-error")) {
          console.log(formatSectionHeader("Rejections"));
          messageCollector.printRelayIssuesSummary();
        }
        
        // Display any error messages
        if (messageCollector.hasMessageType("error")) {
          console.log(formatSectionHeader("Errors"));
          messageCollector.printErrorSummary();
        }
        
        // Display any notice messages
        if (messageCollector.hasMessageType("notice")) {
          console.log(formatSectionHeader("Other Notices"));
          messageCollector.printNotices();
        }
        
        // Display upload results
        console.log(formatSectionHeader("Upload Results"));
        
        if (successCount === results.length) {
          console.log(colors.green(`✓ All ${successCount} files successfully uploaded`));
          // Show file hashes for successful uploads
          messageCollector.printFileSuccessSummary();
        } else {
          console.log(colors.yellow(`${successCount}/${results.length} files successfully uploaded (${successRate}%)`));
          // Show file hashes for successful uploads
          messageCollector.printFileSuccessSummary();
        }
        
        console.log(""); // Add space
        
        if (eventCount === successCount) {
          console.log(colors.green(`✓ All ${eventCount}/${successCount} file events successfully published to relays`));
          // Show event IDs for successful events
          messageCollector.printEventSuccessSummary();
        } else if (eventCount > 0) {
          console.log(colors.yellow(`${eventCount}/${successCount} events published to relays (${eventRate}%)`));
          console.log(colors.yellow(
            "This means some files may not be immediately visible in the nsite."
          ));
          console.log(colors.yellow(
            "Try running the upload command again with only --publish-relay-list to republish events."
          ));
          // Show event IDs for successful events
          messageCollector.printEventSuccessSummary();
        } else {
          console.log(colors.red(`✗ No events published to relays`));
          console.log(colors.yellow(
            "This means files may not be visible in the nsite."
          ));
          console.log(colors.yellow(
            "Try running the upload command again with only --publish-relay-list to republish events."
          ));
        }
        
        // Display server results
        console.log(formatSectionHeader("\nServer Results"));
        
        const serverResults = new Map<string, { success: number; total: number }>();
        
        for (const server of servers) {
          serverResults.set(server, { success: 0, total: 0 });
        }
        
        for (const result of results) {
          if (result.success) {
            for (const [server, status] of Object.entries(result.serverResults)) {
              const stats = serverResults.get(server);
              if (stats) {
                stats.total++;
                if (status.success) {
                  stats.success++;
                }
              }
            }
          }
        }
        
        const serverResultsObject: Record<string, { success: number; total: number }> = {};
        for (const [server, stats] of serverResults.entries()) {
          serverResultsObject[server] = stats;
        }
        
        console.log(formatServerResults(serverResultsObject));
      } else {
        console.log(colors.cyan(`\nUpload summary: ${successCount}/${results.length} files successfully processed (${successRate}%)`));
        
        if (displayManager.isVerbose()) {
          console.log(colors.cyan(`Server operations: ${successfulServerOperations}/${totalServerOperations} uploads successful (${serverSuccessRate}%)`));
        }
        
        if (eventCount < successCount) {
          console.log(colors.yellow(
            `NOSTR events: ${eventCount}/${successCount} events published to relays (${eventRate}%)`
          ));
          console.log(colors.yellow(
            "This means some files may not be immediately visible in the nsite."
          ));
          console.log(colors.yellow(
            "Try running the upload command again with only --publish-relay-list to republish events."
          ));
        } else if (eventCount > 0) {
          console.log(colors.green(
            `NOSTR events: All ${eventCount}/${successCount} file events successfully published to relays.`
          ));
        }
        
        console.log("\nServer Results:");
        
        const serverResults = new Map<string, { success: number; total: number }>();
        
        for (const server of servers) {
          serverResults.set(server, { success: 0, total: 0 });
        }
        
        for (const result of results) {
          if (result.success) {
            for (const [server, status] of Object.entries(result.serverResults)) {
              const stats = serverResults.get(server);
              if (stats) {
                stats.total++;
                if (status.success) {
                  stats.success++;
                }
              }
            }
          }
        }
        
        for (const [server, stats] of serverResults.entries()) {
          const serverSuccessRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
          if (stats.success === stats.total) {
            console.log(colors.green(`✓ ${server}: ${stats.success}/${stats.total} files (${serverSuccessRate}%)`));
          } else {
            console.log(colors.yellow(`! ${server}: ${stats.success}/${stats.total} files (${serverSuccessRate}%)`));
          }
        }
        
        // Display errors
        messageCollector.printRelayIssuesSummary();
        
        if (successCount < results.length) {
          const failedResults = results.filter(r => !r.success);
          
          const errorGroups = new Map<string, string[]>();
          for (const result of failedResults) {
            let errorMessage = result.error || "Unknown error";
            
            if (errorMessage.includes("<!DOCTYPE html>")) {
              const preMatch = errorMessage.match(/<pre>([^<]+)<\/pre>/);
              if (preMatch && preMatch[1]) {
                errorMessage = preMatch[1];
              } else {
                errorMessage = errorMessage.split('\n')[0];
                if (errorMessage.includes("<!DOCTYPE html>")) {
                  errorMessage = "Server returned HTML error page";
                }
              }
            }
            
            if (errorMessage.includes("https://")) {
              const serverMatch = errorMessage.match(/https:\/\/[^\/:\s]+/);
              if (serverMatch) {
                const server = serverMatch[0];
                errorMessage = `Failed to upload to ${server}`;
              }
            }
            
            if (errorMessage.includes("Failed to upload to any server")) {
              errorMessage = "Failed to upload to any server";
            }
            
            const paths = errorGroups.get(errorMessage) || [];
            paths.push(result.file.path);
            errorGroups.set(errorMessage, paths);
            
            // Add to message collector
            messageCollector.addFileError(result.file.path, errorMessage);
          }
          
          console.log(colors.yellow("\nError Summary:"));
          for (const [error, paths] of errorGroups.entries()) {
            console.log(colors.red(`${error} (${paths.length} files)`));
            if (displayManager.isVerbose()) {
              paths.forEach(path => {
                console.log(colors.gray(`  - ${path}`));
              });
            } else if (paths.length <= 3) {
              paths.forEach(path => {
                console.log(colors.gray(`  - ${path}`));
              });
            } else {
              console.log(colors.gray(`  - ${paths[0]}`));
              console.log(colors.gray(`  - ${paths[1]}`));
              console.log(colors.gray(`  - ...and ${paths.length - 2} more files`));
            }
          }
          
          console.log("");
          console.log(colors.yellow("Possible solutions:"));
          console.log("1. Check that the blossom servers are online and accepting uploads");
          console.log("2. Try with different servers using --servers option");
          console.log("3. Check your network connection and try again");
        }
        
        if (displayManager.isVerbose()) {
          console.log("\nDetailed results:");
          results.forEach(result => {
            if (result.success) {
              console.log(colors.green(`✓ ${result.file.path}`));
            } else {
              console.log(colors.red(`✗ ${result.file.path}: ${result.error}`));
            }
          });
        }
      }
    }
    
    if (options.purge && toDelete.length > 0) {
      console.log(colors.cyan(`\nDeleting ${toDelete.length} files from relays and servers...`));
      
      const deleteProgress = new ProgressRenderer();
      let completed = 0;
      let failed = 0;
      
      for (const file of toDelete) {
        try {
          if (!file.event || !file.sha256) {
            log.warn(`Cannot delete file ${file.path}: missing event or hash information`);
            failed++;
            continue;
          }
          
          deleteProgress.update({
            total: toDelete.length,
            completed,
            failed,
            inProgress: 1,
          });
          
          const deletionEventTemplate: NostrEventTemplate = {
            kind: 5,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["e", file.event.id]],
            content: "File deleted through nsyte",
          };
          
          const deletionEvent = await signer.signEvent(deletionEventTemplate);
          log.debug(`Created deletion event: ${deletionEvent.id}`);
          
          await publishToRelays(deletionEvent, relays, messageCollector);
          
          if (file.sha256) {
            for (const server of servers) {
              try {
                const deleteAuthTemplate: NostrEventTemplate = {
                  kind: 27235,
                  created_at: Math.floor(Date.now() / 1000),
                  tags: [
                    ["x", file.sha256],
                    ["operation", "delete"],
                    ["client", "nsyte"],
                  ],
                  content: "",
                };
                
                const deleteAuth = await signer.signEvent(deleteAuthTemplate);
                
                const serverUrl = server.endsWith("/") ? server : `${server}/`;
                const response = await fetch(`${serverUrl}${file.sha256}`, {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(deleteAuth),
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  log.error(`Failed to delete ${file.path} from server ${server}: ${response.status} - ${errorText}`);
                } else {
                  log.debug(`Deleted ${file.path} from server ${server}`);
                }
              } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                log.error(`Error deleting ${file.path} from server ${server}: ${errorMessage}`);
              }
            }
          }
          
          completed++;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error(`Failed to delete file ${file.path}: ${errorMessage}`);
          failed++;
        }
      }
      
      deleteProgress.complete(
        failed === 0,
        `Deleted ${completed}/${toDelete.length} files (${failed} failed)`
      );
    }
    
    if (options.publishRelayList || options.publishServerList || options.publishProfile) {
      console.log(colors.cyan("\nPublishing additional nostr events..."));
      
      if (options.publishRelayList) {
        try {
          console.log(colors.cyan("Publishing relay list (Kind 10002)..."));
          
          const relayListTemplate: NostrEventTemplate = {
            kind: 10002,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ...relays.map(url => ["r", url]),
              ["client", "nsyte"],
            ],
            content: "",
          };
          
          const relayListEvent = await signer.signEvent(relayListTemplate);
          
          const published = await publishToRelays(relayListEvent, relays, messageCollector);
          
          if (published) {
            log.debug(`Published relay list: ${relayListEvent.id}`);
            console.log(colors.green(`✓ Relay list published with ${relays.length} relays`));
          } else {
            console.log(colors.yellow(`! Relay list signed but may not have been published to all relays`));
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(colors.red(`Failed to publish relay list: ${errorMessage}`));
        }
      }
      
      if (options.publishServerList) {
        try {
          console.log(colors.cyan("Publishing blossom server list (Kind 10063)..."));
          
          const serverListTemplate: NostrEventTemplate = {
            kind: 10063,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ...servers.map(url => ["server", url]),
              ["client", "nsyte"],
            ],
            content: "",
          };
          
          const serverListEvent = await signer.signEvent(serverListTemplate);
          
          const publishedServerList = await publishToRelays(serverListEvent, relays, messageCollector);
          
          if (publishedServerList) {
            log.debug(`Published server list: ${serverListEvent.id}`);
            console.log(colors.green(`✓ Server list published with ${servers.length} servers`));
          } else {
            console.log(colors.yellow(`! Server list signed but may not have been published to all relays`));
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(colors.red(`Failed to publish server list: ${errorMessage}`));
        }
      }
      
      if (options.publishProfile && projectData.profile) {
        try {
          console.log(colors.cyan("Publishing profile (Kind 0)..."));
          
          const { name, about, picture, website, nip05, lud16, banner } = projectData.profile;
          
          const profileContent = JSON.stringify({
            name,
            display_name: name,
            about,
            picture,
            website,
            nip05,
            lud16,
            banner,
          });
          
          const profileTemplate: NostrEventTemplate = {
            kind: 0,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["client", "nsyte"]],
            content: profileContent,
          };
          
          const profileEvent = await signer.signEvent(profileTemplate);
          
          const publishedProfile = await publishToRelays(profileEvent, relays, messageCollector);
          
          if (publishedProfile) {
            log.debug(`Published profile: ${profileEvent.id}`);
            console.log(colors.green("✓ Profile published"));
          } else {
            console.log(colors.yellow("! Profile signed but may not have been published to all relays"));
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(colors.red(`Failed to publish profile: ${errorMessage}`));
        }
      }
    }
    
    let nsiteUrl = `https://${publisherPubkey}.nsite.lol`;
    try {
      const npub = nip19.npubEncode(publisherPubkey);
      nsiteUrl = `https://${npub}.nsite.lol`;
    } catch (error) {
      log.debug(`Failed to encode pubkey to npub: ${error}`);
    }
    
    console.log(colors.green(`\nThe website is now available on any nsite gateway, e.g.: ${nsiteUrl}`));
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(colors.red(`Failed to upload: ${errorMessage}`));
    Deno.exit(1);
  }
}

export async function publishToRelays(event: NostrEvent, relays: string[], messageCollector?: MessageCollector): Promise<boolean> {
  try {
    let successCount = 0;
    const totalRelays = relays.length;
    const eventJson = JSON.stringify(["EVENT", event]);
    const relayErrors = new Map<string, string>();
    
    await Promise.all(relays.map(async (relay) => {
      try {
        const socket = new WebSocket(relay);
        
        const connectPromise = new Promise<boolean>(resolve => {
          socket.onopen = () => {
            log.debug(`Connected to relay: ${relay}`);
            socket.send(eventJson);
            
            socket.onmessage = (msg) => {
              try {
                const data = JSON.parse(msg.data);
                
                // Handle successful publish
                if (Array.isArray(data) && data.length >= 3 && data[0] === "OK" && data[2] === true) {
                  log.debug(`Event published to relay: ${relay}`);
                  resolve(true);
                  socket.close();
                  return;
                }
                
                // Handle error responses like ["OK", <event_id>, false, <error_message>]
                if (Array.isArray(data) && data.length >= 4 && data[0] === "OK" && data[2] === false) {
                  const errorMessage = data[3] || "Unknown relay error";
                  
                  // Record the error but don't crash on rate limiting
                  if (errorMessage.includes("rate-limit") || errorMessage.includes("noting too much")) {
                    log.warn(`Relay ${relay} rate-limited this publish: ${errorMessage}`);
                    if (messageCollector) {
                      messageCollector.addRelayRejection(relay, `Rate limited: ${errorMessage}`);
                    }
                    relayErrors.set(relay, `Rate limited: ${errorMessage}`);
                  } else {
                    log.warn(`Relay ${relay} rejected event: ${errorMessage}`);
                    if (messageCollector) {
                      messageCollector.addRelayRejection(relay, errorMessage);
                    }
                    relayErrors.set(relay, errorMessage);
                  }
                  
                  resolve(false);
                  socket.close();
                }
              } catch (e) {
                log.debug(`Error parsing message from relay ${relay}: ${e}`);
              }
            };
            
            setTimeout(() => {
              relayErrors.set(relay, "Timeout waiting for response");
              if (messageCollector) {
                messageCollector.addConnectionError(relay, "Timeout waiting for response");
              }
              resolve(false);
              socket.close();
            }, 5000);
          };
          
          socket.onerror = (e) => {
            log.debug(`WebSocket error with relay ${relay}: ${e}`);
            relayErrors.set(relay, `WebSocket error: ${e}`);
            if (messageCollector) {
              messageCollector.addConnectionError(relay, `WebSocket error: ${e}`);
            }
            resolve(false);
          };
          
          socket.onclose = () => {
            resolve(false);
          };
        });
        
        const success = await connectPromise;
        if (success) {
          successCount++;
        }
      } catch (e) {
        log.debug(`Failed to connect to relay ${relay}: ${e}`);
        relayErrors.set(relay, `Connection failed: ${e}`);
        if (messageCollector) {
          messageCollector.addConnectionError(relay, `Connection failed: ${e}`);
        }
      }
    }));
    
    const success = successCount > 0;
    
    if (success) {
      log.debug(`Published event to ${successCount}/${totalRelays} relays`);
      
      if (successCount < totalRelays) {
        log.debug("Some relays failed to accept the event:");
        for (const [relay, error] of relayErrors.entries()) {
          log.debug(`  - ${relay}: ${error}`);
        }
      }
    } else {
      log.warn("Failed to publish event to any relay");
      log.debug("Relay errors:");
      for (const [relay, error] of relayErrors.entries()) {
        log.debug(`  - ${relay}: ${error}`);
      }
    }
    
    return success;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to publish event: ${errorMessage}`);
    return false;
  }
} 
