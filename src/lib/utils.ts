import { NostrEvent } from "./nostr.ts";

/**
 * Extract a tag value from a NOSTR event
 */
export function extractTagValue(event: NostrEvent, tagName: string): string | undefined {
  for (const tag of event.tags) {
    if (tag.length >= 2 && tag[0] === tagName) {
      return tag[1];
    }
  }
  return undefined;
} 