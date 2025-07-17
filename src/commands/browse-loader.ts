import type { NostrEvent } from "nostr-tools";
import { EventStore, simpleTimeout, mapEventsToStore, mapEventsToTimeline } from "applesauce-core";
import { pool, getTagValue } from "../lib/nostr.ts";
import { lastValueFrom } from "rxjs";
import { createLogger } from "../lib/logger.ts";
import { renderLoadingScreen } from "../ui/browse/renderer.ts";
import type { FileEntryWithSources } from "./ls.ts";

const log = createLogger("browse-loader");
const NSITE_KIND = 34128;

function getTagValues(event: NostrEvent, tagName: string): string[] {
  return event.tags
    .filter((tag: string[]) => tag[0] === tagName && tag.length > 1)
    .map((tag: string[]) => tag[1]);
}

export async function listRemoteFilesWithProgress(
  relays: string[],
  pubkey: string,
  silent: boolean = false,
): Promise<FileEntryWithSources[]> {
  const eventMap = new Map<string, { event: NostrEvent; foundOnRelays: Set<string> }>();
  let completedRelays = 0;
  let totalEvents = 0;

  if (!silent) {
    renderLoadingScreen("Connecting to relays...", `0 / ${relays.length} relays`);
  }

  // Subscribe to each relay individually to track sources
  const promises = relays.map(async (relay) => {
    try {
      log.debug(`Connecting to relay: ${relay}`);
      const store = new EventStore();
      
      // Add a race condition with manual timeout to handle EOSE issues
      const requestPromise = lastValueFrom(
        pool
          .request([relay], {
            kinds: [NSITE_KIND],
            authors: [pubkey],
          })
          .pipe(
            simpleTimeout(8000),
            mapEventsToStore(store),
            mapEventsToTimeline()
          ),
        { defaultValue: [] }
      );
      
      const timeoutPromise = new Promise<any[]>((_, reject) => {
        setTimeout(() => reject(new Error(`Relay ${relay} timeout - no EOSE received`)), 10000);
      });
      
      const events = await Promise.race([requestPromise, timeoutPromise]) as NostrEvent[];

      // Track which relay returned each event
      for (const event of events) {
        const existing = eventMap.get(event.id);
        if (existing) {
          existing.foundOnRelays.add(relay);
        } else {
          eventMap.set(event.id, {
            event,
            foundOnRelays: new Set([relay]),
          });
          totalEvents++;
        }
      }

      log.debug(`Found ${events.length} events from relay ${relay}`);
    } catch (error) {
      log.debug(`Failed to fetch from relay ${relay}: ${error}`);
    } finally {
      completedRelays++;
      if (!silent) {
        renderLoadingScreen(
          "Loading files from relays...",
          `${completedRelays} / ${relays.length} relays • ${totalEvents} events found`
        );
      }
    }
  });

  await Promise.all(promises);

  if (eventMap.size === 0) {
    log.warn(`No file events found for user ${pubkey} from any relays`);
    return [];
  }

  if (!silent) {
    renderLoadingScreen("Processing files...", `${eventMap.size} events`);
  }

  const fileEntries: FileEntryWithSources[] = [];

  for (const [eventId, { event, foundOnRelays }] of eventMap) {
    const path = getTagValue(event, "d");
    const sha256 = getTagValue(event, "x");

    if (path && sha256) {
      // Get blossom servers from the event
      const servers = getTagValues(event, "r").filter((url: string) => 
        url.startsWith("http://") || url.startsWith("https://")
      );

      fileEntries.push({
        path,
        sha256,
        eventId,
        event,
        foundOnRelays: Array.from(foundOnRelays),
        availableOnServers: servers,
      });
    }
  }

  if (!silent) {
    renderLoadingScreen("Deduplicating files...", `${fileEntries.length} files`);
  }

  // Deduplicate by path, keeping the newest event
  const uniqueFiles = fileEntries.reduce((acc, current) => {
    const existingIndex = acc.findIndex((file) => file.path === current.path);

    if (existingIndex === -1) {
      return [...acc, current];
    } else {
      const existing = acc[existingIndex];

      if ((existing.event?.created_at || 0) < (current.event?.created_at || 0)) {
        acc[existingIndex] = current;
      } else {
        // Merge relay sources
        const mergedRelays = new Set([...existing.foundOnRelays, ...current.foundOnRelays]);
        existing.foundOnRelays = Array.from(mergedRelays);
      }

      return acc;
    }
  }, [] as FileEntryWithSources[]);

  log.info(`Found ${uniqueFiles.length} unique remote files for user ${pubkey}`);

  return uniqueFiles.sort((a, b) => a.path.localeCompare(b.path));
}