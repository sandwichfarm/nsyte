import { SimplePool, getEventHash, getPublicKey, nip19, type Event, type Filter } from "npm:nostr-tools";
import { createLogger } from "./logger.ts";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "./constants.ts";
import { generateSecretKey, getEventHash as getEventHashBasic, getPublicKey as getPublicKeyBasic, signEvent as signEventBasic, finalizeEvent } from "npm:@noble/secp256k1";

const log = createLogger("nostr-client");

export const NSITE_KIND = 34128;
export const USER_BLOSSOM_SERVER_LIST_KIND = 10063;

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrEventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey?: string;
}

export interface FileEntry {
  path: string;
  data?: Uint8Array;
  size?: number;
  sha256?: string;
  contentType?: string;
  event?: NostrEvent;
}

const pool = new SimplePool();

/**
 * Get a tag value from an event
 */
export function getTagValue(event: NostrEvent | Event, tagName: string): string | undefined {
  for (const tag of event.tags) {
    if (tag.length >= 2 && tag[0] === tagName) {
      return tag[1];
    }
  }
  return undefined;
}

/**
 * Convert hex to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Sign an event with a private key
 */
function signEvent(event: Event, privateKey: Uint8Array): string {
  const eventHash = getEventHashBasic(event);
  const sig = signEventBasic(eventHash, privateKey);
  return sig;
}

/**
 * Create a signer from a private key
 */
export function createPrivateKeySigner(privateKeyHex: string) {
  let privateKeyBytes: Uint8Array;
  
  if (privateKeyHex.startsWith("nsec")) {
    try {
      const { data } = nip19.decode(privateKeyHex);
      privateKeyBytes = data as Uint8Array;
    } catch (error) {
      throw new Error("Invalid nsec format");
    }
  } else {
    if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
      throw new Error("Invalid private key format");
    }
    privateKeyBytes = hexToBytes(privateKeyHex);
  }
  
  const pubkey = getPublicKeyBasic(privateKeyBytes);
  
  return {
    getPublicKey(): string {
      return pubkey;
    },
    
    async signEvent(template: NostrEventTemplate): Promise<NostrEvent> {
      const event = {
        ...template,
        pubkey,
        id: "",
        sig: "",
      };
      
      event.id = getEventHashBasic(event as unknown as Event);
      
      event.sig = signEvent(event as unknown as Event, privateKeyBytes);
      
      return event as NostrEvent;
    }
  };
}

/**
 * List files available on NOSTR
 */
