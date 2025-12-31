import { schnorr } from "@noble/curves/secp256k1";
import { encodeHex } from "@std/encoding/hex";
import { BLOSSOM_SERVER_LIST_KIND, getBlossomServersFromList } from "applesauce-common/helpers";
import { EventStore, mapEventsToStore, simpleTimeout } from "applesauce-core";
import { buildEvent } from "applesauce-core/event-factory";
import {
  type EventTemplate,
  type Filter,
  getOutboxes,
  getSeenRelays,
  getTagValue,
  kinds,
  type NostrEvent,
  relaySet,
  unixNow,
} from "applesauce-core/helpers";
import { setDeleteEvents } from "applesauce-core/operations/delete";
import { RelayPool } from "applesauce-relay/pool";
import { type ISigner, NostrConnectSigner } from "applesauce-signers";
import { lastValueFrom, timer } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "./constants.ts";
import { getErrorMessage } from "./error-utils.ts";
import { createLogger } from "./logger.ts";
import { type FilePathMapping, NSITE_NAME_SITE_KIND, NSITE_ROOT_SITE_KIND } from "./manifest.ts";
import type { ByteArray } from "./types.ts";

const log = createLogger("nostr");

// Create a global relay pool for connections
export const pool = new RelayPool();

// Create an in-memory event store for managing events
export const store = new EventStore();

export { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS };

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

/**
 * Basic nostr event interface
 * This is a simplified version for this example
 */
export type { NostrEvent };

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

/** Extract a tag value from an event */
export { getTagValue };

/**
 * Fetches the latest site manifest event for the given pubkey and identifier
 * @param relays - Relays to query (will be merged with kind 10002 discovered relays)
 * @param pubkey - Public key of the site owner
 * @param identifier - Optional site identifier for named sites. If not provided, fetches root site (kind 15128) and all named sites (kind 35128)
 */
