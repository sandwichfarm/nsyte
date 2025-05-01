import { createLogger } from "./logger.ts";
import { encodeHex } from "std/encoding/hex.ts";
import { Signer } from "./upload.ts";
import { schnorr } from "@noble/curves/secp256k1";
import { BunkerSigner } from "./bunker.ts";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "./constants.ts";

const log = createLogger("nostr");

export const NSITE_KIND = 34128;
export const USER_BLOSSOM_SERVER_LIST_KIND = 10063;

export { RELAY_DISCOVERY_RELAYS, NSYTE_BROADCAST_RELAYS };

/**
 * Profile interface for NOSTR profiles
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
 * Generate a new NOSTR key pair
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
 * Parse a bunker URL into its components
 */
export function parseBunkerUrl(bunkerUrl: string): {
  pubkey: string;
  relays: string[];
  secret?: string;
} {
  if (!bunkerUrl.startsWith("bunker://")) {
    throw new Error("Invalid bunker URL format. Must start with bunker://");
  }
  
  try {
    const url = new URL(bunkerUrl.replace("bunker://", "https://"));
    const pubkey = url.hostname;
    
    const relays: string[] = [];
    url.searchParams.getAll("relay").forEach((relay) => {
      relays.push(relay);
    });
    
    const secret = url.searchParams.get("secret") || undefined;
    
    return { pubkey, relays, secret };
  } catch (error) {
    log.error(`Failed to parse bunker URL: ${bunkerUrl}`);
    throw new Error("Invalid bunker URL format");
  }
}

/**
 * Basic NOSTR event interface
 * This is a simplified version for this example
 */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Interface for NOSTR event template (unsigned)
 */
export interface NostrEventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey?: string;
}

/**
 * Create a NIP-46 client from a bunker URL
 */
