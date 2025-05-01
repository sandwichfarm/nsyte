import { Command } from "cliffy/command/mod.ts";
import { createLogger } from "../lib/logger.ts";
import { BunkerSigner } from "../lib/nip46.ts";
import { readProjectFile } from "../lib/config.ts";

const log = createLogger("test-bunker");

export const testBunkerCommand = new Command()
  .name("test-bunker")
  .description("Test connection to an NSEC bunker")
  .option("--url <url:string>", "Bunker URL to test")
  .option("--use-project", "Use the bunker from the project config")
  .option("--full", "Perform a full test including signing multiple event kinds")
  .option("--debug", "Enable debug logging")
  .action(async ({ url, useProject, full, debug }) => {
    try {
      // If debug is enabled, set the log level
      if (debug) {
        Deno.env.set("LOG_LEVEL", "debug");
      }
      
      // If using project config, get the bunker URL from there
      let bunkerUrl = url;
      if (useProject && !bunkerUrl) {
        try {
          const config = readProjectFile();
          if (!config || !config.bunkerUrl) {
            throw new Error("No bunker URL in project config");
          }
          bunkerUrl = config.bunkerUrl;
          log.info(`Using bunker URL from project config: ${bunkerUrl}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error(`Failed to get bunker URL from project config: ${errorMessage}`);
          console.log("\nUsage examples:");
          console.log("  nsyte test-bunker --url bunker://npub...?relay=wss://...");
          console.log("  nsyte test-bunker --use-project");
          console.log("\nFor more information, use: nsyte test-bunker --help");
          Deno.exit(1);
        }
      }
      
      if (!bunkerUrl) {
        log.error("Bunker URL is required. Use --url or --use-project");
        console.log("\nUsage examples:");
        console.log("  nsyte test-bunker --url bunker://npub...?relay=wss://...");
        console.log("  nsyte test-bunker --use-project");
        console.log("\nFor more information, use: nsyte test-bunker --help");
        Deno.exit(1);
      }
      
      // Validate the bunker URL format before attempting to connect
      if (!bunkerUrl.startsWith("bunker://")) {
        log.error("Invalid bunker URL format. It must start with 'bunker://'");
        console.log("\nExample format: bunker://npub1...?relay=wss://relay.example.com");
        console.log("\nFor more information, use: nsyte test-bunker --help");
        Deno.exit(1);
      }
      
      log.info(`Testing bunker connection to ${bunkerUrl}`);
      const bunkerSigner = await BunkerSigner.connect(bunkerUrl);
      
      log.info("Connected successfully!");
      log.info(`User pubkey: ${bunkerSigner.getPublicKey()}`);
      
      // Try to describe bunker capabilities
      log.info("Checking bunker capabilities...");
      const methods = await bunkerSigner.describeBunker();
      
      if (full) {
        // Comprehensive test with multiple event kinds
        await testEventSigning(bunkerSigner, 1, "text/note event");
        await testEventSigning(bunkerSigner, 30023, "regular file listing event");
        await testEventSigning(bunkerSigner, 34128, "nsyte/nsite file upload event");
      } else {
        // Simple test event for basic testing
        await testEventSigning(bunkerSigner, 1, "basic test event");
      }
      
      log.info("Bunker test completed successfully!");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to test bunker: ${errorMessage}`);
      Deno.exit(1);
    }
  });

async function testEventSigning(bunkerSigner: BunkerSigner, kind: number, description: string): Promise<void> {
  log.info(`Testing event signing for kind ${kind} (${description})...`);
  
  // Create a test event of the specified kind
  const testEvent = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: `This is a test ${description} from nsyte`,
  };
  
  try {
    const signedEvent = await bunkerSigner.signEvent(testEvent);
    log.info(`✓ Successfully signed ${description} with id: ${signedEvent.id.slice(0, 8)}...`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`✗ Failed to sign ${description}: ${errorMessage}`);
    throw error;
  }
} 