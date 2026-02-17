import { schnorr } from "@noble/curves/secp256k1";
import { encodeHex } from "@std/encoding/hex";
import { castUser } from "applesauce-common/casts";
import { BLOSSOM_SERVER_LIST_KIND, getBlossomServersFromList } from "applesauce-common/helpers";
import {
  EventStore,
  firstValueFrom,
  mapEventsToStore,
  mapEventsToTimeline,
  simpleTimeout,
} from "applesauce-core";
import { buildEvent } from "applesauce-core/event-factory";
import {
  type EventTemplate,
  type Filter,
  getSeenRelays,
  kinds,
  type NostrEvent,
  npubEncode,
  type ProfileContent,
  type ProfilePointer,
  relaySet,
  unixNow,
} from "applesauce-core/helpers";
import { setDeleteEvents } from "applesauce-core/operations/delete";
import { loadAsyncMap } from "applesauce-loaders/helpers";
import { createEventLoaderForStore } from "applesauce-loaders/loaders";
import { RelayPool } from "applesauce-relay/pool";
import { type ISigner, NostrConnectSigner } from "applesauce-signers";
import { catchError, lastValueFrom, of } from "rxjs";
import { timeout } from "rxjs/operators";
import { truncateHash } from "../ui/browse/renderer.ts";
import { LOCAL_RELAY_URL, RELAY_DISCOVERY_RELAYS } from "./constants.ts";
import { getErrorMessage } from "./error-utils.ts";
import { createLogger } from "./logger.ts";
import { type FilePathMapping, NSITE_NAME_SITE_KIND, NSITE_ROOT_SITE_KIND } from "./manifest.ts";
import type { ByteArray } from "./types.ts";

const log = createLogger("nostr");

// Create a global relay pool for connections
export const pool = new RelayPool();

// Create an in-memory event store for managing events
export const store = new EventStore();

// Create a cache request method for loading from the local relay if it exists
let hasLocalRelay: boolean | null = null;
export async function cacheRequest(filters: Filter[]): Promise<NostrEvent[]> {
  // Check if a local relay is available
  if (hasLocalRelay === null) {
    hasLocalRelay = !!(await firstValueFrom(
      pool.relay(LOCAL_RELAY_URL).information$.pipe(timeout(500), catchError(() => of(null))),
    ));

    if (hasLocalRelay) log.info(`Found local relay at ${LOCAL_RELAY_URL}`);
  }

  if (hasLocalRelay === false) return [];

  // Load events from the local relay if its available
  try {
    return await lastValueFrom(
      pool.relay(LOCAL_RELAY_URL).request(filters).pipe(
        // Collect all events into an array
        mapEventsToTimeline(),
        // Throw timeout error after 1 second
        timeout(1000),
      ),
      { defaultValue: [] },
    );
  } catch (error) {
    log.error(`Error loading events from local relay: ${getErrorMessage(error)}`);
    hasLocalRelay = false;
    return [];
  }
}

// Create the event loader for the store so it can load profiles
export const eventLoader = createEventLoaderForStore(store, pool, {
  lookupRelays: RELAY_DISCOVERY_RELAYS,
  cacheRequest,
  // Set a low buffer time since this tool will not be loading anything in parallel
  bufferTime: 300,
});

/** A quick async method to get a users display name */
export async function getUserDisplayName(
  pubkey: string | ProfilePointer,
  timeout = 500,
): Promise<string> {
  const user = castUser(pubkey, store);
  const npub = truncateHash(npubEncode(typeof pubkey === "string" ? pubkey : pubkey.pubkey));
  const name = await user.profile$.displayName.$first(timeout, undefined);
  return name ? `${name} (${npub})` : npub;
}

/** A quick async method to get a users outboxes */
export async function getUserOutboxes(
  pubkey: string | ProfilePointer,
  timeout = 5000,
): Promise<string[] | undefined> {
  const user = castUser(pubkey, store);

  // Load outboxes and profile in parallel
  const { outboxes, name } = await loadAsyncMap({
    outboxes: user.outboxes$.$first(timeout, undefined),
    name: getUserDisplayName(pubkey, timeout),
  }, timeout);

  if (outboxes) log.debug(`Found ${outboxes.length} outboxes for ${name}`);
  else log.warn(`No outboxes found for ${name}`);

  return outboxes;
}

