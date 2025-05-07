import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { readProjectFile, setupProject } from "../lib/config.ts";
import { createLogger } from "../lib/logger.ts";
import { getBunkerInfo } from "../lib/nip46.ts";
import { createNip46ClientFromUrl, RELAY_DISCOVERY_RELAYS } from "../lib/nostr.ts";
import { PrivateKeySigner } from "../lib/signer.ts";

const log = createLogger("download");

/**
 * Register the download command
 */
export function registerDownloadCommand(program: Command): void {
  program
    .command("download")
    .description("Download files from the nostr network")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("-p, --pubkey <npub:string>", "The public key to download files from (if not using private key).")
    .option("-o, --output <dir:string>", "The output directory to save files to.")
    .action(async (options) => {
      try {

        let pubkey: string | undefined;

        if (options.pubkey) {
          pubkey = options.pubkey;
        }
        else {
          if (options.privatekey) {
            const signer = new PrivateKeySigner(options.privatekey);
            pubkey = signer.getPublicKey();
          } else if (options.bunker) {
            const { userPubkey } = await createNip46ClientFromUrl(options.bunker);
            pubkey = userPubkey;
          } else {
            const projectContext = await setupProject();
            const config = projectContext.config;

            if (projectContext.privateKey) {
              const signer = new PrivateKeySigner(projectContext.privateKey);
              pubkey = signer.getPublicKey();
            } else if (config.bunkerPubkey) {
              const bunkerInfo = getBunkerInfo(config.bunkerPubkey);
              let bunkerUrl: string;

              if (bunkerInfo && bunkerInfo.bunkerUrl) {
                bunkerUrl = bunkerInfo.bunkerUrl;
                log.debug(`Using saved bunker connection info for ${config.bunkerPubkey.slice(0, 8)}...`);
              } else {
                log.warn("No saved bunker connection info found, using project relays");
                const relayParams = config.relays.map(r => `relay=${encodeURIComponent(r)}`).join("&");
                bunkerUrl = `bunker://${config.bunkerPubkey}?${relayParams}`;
              }

              const { userPubkey } = await createNip46ClientFromUrl(bunkerUrl);
              pubkey = userPubkey;
            }
          }

          if (!pubkey) {
            console.error(colors.red("No public key specified and no key source available. Use --pubkey, --privatekey, or --bunker."));
            Deno.exit(1);
          }
        }

        if (!options.output) {
          console.error(colors.red("No output directory specified. Use --output <dir>."));
          Deno.exit(1);
        }

        let relays: string[] = [];

        if (options.relays) {
          relays = options.relays.split(",");
        } else {
          const config = readProjectFile();
          if (config && config.relays && config.relays.length > 0) {
            relays = config.relays;
          } else {
            relays = RELAY_DISCOVERY_RELAYS;
          }
        }

        console.log(colors.yellow("Not yet implemented: download command"));
        console.log(colors.cyan(`Would download files for ${pubkey} using relays: ${relays.join(", ")}`));
        console.log(colors.cyan(`Would save to directory: ${options.output}`));

        // Ensure command exits after completion
        Deno.exit(0);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(colors.red(`Error downloading files: ${errorMessage}`));
        Deno.exit(1);
      }
    });
}
