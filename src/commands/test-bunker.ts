import { Command } from "cliffy/command/mod.ts";
import { createLogger } from "../lib/logger.ts";
import { BunkerSigner } from "../lib/nip46.ts";

const log = createLogger("test-bunker");

export const testBunkerCommand = new Command()
  .name("test-bunker")
  .description("Test connection to an NSEC bunker")
  .option("--url <url:string>", "Bunker URL to test")
  .action(async ({ url }) => {
    try {
      if (!url) {
        throw new Error("Bunker URL is required");
      }
      
      log.info(`Testing bunker connection to ${url}`);
      const bunkerSigner = await BunkerSigner.connect(url);
      
      log.info("Connected successfully!");
      log.info(`User pubkey: ${bunkerSigner.getPublicKey()}`);
      
      // Try to describe bunker capabilities
      log.info("Checking bunker capabilities...");
      await bunkerSigner.describeBunker();
      
      // Simple test event
      const testEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: "This is a test event from nsyte",
      };
      
      // Try to sign the event
      log.info("Testing event signing...");
      try {
        const signedEvent = await bunkerSigner.signEvent(testEvent);
        log.info(`Event signed successfully with id: ${signedEvent.id.slice(0, 8)}...`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Failed to sign test event: ${errorMessage}`);
        log.info("This may be expected if your bunker permissions don't allow signing kind 1 events");
      }
      
      log.info("Bunker test completed");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to test bunker: ${errorMessage}`);
      Deno.exit(1);
    }
  }); 