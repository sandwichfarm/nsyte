import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { createSigner } from "../lib/auth/signer-factory.ts";
import { readProjectFile } from "../lib/config.ts";
import { RELAY_DISCOVERY_RELAYS } from "../lib/constants.ts";
import { getErrorMessage } from "../lib/error-utils.ts";
import { createLogger } from "../lib/logger.ts";
import { publishAppHandler } from "../lib/metadata/publisher.ts";
import { fetchRelayListEvent } from "../lib/nostr.ts";
import { extractRelaysFromEvent } from "../lib/utils.ts";
import { StatusDisplay } from "../ui/status.ts";

const logger = createLogger("announce");

export function registerAnnounceCommand(program: Command): void {
  program
    .command("announce")
    .alias("annc")
    .description("Publish app handlers to Nostr")
    .option("--publish-app-handler", "Publish app handler information (Kind 31990)")
    .option("--all", "Publish all available data")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("--nbunksec <nbunksec:string>", "The NIP-46 bunker encoded as nbunksec.")
    .action(async (options) => {
      const status = new StatusDisplay();

      try {
        // Read project config
        const config = readProjectFile();
        if (!config) {
          console.error(colors.red("No nsyte project found in this directory."));
          console.error(colors.yellow("Run 'nsyte init' to create a new project."));
          Deno.exit(1);
        }

        // Determine what to publish
        const publishAll = options.all === true;
        const shouldPublishAppHandler = publishAll || options.publishAppHandler === true;

        // Check if anything needs to be published
        if (!shouldPublishAppHandler) {
          console.error(colors.red("No publish options specified."));
          console.error(
            colors.yellow(
              "Use --publish-app-handler or --all",
            ),
          );
          Deno.exit(1);
        }

        // Initialize signer
        status.update("Initializing signer...");
        logger.debug("Creating signer...");
        const signerResult = await createSigner({
          privateKey: options.privatekey,
          nbunksec: options.nbunksec,
          bunkerUrl: options.bunker,
          bunkerPubkey: config.bunkerPubkey,
        });

        logger.debug("Signer creation completed");

        if ("error" in signerResult) {
          console.error(colors.red(`Failed to create signer: ${signerResult.error}`));
          Deno.exit(1);
        }

        const { signer, pubkey } = signerResult;
        logger.debug(`Signer initialized with pubkey: ${pubkey}`);

        // Clear the signer initialization message
        status.update("Preparing to publish metadata...");

        const results = {
          appHandler: false,
        };

        // Discover user's existing relay list for broader publishing
        let discoveredRelayList: string[] = [];
        try {
          status.update("Discovering user relays...");
          const relayListEvent = await fetchRelayListEvent(RELAY_DISCOVERY_RELAYS, pubkey);
          if (relayListEvent) {
            discoveredRelayList = extractRelaysFromEvent(relayListEvent);
            logger.debug(`Discovered ${discoveredRelayList.length} relays from user's relay list`);
          }
        } catch (e) {
          logger.debug(`Failed to fetch relay list for discovery: ${getErrorMessage(e)}`);
        }

        // Combine all relays for publishing: config relays + discovery relays + user's relay list
        const configRelays = config.relays || [];
        const publishToRelays = Array.from(
          new Set([...configRelays, ...RELAY_DISCOVERY_RELAYS, ...discoveredRelayList]),
        );

        // Publish app handler
        if (shouldPublishAppHandler) {
          status.update("Publishing app handler...");
          try {
            await publishAppHandler(config, signer, publishToRelays, status);
            results.appHandler = true;
            status.addMessage(
              colors.green(`✓ App handler published to ${publishToRelays.length} relays`),
            );
          } catch (error) {
            const errorMsg = getErrorMessage(error);
            status.addMessage(colors.red(`✗ Failed to publish app handler: ${errorMsg}`));
            logger.error(`Failed to publish app handler: ${errorMsg}`);
          }
        }

        // Clear the status display before showing summary
        status.complete();

        // Summary
        const successCount = Object.values(results).filter((v) => v).length;
        const totalCount = Object.values(results).filter((_, i) => (publishAll || [
          options.publishAppHandler,
        ][i])).length;

        console.log("\n" + colors.bold("Announcement Summary:"));
        console.log(colors.green(`Successfully published ${successCount}/${totalCount} items`));
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        status.error(`Failed to announce: ${errorMsg}`);
        logger.error(`Announce command failed: ${errorMsg}`);
        Deno.exit(1);
      }
    });
}
