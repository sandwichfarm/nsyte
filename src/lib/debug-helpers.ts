import { BLOSSOM_SERVER_LIST_KIND } from "applesauce-common/helpers";
import { EventStore, mapEventsToStore, mapEventsToTimeline, simpleTimeout } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers";
import type { RelayPool } from "applesauce-relay/pool";
import { lastValueFrom, timer } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { createLogger } from "./logger.ts";
import { NSITE_NAME_SITE_KIND, NSITE_ROOT_SITE_KIND } from "./manifest.ts";

const logger = createLogger("debug-helpers");

export async function fetchEventsWithTimer(
  pool: RelayPool,
  relays: string[],
  filter: any,
  timeout: number = 5000,
): Promise<NostrEvent[]> {
  try {
    const store = new EventStore();
    const events = await lastValueFrom(
      pool
        .request(relays, filter)
        .pipe(
          simpleTimeout(timeout),
          mapEventsToStore(store),
          mapEventsToTimeline(),
          takeUntil(timer(timeout)), // Force completion even if a relay never sends EOSE
        ),
    );
    return events;
  } catch (error) {
    logger.debug(
      `Timeout or error fetching events: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export async function fetchKind0Event(
  pool: RelayPool,
  relays: string[],
  pubkey: string,
): Promise<NostrEvent | null> {
  logger.debug(`Fetching kind 0 for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [0],
    authors: [pubkey],
    limit: 1,
  });

  return events.length > 0 ? events[0] : null;
}

export async function fetchRelayListEvents(
  pool: RelayPool,
  relays: string[],
  pubkey: string,
): Promise<NostrEvent[]> {
  logger.debug(`Fetching kind 10002 for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [10002],
    authors: [pubkey],
    limit: 10,
  });

  // Sort by created_at descending
  return events.sort((a, b) => b.created_at - a.created_at);
}

export async function fetchServerListEvents(
  pool: RelayPool,
  relays: string[],
  pubkey: string,
): Promise<NostrEvent[]> {
  logger.debug(`Fetching kind ${BLOSSOM_SERVER_LIST_KIND} for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [BLOSSOM_SERVER_LIST_KIND],
    authors: [pubkey],
    limit: 10,
  });

  // Sort by created_at descending
  return events.sort((a, b) => b.created_at - a.created_at);
}

export async function fetchNsiteEvents(
  pool: RelayPool,
  relays: string[],
  pubkey: string,
): Promise<NostrEvent[]> {
  logger.debug(
    `Fetching site manifest events (kinds ${NSITE_ROOT_SITE_KIND}, ${NSITE_NAME_SITE_KIND}) for ${pubkey}`,
  );
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [NSITE_ROOT_SITE_KIND, NSITE_NAME_SITE_KIND],
    authors: [pubkey],
    // No limit - fetch all events
  }, 15000); // Longer timeout for potentially many events

  // Sort by created_at descending
  return events.sort((a, b) => b.created_at - a.created_at);
}

export async function fetchAppHandlerEvents(
  pool: RelayPool,
  relays: string[],
  pubkey: string,
): Promise<NostrEvent[]> {
  logger.debug(`Fetching kinds 31989, 31990 for ${pubkey}`);
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [31989, 31990],
    authors: [pubkey],
    limit: 20,
  });

  // Sort by created_at descending
  return events.sort((a, b) => b.created_at - a.created_at);
}

export async function fetchIndexHtmlEvent(
  pool: RelayPool,
  relays: string[],
  pubkey: string,
): Promise<NostrEvent | null> {
  logger.debug(`Fetching site manifest events containing /index.html for ${pubkey}`);
  // Fetch all manifest events and find one with /index.html in path tags
  const events = await fetchEventsWithTimer(pool, relays, {
    kinds: [NSITE_ROOT_SITE_KIND, NSITE_NAME_SITE_KIND],
    authors: [pubkey],
    limit: 10,
  });

  // Find manifest event that has /index.html in its path tags
  for (const event of events) {
    const pathTags = event.tags.filter((tag) => tag[0] === "path");
    const hasIndexHtml = pathTags.some((tag) => {
      if (tag.length >= 2) {
        const path = tag[1];
        return path === "/index.html" || path === "index.html";
      }
      return false;
    });
    if (hasIndexHtml) {
      return event;
    }
  }

  return null;
}
