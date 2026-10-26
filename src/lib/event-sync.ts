import type { EventStore } from "applesauce-core";
import type { Filter, NostrEvent } from "applesauce-core/helpers";
import {
  createSyncLoader,
  type SyncLoaderPool,
  type SyncLoaderStatus,
} from "applesauce-loaders/loaders";
import { ignoreElements, lastValueFrom, merge, tap } from "rxjs";
import { getErrorMessage } from "./error-utils.ts";
import { createLogger } from "./logger.ts";

const log = createLogger("event-sync");

/** Create a receive-only bulk loader sharing the application's event store and relay pool. */
export function createEventSync(eventStore: EventStore, pool: SyncLoaderPool) {
  const loader = createSyncLoader({ eventStore, pool });

  return async (
    relays: string[],
    filter: Filter,
    onProgress?: (status: SyncLoaderStatus) => void,
  ): Promise<NostrEvent[]> => {
    if (relays.length === 0) return [];

    const run = loader({ relays, filter, timeout: 30_000, waitForAuth: false });
    // NIP-77 only transfers missing IDs. Include matching events already in the shared store,
    // and collect streamed versions too: replaceable events may be superseded during this run.
    const events = new Map(eventStore.getTimeline(filter).map((event) => [event.id, event]));
    const status = await lastValueFrom(merge(
      run.events$.pipe(tap((event) => events.set(event.id, event)), ignoreElements()),
      run.status$.pipe(tap((status) => onProgress?.(status))),
    ));
    const outcomes = Object.values(status.relays);
    for (const outcome of outcomes) {
      if (outcome.state === "error") {
        log.warn(`Could not finish syncing ${outcome.relay}: ${getErrorMessage(outcome.error)}`);
      } else if (outcome.fallbackReason) {
        log.debug(
          `Using paginated requests for ${outcome.relay}: ${outcome.fallbackReason.message}`,
        );
      }
    }
    if (!outcomes.some((outcome) => outcome.state === "complete")) {
      throw new Error(
        "Unable to sync events from any relay. Check your relay URLs and connection.",
      );
    }
    return [...events.values()].sort((a, b) =>
      b.created_at - a.created_at || a.id.localeCompare(b.id)
    );
  };
}
