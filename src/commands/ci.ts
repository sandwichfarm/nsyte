/**
 * CI/CD command implementation
 *
 * This command streamlines the process of creating an nbunksec for CI/CD use.
 * It is designed for automation and avoids any project-specific interactions.
 *
 * The command:
 * 1. Only allows new bunker connections (via QR or URL)
 * 2. Never interacts with project configuration
 * 3. Uses --no-persist to keep nbunksec in memory only
 * 4. Has only one interaction point (the initial connection)
 */

import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { createLogger } from "../lib/logger.ts";
import { connectBunker } from "./bunker.ts";

const log = createLogger("ci");

/**
 * Create an nbunksec string for CI/CD use
 * This command is designed for automation and avoids project interactions
 */
export async function createNbunksecForCI(bunkerUrl?: string): Promise<void> {
  try {
    console.log(colors.cyan("\nConnecting to bunker for CI/CD use..."));
    console.log(colors.yellow("This will generate an nbunksec that is never stored to disk.\n"));

    // Use the --no-persist flag to keep nbunksec in memory only
    await connectBunker(bunkerUrl, true, true); // skipProjectInteraction=true, noPersist=true

    // The connectBunker function with noPersist=true will display the nbunksec
    // and additional usage instructions
    console.log(colors.cyan("\nUsage in CI/CD:"));
    console.log("  nsyte upload ./dist --nbunksec ${NBUNK_SECRET}");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error creating nbunksec: ${errorMessage}`);
    console.error(colors.red(`Error: ${errorMessage}`));

    if (errorMessage.includes("URL format") || errorMessage.includes("invalid URL")) {
      console.log(
        colors.yellow("\nRemember to properly quote URLs with special characters in the shell:"),
      );
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
    .description("Create an nbunksec string for CI/CD use (ephemeral, never stored to disk)")
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
