import { createLogger } from "./logger.ts";
import { NostrEvent, NostrEventTemplate } from "./nostr.ts";
import { Signer } from "./upload.ts";
import * as nostrTools from "npm:nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";
import { join, dirname } from "std/path/mod.ts";
import { ensureDirSync } from "std/fs/ensure_dir.ts";
import { bech32 } from "npm:@scure/base";
import { sha256 } from "npm:@noble/hashes/sha256";

const log = createLogger("nip46");

const NIP46_KIND = 24133;

// Fix TypeScript definition mismatches by creating wrappers
const getPublicKey = (secretKey: string): string => {
  // Cast to any to avoid TypeScript errors since the npm module expects different types
  return (nostrTools.getPublicKey as any)(secretKey);
};

const finalizeEvent = (event: NostrEventTemplate, secretKey: string): NostrEvent => {
  // Cast to any to avoid TypeScript errors
  return (nostrTools.finalizeEvent as any)(event, secretKey);
};

const nip04Encrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  // Cast to any to avoid TypeScript errors
  return await (nostrTools.nip04.encrypt as any)(privateKey, publicKey, content);
};

const nip04Decrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  // Cast to any to avoid TypeScript errors
  return await (nostrTools.nip04.decrypt as any)(privateKey, publicKey, content);
};

// Base interface for a Bunker Pointer
export interface BunkerPointer {
  pubkey: string;
  relays: string[];
  secret: string | null;
}

/**
 * Parse a bunker URL into its components
 */