export async function listRemoteFiles(relays: string[], pubKey: string): Promise<FileEntry[]> {
  log.debug(`Fetching remote files for ${pubKey}`);
  
  try {
    const relayCount = relays.length;
    
    console.log(`Connecting to ${relayCount} relays...`);
    
    const filter: Filter = {
      kinds: [NSITE_KIND],
      authors: [pubKey],
    };
    
    const events: Event[] = await new Promise((resolve) => {
      let received: Event[] = [];
      const sub = pool.sub(relays, [filter]);
      
      sub.on('event', (event: Event) => {
        received.push(event);
      });
      
      setTimeout(() => {
        sub.unsub();
        resolve(received);
      }, 5000);
    });
    
    if (!events || events.length === 0) {
      log.warn(`No file events found for user ${pubKey} from any relays`);
      log.info("This could mean one of these things:");
      log.info("1. This is the first time you're uploading files for this user");
      log.info("2. The relays are not responding or are unreachable");
      log.info("3. The previous uploads were not successfully published to relays");
      return [];
    }
    
    log.info(`Found ${events.length} file events from relays`);
    
    const fileEntries: FileEntry[] = [];
    for (const event of events) {
      const path = getTagValue(event, "d");
      const sha256 = getTagValue(event, "x") || getTagValue(event, "sha256");
      
      if (path && sha256) {
        fileEntries.push({
          path,
          sha256,
          event: event as NostrEvent,
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
    
    log.info(`Found ${uniqueFiles.length} unique remote files for user ${pubKey}`);
    
    return uniqueFiles.sort((a, b) => a.path > b.path ? 1 : -1);
  } catch (error) {
    log.error(`Error fetching remote files: ${error}`);
    return [];
  }
}

/**
 * Publish a NOSTR event to relays
 */
export async function publishEvent(event: NostrEvent, relays: string[] = NSYTE_BROADCAST_RELAYS): Promise<boolean> {
  log.debug(`Publishing event ${event.id} to ${relays.length} relays`);
  
  try {
    // Try to publish to all relays at once, but catch any errors that might occur
    let succeeded = false;
    
    try {
      const pub = pool.publish(relays, event as unknown as Event);
      
      succeeded = await new Promise<boolean>((resolve) => {
        let anySuccess = false;
        
        // Event handler for successful publish to any relay
        pub.on('ok', () => {
          anySuccess = true;
          resolve(true);
        });
        
        // Set a timeout to resolve after waiting for responses
        setTimeout(() => {
          resolve(anySuccess);
        }, 5000);
      });
    } catch (error) {
      // If we get a rate-limiting error or any other error from SimplePool,
      // log it and try publishing to relays individually
      if (error instanceof Error && error.message.includes("rate-limit")) {
        log.warn(`Rate limiting error from relay: ${error.message}`);
      } else {
        log.warn(`Error from SimplePool: ${error}`);
      }
      
      // Try publishing to each relay individually
      log.info("Trying to publish to relays individually...");
      
      // Track successful publishes
      const individualSuccesses = await Promise.all(
        relays.map(async (relay) => {
          try {
            // Try publishing to a single relay
            const singlePub = pool.publish([relay], event as unknown as Event);
            
            return await new Promise<boolean>((resolve) => {
              singlePub.on('ok', () => {
                log.debug(`Successfully published to relay: ${relay}`);
                resolve(true);
              });
              
              setTimeout(() => {
                resolve(false);
              }, 3000);
            });
          } catch (relayError) {
            log.debug(`Failed to publish to relay ${relay}: ${relayError}`);
            return false;
          }
        })
      );
      
      // If any individual publish succeeded, consider it a success
      succeeded = individualSuccesses.some(success => success);
    }
    
    if (succeeded) {
      log.info(`Successfully published event to at least one relay`);
    } else {
      log.warn(`Failed to publish event to any relay`);
    }
    
    return succeeded;
  } catch (error) {
    // This is our final fallback for any uncaught errors
    log.error(`Error publishing event: ${error}`);
    return false;
  }
}

/**
 * Create and sign an nsite event
 */
export async function createNsiteEvent(
  signer: { signEvent: (template: NostrEventTemplate) => Promise<NostrEvent> },
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

/**
 * Create and sign a blossom server list event
 */
export async function createServerListEvent(
  signer: { signEvent: (template: NostrEventTemplate) => Promise<NostrEvent> },
  servers: string[]
): Promise<NostrEvent> {
  const eventTemplate: NostrEventTemplate = {
    kind: USER_BLOSSOM_SERVER_LIST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ...servers.map(url => ["server", url]),
      ["client", "nsyte"],
    ],
    content: "",
  };
  
  return await signer.signEvent(eventTemplate);
}

/**
 * Create and sign a relay list event
 */
export async function createRelayListEvent(
  signer: { signEvent: (template: NostrEventTemplate) => Promise<NostrEvent> },
  relays: string[]
): Promise<NostrEvent> {
  const eventTemplate: NostrEventTemplate = {
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ...relays.map(url => ["r", url]),
      ["client", "nsyte"],
    ],
    content: "",
  };
  
  return await signer.signEvent(eventTemplate);
}

/**
 * Create and sign a profile event
 */
export async function createProfileEvent(
  signer: { signEvent: (template: NostrEventTemplate) => Promise<NostrEvent> },
  profile: Record<string, string>
): Promise<NostrEvent> {
  const eventTemplate: NostrEventTemplate = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["client", "nsyte"]],
    content: JSON.stringify(profile),
  };
  
  return await signer.signEvent(eventTemplate);
}

/**
 * Create and sign a deletion event
 */
export async function createDeletionEvent(
  signer: { signEvent: (template: NostrEventTemplate) => Promise<NostrEvent> },
  eventId: string
): Promise<NostrEvent> {
  const eventTemplate: NostrEventTemplate = {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", eventId]],
    content: "File deleted through nsyte",
  };
  
  return await signer.signEvent(eventTemplate);
}

/**
 * Close all connections to relays
 */
export function closeAllConnections(): void {
  pool.close();
} 