import { NostrEvent } from "./nostr.ts";
import { Command } from "@cliffy/command";

/**
 * Extract a tag value from a nostr event
 */
export function extractTagValue(event: NostrEvent, tagName: string): string | undefined {
  for (const tag of event.tags) {
    if (tag.length >= 2 && tag[0] === tagName) {
      return tag[1];
    }
  }
  return undefined;
}

/**
 * Creates a properly grouped subcommand structure
 * 
 * This function takes a parent command and adds a subcommand with nested commands
 * in a way that ensures they display properly in the help output.
 */
export function createGroupedCommand(
  parentCommand: Command,
  name: string,
  description: string
): Command {
  const subCommand = new Command()
    .name(name)
    .description(description);
  
  parentCommand.command(name, description).action(() => {
    subCommand.showHelp();
  });
  
  return subCommand;
} 