export function parseBunkerUrl(url: string): BunkerPointer {
  if (!url.startsWith("bunker://")) {
    throw new Error("Invalid bunker URL format. Must start with bunker://");
  }
  
  try {
    const parsedUrl = new URL(url.replace("bunker://", "https://"));
    
    const pubkey = parsedUrl.hostname;
    
    const relays = parsedUrl.searchParams.getAll("relay");
    if (relays.length === 0) {
      throw new Error("Bunker URL must include at least one relay parameter");
    }
    
    const secret = parsedUrl.searchParams.get("secret");
    
    return { pubkey, relays, secret };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse bunker URL: ${errorMessage}`);
  }
}

/**
 * NIP-19 style bunker information
 */
export interface BunkerInfo {
  pubkey: string;
  relays: string[];
  local_key: string;
  secret?: string;
}

/**
 * Encode bunker information in NIP-19 style with "nbunk" prefix
 */
export function encodeBunkerInfo(info: BunkerInfo): string {
  try {
    // TLV format, similar to NIP-19
    const encodedData: Uint8Array[] = [];
    
    // Convert hex pubkey to bytes (type 0)
    const pubkeyBytes = new Uint8Array(info.pubkey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    encodedData.push(new Uint8Array([0, pubkeyBytes.length]));
    encodedData.push(pubkeyBytes);
    
    // Convert local_key to bytes (type 1)
    const localKeyBytes = new Uint8Array(info.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    encodedData.push(new Uint8Array([1, localKeyBytes.length]));
    encodedData.push(localKeyBytes);
    
    // Add relays (type 2)
    for (const relay of info.relays) {
      const relayBytes = new TextEncoder().encode(relay);
      encodedData.push(new Uint8Array([2, relayBytes.length]));
      encodedData.push(relayBytes);
    }
    
    // Add secret if it exists (type 3)
    if (info.secret) {
      const secretBytes = new TextEncoder().encode(info.secret);
      encodedData.push(new Uint8Array([3, secretBytes.length]));
      encodedData.push(secretBytes);
    }
    
    // Combine all data
    const combinedLength = encodedData.reduce((sum, part) => sum + part.length, 0);
    const combinedData = new Uint8Array(combinedLength);
    
    let offset = 0;
    for (const part of encodedData) {
      combinedData.set(part, offset);
      offset += part.length;
    }
    
    // Return bech32 encoded with nbunk prefix - increase the limit to accommodate longer strings
    // Use 1000 as a much higher limit
    return bech32.encode("nbunk", bech32.toWords(combinedData), 1000);
  } catch (error) {
    log.error(`Failed to encode bunker info: ${error}`);
    throw new Error(`Failed to encode bunker info: ${error}`);
  }
}

/**
 * Decode a NIP-19 style "nbunk" string into bunker information
 */
export function decodeBunkerInfo(nbunkString: string): BunkerInfo {
  try {
    // Check format
    if (!nbunkString.startsWith("nbunk")) {
      throw new Error("Not a valid nbunk string. Must start with nbunk");
    }
    
    // Decode bech32 with increased limit
    const { prefix, words } = bech32.decode(nbunkString, 1000);
    if (prefix !== "nbunk") {
      throw new Error(`Invalid prefix: ${prefix}, expected nbunk`);
    }
    
    const data = bech32.fromWords(words);
    
    // Initialize result
    const result: BunkerInfo = {
      pubkey: "",
      relays: [],
      local_key: ""
    };
    
    // Parse TLV format
    let i = 0;
    while (i < data.length) {
      const type = data[i];
      const length = data[i + 1];
      
      if (i + 2 + length > data.length) {
        throw new Error("Invalid data: incomplete TLV record");
      }
      
      const value = data.slice(i + 2, i + 2 + length);
      
      if (type === 0) { // pubkey
        result.pubkey = bytesToHex(new Uint8Array(value));
      } else if (type === 1) { // local_key
        result.local_key = bytesToHex(new Uint8Array(value));
      } else if (type === 2) { // relay
        const relay = new TextDecoder().decode(new Uint8Array(value));
        result.relays.push(relay);
      } else if (type === 3) { // secret
        result.secret = new TextDecoder().decode(new Uint8Array(value));
      }
      
      i += 2 + length;
    }
    
    // Validate required fields
    if (!result.pubkey) {
      throw new Error("Invalid nbunk: missing pubkey");
    }
    if (!result.local_key) {
      throw new Error("Invalid nbunk: missing local_key");
    }
    if (result.relays.length === 0) {
      throw new Error("Invalid nbunk: missing relays");
    }
    
    return result;
  } catch (error) {
    log.error(`Failed to decode nbunk string: ${error}`);
    throw new Error(`Failed to decode nbunk string: ${error}`);
  }
}

/**
 * Compute checksum for a bunker identifier
 */
function computeBunkerChecksum(pubkey: string, relays: string[]): string {
  // Sort relays for consistent hashing
  const sortedRelays = [...relays].sort();
  
  // Hash the pubkey and sorted relays
  const data = pubkey + sortedRelays.join(",");
  const hash = sha256(new TextEncoder().encode(data));
  
  // Return first 8 bytes as hex
  return bytesToHex(hash.slice(0, 8));
}

/**
 * Manages the client keys for NIP-46 bunker connections
 */
export class BunkerKeyManager {
  private static readonly CONFIG_DIR = ".nsite";
  private static readonly BUNKER_SECRETS_FILE = "bunker_secrets.json";
  
  /**
   * Get stored bunker information for a bunker pubkey
   */
  public static getBunkerInfo(bunkerPubkey: string): { clientKey: Uint8Array; bunkerUrl: string; nbunkString?: string } | null {
    try {
      const data = this.loadSecrets();
      const bunkerData = data[bunkerPubkey];
      
      if (!bunkerData) {
        return null;
      }

      // If we have nbunk string, decode it
      if (bunkerData.nbunk) {
        const info = decodeBunkerInfo(bunkerData.nbunk);
        
        // Convert hex to Uint8Array
        const clientKey = new Uint8Array(
          info.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
        );
        
        // Recreate bunker URL from nbunk data
        const relayParams = info.relays.map(r => `relay=${encodeURIComponent(r)}`).join("&");
        const bunkerUrl = `bunker://${info.pubkey}?${relayParams}`;
        
        return {
          clientKey,
          bunkerUrl,
          nbunkString: bunkerData.nbunk
        };
      }
      
      // Legacy fallback for older stored data
      if (bunkerData.local_key) {
        // Convert hex string back to Uint8Array
        const clientKey = new Uint8Array(
          bunkerData.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
        );
        
        return {
          clientKey,
          bunkerUrl: bunkerData.bunker_url || "",
          nbunkString: bunkerData.nbunk
        };
      }
      
      return null;
    } catch (error) {
      log.debug(`No existing bunker info found for bunker ${bunkerPubkey}: ${error}`);
      return null;
    }
  }
  
  /**
   * Store bunker information
   */
  public static saveBunkerInfo(bunkerPubkey: string, clientKey: Uint8Array, bunkerUrl: string): void {
    try {
      const data = this.loadSecrets();
      
      // Create full bunker info object
      const bunkerInfo: BunkerInfo = {
        pubkey: bunkerPubkey,
        relays: parseBunkerUrl(bunkerUrl).relays,
        local_key: bytesToHex(clientKey)
      };
      
      // Encode to nbunk format - this is all we need to store
      const nbunkString = encodeBunkerInfo(bunkerInfo);
      
      // Store in secrets - only store the nbunk string
      data[bunkerPubkey] = {
        nbunk: nbunkString
      };
      
      this.saveSecrets(data);
      log.debug(`Saved bunker info for ${bunkerPubkey.slice(0, 8)}... as nbunk`);
    } catch (error) {
      log.warn(`Failed to save bunker info: ${error}`);
      // Don't throw - this is not fatal
    }
  }
  
  /**
   * Store a bunker URL in the secrets file
   * This method is used from config.ts during setup
   */
  public static storeBunkerUrl(bunkerPubkey: string, bunkerUrl: string): void {
    try {
      // Generate a temporary client key
      const tempClientKey = nostrTools.generateSecretKey();
      
      // Delegate to saveBunkerInfo to create and store the nbunk
      this.saveBunkerInfo(bunkerPubkey, tempClientKey, bunkerUrl);
      
      log.debug(`Created nbunk for bunker ${bunkerPubkey.slice(0, 8)}...`);
    } catch (error) {
      log.warn(`Failed to create nbunk: ${error}`);
      // Don't throw - this is not fatal
    }
  }
  
  /**
   * Get just the client key for backward compatibility
   */
  public static getClientKey(bunkerPubkey: string): Uint8Array | null {
    const info = this.getBunkerInfo(bunkerPubkey);
    return info?.clientKey || null;
  }
  
  /**
   * Save just the client key for backward compatibility
   */
  public static saveClientKey(bunkerPubkey: string, clientKey: Uint8Array): void {
    // Get existing bunker info for relays if available
    const existingInfo = this.getBunkerInfo(bunkerPubkey);
    
    if (existingInfo && existingInfo.bunkerUrl) {
      // If we have existing relays, save with full info
      this.saveBunkerInfo(bunkerPubkey, clientKey, existingInfo.bunkerUrl);
    } else {
      // Without existing relays, create minimal BunkerInfo with dummy relay
      const bunkerInfo: BunkerInfo = {
        pubkey: bunkerPubkey,
        relays: ["wss://dummy.relay"],
        local_key: bytesToHex(clientKey)
      };
      
      // Encode to nbunk
      const nbunkString = encodeBunkerInfo(bunkerInfo);
      
      // Store only the nbunk
      const data = this.loadSecrets();
      data[bunkerPubkey] = {
        nbunk: nbunkString
      };
      
      this.saveSecrets(data);
      log.debug(`Saved client key for bunker ${bunkerPubkey.slice(0, 8)}... as nbunk`);
    }
  }
  
  /**
   * Load stored bunker secrets
   */
  private static loadSecrets(): Record<string, { 
    local_key?: string; 
    bunker_url?: string;
    nbunk?: string;
  }> {
    const secretsPath = this.getSecretsPath();
    
    try {
      if (!this.fileExists(secretsPath)) {
        return {};
      }
      
      const fileContent = Deno.readTextFileSync(secretsPath);
      return JSON.parse(fileContent);
    } catch (error) {
      log.debug(`Failed to load bunker secrets: ${error}`);
      return {};
    }
  }
  
  /**
   * Save bunker secrets
   */
  private static saveSecrets(data: Record<string, { 
    local_key?: string; 
    bunker_url?: string;
    nbunk?: string;
  }>): void {
    const secretsPath = this.getSecretsPath();
    
    try {
      ensureDirSync(dirname(secretsPath));
      Deno.writeTextFileSync(secretsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      log.warn(`Failed to save bunker secrets: ${error}`);
    }
  }
  
  /**
   * Get the path to the secrets file
   */
  private static getSecretsPath(): string {
    return join(Deno.cwd(), this.CONFIG_DIR, this.BUNKER_SECRETS_FILE);
  }
  
  /**
   * Check if a file exists
   */
  private static fileExists(filePath: string): boolean {
    try {
      const stats = Deno.statSync(filePath);
      return stats.isFile;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * NIP-46 Bunker Signer Implementation
 */
export class BunkerSigner implements Signer {
  private secretKeyHex: string;
  private pool: nostrTools.SimplePool;
  private connected = false;
  private pendingRequests = new Map<string, { 
    resolve: (value: unknown) => void; 
    reject: (reason: unknown) => void 
  }>();
  private clientPubkey: string;
  private userPubkey = "";
  private subscription: { close: () => void } | null = null;
  
  /**
   * Create a new BunkerSigner instance
   */
  private constructor(
    private bunkerPointer: BunkerPointer,
    secretKey: Uint8Array
  ) {
    this.secretKeyHex = bytesToHex(secretKey);
    this.clientPubkey = getPublicKey(this.secretKeyHex);
    this.pool = new nostrTools.SimplePool();
    
    log.debug(`Created BunkerSigner for ${bunkerPointer.pubkey.slice(0, 8)}... with client pubkey ${this.clientPubkey.slice(0, 8)}...`);
  }
  
  /**
   * Connect to a NIP-46 bunker
   */
  public static async connect(bunkerUrl: string): Promise<BunkerSigner> {
    const bunkerPointer = parseBunkerUrl(bunkerUrl);
    
    // CRITICAL: Verify we have the secret parameter
    if (!bunkerPointer.secret) {
      log.warn("NO SECRET in bunker URL - connection will likely fail!");
    } else {
      log.debug("Secret parameter found in bunker URL");
    }
    
    // Generate a new client key - DO NOT save it yet
    const secretKey = nostrTools.generateSecretKey();
    log.debug("Generated new client key for this connection");
    
    // Create signer with the URL's relays and secret
    const signer = new BunkerSigner(bunkerPointer, secretKey);
    
    try {
      // Try to connect with the fresh key and URL params
      await signer.connect();
      
      // ONLY save after successful connection
      log.debug("Connection successful - now saving client key");
      
      // Now we can safely save the key - it's been authorized
      BunkerKeyManager.saveBunkerInfo(bunkerPointer.pubkey, secretKey, bunkerUrl);
      
      return signer;
    } catch (error: unknown) {
      await signer.disconnect();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to connect to bunker: ${errorMessage}`);
      throw new Error(`Failed to connect to bunker: ${errorMessage}`);
    }
  }
  
  /**
   * Import from an nbunk string
   */
  public static async importFromNbunk(nbunkString: string): Promise<BunkerSigner> {
    try {
      // Decode the nbunk string
      const info = decodeBunkerInfo(nbunkString);
      
      // Convert local_key from hex to Uint8Array
      const secretKey = new Uint8Array(
        info.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      
      // Create bunker pointer directly from the nbunk data
      const bunkerPointer: BunkerPointer = {
        pubkey: info.pubkey,
        relays: info.relays,
        secret: null
      };
      
      // Create the signer - don't store yet
      const signer = new BunkerSigner(bunkerPointer, secretKey);
      
      try {
        // Only after successful connection, store the details
        await signer.connect();
        
        // Connection successful - now save the nbunk
        log.info("Connection successful - saving nbunk");
        const dummyUrl = `bunker://${info.pubkey}?${info.relays.map(r => `relay=${encodeURIComponent(r)}`).join("&")}`;
        BunkerKeyManager.saveBunkerInfo(info.pubkey, secretKey, dummyUrl);
        
        return signer;
      } catch (error: unknown) {
        await signer.disconnect();
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Failed to connect to bunker from nbunk: ${errorMessage}`);
        throw new Error(`Failed to connect to bunker from nbunk: ${errorMessage}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to import from nbunk: ${errorMessage}`);
      throw new Error(`Failed to import from nbunk: ${errorMessage}`);
    }
  }
  
  /**
   * Connect to the bunker
   */
  private async connect(): Promise<void> {
    log.info(`Connecting to bunker ${this.bunkerPointer.pubkey.slice(0, 8)}... via ${this.bunkerPointer.relays.join(", ")}`);
    
    // CRITICAL: Ensure we have the secret for connection
    if (!this.bunkerPointer.secret) {
      log.warn("No secret parameter provided in bunker URL - this will likely fail");
    } else {
      log.debug("Using secret from URL for connection");
    }
    
    // Make a direct connection to each relay first to verify they're accessible
    const directRelayConnections = await Promise.all(
      this.bunkerPointer.relays.map(async (relay) => {
        try {
          const ws = new WebSocket(relay);
          return new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
              log.warn(`Timed out connecting to relay: ${relay}`);
              resolve(false);
            }, 3000);
            
            ws.onopen = () => {
              clearTimeout(timeout);
              ws.close();
              resolve(true);
            };
            
            ws.onerror = () => {
              clearTimeout(timeout);
              resolve(false);
            };
          });
        } catch (e) {
          log.warn(`Failed to connect to relay: ${relay}`);
          return false;
        }
      })
    );
    
    const connectedRelayCount = directRelayConnections.filter(Boolean).length;
    if (connectedRelayCount === 0) {
      throw new Error("Failed to connect to any relay - check relay URLs");
    }
    
    log.info(`Successfully connected to ${connectedRelayCount}/${this.bunkerPointer.relays.length} relays`);
    
    // Set up subscription to receive responses
    const filter = {
      kinds: [NIP46_KIND],
      "#p": [this.clientPubkey],
    };
    
    const sub = this.pool.subscribeMany(
      this.bunkerPointer.relays,
      [filter],
      {
        onevent: (event: NostrEvent) => {
          this.handleResponse(event);
        }
      }
    );
    
    this.subscription = sub;
    
    // Wait for subscriptions to be established
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mark as connected to the relay - we need this to be true before sending requests
    this.connected = true;
    
    // Attempt to connect to the bunker with secret
    try {
      // Send connect request with secret parameter
      const connectParams = [this.bunkerPointer.pubkey];
      if (this.bunkerPointer.secret) {
        log.debug("Adding secret to connect request");
        connectParams.push(this.bunkerPointer.secret);
      }
      
      log.info("Sending connect request to bunker...");
      
      try {
        // Try connect with direct publishing for maximum reliability
        const event = await this.prepareRequestEvent('connect', connectParams);
        const directSuccess = await this.publishDirectly(event);
        
        if (!directSuccess) {
          // Fallback to regular method if direct publishing fails
          await this.sendRequest('connect', connectParams, 15000);
        }
        
        log.info("Connect request succeeded");
      } catch (connectError: unknown) {
        const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);
        
        // If the error is "already connected", we can proceed
        if (errorMessage.includes("already connected")) {
          log.info("Bunker reports we're already connected, proceeding...");
        } else if (errorMessage.includes("unauthorized") || errorMessage.includes("permission")) {
          throw new Error("Unauthorized - the secret parameter may be incorrect or missing");
        } else {
          throw connectError;
        }
      }
      
      // Try to get the public key
      try {
        const userPubkey = await this.sendRequest('get_public_key', [], 10000) as string;
        this.userPubkey = userPubkey;
        log.info(`Connected to bunker, user pubkey: ${this.userPubkey.slice(0, 8)}...`);
        return;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("permission") || errorMessage.includes("not authorized") || 
            errorMessage.includes("unauthorized")) {
          log.info("Permission needed, requesting authorization...");
        } else {
          throw error;
        }
      }
      
      // Need to request permission
      await this.requestPermissions();
      
      // After permission request, try to get public key again
      const userPubkey = await this.sendRequest('get_public_key', [], 10000) as string;
      this.userPubkey = userPubkey;
      log.info(`Connected to bunker, user pubkey: ${this.userPubkey.slice(0, 8)}...`);
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }
  
  /**
   * Prepare a request event without sending it
   */
  private async prepareRequestEvent(method: string, params: unknown[]): Promise<NostrEvent> {
    const id = Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    
    const request = {
      id,
      method,
      params,
    };
    
    // Encrypt the request
    const encrypted = await nip04Encrypt(
      this.secretKeyHex,
      this.bunkerPointer.pubkey, 
      JSON.stringify(request)
    );
    
    // Create the event
    const event: NostrEventTemplate = {
      kind: NIP46_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", this.bunkerPointer.pubkey]],
      content: encrypted,
    };
    
    // Sign the event
    return finalizeEvent(event, this.secretKeyHex);
  }
  
  /**
   * Publish an event directly to all relays using basic WebSockets
   * For maximum compatibility with various relay implementations
   */
  private async publishDirectly(event: NostrEvent): Promise<boolean> {
    log.debug("Attempting direct WebSocket publishing for maximum compatibility");
    
    const results = await Promise.all(
      this.bunkerPointer.relays.map(async (relay) => {
        return new Promise<boolean>((resolve) => {
          try {
            const ws = new WebSocket(relay);
            let success = false;
            
            const timeout = setTimeout(() => {
              if (!success) {
                ws.close();
                resolve(false);
              }
            }, 5000);
            
            ws.onopen = () => {
              const message = JSON.stringify(["EVENT", event]);
              ws.send(message);
              
              // For best compatibility, consider a successful send as success
              // Many older relays don't send OK messages
              success = true;
              
              // Still wait a bit for potential OK message
              setTimeout(() => {
                clearTimeout(timeout);
                ws.close();
                resolve(true);
              }, 1000);
            };
            
            ws.onmessage = (msg: MessageEvent) => {
              try {
                const data = JSON.parse(msg.data as string);
                if (Array.isArray(data) && data[0] === "OK" && data[1] === event.id) {
                  success = true;
                  clearTimeout(timeout);
                  ws.close();
                  resolve(true);
                }
              } catch (e) {
                // Ignore parsing errors
              }
            };
            
            ws.onerror = () => {
              clearTimeout(timeout);
              resolve(false);
            };
            
            ws.onclose = () => {
              clearTimeout(timeout);
              if (!success) {
                resolve(false);
              }
            };
          } catch (e) {
            resolve(false);
          }
        });
      })
    );
    
    const successCount = results.filter(Boolean).length;
    if (successCount > 0) {
      log.debug(`Direct publishing succeeded on ${successCount}/${this.bunkerPointer.relays.length} relays`);
      return true;
    }
    
    log.debug("Direct publishing failed on all relays");
    return false;
  }
  
  /**
   * Request permissions from the bunker
   */
  private async requestPermissions(): Promise<void> {
    // Define the permissions we need
    const permissions = ["get_public_key", "sign_event"];
    
    // Define methods to try, in priority order (most widely supported first)
    const methods = [
      'request_permissions',  // Plural is more common
      'request_permission',   // Singular used in some bunkers
      'authorize'             // Less common
    ];
    
    log.info("Requesting bunker permission - check your bunker app for approval prompt");
    
    // Try each method
    for (const method of methods) {
      try {
        // Try direct publishing first for critical requests
        const event = await this.prepareRequestEvent(method, [permissions]);
        const directSuccess = await this.publishDirectly(event);
        
        if (!directSuccess) {
          // Fall back to regular request if direct publishing fails
          await this.sendRequest(method, [permissions], 8000);
        }
        
        log.info(`Permission request sent with ${method}, waiting for approval...`);
        return;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // If method not found, try the next one
        if (errorMessage.includes("method not found") || 
            errorMessage.includes("unknown method") || 
            errorMessage.includes("not implemented") ||
            errorMessage.includes("no such method")) {
          continue;
        }
        
        // If permission already granted, we're good
        if (errorMessage.includes("already authorized") || 
            errorMessage.includes("already granted") ||
            errorMessage.includes("permission already") ||
            errorMessage.includes("already has permission")) {
          log.info("Permission already granted");
          return;
        }
        
        // If we got here, something else went wrong
        log.warn(`Error requesting permission with ${method}: ${errorMessage}`);
      }
    }
    
    // If all methods failed, wait a bit and let the user know they need to approve manually
    log.warn("Could not automatically request permissions. Please approve this client in your bunker app.");
    
    // Wait a moment to allow manual approval
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  /**
   * Handle a response from the bunker
   */
  private async handleResponse(event: NostrEvent): Promise<void> {
    if (event.pubkey !== this.bunkerPointer.pubkey) {
      return;
    }
    
    try {
      // Decrypt the response
      const decrypted = await nip04Decrypt(
        this.secretKeyHex,
        event.pubkey, 
        event.content
      );
      
      const response = JSON.parse(decrypted);
      
      // Log the response for debugging
      if (response.error) {
        const methodInfo = response.id ? ` for request ${response.id}` : '';
        
        // For permission errors, provide more detailed logging
        if (response.error.includes("permission") || response.error.includes("access")) {
          log.error(`${response.error.toUpperCase()} error${methodInfo}. The user might need to approve this action in their bunker app.`);
        } else {
          log.debug(`Bunker response error${methodInfo}: ${response.error}`);
        }
      } else {
        log.debug(`Received bunker response for id: ${response.id}`);
      }
      
      const pendingRequest = this.pendingRequests.get(response.id);
      if (!pendingRequest) {
        return;
      }
      
      this.pendingRequests.delete(response.id);
      
      if (response.error) {
        pendingRequest.reject(new Error(response.error));
      } else {
        pendingRequest.resolve(response.result);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to decrypt response: ${errorMessage}`);
    }
  }
  
  /**
   * Send a request to the bunker
   */
  private async sendRequest(method: string, params: unknown[], timeoutMs = 30000): Promise<unknown> {
    if (method !== 'connect' && !this.connected) {
      throw new Error("Not connected to the bunker");
    }
    
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2, 15) + 
                 Math.random().toString(36).substring(2, 15);
      
      const request = {
        id,
        method,
        params,
      };
      
      log.debug(`Sending ${method} request to bunker with id ${id}`);
      this.pendingRequests.set(id, { resolve, reject });
      
      // Set a timeout
      const timeoutHandle = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          log.error(`Request timed out: ${method} (id: ${id})`);
          reject(new Error(`Request timed out: ${method}`));
        }
      }, timeoutMs);
      
      // Encrypt and send the request
      this.encryptAndSendRequest(request, id, timeoutHandle).catch(error => {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(id);
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Failed to send ${method} request (id: ${id}): ${errorMessage}`);
        reject(new Error(`Failed to send request: ${errorMessage}`));
      });
    });
  }
  
  /**
   * Encrypt and send a request to the bunker
   */
  private async encryptAndSendRequest(
    request: { id: string; method: string; params: unknown[] },
    requestId: string,
    timeoutHandle: number
  ): Promise<void> {
    try {
      // Encrypt the request
      const encrypted = await nip04Encrypt(
        this.secretKeyHex,
        this.bunkerPointer.pubkey, 
        JSON.stringify(request)
      );
      
      // Create the event
      const event: NostrEventTemplate = {
        kind: NIP46_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.bunkerPointer.pubkey]],
        content: encrypted,
      };
      
      // Sign the event
      const signedEvent = finalizeEvent(
        event, 
        this.secretKeyHex
      );
      
      log.debug(`Publishing ${request.method} request to ${this.bunkerPointer.relays.length} relays (id: ${requestId})`);
      
      // Keep track of relay success/failure
      const relayStatuses = new Map<string, string>();
      
      // First try to publish to all relays at once for efficiency
      let allRelaysPublished = false;
      
      try {
        await this.pool.publish(this.bunkerPointer.relays, signedEvent);
        log.debug(`Request ${requestId} published to all relays at once`);
        allRelaysPublished = true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        if (errorMsg.includes("rate-limit") || errorMsg.includes("noting too much")) {
          log.warn(`Rate limiting detected: ${errorMsg}`);
        } else {
          log.warn(`Failed to publish to all relays at once: ${errorMsg}`);
        }
        
        // We'll try individual relays below
      }
      
      // Special handling for connect and permission requests - always use direct publishing
      const criticalMethods = ['connect', 'request_permissions', 'request_permission', 'authorize', 'get_public_key'];
      const needsDirectPublish = criticalMethods.includes(request.method);
      
      if (needsDirectPublish) {
        log.debug(`Using direct publishing for critical method: ${request.method}`);
        
        // Use our direct publish method instead of publishEventDirectly which was removed
        const directSuccess = await this.publishDirectly(signedEvent);
        if (directSuccess) {
          log.debug(`Direct publish succeeded for ${request.method}`);
        } else {
          log.warn(`Direct publish failed for critical method: ${request.method}`);
        }
      }
      
      // If we failed the bulk publish, try each relay individually
      // Or even if we succeeded bulk publish, still try individual relays for critical methods
      const needsIndividualPublish = !allRelaysPublished || criticalMethods.includes(request.method);
      
      if (needsIndividualPublish) {
        log.debug(`${!allRelaysPublished ? "Trying" : "Also trying"} individual relay publishing for ${request.method}`);
        
        // Publish to each relay individually
        const individualPublishPromises = this.bunkerPointer.relays.map(async (relay) => {
          try {
            await this.pool.publish([relay], signedEvent);
            log.debug(`Request ${requestId} published successfully to relay: ${relay}`);
            relayStatuses.set(relay, "success");
            return true;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes("rate-limit") || errMsg.includes("noting too much")) {
              log.warn(`Rate limited on relay ${relay}: ${errMsg}`);
              relayStatuses.set(relay, `rate-limited: ${errMsg}`);
            } else if (errMsg.includes("blocked")) {
              log.warn(`Blocked on relay ${relay}: ${errMsg}`);
              relayStatuses.set(relay, `blocked: ${errMsg}`);
            } else {
              log.debug(`Failed to publish to ${relay}: ${errMsg}`);
              relayStatuses.set(relay, `error: ${errMsg}`);
            }
            return false;
          }
        });
        
        // Wait for all individual publish attempts to complete
        const results = await Promise.all(individualPublishPromises);
        const successCount = results.filter(r => r).length;
        
        if (successCount > 0) {
          log.debug(`Successfully published to ${successCount}/${this.bunkerPointer.relays.length} relays individually`);
          
          // Log details of relay statuses in case it helps with debugging
          log.debug("Relay publish statuses:");
          for (const [relay, status] of relayStatuses.entries()) {
            log.debug(`  - ${relay}: ${status}`);
          }
          
          return; // At least one relay succeeded
        }
        
        // No relays succeeded with individual publishing
        log.error("Failed to publish to any relay individually");
        log.debug("Relay publish statuses:");
        for (const [relay, status] of relayStatuses.entries()) {
          log.debug(`  - ${relay}: ${status}`);
        }
        
        throw new Error("Failed to publish to any relay - check relay connections");
      }
      
    } catch (error: unknown) {
      clearTimeout(timeoutHandle);
      this.pendingRequests.delete(requestId);
      throw error;
    }
  }
  
  /**
   * Disconnect from the bunker
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.connected) {
        await this.sendRequest('disconnect', [], 30000);
      }
    } catch (error) {
      // Ignore
    } finally {
      if (this.subscription) {
        this.subscription.close();
        this.subscription = null;
      }
      
      this.pool.close(this.bunkerPointer.relays);
      this.connected = false;
      
      for (const [id, { reject }] of this.pendingRequests.entries()) {
        reject(new Error("Disconnected from bunker"));
        this.pendingRequests.delete(id);
      }
    }
  }
  
  /**
   * Get the user's public key
   */
  public getPublicKey(): string {
    return this.userPubkey;
  }
  
  /**
   * Sign an event using the bunker
   */
  public async signEvent(template: NostrEventTemplate): Promise<NostrEvent> {
    try {
      const signedEvent = await this.sendRequest('sign_event', [template], 30000) as NostrEvent;
      return signedEvent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to sign event with bunker: ${errorMessage}`);
      throw new Error(`Failed to sign event with bunker: ${errorMessage}`);
    }
  }

  /**
   * Describe bunker capabilities
   * This method can help debug what methods the bunker supports
   */
  public async describeBunker(): Promise<string[]> {
    try {
      if (!this.connected) {
        await this.connect();
      }
      
      const methods = await this.sendRequest('describe', [], 30000) as string[];
      log.info(`Bunker supports the following methods: ${methods.join(', ')}`);
      return methods;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to describe bunker capabilities: ${errorMessage}`);
      throw new Error(`Failed to describe bunker: ${errorMessage}`);
    }
  }

  /**
   * Get the nbunk string for this connection
   */
  public getNbunkString(): string {
    const bunkerInfo: BunkerInfo = {
      pubkey: this.bunkerPointer.pubkey,
      relays: this.bunkerPointer.relays,
      local_key: this.secretKeyHex
    };
    
    return encodeBunkerInfo(bunkerInfo);
  }
} 