/** A quick async method to get a users blossom servers */
export async function getUserBlossomServers(
  pubkey: string | ProfilePointer,
  timeout = 5000,
): Promise<string[] | undefined> {
  const user = castUser(pubkey, store);

  const serverList = await user.replaceable(BLOSSOM_SERVER_LIST_KIND).$first(timeout, undefined);
  if (serverList) {
    return getBlossomServersFromList(serverList).map((server) => server.toString());
  }
}

/** @deprecated use getUserBlossomServers instead */
export async function getUserServers(
  pubkey: string | ProfilePointer,
  timeout = 5000,
): Promise<string[]> {
  return (await getUserBlossomServers(pubkey, timeout)) ?? [];
}

/** Fetch profile event (kind 0) from nostr relays */
export function getUserProfile(
  pubkey: string,
  timeout = 5000,
): Promise<ProfileContent | null> {
  const user = castUser(pubkey, store);

  return user.profile$.$first(timeout, null);
}

/** Fetch relay list event (kind 10002) from nostr relays */
export async function fetchUserRelayList(
  relays: string[],
  pubkey: string,
  timeout = 5000,
): Promise<NostrEvent | null> {
  log.debug(
    `Fetching relay list for ${await getUserDisplayName(pubkey)} from ${relays.join(", ")}`,
  );

  try {
    // Load events from the relays
    const event = await lastValueFrom(
      pool
        .request(relays, {
          kinds: [kinds.RelayList],
          authors: [pubkey],
        })
        .pipe(
          // Timeout after 5 seconds
          simpleTimeout(timeout),
          // Add all events to the store
          mapEventsToStore(store),
        ),
      { defaultValue: null },
    );

    // Get the latest event from the store
    return event;
  } catch (error) {
    log.error(`Error fetching relay list: ${getErrorMessage(error)}`);
    return null;
  }
}

/**
 * File entry interface
 */
export interface FileEntry {
  path: string;
  data?: ByteArray;
  size?: number;
  sha256?: string;
  contentType?: string;
  event?: NostrEvent; // Reference to the manifest event this file comes from
}

/**
 * Enhanced FileEntry with source tracking
 */
export interface FileEntryWithSources {
  path: string;
  sha256: string;
  eventId: string;
  event?: NostrEvent;
  foundOnRelays: string[];
  availableOnServers: string[];
}

/**
 * Site manifest event metadata
 */
export interface SiteManifestMetadata {
  title?: string;
  description?: string;
  servers?: string[];
  relays?: string[];
}

/**
 * Generate a new nostr key pair
 */
export function generateKeyPair(): { privateKey: string; publicKey: string } {
  const privateKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(privateKeyBytes);

  const privateKey = encodeHex(privateKeyBytes);

  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
  const publicKey = encodeHex(publicKeyBytes);

  return { privateKey, publicKey };
}

/** Interface for unsigned nostr events */
export type NostrEventTemplate = EventTemplate & { pubkey?: string };

/**
 * Create a NIP-46 client from a bunker URL
 */
export async function createNip46ClientFromUrl(bunkerUrl: string): Promise<{
  client: ISigner;
  userPubkey: string;
}> {
  try {
    log.info(`Connecting to bunker: ${bunkerUrl}`);
    log.debug(`Pool subscription method: ${NostrConnectSigner.subscriptionMethod}`);
    log.debug(`Pool publish method: ${NostrConnectSigner.publishMethod}`);
    const bunkerSigner = await NostrConnectSigner.fromBunkerURI(bunkerUrl);
    log.debug("NostrConnectSigner created, attempting to get public key");
    const userPubkey = await bunkerSigner.getPublicKey();

    log.info(`Connected to bunker, user pubkey: ${userPubkey}`);
    return { client: bunkerSigner, userPubkey };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    log.error(`Failed to connect to bunker: ${errorMessage}`);
    throw new Error(`Failed to connect to bunker: ${errorMessage}`);
  }
}

/**
 * Fetches the latest site manifest event for the given pubkey and identifier
 * @param relays - Relays to query (will be merged with kind 10002 discovered relays)
 * @param pubkey - Public key of the site owner
 * @param identifier - Optional site identifier for named sites. If not provided, fetches root site (kind 15128) and all named sites (kind 35128)
 * @param timeout - Timeout for the request in milliseconds
 */
