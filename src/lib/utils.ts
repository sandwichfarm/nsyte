import { Command } from "@cliffy/command";
import { getTagValue } from "applesauce-core/helpers";

/** Extract a tag value from a nostr event */
export { getTagValue as extractTagValue };
export { npubEncode } from "nostr-tools/nip19";

/**
 * Creates a properly grouped subcommand structure
 *
 * This function takes a parent command and adds a subcommand with nested commands
 * in a way that ensures they display properly in the help output.
 */
export function createGroupedCommand(
  parentCommand: Command,
  name: string,
  description: string,
): Command {
  const subCommand = new Command().name(name).description(description);

  parentCommand.command(name, description).action(() => {
    subCommand.showHelp();
  });

  return subCommand;
}
