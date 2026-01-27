import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import { join } from "@std/path";
import { configDir, setupProject } from "../lib/config.ts";
import { displayColorfulHeader } from "../ui/output-helpers.ts";

/**
 * Register the init command
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new nsyte project")
    .action(async () => {
      console.log(displayColorfulHeader());
      try {
        const { config, privateKey } = await setupProject();

        if (privateKey || config.bunkerPubkey) {
          const keyType = privateKey ? "private key" : "bunker connection";
          const relayCount = config.relays.length;
          const serverCount = config.servers.length;
          const siteName = config.id || "root";

          console.log(
            colors.green(`\nProject initialized successfully with:`),
          );
          console.log(
            colors.green(`- Site: ${siteName}`),
          );
          console.log(
            colors.green(`- Authentication: ${keyType}`),
          );
          console.log(
            colors.green(`- Relays: ${relayCount}`),
          );
          console.log(
            colors.green(`- Blossom servers: ${serverCount}`),
          );
          console.log(
            colors.green(`\nConfiguration saved to .nsite/config.json`),
          );
        }

        Deno.exit(0);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if this is a validation error
        if (
          error instanceof Error && (
            error.message === "Invalid configuration format" ||
            error.message === "Invalid JSON in configuration file"
          )
        ) {
          // Ask user if they want to reinitialize
          const shouldReinitialize = await Confirm.prompt({
            message:
              "Would you like to reinitialize the configuration? This will overwrite the existing invalid config.",
            default: false,
          });

          if (shouldReinitialize) {
            // Delete the invalid config file
            const configPath = join(Deno.cwd(), configDir, "config.json");
            try {
              await Deno.remove(configPath);
              console.log(colors.yellow("\nRemoved invalid configuration file."));
            } catch (removeError) {
              // File might not exist or already removed, continue anyway
              if (!(removeError instanceof Deno.errors.NotFound)) {
                console.error(
                  colors.red(
                    `\nFailed to remove config file: ${
                      removeError instanceof Error ? removeError.message : String(removeError)
                    }`,
                  ),
                );
                Deno.exit(1);
              }
            }

            // Try setup again
            try {
              const { config, privateKey } = await setupProject();

              if (privateKey || config.bunkerPubkey) {
                const keyType = privateKey ? "private key" : "bunker connection";
                const relayCount = config.relays.length;
                const serverCount = config.servers.length;
                const siteName = config.id || "root";

                console.log(
                  colors.green(`\nProject reinitialized successfully with:`),
                );
                console.log(
                  colors.green(`- Site: ${siteName}`),
                );
                console.log(
                  colors.green(`- Authentication: ${keyType}`),
                );
                console.log(
                  colors.green(`- Relays: ${relayCount}`),
                );
                console.log(
                  colors.green(`- Blossom servers: ${serverCount}`),
                );
                console.log(
                  colors.green(`\nConfiguration saved to .nsite/config.json`),
                );
              }

              Deno.exit(0);
            } catch (retryError) {
              const retryErrorMessage = retryError instanceof Error
                ? retryError.message
                : String(retryError);
              console.error(colors.red(`\nError reinitializing project: ${retryErrorMessage}`));
              Deno.exit(1);
            }
          } else {
            console.log(
              colors.yellow(
                "\nInitialization cancelled. Please fix the configuration manually or run 'nsyte init' again.",
              ),
            );
            Deno.exit(1);
          }
        } else {
          // For other errors, just display and exit
          console.error(colors.red(`\nError initializing project: ${errorMessage}`));
          Deno.exit(1);
        }
      }
    });
}