export async function fetchSiteManifestEvent(
  relays: string[],
  pubkey: string,
  identifier?: string,
  timeout = 12_000,
): Promise<NostrEvent | null> {
  // Load user information in parallel up front
  const { outboxes, name } = await loadAsyncMap({
    outboxes: getUserOutboxes(pubkey),
    name: getUserDisplayName(pubkey, 1000),
  }, 5000);

  // First, fetch kind 10002 to get user's preferred relays
  relays = relaySet(relays, outboxes);

  log.debug(
    `Fetching site manifest events for ${name} from ${relays.join(" ")}${
      identifier ? ` (site: ${identifier})` : ""
    }`,
  );

  try {
    const event = await lastValueFrom(
      pool.request(
        relays,
        identifier
          ? {
            kinds: [NSITE_NAME_SITE_KIND],
            authors: [pubkey],
            "#d": [identifier],
            limit: 1,
          }
          : {
            kinds: [NSITE_ROOT_SITE_KIND],
            authors: [pubkey],
            limit: 1,
          },
      ).pipe(
        mapEventsToStore(store),
        simpleTimeout(timeout),
      ),
      { defaultValue: null },
    );

    if (!event) {
      log.warn(
        `No site manifest event found for ${pubkey} from ${relays.join(", ")}${
          identifier ? ` (site: ${identifier})` : ""
        }`,
      );
    }

    return event ?? null;
  } catch (error) {
    log.error(`Error fetching manifest events: ${getErrorMessage(error)}`);
    return null;
  }
}

/** Get the site manifest event from the store or fetch it from the relays */
export async function getSiteManifestEvent(
  relays: string[],
  pubkey: string,
  identifier?: string,
): Promise<NostrEvent | null> {
  return store.getReplaceable(
    identifier ? NSITE_NAME_SITE_KIND : NSITE_ROOT_SITE_KIND,
    pubkey,
    identifier,
  ) || await fetchSiteManifestEvent(relays, pubkey, identifier);
}

/**
 * Fetch server list events (kind 10063) for a given pubkey
 * Returns events sorted by created_at descending
 */
