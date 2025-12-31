import { join } from "@std/path";
import { existsSync } from "@std/fs/exists";
import { colors } from "@cliffy/ansi/colors";
import { configDir } from "./config.ts";
import { createLogger } from "./logger.ts";

const log = createLogger("config-cleanup");

/**
 * Clean up incorrect config files in the .nsite directory
 */
export async function cleanupConfigFiles(interactive = true): Promise<boolean> {
  const cwd = Deno.cwd();
  const configDirPath = join(cwd, configDir);

  if (!existsSync(configDirPath)) {
    return true; // No config directory, nothing to clean
  }

  let cleaned = false;
  const invalidFiles: string[] = [];

  // Check for YAML files
  const yamlFiles = ["config.yaml", "config.yml"];
  for (const yamlFile of yamlFiles) {
    const yamlPath = join(configDirPath, yamlFile);
    if (existsSync(yamlPath)) {
      invalidFiles.push(yamlPath);
    }
  }

  // Check for other non-JSON config files
  try {
    for await (const entry of Deno.readDir(configDirPath)) {
      if (
        entry.isFile && entry.name.startsWith("config") &&
        !entry.name.endsWith(".json") && !entry.name.endsWith(".backup")
      ) {
        invalidFiles.push(join(configDirPath, entry.name));
      }
    }
  } catch (error) {
    log.error(`Failed to read config directory: ${error}`);
  }

  if (invalidFiles.length === 0) {
    return true; // Nothing to clean
  }

  console.error(colors.red("\n⚠️  Found invalid config files in .nsite directory:"));
  for (const file of invalidFiles) {
    console.error(colors.yellow(`  - ${file}`));
  }
  console.error(
    colors.yellow("\nnsyte uses config.json for configuration, not YAML or other formats."),
  );

  if (interactive) {
    const { Confirm } = await import("@cliffy/prompt");
    const shouldClean = await Confirm.prompt({
      message: "Would you like to remove these invalid config files?",
      default: true,
    });

    if (!shouldClean) {
      console.log(
        colors.yellow("Keeping invalid config files. Please remove them manually to avoid issues."),
      );
      return false;
    }
  }

  // Remove invalid files
  for (const file of invalidFiles) {
    try {
      // Check if it contains important data first
      const content = await Deno.readTextFile(file);
      const backupPath = `${file}.invalid-backup`;

      // Create a backup just in case
      await Deno.writeTextFile(backupPath, content);

      // Remove the invalid file
      await Deno.remove(file);
      log.info(`Removed invalid config file: ${file} (backup saved as ${backupPath})`);
      cleaned = true;
    } catch (error) {
      log.error(`Failed to remove ${file}: ${error}`);
    }
  }

  if (cleaned) {
    console.log(colors.green("\n✓ Invalid config files have been cleaned up."));
    console.log(colors.dim("Backups were created with .invalid-backup extension."));
  }

  return cleaned;
}

/**
 * Check if config directory has any issues
 */
export function checkConfigHealth(): { healthy: boolean; issues: string[] } {
  const cwd = Deno.cwd();
  const configDirPath = join(cwd, configDir);
  const issues: string[] = [];

  if (!existsSync(configDirPath)) {
    return { healthy: true, issues: [] }; // No config directory is fine
  }

  // Check for YAML files
  const yamlFiles = ["config.yaml", "config.yml"];
  for (const yamlFile of yamlFiles) {
    const yamlPath = join(configDirPath, yamlFile);
    if (existsSync(yamlPath)) {
      issues.push(`Found invalid YAML config file: ${yamlFile}`);
    }
  }

  // Check for proper JSON file
  const jsonPath = join(configDirPath, "config.json");
  if (existsSync(jsonPath)) {
    try {
      const content = Deno.readTextFileSync(jsonPath);
      JSON.parse(content); // Validate JSON
    } catch (error) {
      issues.push(`config.json contains invalid JSON: ${error}`);
    }
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}
