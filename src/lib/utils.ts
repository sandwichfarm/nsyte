import { Command } from "@cliffy/command";
import { type NostrEvent, relaySet } from "applesauce-core/helpers";

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

/**
 * Extract server URLs from a nostr event's tags (for blossom server lists)
 * @param event - The nostr event containing server tags
 * @returns Array of server URLs
 *
 * @deprecated use getBlossomServersFromList instead
 */
export function extractServersFromEvent(event: NostrEvent | null): string[] {
  if (!event) return [];
  const servers: string[] = [];
  for (const tag of event.tags) {
    if (tag[0] === "server" && tag[1]) {
      servers.push(tag[1]);
    }
  }
  return servers;
}

/**
 * Extract server URLs from site manifest events, prioritizing the most recent events.
 * According to NIP-XX, server tags from manifest events should be prioritized over kind 10063 server list events.
 * @param manifestEvents - Array of site manifest events (should be sorted by created_at descending)
 * @returns Array of unique server URLs, with servers from more recent events appearing first
 */
export function extractServersFromManifestEvents(manifestEvents: NostrEvent[]): string[] {
  const serverSet = new Set<string>();
  const servers: string[] = [];

  // Process events from most recent to oldest (assuming they're already sorted)
  for (const event of manifestEvents) {
    for (const tag of event.tags) {
      if (tag[0] === "server" && tag[1] && !serverSet.has(tag[1])) {
        serverSet.add(tag[1]);
        servers.push(tag[1]);
      }
    }
  }

  return servers;
}

/**
 * Parse a comma-separated string of relays into an array
 * @param relayInput - Comma-separated string of relay URLs
 * @returns Array of trimmed relay URLs
 */
export function parseRelayInput(relayInput: string): string[] {
  return relaySet(
    relayInput
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0),
  );
}

/**
 * Convert an SSH git URL to HTTPS format.
 * git@github.com:user/repo.git -> https://github.com/user/repo
 */
export function sshToHttpsUrl(url: string): string | null {
  const match = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (!match) return null;
  return `https://${match[1]}/${match[2]}`;
}

/**
 * Detect source repository URL from git remote.
 * Returns the configured source URL, or auto-detected from git origin, or undefined.
 * Auto-detected SSH URLs are converted to HTTPS.
 */
export async function detectSourceUrl(configSource?: string): Promise<string | undefined> {
  // Config takes priority
  if (configSource) return configSource;

  try {
    const command = new Deno.Command("git", {
      args: ["remote", "get-url", "origin"],
      stdout: "piped",
      stderr: "null",
    });
    const output = await command.output();
    if (!output.success) return undefined;

    const url = new TextDecoder().decode(output.stdout).trim();
    if (!url) return undefined;

    // If already HTTP(S), use directly
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url.replace(/\.git$/, "");
    }

    // Try SSH-to-HTTPS conversion
    return sshToHttpsUrl(url) ?? undefined;
  } catch {
    // No git, no remote, or permission error — silently skip
    return undefined;
  }
}

/**
 * Truncate a string (typically a pubkey or hash) for display
 * @param str - The string to truncate
 * @param prefixLength - Length of prefix to show (default 8)
 * @param suffixLength - Length of suffix to show (default 0, which means no suffix)
 * @returns Truncated string with ellipsis
 */
export function truncateString(str: string, prefixLength = 8, suffixLength = 0): string {
  if (!str) return "";
  if (str.length <= prefixLength + suffixLength + 3) return str;

  if (suffixLength > 0) {
    return `${str.substring(0, prefixLength)}...${str.substring(str.length - suffixLength)}`;
  }
  return `${str.substring(0, prefixLength)}...`;
}
