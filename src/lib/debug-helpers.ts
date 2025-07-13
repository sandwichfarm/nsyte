import { RelayPool } from "applesauce-relay/pool";
import { NostrEvent } from "nostr-tools";
import { createLogger } from "./logger.ts";
import { USER_BLOSSOM_SERVER_LIST_KIND, NSITE_KIND } from "./nostr.ts";
import { EventStore, mapEventsToStore, mapEventsToTimeline, simpleTimeout } from "applesauce-core";
import { lastValueFrom } from "rxjs";

const logger = createLogger("debug-helpers");

export async function fetchEventsWithTimer(
  pool: RelayPool,
  relays: string[],
  filter: any,
  timeout: number = 5000
): Promise<NostrEvent[]> {
  try {
    const store = new EventStore();
    const events = await lastValueFrom(
      pool
        .request(relays, filter)
        .pipe(
          simpleTimeout(timeout),
          mapEventsToStore(store),
          mapEventsToTimeline()
        )
    );
    return events;
  } catch (error) {
    logger.debug(`Timeout or error fetching events: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function fetchKind0Event(
  pool: RelayPool,
  relays: string[],
  pubkey: string
): Promise<NostrEvent | null> {
  logger.debug(`Fetching kind 0 for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [0],
    authors: [pubkey],
    limit: 1
  });
  
  return events.length > 0 ? events[0] : null;
}

export async function fetchRelayListEvents(
  pool: RelayPool,
  relays: string[],
  pubkey: string
): Promise<NostrEvent[]> {
  logger.debug(`Fetching kind 10002 for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [10002],
    authors: [pubkey],
    limit: 10
  });
  
  // Sort by created_at descending
  return events.sort((a, b) => b.created_at - a.created_at);
}

export async function fetchServerListEvents(
  pool: RelayPool,
  relays: string[],
  pubkey: string
): Promise<NostrEvent[]> {
  logger.debug(`Fetching kind ${USER_BLOSSOM_SERVER_LIST_KIND} for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [USER_BLOSSOM_SERVER_LIST_KIND],
    authors: [pubkey],
    limit: 10
  });
  
  // Sort by created_at descending
  return events.sort((a, b) => b.created_at - a.created_at);
}

export async function fetchNsiteEvents(
  pool: RelayPool,
  relays: string[],
  pubkey: string
): Promise<NostrEvent[]> {
  logger.debug(`Fetching kind ${NSITE_KIND} for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [NSITE_KIND],
    authors: [pubkey]
    // No limit - fetch all events
  }, 15000); // Longer timeout for potentially many events
  
  // Sort by created_at descending
  return events.sort((a, b) => b.created_at - a.created_at);
}

export async function fetchAppHandlerEvents(
  pool: RelayPool,
  relays: string[],
  pubkey: string
): Promise<NostrEvent[]> {
  logger.debug(`Fetching kinds 31989, 31990 for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [31989, 31990],
    authors: [pubkey],
    limit: 20
  });
  
  // Sort by created_at descending
  return events.sort((a, b) => b.created_at - a.created_at);
}