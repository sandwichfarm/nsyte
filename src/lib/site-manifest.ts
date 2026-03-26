import { getSeenRelays, type NostrEvent, relaySet } from "applesauce-core/helpers";
import { getManifestRelays } from "./manifest.ts";
import { fetchSiteManifestEvent, getUserOutboxes } from "./nostr.ts";
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

const defaultDependencies: TrustedManifestDependencies = {
  getOutboxes: getUserOutboxes,
  fetchManifest: fetchSiteManifestEvent,
};

function pickNewerManifest(a: NostrEvent | null, b: NostrEvent | null): NostrEvent | null {
  if (!a) return b;
  if (!b) return a;
  if (a.created_at !== b.created_at) {
    return a.created_at > b.created_at ? a : b;
  }

  return a.id >= b.id ? a : b;
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
