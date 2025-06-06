import { NostrEvent } from "./nostr.ts";
import { Command } from "@cliffy/command";
import { bech32 } from "@scure/base";
import { hexToBytes } from "@noble/hashes/utils";

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
 * Encode a hex public key as npub (bech32)
 */
export function npubEncode(pubkeyHex: string): string {
  const pubkeyBytes = hexToBytes(pubkeyHex);
  return bech32.encode("npub", bech32.toWords(pubkeyBytes));
}

/**
 * Decode a bech32 encoded string (npub, nsec, etc.)
 */
export function bech32Decode(encoded: string): { prefix: string; data: Uint8Array } {
  const decoded = bech32.decode(encoded);
  const data = new Uint8Array(bech32.fromWords(decoded.words));
  return { prefix: decoded.prefix, data };
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