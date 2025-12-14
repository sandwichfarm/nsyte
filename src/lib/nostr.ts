import { schnorr } from "@noble/curves/secp256k1";
import { encodeHex } from "@std/encoding/hex";
import { EventStore, mapEventsToStore, mapEventsToTimeline, simpleTimeout } from "applesauce-core";
import { getTagValue } from "applesauce-core/helpers";
import { RelayPool } from "applesauce-relay/pool";
import { NostrConnectSigner } from "applesauce-signers";
import { lastValueFrom, timer } from "rxjs";
import { toArray } from "rxjs/operators";
import { takeUntil } from "rxjs/operators";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "./constants.ts";
import { getErrorMessage } from "./error-utils.ts";
import { createLogger } from "./logger.ts";
import type { Signer } from "./upload.ts";
import type { ByteArray } from "./types.ts";
import type { EventTemplate, NostrEvent } from "nostr-tools";

const log = createLogger("nostr");

export const NSITE_KIND = 34128;
export const USER_BLOSSOM_SERVER_LIST_KIND = 10063;

export const pool = new RelayPool();

export { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS };

/**
 * Profile interface for nostr profiles
 */
export interface Profile {
  name?: string;
  about?: string;
  picture?: string;
  display_name?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
  banner?: string;
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
  event?: NostrEvent;
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

/** Parse a bunker URL into its components */
export function parseBunkerUrl(bunkerUrl: string): {
  pubkey: string;
  relays: string[];
  secret?: string;
} {
  const parsed = NostrConnectSigner.parseBunkerURI(bunkerUrl);
  return {
    pubkey: parsed.remote,
    relays: parsed.relays,
    secret: parsed.secret,
  };
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
  client: Signer;
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

/** Fetch file events from nostr relays */
export async function fetchFileEvents(
  relays: string[],
  pubkey: string,
): Promise<NostrEvent[]> {
  log.debug(`Fetching file events for ${pubkey} from ${relays.join(", ")}`);
  // Keep timeouts reasonable to avoid long waits
  const REQUEST_TIMEOUT_MS = 12000;

  try {
    // Create tmp event store to deduplicate events
    const store = new EventStore();
    const events = await lastValueFrom(
      pool
        .request(relays, {
          kinds: [NSITE_KIND],
          authors: [pubkey],
        })
        .pipe(
          simpleTimeout(7000),
          mapEventsToStore(store),
          mapEventsToTimeline(),
          takeUntil(timer(REQUEST_TIMEOUT_MS)), // Force completion even if a relay never sends EOSE
        ),
      { defaultValue: [] },
    );
    return events;
  } catch (error) {
    log.error(`Error fetching events: ${getErrorMessage(error)}`);
    return [];
  }
}

/** Fetch profile event (kind 0) from nostr relays */
export async function fetchProfileEvent(
  relays: string[],
  pubkey: string,
): Promise<NostrEvent | null> {
  log.debug(`Fetching profile for ${pubkey} from ${relays.join(", ")}`);

  try {
    const store = new EventStore();
    const events = await lastValueFrom(
      pool
        .request(relays, {
          kinds: [0],
          authors: [pubkey],
        })
        .pipe(
          simpleTimeout(5000),
          mapEventsToStore(store),
          mapEventsToTimeline(),
        ),
      { defaultValue: [] },
    );
    return events.length > 0 ? events[0] : null;
  } catch (error) {
    log.error(`Error fetching profile: ${getErrorMessage(error)}`);
    return null;
  }
}

/** Fetch relay list event (kind 10002) from nostr relays */
export async function fetchRelayListEvent(
  relays: string[],
  pubkey: string,
): Promise<NostrEvent | null> {
  log.debug(`Fetching relay list for ${pubkey} from ${relays.join(", ")}`);

  try {
    const store = new EventStore();
    const events = await lastValueFrom(
      pool
        .request(relays, {
          kinds: [10002],
          authors: [pubkey],
        })
        .pipe(
          simpleTimeout(5000),
          mapEventsToStore(store),
          mapEventsToTimeline(),
        ),
      { defaultValue: [] },
    );
    return events.length > 0 ? events[0] : null;
  } catch (error) {
    log.error(`Error fetching relay list: ${getErrorMessage(error)}`);
    return null;
  }
}

/** Fetch release events from nostr relays */
export async function fetchReleaseEvents(
  relays: string[],
  pubkey: string,
  dTag: string,
): Promise<NostrEvent[]> {
  log.debug(`Fetching release events for ${pubkey} with d-tag ${dTag} from ${relays.join(", ")}`);

  try {
    // Create tmp event store to deduplicate events
    const store = new EventStore();
    return await lastValueFrom(
      pool
        .request(relays, {
          kinds: [30063],
          authors: [pubkey],
          "#d": [dTag],
        })
        .pipe(mapEventsToStore(store), mapEventsToTimeline()),
    );
  } catch (error) {
    log.error(`Error fetching release events: ${getErrorMessage(error)}`);
    return [];
  }
}

/** Fetch file metadata events from nostr relays */
export async function fetchFileMetadataEvents(
  relays: string[],
  pubkey: string,
  eventIds: string[],
): Promise<NostrEvent[]> {
  log.debug(`Fetching file metadata events for ${eventIds.length} IDs from ${relays.join(", ")}`);

  try {
    // Create tmp event store to deduplicate events
    const store = new EventStore();
    return await lastValueFrom(
      pool
        .request(relays, {
          kinds: [1063],
          authors: [pubkey],
          ids: eventIds,
        })
        .pipe(mapEventsToStore(store), mapEventsToTimeline()),
    );
  } catch (error) {
    log.error(`Error fetching file metadata events: ${getErrorMessage(error)}`);
    return [];
  }
}

/**
 * Fetch NIP-82 software application events
 */
export async function fetchSoftwareApplicationEvent(
  relays: string[],
  pubkey: string,
  appId: string,
): Promise<NostrEvent | null> {
  log.debug(`Fetching software application event for ${appId} from ${relays.join(", ")}`);

  try {
    // Create tmp event store to deduplicate events
    const store = new EventStore();
    const events = await lastValueFrom(
      pool
        .request(relays, {
          kinds: [32267],
          authors: [pubkey],
          "#d": [appId],
        })
        .pipe(mapEventsToStore(store), mapEventsToTimeline()),
    );

    // Return the most recent event
    return events.length > 0 ? events[0] : null;
  } catch (error) {
    log.error(`Error fetching software application event: ${getErrorMessage(error)}`);
    return null;
  }
}

/** Get a list of remote files for a user */
export async function listRemoteFiles(
  relays: string[],
  pubkey: string,
): Promise<FileEntry[]> {
  const events = await fetchFileEvents(relays, pubkey);
  const now = Math.floor(Date.now() / 1000);

  if (events.length === 0) {
    log.warn(`No file events found for user ${pubkey} from any relays`);
    log.info("This could mean one of these things:");
    log.info("1. This is the first time you're uploading files for this user");
    log.info("2. The relays are not responding or are unreachable");
    log.info(
      "3. The previous uploads were not successfully published to relays",
    );

    return [];
  }

  const fileEntries: FileEntry[] = [];

  for (const event of events) {
    const path = getTagValue(event, "d");
    const sha256 = getTagValue(event, "x");

    if (path && sha256) {
      fileEntries.push({
        path,
        sha256,
        event,
        size: 0,
      });
    }
  }

  const uniqueFiles = fileEntries.reduce((acc, current) => {
    const existingIndex = acc.findIndex((file) => file.path === current.path);
    const currentTs = Math.min(current.event?.created_at ?? 0, now);

    if (existingIndex === -1) {
      return [...acc, current];
    } else {
      const existing = acc[existingIndex];
      const existingTs = Math.min(existing.event?.created_at ?? 0, now);

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

/** Publish an nsite event to nostr */
export async function createNsiteEvent(
  signer: Signer,
  pubkey: string,
  path: string,
  sha256: string,
): Promise<NostrEvent> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const eventTemplate = {
    kind: NSITE_KIND,
    pubkey: pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", normalizedPath],
      ["x", sha256],
      ["client", "nsyte"],
    ],
    content: "",
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a profile event (NIP-01)
 */
export async function createProfileEvent(
  signer: Signer,
  profile: Profile,
): Promise<NostrEvent> {
  const eventTemplate = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["client", "nsyte"]],
    content: JSON.stringify(profile),
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a relay list event (NIP-01, NIP-65)
 */
export async function createRelayListEvent(
  signer: Signer,
  relays: string[],
): Promise<NostrEvent> {
  const tags = relays.map((relay) => ["r", relay, "read", "write"]);
  tags.push(["client", "nsyte"]);

  const eventTemplate = {
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a server list event
 */
export async function createServerListEvent(
  signer: Signer,
  servers: string[],
): Promise<NostrEvent> {
  const tags = servers.map((server) => ["server", server]);
  tags.push(["client", "nsyte"]);

  const eventTemplate = {
    kind: USER_BLOSSOM_SERVER_LIST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };

  return await signer.signEvent(eventTemplate);
}

/** Create a delete event (NIP-09) */
export async function createDeleteEvent(
  signer: Signer,
  eventIds: string[],
): Promise<NostrEvent> {
  const tags = eventIds.map((id) => ["e", id]);
  tags.push(["client", "nsyte"]);

  const eventTemplate: NostrEventTemplate = {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "Deleted by nsyte-cli",
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a NIP-89 app handler event (kind 31990)
 * This announces that this nsite can handle/display specific event kinds
 */
export async function createAppHandlerEvent(
  signer: Signer,
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
    created_at: Math.floor(Date.now() / 1000),
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
  signer: Signer,
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
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a NIP-94 file metadata event (kind 1063)
 * This announces file metadata for a release archive
 */
export async function createFileMetadataEvent(
  signer: Signer,
  file: {
    url: string;
    mimeType: string;
    sha256: string;
    size: number;
    platforms?: string[];
  },
  description: string,
): Promise<NostrEvent> {
  const tags: string[][] = [
    ["url", file.url],
    ["m", file.mimeType],
    ["x", file.sha256],
    ["size", file.size.toString()],
    ["client", "nsyte"],
  ];

  // Add platform tags if provided
  if (file.platforms) {
    file.platforms.forEach((platform) => tags.push(["f", platform]));
  }

  const eventTemplate: NostrEventTemplate = {
    kind: 1063,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: description,
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a NIP-82 software application event (kind 32267)
 * This describes the software application metadata
 */
export async function createSoftwareApplicationEvent(
  signer: Signer,
  appId: string,
  metadata: {
    name: string;
    summary?: string;
    content?: string;
    icon?: string;
    image?: string[];
    tags?: string[];
    url?: string;
    repository?: string;
    platforms: string[];
    license?: string;
  },
): Promise<NostrEvent> {
  const tags: string[][] = [
    ["d", appId],
    ["name", metadata.name],
    ["client", "nsyte"],
  ];

  if (metadata.summary) {
    tags.push(["summary", metadata.summary]);
  }
  if (metadata.icon) {
    tags.push(["icon", metadata.icon]);
  }
  if (metadata.image) {
    metadata.image.forEach((img) => tags.push(["image", img]));
  }
  if (metadata.tags) {
    metadata.tags.forEach((tag) => tags.push(["t", tag]));
  }
  if (metadata.url) {
    tags.push(["url", metadata.url]);
  }
  if (metadata.repository) {
    tags.push(["repository", metadata.repository]);
  }
  if (metadata.license) {
    tags.push(["license", metadata.license]);
  }

  // Add platform tags (required)
  metadata.platforms.forEach((platform) => tags.push(["f", platform]));

  const eventTemplate: NostrEventTemplate = {
    kind: 32267,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: metadata.content || "",
  };

  return await signer.signEvent(eventTemplate);
}

/**
 * Create a NIP-51 release artifact set event (kind 30063)
 * This groups file metadata events for a specific release version
 */
export async function createReleaseArtifactSetEvent(
  signer: Signer,
  projectName: string,
  version: string,
  fileMetadataEventIds: string | string[],
  releaseNotes: string,
  applicationId?: string,
): Promise<NostrEvent> {
  const dTag = `${projectName}@${version}`;

  const tags: string[][] = [
    ["d", dTag],
    ["version", version],
    ["client", "nsyte"],
  ];

  // Add reference to parent application event if provided
  if (applicationId) {
    const pubkey = await signer.getPublicKey();
    tags.push(["a", `32267:${pubkey}:${applicationId}`]);
  }

  // Add event references - support both single ID and array of IDs
  const eventIds = Array.isArray(fileMetadataEventIds)
    ? fileMetadataEventIds
    : [fileMetadataEventIds];
  for (const eventId of eventIds) {
    tags.push(["e", eventId]); // Reference to NIP-94 file metadata events
  }

  const eventTemplate: NostrEventTemplate = {
    kind: 30063,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: releaseNotes,
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
        const results = await lastValueFrom(
          pool
            .publish(relays, event, { retries: 1 })
            // Add a 15s timeout to the publish
            .pipe(simpleTimeout(15000), toArray()),
        );
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
 */
export async function purgeRemoteFiles(
  relays: string[],
  files: FileEntry[],
  signer: Signer,
): Promise<number> {
  if (files.length === 0) {
    return 0;
  }

  const eventsToDelete: string[] = [];

  for (const file of files) {
    if (file.event?.id) {
      eventsToDelete.push(file.event.id);
    }
  }

  if (eventsToDelete.length === 0) {
    return 0;
  }

  try {
    const deleteEvent = await createDeleteEvent(signer, eventsToDelete);
    const success = await publishEventsToRelays(
      [...relays],
      [deleteEvent],
    );

    if (success) {
      return eventsToDelete.length;
    } else {
      return 0;
    }
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    log.error(`Error purging remote files: ${errorMessage}`);
    return 0;
  }
}
