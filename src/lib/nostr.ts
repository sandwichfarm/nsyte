import { schnorr } from "@noble/curves/secp256k1";
import { encodeHex } from "@std/encoding/hex";
import { EventStore, mapEventsToStore, mapEventsToTimeline, simpleTimeout } from "applesauce-core";
import { getTagValue } from "applesauce-core/helpers";
import { RelayPool } from "applesauce-relay/pool";
import { NostrConnectSigner } from "applesauce-signers";
import { lastValueFrom, toArray } from "rxjs";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "./constants.ts";
import { getErrorMessage } from "./error-utils.ts";
import { createLogger } from "./logger.ts";
import type { Signer } from "./upload.ts";
import type { NostrEvent, EventTemplate } from "nostr-tools";

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
  data?: Uint8Array;
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
export type { NostrEvent }

/** Interface for unsigned nostr events */
export type NostrEventTemplate = EventTemplate & { pubkey?: string }

/**
 * Create a NIP-46 client from a bunker URL
 */
export async function createNip46ClientFromUrl(bunkerUrl: string): Promise<{
  client: Signer;
  userPubkey: string;
}> {
  try {
    log.info(`Connecting to bunker: ${bunkerUrl}`);
    const bunkerSigner = await NostrConnectSigner.fromBunkerURI(bunkerUrl);
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

  try {
    // Create tmp event store to deduplicate events
    const store = new EventStore();
    return await lastValueFrom(
      pool
        .request(relays, {
          kinds: [NSITE_KIND],
          authors: [pubkey],
        })
        .pipe(mapEventsToStore(store), mapEventsToTimeline()),
    );
  } catch (error) {
    log.error(`Error fetching events: ${getErrorMessage(error)}`);
    return [];
  }
}

/** Get a list of remote files for a user */
export async function listRemoteFiles(
  relays: string[],
  pubkey: string,
): Promise<FileEntry[]> {
  const events = await fetchFileEvents(relays, pubkey);

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
    const sha256 = getTagValue(event, "x") || getTagValue(event, "sha256");

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

    if (existingIndex === -1) {
      return [...acc, current];
    } else {
      const existing = acc[existingIndex];

      if (
        (existing.event?.created_at || 0) < (current.event?.created_at || 0)
      ) {
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

/** Publish events to relays */
export async function publishEventsToRelays(
  relays: string[],
  events: NostrEvent[],
  messageCollector?: any,
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

        // TODO: find out what this actually does
        for (const result of results) {
          if (messageCollector && !result.ok && result.message) {
            messageCollector.addRelayMessage(
              "error",
              result.from,
              `Failed to publish: ${result.message}`,
            );
          }
        }

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
  messageCollector?: any,
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
      messageCollector,
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
