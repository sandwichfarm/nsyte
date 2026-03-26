import { mapEventsToStore, mapEventsToTimeline, simpleTimeout } from "applesauce-core";
import { getSeenRelays, type NostrEvent, relaySet } from "applesauce-core/helpers";
import { lastValueFrom } from "rxjs";
import { getManifestRelays, NSITE_NAME_SITE_KIND, NSITE_ROOT_SITE_KIND } from "./manifest.ts";
import { fetchSiteManifestEvent, getUserOutboxes, pool, store } from "./nostr.ts";
import type { FileEntry, FileEntryWithSources } from "./nostr.ts";

export interface TrustedManifestFetchResult {
  event: NostrEvent | null;
  relays: string[];
  outboxes: string[];
  manifestRelays: string[];
}

export interface TrustedManifestDependencies {
  getOutboxes: (pubkey: string) => Promise<string[] | undefined>;
  fetchManifest: (
    relays: string[],
    pubkey: string,
    identifier?: string,
  ) => Promise<NostrEvent | null>;
}

export interface ManifestHistoryDependencies {
  getOutboxes: (pubkey: string) => Promise<string[] | undefined>;
  fetchEvents: (relays: string[], pubkey: string, identifier?: string) => Promise<NostrEvent[]>;
}

const defaultDependencies: TrustedManifestDependencies = {
  getOutboxes: getUserOutboxes,
  fetchManifest: fetchSiteManifestEvent,
};

const defaultManifestHistoryDependencies: ManifestHistoryDependencies = {
  getOutboxes: getUserOutboxes,
  fetchEvents: fetchSiteManifestEvents,
};

function pickNewerManifest(a: NostrEvent | null, b: NostrEvent | null): NostrEvent | null {
  if (!a) return b;
  if (!b) return a;
  if (a.created_at !== b.created_at) {
    return a.created_at > b.created_at ? a : b;
  }

  return a.id >= b.id ? a : b;
}

export function sortManifestEvents(events: NostrEvent[]): NostrEvent[] {
  const uniqueEvents = new Map<string, NostrEvent>();
  for (const event of events) {
    uniqueEvents.set(event.id, event);
  }

  return Array.from(uniqueEvents.values()).sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return b.created_at - a.created_at;
    }

    return b.id.localeCompare(a.id);
  });
}

async function fetchSiteManifestEvents(
  relays: string[],
  pubkey: string,
  identifier?: string,
  timeout = 15_000,
): Promise<NostrEvent[]> {
  try {
    const events = await lastValueFrom(
      pool.request(
        relays,
        identifier
          ? {
            kinds: [NSITE_NAME_SITE_KIND],
            authors: [pubkey],
            "#d": [identifier],
          }
          : {
            kinds: [NSITE_ROOT_SITE_KIND],
            authors: [pubkey],
          },
      ).pipe(mapEventsToStore(store), mapEventsToTimeline(), simpleTimeout(timeout)),
      { defaultValue: [] },
    );

    return sortManifestEvents(events);
  } catch {
    return [];
  }
}

export async function fetchTrustedSiteManifestEvent(
  initialRelays: string[],
  pubkey: string,
  identifier?: string,
  dependencies: TrustedManifestDependencies = defaultDependencies,
): Promise<TrustedManifestFetchResult> {
  const outboxes = await dependencies.getOutboxes(pubkey) ?? [];
  const firstPassRelays = relaySet(initialRelays, outboxes);
  const firstPassManifest = await dependencies.fetchManifest(firstPassRelays, pubkey, identifier);
  const manifestRelays = firstPassManifest ? getManifestRelays(firstPassManifest) : [];

  if (manifestRelays.length === 0) {
    return {
      event: firstPassManifest,
      relays: firstPassRelays,
      outboxes,
      manifestRelays: [],
    };
  }

  const trustedRelays = relaySet(firstPassRelays, manifestRelays);
  const secondPassManifest = await dependencies.fetchManifest(trustedRelays, pubkey, identifier);

  return {
    event: pickNewerManifest(firstPassManifest, secondPassManifest),
    relays: trustedRelays,
    outboxes,
    manifestRelays,
  };
}

export async function fetchTrustedSiteManifestHistory(
  initialRelays: string[],
  pubkey: string,
  identifier?: string,
  dependencies: ManifestHistoryDependencies = defaultManifestHistoryDependencies,
): Promise<NostrEvent[]> {
  const outboxes = await dependencies.getOutboxes(pubkey) ?? [];
  const firstPassRelays = relaySet(initialRelays, outboxes);
  const firstPassEvents = await dependencies.fetchEvents(firstPassRelays, pubkey, identifier);
  const manifestRelays = relaySet(...firstPassEvents.map((event) => getManifestRelays(event)));

  if (manifestRelays.length === 0) {
    return sortManifestEvents(firstPassEvents);
  }

  const trustedRelays = relaySet(firstPassRelays, manifestRelays);
  const secondPassEvents = await dependencies.fetchEvents(trustedRelays, pubkey, identifier);
  return sortManifestEvents([...firstPassEvents, ...secondPassEvents]);
}

export function getManifestFileEntries(manifestEvent: NostrEvent): FileEntry[] {
  const fileEntries: FileEntry[] = [];

  for (const tag of manifestEvent.tags) {
    if (tag[0] !== "path" || tag.length < 3) {
      continue;
    }

    const path = tag[1];
    const sha256 = tag[2];
    if (!path || !sha256) {
      continue;
    }

    fileEntries.push({
      path,
      sha256,
      event: manifestEvent,
      size: 0,
    });
  }

  return fileEntries.sort((a, b) => a.path.localeCompare(b.path));
}

export function getManifestFileEntriesWithSources(
  manifestEvent: NostrEvent,
): FileEntryWithSources[] {
  const foundOnRelays = Array.from(getSeenRelays(manifestEvent) ?? []);

  return getManifestFileEntries(manifestEvent).map((file) => ({
    path: file.path,
    sha256: file.sha256!,
    eventId: manifestEvent.id,
    event: manifestEvent,
    foundOnRelays,
    availableOnServers: [],
  }));
}

export async function listTrustedRemoteFiles(
  relays: string[],
  pubkey: string,
  identifier?: string,
  dependencies: TrustedManifestDependencies = defaultDependencies,
): Promise<FileEntry[]> {
  const trustedManifest = await fetchTrustedSiteManifestEvent(
    relays,
    pubkey,
    identifier,
    dependencies,
  );

  if (!trustedManifest.event) {
    return [];
  }

  return getManifestFileEntries(trustedManifest.event);
}

export async function listTrustedRemoteFilesWithSources(
  relays: string[],
  pubkey: string,
  identifier?: string,
  dependencies: TrustedManifestDependencies = defaultDependencies,
): Promise<FileEntryWithSources[]> {
  const trustedManifest = await fetchTrustedSiteManifestEvent(
    relays,
    pubkey,
    identifier,
    dependencies,
  );

  if (!trustedManifest.event) {
    return [];
  }

  return getManifestFileEntriesWithSources(trustedManifest.event);
}
