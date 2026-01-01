import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { existsSync } from "@std/fs/exists";
import { join } from "@std/path";
import { formatValidationErrors, validateConfigWithFeedback } from "../lib/config-validator.ts";
import { createLogger } from "../lib/logger.ts";

const log = createLogger("validate");

export interface ValidateCommandOptions {
  file?: string;
  schema?: boolean;
}

/**
 * Validate command - checks configuration file against schema
 */
export const validateCommand = (program: Command) => {
  program
    .command("validate")
    .alias("val")
    .description("Validate nsyte configuration file")
    .option("-f, --file <path>", "Path to config file (default: .nsite/config.json)")
    .option("-s, --schema", "Show the JSON schema location", { default: false })
    .action(async (options: ValidateCommandOptions) => {
      if (options.schema) {
        console.log(colors.cyan("JSON Schema Location:"));
        console.log("  Local: src/schemas/config.schema.json");
        console.log("  URL: https://nsyte.run/schemas/config.schema.json");
        console.log(
          "\nYou can use this schema with VS Code or other editors for auto-completion and validation.",
        );
        return;
      }

      const configPath = options.file || join(Deno.cwd(), ".nsite", "config.json");

      // Check if file exists
      if (!existsSync(configPath)) {
        console.error(colors.red(`Configuration file not found: ${configPath}`));
        console.log(colors.yellow("\nTip: Run 'nsyte init' to create a configuration file."));
        Deno.exit(1);
      }

      console.log(colors.cyan(`Validating configuration: ${configPath}\n`));

      try {
        // Read the configuration file
        const fileContent = await Deno.readTextFile(configPath);
        let config: unknown;

        try {
          config = JSON.parse(fileContent);
        } catch (e) {
          console.error(colors.red("Failed to parse JSON:"));
          console.error(`  ${e instanceof Error ? e.message : String(e)}`);
          Deno.exit(1);
        }

        // Validate against schema
        const validation = validateConfigWithFeedback(config);

        if (validation.valid) {
          console.log(colors.green("✓ Configuration is valid!\n"));

          // Display summary
          const cfg = config as any;
          console.log(colors.cyan("Configuration Summary:"));
          console.log(`  Relays: ${cfg.relays?.length || 0}`);
          console.log(`  Servers: ${cfg.servers?.length || 0}`);

          if (cfg.title) {
            console.log(`  Title: ${cfg.title}`);
          }
          if (cfg.description) {
            console.log(`  Description: ${cfg.description}`);
          }

          if (cfg.publishAppHandler && cfg.appHandler) {
            console.log(`  App Handler: Enabled (${cfg.appHandler.kinds?.length || 0} kinds)`);
          }

          // Show warnings if any
          if (validation.warnings.length > 0) {
            console.log(colors.yellow("\nWarnings:"));
            validation.warnings.forEach((w) => console.log(`  - ${w}`));
          }

          // Provide helpful tips
          console.log(colors.dim("\nTips:"));
          if (!cfg.appHandler) {
            console.log(colors.dim("  - Consider adding 'appHandler' for better discoverability"));
          }
        } else {
          console.error(colors.red("✗ Configuration is invalid!\n"));
          console.error(colors.red("Errors:"));
          console.error(formatValidationErrors(validation.errors));

          if (validation.suggestions.length > 0) {
            console.log(colors.yellow("\nSuggestions:"));
            validation.suggestions.forEach((s) => console.log(`  - ${s}`));
          }

          console.log(colors.dim("\nFor schema reference, run: nsyte validate --schema"));

          Deno.exit(1);
        }
      } catch (error) {
        console.error(colors.red("Error reading configuration:"));
        console.error(`  ${error instanceof Error ? error.message : String(error)}`);
        Deno.exit(1);
      }
    });
};
