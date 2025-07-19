/**
 * Cliffy-based bunker command registration for help menu
 * 
 * This registers the bunker command with cliffy ONLY for help menu display.
 * The actual command execution is still handled by the direct implementation
 * in bunker.ts to preserve the complex async control flow.
 */

import { Command } from "@cliffy/command";

/**
 * Register the bunker command with cliffy for help menu only
 */
export function registerBunkerCommand(program: Command): void {
  const bunker = new Command()
    .description("Manage NIP-46 bunker connections and nbunks")
    .action(() => {
      // This action will never be called - the direct handler intercepts first
      console.error("Unexpected code path reached in bunker command. This suggests a bug in the command interception logic.");
    })
    // List subcommand
    .command("list", "List all stored bunkers in the system")
    .action(() => {})
    .reset()
    // Import subcommand
    .command("import [nbunksec:string]", "Import a bunker from an nbunksec string")
    .action(() => {})
    .reset()
    // Export subcommand
    .command("export [pubkey:string]", "Export a bunker as an nbunksec string")
    .action(() => {})
    .reset()
    // Connect subcommand with complex URL handling
    .command("connect [url:string]", "Connect to a bunker URL and store as nbunksec")
    .option("--pubkey <pubkey:string>", "Bunker public key")
    .option("--relay <relay:string>", "Relay URL")
    .option("--secret <secret:string>", "Connection secret")
    .option("--no-persist", "Display nbunksec without storing it")
    .option("--force-encrypted-storage", "Force use of encrypted file storage instead of OS keychain")
    .action(() => {})
    .reset()
    // Use subcommand
    .command("use [pubkey:string]", "Configure current project to use a bunker")
    .action(() => {})
    .reset()
    // Remove subcommand
    .command("remove [pubkey:string]", "Remove a bunker from storage")
    .action(() => {})
    .reset()
    // Migrate subcommand
    .command("migrate [...pubkeys:string]", "Rebuild index for existing keychain bunkers")
    .action(() => {});

  // Register the bunker command to the main program
  program.command("bunker", bunker);
}