export async function fetchSiteManifestEvent(
  relays: string[],
  pubkey: string,
  identifier?: string,
): Promise<NostrEvent | null> {
  // First, fetch kind 10002 to get user's preferred relays
  relays = relaySet(relays, await getUserOutboxes(pubkey));

  log.debug(
    `Fetching site manifest events for ${pubkey} from ${relays.join(", ")}${
      identifier ? ` (site: ${identifier})` : ""
    }`,
  );

  // Keep timeouts reasonable to avoid long waits
  const REQUEST_TIMEOUT_MS = 12000;

  // Build filter based on whether we're fetching a specific named site or all sites
  const filter: Filter = identifier
    ? {
      // Search for named site manifest event
      kinds: [NSITE_NAME_SITE_KIND],
      authors: [pubkey],
      "#d": [identifier],
    }
    : {
      // Search for root site manifest event
      kinds: [NSITE_ROOT_SITE_KIND],
      authors: [pubkey],
    };

  try {
    // Fetch the site manifest event from relays
    await lastValueFrom(
      pool
        .request(relays, filter)
        .pipe(
          simpleTimeout(7000),
          mapEventsToStore(store),
          takeUntil(timer(REQUEST_TIMEOUT_MS)), // Force completion even if a relay never sends EOSE
        ),
      { defaultValue: null },
    );

    const event = store.getReplaceable(
      identifier ? NSITE_NAME_SITE_KIND : NSITE_ROOT_SITE_KIND,
      pubkey,
      identifier,
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
  const existing = store.getReplaceable(
    identifier ? NSITE_NAME_SITE_KIND : NSITE_ROOT_SITE_KIND,
    pubkey,
    identifier,
  );
  if (existing) return existing;

  return await fetchSiteManifestEvent(relays, pubkey, identifier);
}

/** Fetch profile event (kind 0) from nostr relays */
export async function getUserProfile(
  relays: string[],
  pubkey: string,
): Promise<NostrEvent | null> {
  try {
    const existing = store.getReplaceable(kinds.Metadata, pubkey);
    if (existing) return existing;

    log.debug(`Fetching profile for ${pubkey} from ${relays.join(", ")}`);

    // Always check the lookup relays
    relays = relaySet(relays, RELAY_DISCOVERY_RELAYS);

    // Fetch from the users outboxes
    relays = relaySet(relays, await getUserOutboxes(pubkey));

    // Fetch profile event from relays
    await lastValueFrom(
      pool
        .request(relays, {
          kinds: [0],
          authors: [pubkey],
        })
        .pipe(
          simpleTimeout(5000),
          mapEventsToStore(store),
        ),
      { defaultValue: null },
    );

    const event = store.getReplaceable(kinds.Metadata, pubkey);
    return event ?? null;
  } catch (error) {
    log.error(`Error fetching profile: ${getErrorMessage(error)}`);
    return null;
  }
}

/** Fetch relay list event (kind 10002) from nostr relays */
export async function fetchUserRelayList(
  relays: string[],
  pubkey: string,
): Promise<NostrEvent | null> {
  log.debug(`Fetching relay list for ${pubkey} from ${relays.join(", ")}`);

  try {
    // Load events from the relays
    await lastValueFrom(
      pool
        .request(relays, {
          kinds: [kinds.RelayList],
          authors: [pubkey],
        })
        .pipe(
          // Timeout after 5 seconds
          simpleTimeout(5000),
          // Add all events to the store
          mapEventsToStore(store),
        ),
      { defaultValue: null },
    );

    // Get the latest event from the store
    return store.getReplaceable(kinds.RelayList, pubkey) ?? null;
  } catch (error) {
    log.error(`Error fetching relay list: ${getErrorMessage(error)}`);
    return null;
  }
}

/**
 * Resolve relays by fetching kind 10002 (relay list) and merging with provided relays
 * @param pubkey - Public key to fetch relay list for
 * @param providedRelays - Relays provided by user/config
 * @returns Merged list of discovered and provided relays (deduplicated)
 */
export async function getUserOutboxes(
  pubkey: string,
): Promise<string[]> {
  const existing = store.getReplaceable(kinds.RelayList, pubkey);
  if (existing) return getOutboxes(existing);

  // Fetch kind 10002 using discovery relays
  const mailboxes = await fetchUserRelayList(RELAY_DISCOVERY_RELAYS, pubkey);
  if (!mailboxes) {
    log.warn(`No mailboxes found for ${pubkey}`);
    return [];
  }

  const outboxes = getOutboxes(mailboxes);
  log.debug(`Found ${outboxes.length} outboxes for ${pubkey}`);
  return outboxes;
}

/**
 * Resolve servers by fetching kind 10063 (server list) and merging with provided servers
 * @param pubkey - Public key to fetch server list for
 * @param providedServers - Servers provided by user/config
 * @param discoveryRelays - Relays to use for fetching kind 10063 (defaults to RELAY_DISCOVERY_RELAYS)
 * @returns Merged list of discovered and provided servers (deduplicated)
 */
export async function fetchUserServers(
  pubkey: string,
  discoveryRelays: string[] = RELAY_DISCOVERY_RELAYS,
): Promise<string[]> {
  log.debug(`Fetching server list for ${pubkey}`);

  try {
    await lastValueFrom(
      pool
        .request(discoveryRelays, {
          kinds: [BLOSSOM_SERVER_LIST_KIND],
          authors: [pubkey],
        })
        .pipe(
          // Timeout after 5 seconds
          simpleTimeout(5000),
          // Add all events to the store
          mapEventsToStore(store),
        ),
      { defaultValue: null },
    );

    // Get the latest server list
    const list = store.getReplaceable(BLOSSOM_SERVER_LIST_KIND, pubkey);
    if (!list) log.warn(`No server list found for ${pubkey}`);

    const servers = list ? getBlossomServersFromList(list) : [];
    if (servers.length > 0) {
      log.debug(`Found ${servers.length} servers in user's server list`);
    }

    return servers.map((server) => server.toString());
  } catch (error) {
    log.error(`Error fetching server list: ${getErrorMessage(error)}`);
    // Return provided servers if fetch fails
    return [];
  }
}

/** Get the user's servers from the store or fetch them from the relays */
export async function getUserServers(
  pubkey: string,
): Promise<string[]> {
  const existing = store.getReplaceable(BLOSSOM_SERVER_LIST_KIND, pubkey);
  if (existing) return getBlossomServersFromList(existing).map((server) => server.toString());

  return await fetchUserServers(pubkey);
}

/** Get a list of remote files for a user from site manifest events */
export async function listRemoteFiles(
  relays: string[],
  pubkey: string,
  siteIdentifier?: string,
): Promise<FileEntry[]> {
  const manifestEvent = await fetchSiteManifestEvent(relays, pubkey, siteIdentifier);
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
  metadata?: {
    name?: string;
    description?: string;
    picture?: string;
  },
): Promise<NostrEvent> {
  const tags: string[][] = [
    ["d", crypto.randomUUID()], // Random identifier for this handler
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

  // Optional metadata content
  let content = "";
  if (metadata && Object.keys(metadata).length > 0) {
    content = JSON.stringify(metadata);
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