export async function fetchServerListEvents(
  relays: string[],
  pubkey: string,
): Promise<NostrEvent[]> {
  log.debug(`Fetching kind ${BLOSSOM_SERVER_LIST_KIND} for ${pubkey}`);
  try {
    // Use the global store for caching - server list events are replaceable
    // so the store will automatically keep the latest one
    const events = await lastValueFrom(
      eventLoader({
        kind: BLOSSOM_SERVER_LIST_KIND,
        pubkey,
        relays,
        // Explicitly skip cache
        cache: false,
      }).pipe(mapEventsToStore(store), mapEventsToTimeline(), simpleTimeout(5000)),
      { defaultValue: [] },
    )
      // Ingore errors
      .catch(() => []);

    // Sort by created_at descending
    return events.sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    log.debug(
      `Timeout or error fetching server list events: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

/** Get a list of remote files for a user from site manifest events */
export async function listRemoteFiles(
  relays: string[],
  pubkey: string,
  identifier?: string,
): Promise<FileEntry[]> {
  const manifestEvent = await fetchSiteManifestEvent(relays, pubkey, identifier);
  const now = unixNow();

  if (!manifestEvent) {
    log.warn(`No site manifest events found for user ${pubkey} from any relays`);
    log.info("This could mean one of these things:");
    log.info("1. This is the first time you're uploading files for this user");
    log.info("2. The relays are not responding or are unreachable");
    log.info(
      "3. The previous uploads were not successfully published to relays",
    );

    return [];
  }

  const fileEntries: FileEntry[] = [];

  // Extract all path tags from the manifest
  const pathTags = manifestEvent.tags.filter((tag) => tag[0] === "path");

  for (const pathTag of pathTags) {
    // Path tag format: ["path", "/absolute/path", "sha256hash"]
    if (pathTag.length >= 3) {
      const path = pathTag[1];
      const sha256 = pathTag[2];

      if (path && sha256) {
        fileEntries.push({
          path,
          sha256,
          event: manifestEvent,
          size: 0,
        });
      }
    }
  }

  // Deduplicate files by path, keeping the most recent manifest version
  // For replaceable events (root site), the most recent one wins
  // For addressable events (named sites), we already filtered by identifier
  const uniqueFiles = fileEntries.reduce((acc, current) => {
    const existingIndex = acc.findIndex((file) => file.path === current.path);
    const currentTs = Math.min(current.event?.created_at ?? 0, now);

    if (existingIndex === -1) {
      return [...acc, current];
    } else {
      const existing = acc[existingIndex];
      const existingTs = Math.min(existing.event?.created_at ?? 0, now);

      // Keep the most recent version
      if (existingTs < currentTs) {
        acc[existingIndex] = current;
      }

      return acc;
    }
  }, [] as FileEntry[]);

  log.info(
    `Found ${uniqueFiles.length} unique remote files for user ${pubkey}`,
  );

  if (uniqueFiles.length > 0) {
    const truncatedList = uniqueFiles.slice(0, Math.min(5, uniqueFiles.length));
    log.debug("Remote files found (sample):");
    truncatedList.forEach((file) => {
      log.debug(`- ${file.path} (hash: ${file.sha256?.substring(0, 8)}...)`);
    });

    if (uniqueFiles.length > 5) {
      log.debug(`... and ${uniqueFiles.length - 5} more files`);
    }
  }

  return uniqueFiles.sort((a, b) => {
    return a.path > b.path ? 1 : -1;
  });
}

/**
 * List remote files with enhanced source information
 * Only uses the latest manifest event (by created_at timestamp)
 */
export async function listRemoteFilesWithSources(
  relays: string[],
  pubkey: string,
): Promise<FileEntryWithSources[]> {
  // Fetch manifest events from all relays (including discovered ones via kind 10002)
  const manifest = await fetchSiteManifestEvent(relays, pubkey);

  if (!manifest) {
    log.warn(`No manifest events found for user ${pubkey} from any relays`);
    return [];
  }

  // Get all relays that were used to fetch the manifest events
  // fetchSiteManifestEvents already merges discovered relays via resolveRelaysWithKind10002
  relays = relaySet(relays, await getUserOutboxes(pubkey));

  // Extract files only from the latest manifest event
  const fileEntries: FileEntryWithSources[] = [];
  const pathTags = manifest.tags.filter((tag) => tag[0] === "path");

  for (const pathTag of pathTags) {
    // Path tag format: ["path", "/absolute/path", "sha256hash"]
    if (pathTag.length >= 3) {
      const path = pathTag[1];
      const sha256 = pathTag[2];

      if (path && sha256) {
        fileEntries.push({
          path,
          sha256,
          eventId: manifest.id,
          event: manifest,
          foundOnRelays: Array.from(getSeenRelays(manifest) ?? []),
          availableOnServers: [],
        });
      }
    }
  }

  return fileEntries.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Create a site manifest event (NIP-XX)
 * @param signer - Signer for the event
 * @param pubkey - Public key of the site owner
 * @param files - Array of file path mappings (path -> sha256)
 * @param id - Optional site identifier for named sites (kind 35128). If not provided, creates root site (kind 15128)
 * @param metadata - Optional metadata (title, description, servers, relays)
 */
export async function createSiteManifestEvent(
  signer: ISigner,
  pubkey: string,
  files: FilePathMapping[],
  id?: string,
  metadata?: SiteManifestMetadata,
): Promise<NostrEvent> {
  const tags: string[][] = [];

  // Add d tag for named sites (kind 35128)
  if (id) {
    tags.push(["d", id]);
  }

  // Add path tags for all files
  for (const file of files) {
    const normalizedPath = file.path.startsWith("/") ? file.path : `/${file.path}`;
    tags.push(["path", normalizedPath, file.sha256]);
  }

  // Add optional server tags
  if (metadata?.servers && metadata.servers.length > 0) {
    for (const server of metadata.servers) {
      tags.push(["server", server]);
    }
  }

  // Add optional relay tags
  if (metadata?.relays && metadata.relays.length > 0) {
    for (const relay of metadata.relays) {
      tags.push(["relay", relay]);
    }
  }

  // Add optional title and description
  if (metadata?.title) {
    tags.push(["title", metadata.title]);
  }
  if (metadata?.description) {
    tags.push(["description", metadata.description]);
  }

  tags.push(["client", "nsyte"]);

  // Use kind 35128 for named sites, 15128 for root site
  const kind = id ? NSITE_NAME_SITE_KIND : NSITE_ROOT_SITE_KIND;

  const eventTemplate = {
    kind,
    pubkey: pubkey,
    created_at: unixNow(),
    tags,
    content: "",
  };

  return await signer.signEvent(eventTemplate);
}

/** Create a delete event (NIP-09) */
export async function createDeleteEvent(
  signer: ISigner,
  eventIds: string[],
): Promise<NostrEvent> {
  const draft = await buildEvent(
    { kind: kinds.EventDeletion },
    { client: { name: "nsyte" } },
    setDeleteEvents(eventIds),
  );

  return await signer.signEvent(draft);
}

/**
 * Create a NIP-89 app handler event (kind 31990)
 * This announces that this nsite can handle/display specific event kinds
 */
export async function createAppHandlerEvent(
  signer: ISigner,
  kinds: number[],
  handlers: {
    web?: {
      url: string;
      patterns?: Array<{ url: string; entities?: string[] }>;
    };
    android?: string;
    ios?: string;
    macos?: string;
    windows?: string;
    linux?: string;
  },
  metadata?: Partial<ProfileContent>,
  handlerId?: string,
): Promise<NostrEvent> {
  // Use provided handlerId or default to "default"
  const normalizedId = handlerId || "default";

  const tags: string[][] = [
    ["d", normalizedId], // Stable identifier for this handler
    ["client", "nsyte"],
  ];

  // Add k tags for each supported event kind
  for (const kind of kinds) {
    tags.push(["k", kind.toString()]);
  }

  // Add web handler URLs following NIP-89 spec
  if (handlers.web) {
    const { url, patterns } = handlers.web;
    if (patterns && patterns.length > 0) {
      // Use custom patterns if provided - these should be full URLs
      for (const pattern of patterns) {
        if (pattern.entities && pattern.entities.length > 0) {
          // Add handler with specific entity types
          for (const entity of pattern.entities) {
            tags.push(["web", pattern.url, entity]);
          }
        } else {
          // Add handler without entity type restriction
          tags.push(["web", pattern.url]);
        }
      }
    } else {
      // Default patterns following NIP-89 spec
      tags.push(["web", `${url}/e/<bech32>`, "nevent"]);
      tags.push(["web", `${url}/a/<bech32>`, "naddr"]);
      tags.push(["web", `${url}/p/<bech32>`, "nprofile"]);
      tags.push(["web", `${url}/e/<bech32>`]); // Generic event handler
    }
  }

  // Add native platform handlers
  if (handlers.android) tags.push(["android", handlers.android]);
  if (handlers.ios) tags.push(["ios", handlers.ios]);
  if (handlers.macos) tags.push(["macos", handlers.macos]);
  if (handlers.windows) tags.push(["windows", handlers.windows]);
  if (handlers.linux) tags.push(["linux", handlers.linux]);

  // NIP-01 style metadata content (ProfileContent)
  let content = "";
  if (metadata && Object.keys(metadata).length > 0) {
    const profile: Partial<ProfileContent> = {};

    // Build ProfileContent object
    if (metadata.name) profile.name = metadata.name;
    if (metadata.about) profile.about = metadata.about;
    if (metadata.picture) profile.picture = metadata.picture;

    if (Object.keys(profile).length > 0) {
      content = JSON.stringify(profile);
    }
  }

  const eventTemplate: NostrEventTemplate = {
    kind: 31990,
    created_at: unixNow(),
    tags,
    content,
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a kind 0 profile metadata event
 * Replaces the entire profile with the provided content (NIP-01)
 */
export async function createProfileEvent(
  signer: ISigner,
  profile: Partial<ProfileContent>,
): Promise<NostrEvent> {
  // Build the profile content object
  const profileContent: Partial<ProfileContent> = {};
  
  if (profile.name) profileContent.name = profile.name;
  if (profile.display_name) profileContent.display_name = profile.display_name;
  if (profile.about) profileContent.about = profile.about;
  if (profile.picture) profileContent.picture = profile.picture;
  if (profile.banner) profileContent.banner = profile.banner;
  if (profile.website) profileContent.website = profile.website;
  if (profile.nip05) profileContent.nip05 = profile.nip05;
  if (profile.lud16) profileContent.lud16 = profile.lud16;
  if (profile.lud06) profileContent.lud06 = profile.lud06;

  const eventTemplate: NostrEventTemplate = {
    kind: kinds.Metadata,
    created_at: unixNow(),
    tags: [],
    content: JSON.stringify(profileContent),
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a kind 10002 relay list event (NIP-65)
 * All relays are marked as outbox (write) relays only
 */
export async function createRelayListEvent(
  signer: ISigner,
  relays: string[],
): Promise<NostrEvent> {
  // Add all relays as outbox (write) relays
  // NIP-65: ["r", <relay-url>, "write"]
  const tags: string[][] = relays.map((relay) => ["r", relay, "write"]);

  const eventTemplate: NostrEventTemplate = {
    kind: kinds.RelayList,
    created_at: unixNow(),
    tags,
    content: "",
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a kind 10063 Blossom server list event
 */
export async function createServerListEvent(
  signer: ISigner,
  servers: string[],
): Promise<NostrEvent> {
  // Add servers as tags
  // Format: ["server", <server-url>]
  const tags: string[][] = servers.map((server) => ["server", server]);

  const eventTemplate: NostrEventTemplate = {
    kind: BLOSSOM_SERVER_LIST_KIND,
    created_at: unixNow(),
    tags,
    content: "",
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a NIP-89 recommendation event (kind 31989)
 * This is published by users to recommend an app for handling specific event kinds
 */
export async function createAppRecommendationEvent(
  signer: ISigner,
  eventKind: number,
  handlerAddress: {
    pubkey: string;
    relay?: string;
    identifier: string;
  },
): Promise<NostrEvent> {
  const tags: string[][] = [
    ["d", eventKind.toString()],
    [
      "a",
      `31990:${handlerAddress.pubkey}:${handlerAddress.identifier}`,
      handlerAddress.relay || "",
    ],
    ["client", "nsyte"],
  ];

  const eventTemplate: NostrEventTemplate = {
    kind: 31989,
    created_at: unixNow(),
    tags,
    content: "",
  };

  return await signer.signEvent(eventTemplate);
}

/** Publish events to relays */
export async function publishEventsToRelays(
  relays: string[],
  events: NostrEvent[],
): Promise<boolean> {
  if (events.length === 0) {
    log.warn("No events to publish");
    return false;
  }

  if (relays.length === 0) {
    log.error("No relays provided for publishing");
    return false;
  }

  log.debug(`Publishing ${events.length} events to ${relays.length} relays`);

  try {
    const failed: NostrEvent[] = [];

    for (const event of events) {
      try {
        const results = await pool
          .publish(relays, event, { retries: 1, timeout: 15 * 1000 });
        log.debug(
          `Published event ${event.id.substring(0, 8)}... to ${
            relays.join(
              ", ",
            )
          }`,
        );

        const success = results.some((r) => r.ok);
        if (!success) throw new Error(`Failed to publish any relay`);
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        log.error(
          `Failed to publish to relay ${relays.join(", ")}: ${errorMessage}`,
        );

        failed.push(event);
      }
    }

    if (failed.length === 0) {
      log.info(`Successfully published to ${relays.length} relays`);
      return true;
    } else {
      log.error(`Failed to publish ${failed.length} events`);
      return false;
    }
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    log.error(`Error publishing events: ${errorMessage}`);
    return false;
  }
}

/**
 * Delete remote files by creating and publishing delete events
 * Note: Since files come from manifest events, this deletes the entire manifest events
 * that contain the specified files
 */
export async function purgeRemoteFiles(
  relays: string[],
  files: FileEntry[],
  signer: ISigner,
): Promise<number> {
  if (files.length === 0) {
    return 0;
  }

  // Collect unique manifest event IDs (multiple files can come from same manifest)
  const eventsToDelete = new Set<string>();

  for (const file of files) {
    if (file.event?.id) {
      eventsToDelete.add(file.event.id);
    }
  }

  if (eventsToDelete.size === 0) {
    return 0;
  }

  try {
    const deleteEvent = await createDeleteEvent(signer, Array.from(eventsToDelete));
    const success = await publishEventsToRelays(
      [...relays],
      [deleteEvent],
    );

    if (success) {
      return eventsToDelete.size;
    } else {
      return 0;
    }
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    log.error(`Error purging remote files: ${errorMessage}`);
    return 0;
  }
}
