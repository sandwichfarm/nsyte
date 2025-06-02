import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { resolvePubkey, resolveRelays, type ResolverOptions } from "../lib/resolver-utils.ts";

const log = createLogger("download");

interface DownloadOptions extends ResolverOptions {
  output?: string;
}

/**
 * Register the download command
 */
export function registerDownloadCommand(program: Command): void {
  const command = program
    .command("download")
    .description("Download files from the nostr network")
    .option("-o, --output <dir:string>", "The output directory to save files to.")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("-p, --pubkey <npub:string>", "The public key to download files from (if not using private key).")
    .option("--nbunksec <nbunksec:string>", "The nbunksec string to use for authentication (for CI/CD).")
    .action(async (options: DownloadOptions) => {
    try {
      // Resolve public key using shared resolver
      const pubkey = await resolvePubkey(options, null, false);
      
      // Validate output directory
      if (!options.output) {
        console.error(colors.red("No output directory specified. Use --output <dir>."));
        Deno.exit(1);
      }
      
      // Resolve relays using shared resolver
      const relays = resolveRelays(options, null, true);
      
      // Log what would be done (not yet implemented)
      console.log(colors.yellow("Not yet implemented: download command"));
      console.log(colors.cyan(`Would download files for ${pubkey} using relays: ${relays.join(", ")}`));
      console.log(colors.cyan(`Would save to directory: ${options.output}`));
      
      // Ensure command exits after completion
      Deno.exit(0);
    } catch (error: unknown) {
      handleError("Error downloading files", error, {
        exit: true,
        showConsole: true,
        logger: log
      });
    }
  });
}
