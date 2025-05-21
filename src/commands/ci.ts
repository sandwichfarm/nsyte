/**
 * CI/CD command implementation
 * 
 * This command streamlines the process of creating an nbunksec for CI/CD use.
 * It is designed for automation and avoids any project-specific interactions.
 * 
 * The command:
 * 1. Only allows new bunker connections (via QR or URL)
 * 2. Never interacts with project configuration
 * 3. Always cleans up after generating the nbunksec
 * 4. Has only one interaction point (the initial connection)
 */

import { colors } from "@cliffy/ansi/colors";
import { Command } from "@cliffy/command";
import { createLogger } from "../lib/logger.ts";
import { connectBunker } from "./bunker.ts";
import { parseBunkerUrl } from "../lib/nip46.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";

const log = createLogger("ci");

/**
 * Create an nbunksec string for CI/CD use
 * This command is designed for automation and avoids project interactions
 */
export async function createNbunksecForCI(bunkerUrl?: string): Promise<void> {
  let bunkerPubkey: string | null = null;
  let nbunksec: string | null = null;
  const secretsManager = SecretsManager.getInstance();

  try {
    // Step 1: Connect to bunker (only new connections allowed)
    console.log(colors.cyan("\nStep 1: Connecting to bunker..."));
    
    // Override the default connectBunker behavior to skip project interaction
    const originalConnectBunker = connectBunker;
    const connectBunkerForCI = async (url?: string) => {
      // Call the original function but skip the project interaction
      await originalConnectBunker(url, true); // Pass true to skip project interaction
      // Get the bunker pubkey from the URL or last connected bunker
      if (url) {
        const parsedPointer = parseBunkerUrl(url);
        return parsedPointer.pubkey;
      } else {
        const pubkeys = secretsManager.getAllPubkeys();
        return pubkeys.length > 0 ? pubkeys[pubkeys.length - 1] : null;
      }
    };

    bunkerPubkey = await connectBunkerForCI(bunkerUrl);

    if (!bunkerPubkey) {
      console.log(colors.red("Failed to determine bunker pubkey."));
      Deno.exit(1);
      return;
    }

    // Step 2: Get the nbunksec
    console.log(colors.cyan("\nStep 2: Getting nbunksec..."));
    nbunksec = secretsManager.getNbunk(bunkerPubkey);
    
    if (!nbunksec) {
      console.log(colors.red("Failed to get nbunksec."));
      Deno.exit(1);
      return;
    }

    // Step 3: Clean up (always remove without confirmation)
    console.log(colors.cyan("\nStep 3: Cleaning up..."));
    secretsManager.deleteNbunk(bunkerPubkey);
    console.log(colors.green(`Bunker ${bunkerPubkey.slice(0, 8)}... removed from system storage.`));

    // Step 4: Output the nbunksec
    console.log(colors.cyan("\nStep 4: Your nbunksec for CI/CD:"));
    console.log(colors.yellow("\nIMPORTANT: Store this securely. It contains sensitive key material."));
    console.log(colors.cyan("\nAdd this to your CI/CD secrets:"));
    console.log(nbunksec);
    console.log(colors.cyan("\nUsage in CI/CD:"));
    console.log("  nsyte upload ./dist --nbunksec ${NBUNK_SECRET}");

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error creating nbunksec: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));

    if (errorMessage.includes("URL format") || errorMessage.includes("invalid URL")) {
      console.log(colors.yellow("\nRemember to properly quote URLs with special characters in the shell:"));
      console.log(colors.cyan("  nsyte ci 'bunker://pubkey?relay=wss://relay.example&secret=xxx'"));
    }
    Deno.exit(1);
  }
}

/**
 * Register the CI command with the CLI
 */
export function registerCICommand(program: Command): void {
  program
    .command("ci")
    .description("Create an nbunksec string for CI/CD use (creates a new bunker connection)")
    .arguments("[url:string]")
    .action(async (_: unknown, url?: string) => {
      await createNbunksecForCI(url);
    });
}

if (import.meta.main) {
  if (Deno.args.length > 0) {
    await createNbunksecForCI(Deno.args[0]);
  } else {
    await createNbunksecForCI();
  }
}
