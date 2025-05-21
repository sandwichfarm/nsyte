import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { setupProject } from "../lib/config.ts";
import { createLogger } from "../lib/logger.ts";

const log = createLogger("init");

/**
 * Register the init command
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new nsyte project")
    .action(async () => {
      try {
        const { config, privateKey } = await setupProject();
        
        if (privateKey || config.bunkerPubkey) {
          const keyType = privateKey ? "private key" : "bunker connection";
          const relayCount = config.relays.length;
          const serverCount = config.servers.length;
          
          console.log(
            colors.green(`\nProject initialized successfully with:`)
          );
          console.log(
            colors.green(`- Authentication: ${keyType}`)
          );
          console.log(
            colors.green(`- Relays: ${relayCount}`)
          );
          console.log(
            colors.green(`- Blossom servers: ${serverCount}`)
          );
          console.log(
            colors.green(`\nConfiguration saved to .nsite/config.json`)
          );
        }
        
        Deno.exit(0);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(colors.red(`\nError initializing project: ${errorMessage}`));
        Deno.exit(1);
      }
    });
} 