export async function createNip46ClientFromUrl(bunkerUrl: string): Promise<{
  client: Signer;
  userPubkey: string;
}> {
  try {
    log.info(`Connecting to bunker: ${bunkerUrl}`);
    const bunkerSigner = await BunkerSigner.connect(bunkerUrl);
    const userPubkey = bunkerSigner.getPublicKey();
    
    log.info(`Connected to bunker, user pubkey: ${userPubkey}`);
    return { client: bunkerSigner, userPubkey };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to connect to bunker: ${errorMessage}`);
    throw new Error(`Failed to connect to bunker: ${errorMessage}`);
  }
}

/**
 * Extract a tag value from an event
 */
export function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  for (const tag of event.tags) {
    if (tag.length >= 2 && tag[0] === tagName) {
      return tag[1];
    }
  }
  return undefined;
}

/**
 * Connect to a NOSTR relay and perform an operation
 */
export async function connectToRelay<T>(
  relay: string,
  operation: (socket: WebSocket) => Promise<T>,
  options = { timeout: 10000, retries: 2 }
): Promise<T | null> {
  let attempt = 0;
  const maxAttempts = options.retries + 1;
  
  while (attempt < maxAttempts) {
    attempt++;
    const isRetry = attempt > 1;
    
    if (isRetry) {
      log.debug(`Retrying connection to relay ${relay} (attempt ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
    
    const result = await connectToRelayOnce(relay, operation, options.timeout);
    if (result !== null) {
      return result;
    }
    
  }
  
  log.warn(`Failed to connect to relay ${relay} after ${maxAttempts} attempts`);
  return null;
}

/**
 * Single attempt to connect to a NOSTR relay
 */
async function connectToRelayOnce<T>(
  relay: string,
  operation: (socket: WebSocket) => Promise<T>,
  timeout: number
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let resolved = false;
    let socket: WebSocket | null = null;
    
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        log.warn(`Timeout connecting to relay ${relay}`);
        if (socket) {
          try {
            socket.close();
          } catch (e) {
          }
        }
        resolved = true;
        resolve(null);
      }
    }, timeout);
    
    try {
      socket = new WebSocket(relay);
      
      socket.onopen = async () => {
        try {
          if (socket) {
            const result = await operation(socket);
            clearTimeout(timeoutId);
            if (!resolved) {
              resolved = true;
              resolve(result);
            }
          } else {
            log.error(`Socket became null after connection to ${relay}`);
            clearTimeout(timeoutId);
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error(`Error performing operation on relay ${relay}: ${errorMessage}`);
          clearTimeout(timeoutId);
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }
      };
      
      socket.onerror = (error: Event) => {
        log.debug(`WebSocket error with relay ${relay}: ${String(error)}`);
        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      };
      
      socket.onclose = () => {
        log.debug(`WebSocket closed for relay ${relay}`);
        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to connect to relay ${relay}: ${errorMessage}`);
      clearTimeout(timeoutId);
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }
  });
}

/**
 * Fetch file events from NOSTR relays
 */
export async function fetchFileEvents(
  relays: string[],
  pubkey: string
): Promise<NostrEvent[]> {
  log.debug(`Fetching file events for ${pubkey} from ${relays.join(", ")}`);
  
  const events: NostrEvent[] = [];
  const attemptedRelays = new Set<string>();
  let successfulRelays = 0;
  
  try {
    await Promise.all(
      relays.map(async (relay) => {
        try {
          attemptedRelays.add(relay);
          const socket = new WebSocket(relay);
          
          const eventsPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              socket.close();
              reject(new Error(`Timeout connecting to relay ${relay}`));
            }, 15000);
            
            socket.onopen = () => {
              const subId = `sub_${Math.random().toString(36).substring(2, 15)}`;
              
              const subscriptionMessage = JSON.stringify([
                "REQ",
                subId,
                {
                  kinds: [NSITE_KIND],
                  authors: [pubkey],
                }
              ]);
              
              socket.send(subscriptionMessage);
              
              socket.onmessage = (event) => {
                try {
                  const message = JSON.parse(event.data);
                  
                  if (Array.isArray(message) && message.length >= 2) {
                    if (message[0] === "EVENT" && message[1] === subId && message[2]) {
                      events.push(message[2]);
                    } else if (message[0] === "EOSE" && message[1] === subId) {
                      clearTimeout(timeout);
                      socket.close();
                      successfulRelays++;
                      resolve();
                    }
                  }
                } catch (err) {
                  log.error(`Error processing message from relay ${relay}: ${String(err)}`);
                }
              };
            };
            
            socket.onerror = (error) => {
              clearTimeout(timeout);
              log.error(`WebSocket error with relay ${relay}: ${String(error)}`);
              reject(error);
            };
            
            socket.onclose = () => {
              clearTimeout(timeout);
              resolve();
            };
          });
          
          await eventsPromise;
        } catch (error) {
          log.error(`Failed to fetch events from relay ${relay}: ${String(error)}`);
        }
      })
    );
    
    if (successfulRelays === 0 && attemptedRelays.size < relays.length) {
      const remainingRelays = relays.filter(r => !attemptedRelays.has(r));
      
      log.warn(`No relays responded in parallel fetch, trying ${remainingRelays.length} remaining relays sequentially`);
      
      for (const relay of remainingRelays) {
        try {
          attemptedRelays.add(relay);
          
          const socket = new WebSocket(relay);
          
          const eventsPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              socket.close();
              reject(new Error(`Timeout connecting to relay ${relay}`));
            }, 20000);
            
            socket.onopen = () => {
              const subId = `sub_${Math.random().toString(36).substring(2, 15)}`;
              
              const subscriptionMessage = JSON.stringify([
                "REQ",
                subId,
                {
                  kinds: [NSITE_KIND],
                  authors: [pubkey],
                }
              ]);
              
              socket.send(subscriptionMessage);
              
              socket.onmessage = (event) => {
                try {
                  const message = JSON.parse(event.data);
                  
                  if (Array.isArray(message) && message.length >= 2) {
                    if (message[0] === "EVENT" && message[1] === subId && message[2]) {
                      events.push(message[2]);
                    } else if (message[0] === "EOSE" && message[1] === subId) {
                      clearTimeout(timeout);
                      socket.close();
                      successfulRelays++;
                      resolve();
                    }
                  }
                } catch (err) {
                  log.error(`Error processing message from relay ${relay}: ${String(err)}`);
                }
              };
            };
            
            socket.onerror = (error) => {
              clearTimeout(timeout);
              log.error(`WebSocket error with relay ${relay}: ${String(error)}`);
              reject(error);
            };
            
            socket.onclose = () => {
              clearTimeout(timeout);
              resolve();
            };
          });
          
          await eventsPromise;
          
          if (events.length > 0) {
            log.debug(`Got ${events.length} events from relay ${relay}, stopping sequential fetch`);
            break;
          }
        } catch (error) {
          log.error(`Failed to fetch events from relay ${relay} (sequential): ${String(error)}`);
        }
      }
    }
    
    log.debug(`Fetched ${events.length} events from ${successfulRelays} successful relays out of ${attemptedRelays.size} attempted`);
    return events;
  } catch (error) {
    log.error(`Error fetching events: ${String(error)}`);
    return [];
  }
}

/**
 * Get a list of remote files for a user
 */
export async function listRemoteFiles(relays: string[], pubkey: string): Promise<FileEntry[]> {
  const events = await fetchFileEvents(relays, pubkey);
  
  if (events.length === 0) {
    log.warn(`No file events found for user ${pubkey} from any relays`);
    log.info("This could mean one of these things:");
    log.info("1. This is the first time you're uploading files for this user");
    log.info("2. The relays are not responding or are unreachable");
    log.info("3. The previous uploads were not successfully published to relays");
    
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
    const existingIndex = acc.findIndex(file => file.path === current.path);
    
    if (existingIndex === -1) {
      return [...acc, current];
    } else {
      const existing = acc[existingIndex];
      
      if ((existing.event?.created_at || 0) < (current.event?.created_at || 0)) {
        acc[existingIndex] = current;
      }
      
      return acc;
    }
  }, [] as FileEntry[]);
  
  log.info(`Found ${uniqueFiles.length} unique remote files for user ${pubkey}`);
  
  if (uniqueFiles.length > 0) {
    const truncatedList = uniqueFiles.slice(0, Math.min(5, uniqueFiles.length));
    log.debug("Remote files found (sample):");
    truncatedList.forEach(file => {
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
 * Publish an nsite event to NOSTR
 */
export async function publishNsiteEvent(
  signer: Signer,
  pubkey: string,
  path: string,
  sha256: string
): Promise<NostrEvent> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  
  const eventTemplate: NostrEventTemplate = {
    kind: NSITE_KIND,
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