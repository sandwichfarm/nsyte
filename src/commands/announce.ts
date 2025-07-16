import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { createSigner } from "../lib/auth/signer-factory.ts";
import { readProjectFile, ProjectConfig } from "../lib/config.ts";
import {
  publishProfile,
  publishRelayList,
  publishServerList,
  publishAppHandler,
} from "../lib/metadata/publisher.ts";
import { StatusDisplay } from "../ui/status.ts";
import { createLogger } from "../lib/logger.ts";
import { getErrorMessage } from "../lib/error-utils.ts";

const logger = createLogger("announce");

export function registerAnnounceCommand(program: Command): void {
  program
    .command("announce")
    .alias("annc")
    .description("Publish profile, relay list, server list, and app handlers to Nostr")
    .option("--publish-profile", "Publish your Nostr profile (Kind 0)")
    .option("--publish-relay-list", "Publish your relay list (Kind 10002)")
    .option("--publish-server-list", "Publish your Blossom server list (Kind 10063)")
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
        const shouldPublishProfile = publishAll || options.publishProfile === true;
        const shouldPublishRelayList = publishAll || options.publishRelayList === true;
        const shouldPublishServerList = publishAll || options.publishServerList === true;
        const shouldPublishAppHandler = publishAll || options.publishAppHandler === true;

        // Check if anything needs to be published
        if (!shouldPublishProfile && !shouldPublishRelayList && 
            !shouldPublishServerList && !shouldPublishAppHandler) {
          console.error(colors.red("No publish options specified."));
          console.error(colors.yellow("Use --publish-profile, --publish-relay-list, --publish-server-list, --publish-app-handler, or --all"));
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
          profile: false,
          relayList: false,
          serverList: false,
          appHandler: false,
        };

        // Publish profile
        if (shouldPublishProfile) {
          status.update("Publishing profile...");
          try {
            logger.debug("Starting profile publish...");
            await publishProfile(config, signer, config.relays || [], status);
            results.profile = true;
            status.addMessage(colors.green("✓ Profile published"));
            logger.debug("Profile publish completed");
          } catch (error) {
            const errorMsg = getErrorMessage(error);
            status.addMessage(colors.red(`✗ Failed to publish profile: ${errorMsg}`));
            logger.error(`Failed to publish profile: ${errorMsg}`);
          }
        }

        // Publish relay list
        if (shouldPublishRelayList) {
          status.update("Publishing relay list...");
          try {
            await publishRelayList(config, signer, config.relays || [], status);
            results.relayList = true;
            status.addMessage(colors.green("✓ Relay list published"));
          } catch (error) {
            const errorMsg = getErrorMessage(error);
            status.addMessage(colors.red(`✗ Failed to publish relay list: ${errorMsg}`));
            logger.error(`Failed to publish relay list: ${errorMsg}`);
          }
        }

        // Publish server list
        if (shouldPublishServerList) {
          status.update("Publishing server list...");
          try {
            await publishServerList(config, signer, config.relays || [], status);
            results.serverList = true;
            status.addMessage(colors.green("✓ Server list published"));
          } catch (error) {
            const errorMsg = getErrorMessage(error);
            status.addMessage(colors.red(`✗ Failed to publish server list: ${errorMsg}`));
            logger.error(`Failed to publish server list: ${errorMsg}`);
          }
        }

        // Publish app handler
        if (shouldPublishAppHandler) {
          status.update("Publishing app handler...");
          try {
            await publishAppHandler(config, signer, config.relays || [], status);
            results.appHandler = true;
            status.addMessage(colors.green("✓ App handler published"));
          } catch (error) {
            const errorMsg = getErrorMessage(error);
            status.addMessage(colors.red(`✗ Failed to publish app handler: ${errorMsg}`));
            logger.error(`Failed to publish app handler: ${errorMsg}`);
          }
        }

        // Clear the status display before showing summary
        status.complete();

        // Summary
        const successCount = Object.values(results).filter(v => v).length;
        const totalCount = Object.values(results).filter((_, i) => 
          (publishAll || [
            options.publishProfile,
            options.publishRelayList,
            options.publishServerList,
            options.publishAppHandler
          ][i])
        ).length;

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