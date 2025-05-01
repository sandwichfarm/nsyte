import { Command } from "cliffy/command/mod.ts";
import { colors } from "cliffy/ansi/colors.ts";
import { createLogger } from "../lib/logger.ts";
import { listRemoteFiles, RELAY_DISCOVERY_RELAYS } from "../lib/nostr.ts";
import { PrivateKeySigner } from "../lib/signer.ts";
import { createNip46ClientFromUrl } from "../lib/nostr.ts";
import { setupProject, readProjectFile } from "../lib/config.ts";

const log = createLogger("ls");

/**
 * Register the ls command
 */
export function registerLsCommand(program: Command): void {
  program
    .command("ls")
    .description("List files available on the NOSTR network")
    .option("-r, --relays <relays:string>", "The NOSTR relays to use (comma separated).")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("-p, --pubkey <npub:string>", "The public key to list files for (if not using private key).")
    .action(async (options) => {
      try {
        // For listing files, we only need the pubkey, so we can operate differently
        // from upload command
        
        let pubkey: string | undefined;
        
        // If a pubkey is directly specified, use that
        if (options.pubkey) {
          pubkey = options.pubkey;
        } 
        // Otherwise get it from the private key or bunker
        else {
          // Check for command line options first
          if (options.privatekey) {
            const signer = new PrivateKeySigner(options.privatekey);
            pubkey = signer.getPublicKey();
          } else if (options.bunker) {
            const { userPubkey } = await createNip46ClientFromUrl(options.bunker);
            pubkey = userPubkey;
          } else {
            // Try to get from project config (only bunker is stored in config)
            const projectContext = await setupProject();
            const projectData = projectContext.projectData;
            
            if (projectContext.privateKey) {
              const signer = new PrivateKeySigner(projectContext.privateKey);
              pubkey = signer.getPublicKey();
            } else if (projectData.bunkerUrl) {
              const { userPubkey } = await createNip46ClientFromUrl(projectData.bunkerUrl);
              pubkey = userPubkey;
            }
          }
          
          if (!pubkey) {
            console.error(colors.red("No public key specified and no key source available. Use --pubkey, --privatekey, or --bunker."));
            Deno.exit(1);
          }
        }
        
        // Determine relays to use
        let relays: string[] = [];
        
        if (options.relays) {
          relays = options.relays.split(",");
        } else {
          // Try to get from project config
          const projectData = readProjectFile();
          if (projectData && projectData.relays && projectData.relays.length > 0) {
            relays = projectData.relays;
          } else {
            // Use default relays
            relays = RELAY_DISCOVERY_RELAYS;
          }
        }
        
        console.log(colors.cyan(`Listing files for ${pubkey} using relays: ${relays.join(", ")}`));
        
        // Get the file list
        const files = await listRemoteFiles(relays, pubkey);
        
        if (files.length === 0) {
          console.log(colors.yellow("No files found for this user."));
        } else {
          console.log(colors.green(`Found ${files.length} files:`));
          
          // Display the files sorted by path
          files.sort((a, b) => a.path.localeCompare(b.path));
          
          files.forEach(file => {
            console.log(`${file.path}`);
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(colors.red(`Error listing files: ${errorMessage}`));
        Deno.exit(1);
      }
    });
} 