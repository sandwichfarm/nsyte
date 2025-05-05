/**
 * NIP-46: Nostr Remote Signing implementation
 * Following the specification at https://nostr-nips.com/nip-46
 */
import { dirname, join } from "std/path/mod.ts";
import { ensureDirSync } from "std/fs/ensure_dir.ts";
import { createLogger } from "./logger.ts";
import { NostrEvent, NostrEventTemplate } from "./nostr.ts";
import { bech32 } from "npm:@scure/base";
import * as nostrTools from "npm:nostr-tools";
import { bytesToHex } from "npm:@noble/hashes/utils";
import { sha256 } from "npm:@noble/hashes/sha256";
import { Signer } from "./upload.ts";
import { SecretsManager } from "./secrets/mod.ts";

const log = createLogger("nip46");

const NIP46_KIND = 24133;

/**
 * Get a public key from a secret key
 */
const getPublicKey = (secretKey: string): string => {
  return (nostrTools.getPublicKey as any)(secretKey);
};

/**
 * Finalize an event by adding an ID and signature
 */
const finalizeEvent = (event: NostrEventTemplate, secretKey: string): NostrEvent => {
  return (nostrTools.finalizeEvent as any)(event, secretKey);
};

/**
 * Encrypt a message using NIP-04
 */
const nip04Encrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  try {
    return await (nostrTools.nip04.encrypt as any)(privateKey, publicKey, content);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`NIP-04 encryption failed: ${errorMessage}`);
    throw error;
  }
};

/**
 * Decrypt a message using NIP-04
 */
const nip04Decrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  try {
    return await (nostrTools.nip04.decrypt as any)(privateKey, publicKey, content);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`NIP-04 decryption failed: ${errorMessage}`);
    throw error;
  }
};

/**
 * Encrypt a message using NIP-44 if available
 */
const nip44Encrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  if (!nostrTools.nip44 || typeof nostrTools.nip44.encrypt !== 'function') {
    throw new Error("NIP-44 encryption not available");
  }
  
  try {
    const privKeyBytes = new Uint8Array(
      privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    
    const conversationKey = nostrTools.nip44.getConversationKey(privKeyBytes, publicKey);
    return nostrTools.nip44.encrypt(content, conversationKey);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`NIP-44 encryption failed: ${errorMessage}`);
    throw error;
  }
};

/**
 * Decrypt a message using NIP-44 if available
 */
const nip44Decrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  if (!nostrTools.nip44 || typeof nostrTools.nip44.decrypt !== 'function') {
    throw new Error("NIP-44 decryption not available");
  }
  
  try {
    const privKeyBytes = new Uint8Array(
      privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    
    const conversationKey = nostrTools.nip44.getConversationKey(privKeyBytes, publicKey);
    return nostrTools.nip44.decrypt(content, conversationKey);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`NIP-44 decryption failed: ${errorMessage}`);
    throw error;
  }
};

/**
 * Encrypt content using the best available method
 * Most bunkers still use NIP-04 despite NIP-46 recommending NIP-44
 */
async function encryptContent(
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> {
  try {
    log.debug("Using NIP-04 encryption for maximum compatibility");
    return await nip04Encrypt(privateKey, publicKey, content);
  } catch (error) {
    log.debug("NIP-04 encryption failed, trying NIP-44 as fallback");
    return await nip44Encrypt(privateKey, publicKey, content);
  }
}

/**
 * Decrypt content using the appropriate method
 * Tries NIP-04 first as most bunkers use it
 */
async function decryptContent(
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> {
  try {
    log.debug("Trying NIP-04 decryption first (for maximum compatibility)");
    return await nip04Decrypt(privateKey, publicKey, content);
  } catch (nip04Error) {
    try {
      log.debug("NIP-04 decryption failed, trying NIP-44 as fallback");
      return await nip44Decrypt(privateKey, publicKey, content);
    } catch (nip44Error) {
      log.error("Failed to decrypt with both NIP-04 and NIP-44");
      throw new Error(`Decryption failed with both protocols. NIP-04 error: ${nip04Error}, NIP-44 error: ${nip44Error}`);
    }
  }
}

/**
 * Interface for a bunker connection information
 */
export interface BunkerPointer {
  pubkey: string;
  relays: string[];
  secret: string | null;
}

/**
 * Parse a bunker URL following NIP-46 format:
 * bunker://<remote-signer-pubkey>?relay=<wss://relay1>&relay=<wss://relay2>&secret=<optional>
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
 * Bundle of information for bunker connections
 */
export interface BunkerInfo {
  pubkey: string;
  relays: string[];
  local_key: string;
  secret?: string;
}

/**
 * Generate a TLV encoded string for storing bunker connection info
 */
export function encodeBunkerInfo(info: BunkerInfo): string {
  try {
    const encodedData: Uint8Array[] = [];
    
    const pubkeyBytes = new Uint8Array(info.pubkey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    encodedData.push(new Uint8Array([0, pubkeyBytes.length]));
    encodedData.push(pubkeyBytes);
    
    const localKeyBytes = new Uint8Array(info.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    encodedData.push(new Uint8Array([1, localKeyBytes.length]));
    encodedData.push(localKeyBytes);
    
    for (const relay of info.relays) {
      const relayBytes = new TextEncoder().encode(relay);
      encodedData.push(new Uint8Array([2, relayBytes.length]));
      encodedData.push(relayBytes);
    }
    
    if (info.secret) {
      const secretBytes = new TextEncoder().encode(info.secret);
      encodedData.push(new Uint8Array([3, secretBytes.length]));
      encodedData.push(secretBytes);
    }
    
    const combinedLength = encodedData.reduce((sum, part) => sum + part.length, 0);
    const combinedData = new Uint8Array(combinedLength);
    
    let offset = 0;
    for (const part of encodedData) {
      combinedData.set(part, offset);
      offset += part.length;
    }
    
    return bech32.encode("nbunksec", bech32.toWords(combinedData), 1000);
  } catch (error: unknown) {
    log.error(`Failed to encode bunker info: ${error}`);
    throw new Error(`Failed to encode bunker info: ${error}`);
  }
}

/**
 * Decode a nbunksec string into bunker information
 */
export function decodeBunkerInfo(nbunkString: string): BunkerInfo {
  try {
    if (!nbunkString.startsWith("nbunksec")) {
      throw new Error("Not a valid nbunksec string. Must start with nbunksec");
    }
    
    const decoded = bech32.decodeUnsafe(nbunkString, 1000);
    if (!decoded || decoded.prefix !== "nbunksec") {
      throw new Error(`Invalid prefix: ${decoded?.prefix || "none"}, expected nbunksec`);
    }
    
    const data = bech32.fromWords(decoded.words);
    
    const result: BunkerInfo = {
      pubkey: "",
      relays: [],
      local_key: ""
    };
    
    let i = 0;
    while (i < data.length) {
      const type = data[i];
      const length = data[i + 1];
      
      if (i + 2 + length > data.length) {
        throw new Error("Invalid data: incomplete TLV record");
      }
      
      const value = data.slice(i + 2, i + 2 + length);
      
      if (type === 0) {
        result.pubkey = bytesToHex(new Uint8Array(value));
      } else if (type === 1) {
        result.local_key = bytesToHex(new Uint8Array(value));
      } else if (type === 2) {
        const relay = new TextDecoder().decode(new Uint8Array(value));
        result.relays.push(relay);
      } else if (type === 3) {
        result.secret = new TextDecoder().decode(new Uint8Array(value));
      }
      
      i += 2 + length;
    }
    
    if (!result.pubkey) {
      throw new Error("Invalid nbunksec: missing pubkey");
    }
    if (!result.local_key) {
      throw new Error("Invalid nbunksec: missing local_key");  
    }
    if (result.relays.length === 0) {
      throw new Error("Invalid nbunksec: missing relays");
    }
    
    return result;
  } catch (error: unknown) {
    log.error(`Failed to decode nbunksec string: ${error}`);
    throw new Error(`Failed to decode nbunksec string: ${error}`);
  }
}

/**
 * Bunker management functions for secrets storage
 */
export function getBunkerInfo(bunkerPubkey: string): { clientKey: Uint8Array; bunkerUrl: string; nbunkString?: string } | null {
  try {
    const secretsManager = SecretsManager.getInstance();
    const nbunkString = secretsManager.getNbunk(bunkerPubkey);
    
    if (!nbunkString) {
      return null;
    }
    
    const info = decodeBunkerInfo(nbunkString);
    
    const clientKey = new Uint8Array(
      info.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    
    const relayParams = info.relays.map(r => `relay=${encodeURIComponent(r)}`).join("&");
    const bunkerUrl = `bunker://${info.pubkey}?${relayParams}`;
    
    return {
      clientKey,
      bunkerUrl,
      nbunkString
    };
  } catch (error) {
    log.debug(`No existing bunker info found for bunker ${bunkerPubkey}: ${error}`);
    return null;
  }
}

/**
 * Store bunker information
 */
export function saveBunkerInfo(bunkerPubkey: string, clientKey: Uint8Array, bunkerUrl: string): void {
  try {
    const bunkerInfo: BunkerInfo = {
      pubkey: bunkerPubkey,
      relays: parseBunkerUrl(bunkerUrl).relays,
      local_key: bytesToHex(clientKey)
    };
    
    const nbunkString = encodeBunkerInfo(bunkerInfo);
    
    const secretsManager = SecretsManager.getInstance();
    secretsManager.storeNbunk(bunkerPubkey, nbunkString);
    
    log.debug(`Saved bunker info for ${bunkerPubkey.slice(0, 8)}...`);
  } catch (error) {
    log.warn(`Failed to save bunker info: ${error}`);
  }
}

/**
 * Store a bunker URL in the secrets system
 * This function is used by the config system
 */
export function storeBunkerUrl(bunkerPubkey: string, bunkerUrl: string): void {
  try {
    const tempClientKey = nostrTools.generateSecretKey();
    
    saveBunkerInfo(bunkerPubkey, tempClientKey, bunkerUrl);
    
    log.debug(`Created nbunksec for bunker ${bunkerPubkey.slice(0, 8)}...`);
  } catch (error) {
    log.warn(`Failed to create nbunksec: ${error}`);
  }
}

/**
 * NIP-46 Bunker Signer Implementation
 * Follows the specification for Nostr Remote Signing
 */
export class BunkerSigner implements Signer {
  private secretKeyHex: string;
  private pool: nostrTools.SimplePool;
  private connected = false;
  private pendingRequests = new Map<string, { 
    resolve: (value: unknown) => void; 
    reject: (reason: unknown) => void;
  }>();
  private clientPubkey: string;
  private userPubkey = "";
  private subscription: { close: () => void } | null = null;
  
  /**
   * Create a new BunkerSigner instance
   * @param bunkerPointer - Remote signer connection details
   * @param clientKey - Client keypair secret key
   */
  private constructor(
    private bunkerPointer: BunkerPointer,
    clientKey: Uint8Array
  ) {
    this.secretKeyHex = bytesToHex(clientKey);
    this.clientPubkey = getPublicKey(this.secretKeyHex);
    this.pool = new nostrTools.SimplePool();
    
    log.debug(`Created BunkerSigner for ${bunkerPointer.pubkey.slice(0, 8)}... with client pubkey ${this.clientPubkey.slice(0, 8)}...`);
  }
  
  /**
   * Connect to a remote signer using a bunker URL
   * @param bunkerUrl - URL in the format bunker://<pubkey>?relay=<wsurl>&secret=<secret>
   */
  public static async connect(bunkerUrl: string): Promise<BunkerSigner> {
    const bunkerPointer = parseBunkerUrl(bunkerUrl);
    
    if (!bunkerPointer.secret) {
      log.warn("No secret in bunker URL - connection may fail if required by the remote signer");
    } else {
      log.debug("Secret parameter found in bunker URL");
    }
    
    const clientKey = nostrTools.generateSecretKey();
    log.debug("Generated new client keypair for this connection");
    
    const signer = new BunkerSigner(bunkerPointer, clientKey);
    
    try {
      await signer.connect();
      
      log.debug("Connection successful - saving client key");
      saveBunkerInfo(bunkerPointer.pubkey, clientKey, bunkerUrl);
      
      return signer;
    } catch (error: unknown) {
      try {
        await signer.disconnect();
      } catch (e) {
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to connect to bunker: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Connect to a bunker from an nbunksec string
   */
  public static async importFromNbunk(nbunkString: string): Promise<BunkerSigner> {
    try {
      const info = decodeBunkerInfo(nbunkString);
      
      const clientKey = new Uint8Array(
        info.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      
      const bunkerPointer: BunkerPointer = {
        pubkey: info.pubkey,
        relays: info.relays,
        secret: info.secret || null
      };
      
      const signer = new BunkerSigner(bunkerPointer, clientKey);
      
      try {
        await signer.connect();
        
        log.info("Connection successful from nbunksec");
        const dummyUrl = `bunker://${info.pubkey}?${info.relays.map(r => `relay=${encodeURIComponent(r)}`).join("&")}`;
        saveBunkerInfo(info.pubkey, clientKey, dummyUrl);
        
        return signer;
      } catch (error: unknown) {
        await signer.disconnect();
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Failed to connect to bunker from nbunksec: ${errorMessage}`);
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to import from nbunksec: ${errorMessage}`);
      throw error;
    }
  }
  
   /**
   * Connect to the remote signer
   * Follows the NIP-46 connection flow
   */
   private async connect(): Promise<void> {
    this.connected = false;
    
    log.info(`Connecting to bunker ${this.bunkerPointer.pubkey.slice(0, 8)}... via ${this.bunkerPointer.relays.join(", ")}`);
    
    try {
      this.cleanup();
      
      this.pool = new nostrTools.SimplePool();
      
      let oneSuccessfulConnection = false;
      const connectionPromises = this.bunkerPointer.relays.map(async (relayUrl) => {
        try {
          log.debug(`Ensuring connection to relay: ${relayUrl}`);
          await this.pool.ensureRelay(relayUrl); 
          log.debug(`Successfully connected to relay: ${relayUrl}`);
          oneSuccessfulConnection = true; 
        } catch (error) {
          log.warn(`Failed to connect to relay ${relayUrl}: ${error}`);
        }
      });
      
      await Promise.allSettled(connectionPromises);
      
      if (!oneSuccessfulConnection) {
        throw new Error("Failed to connect to any of the specified bunker relays.");
      }
      log.info("Established connection to at least one relay.");
      
      
      log.debug(`Setting up subscription for responses to client pubkey ${this.clientPubkey.slice(0, 8)}...`);
      
      const filter = {
        kinds: [NIP46_KIND],
        "#p": [this.clientPubkey],
      };
      
      try {
        this.subscription = this.pool.subscribeMany(
          this.bunkerPointer.relays,
          [filter],
          {
            onevent: (event: NostrEvent) => {
              this.handleResponse(event);
            }
          }
        );
        
      } catch (error) {
        log.error(`Failed to create subscription: ${error}`);
        this.cleanup();
        throw new Error(`Failed to create subscription: ${error}`);
      }
      
      const permissionsStr = "get_public_key,sign_event";
      const connectParams = [this.bunkerPointer.pubkey];
      
      if (this.bunkerPointer.secret) {
        log.debug("Adding secret to connect request");
        connectParams.push(this.bunkerPointer.secret);
      }
      connectParams.push(permissionsStr);
      
      log.info("Sending connect request to bunker");
      
      try {
        const connectResponse = await this.sendRequest('connect', connectParams, 15000);
        log.debug(`Connect response: ${JSON.stringify(connectResponse)}`);
        
        if (connectResponse === "ack") {
          this.connected = true;
          log.info("Connect request acknowledged (ack)");
        } else {
          log.warn(`Unexpected connect response: ${JSON.stringify(connectResponse)}. Assuming not connected.`);
          this.connected = false; 
          throw new Error(`Bunker returned unexpected response to connect request: ${JSON.stringify(connectResponse)}`);
        }
      } catch (connectError: unknown) {
        const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);
        
        if (errorMessage.toLowerCase().includes("already connected")) { 
          log.info("Already connected to bunker (or bunker reported as such)");
          this.connected = true; 
        } else if (errorMessage.toLowerCase().includes("unauthorized") || errorMessage.toLowerCase().includes("permission")) {
          log.error(`Unauthorized: ${errorMessage}. Check secret parameter.`);
          this.connected = false;
          throw new Error(`Unauthorized: ${errorMessage}`);
        } else {
          log.error(`Connect error: ${errorMessage}`);
          this.connected = false;
          throw connectError;
        }
      }
      
      if (this.connected) {
        log.debug("Connected successfully, requesting user public key");
        
        try {
          const userPubkey = await this.sendRequest('get_public_key', [], 10000) as string;
          
          if (!userPubkey || typeof userPubkey !== 'string' || userPubkey.length !== 64) {
            log.error(`Invalid user pubkey received: ${userPubkey}`);
            this.connected = false; 
            throw new Error(`Invalid user pubkey received: ${userPubkey}`);
          }
          
          this.userPubkey = userPubkey;
          log.info(`Connected to bunker, user pubkey: ${this.userPubkey.slice(0, 8)}...`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error(`Failed to get user pubkey: ${errorMessage}`);
          this.connected = false; 
          throw error; 
        }
      } else {
        throw new Error("Failed to establish connection to bunker (connect request failed, was denied, or response invalid)");
      }
    } catch (error) {
      this.connected = false;
      this.cleanup();
      throw error; 
    }
  }
  
  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.subscription) {
      try {
        this.subscription.close();
      } catch (e) {
      }
      this.subscription = null;
    }
    
    if (this.pool) {
      try {
        this.pool.close(this.bunkerPointer.relays);
      } catch (e) {
      }
    }
  }
  
  /**
   * Handle a response from the bunker
   */
  private async handleResponse(event: NostrEvent): Promise<void> {
    if (event.pubkey !== this.bunkerPointer.pubkey) {
      return;
    }
    
    try {
      log.debug(`Received response event from bunker, attempting to decrypt`);
      
      let decrypted: string;
      try {
        decrypted = await decryptContent(this.secretKeyHex, event.pubkey, event.content);
      } catch (error) {
        log.error(`Failed to decrypt response: ${error}`);
        throw error;
      }
      
      let response;
      try {
        response = JSON.parse(decrypted);
      } catch (parseError) {
        log.error(`Failed to parse decrypted response: ${decrypted.substring(0, 100)}`);
        throw parseError;
      }
      
      if (response.error) {
        log.debug(`Bunker error response: ${response.error}`);
      } else {
        log.debug(`Received successful bunker response for id: ${response.id}`);
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
      log.error(`Failed to process response: ${errorMessage}`);
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
    
    const encrypted = await encryptContent(
      this.secretKeyHex,
      this.bunkerPointer.pubkey, 
      JSON.stringify(request)
    );
    
    const event: NostrEventTemplate = {
      kind: NIP46_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", this.bunkerPointer.pubkey]],
      content: encrypted,
    };
    
    return finalizeEvent(event, this.secretKeyHex);
  }
  
  /**
   * Send a request to the bunker
   */
  private async sendRequest(method: string, params: unknown[], timeoutMs = 10000): Promise<unknown> {
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
      
      const timeoutHandle = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timed out: ${method}`));
        }
      }, timeoutMs);
      
      this.encryptAndSendRequest(request)
        .then(() => {
        })
        .catch(error => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(id);
          reject(error);
        });
    });
  }
  
  /**
   * Encrypt and send a request to the bunker
   */
  private async encryptAndSendRequest(request: { id: string; method: string; params: unknown[] }): Promise<void> {
    try {
      const encrypted = await encryptContent(
        this.secretKeyHex,
        this.bunkerPointer.pubkey, 
        JSON.stringify(request)
      );
      
      const event: NostrEventTemplate = {
        kind: NIP46_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.bunkerPointer.pubkey]],
        content: encrypted,
      };
      
      const signedEvent = finalizeEvent(
        event, 
        this.secretKeyHex
      );
      
      log.debug(`Publishing ${request.method} request to ${this.bunkerPointer.relays.length} relays`);
      
      await this.pool.publish(this.bunkerPointer.relays, signedEvent);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to send request: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Disconnect from the bunker
   * Note: NIP-46 doesn't define a disconnect method, this just cleans up resources
   */
  public async disconnect(): Promise<void> {
    this.connected = false;
    
    for (const [id, { reject }] of this.pendingRequests.entries()) {
      reject(new Error("Disconnected from bunker"));
      this.pendingRequests.delete(id);
    }
    
    this.cleanup();
    
    log.debug("Disconnected from bunker");
  }
  
  /**
   * Get the user's public key
   */
  public getPublicKey(): string {
    return this.userPubkey;
  }
  
  /**
   * Sign an event using the bunker
   * Implements the main NIP-46 sign_event method
   */
  public async signEvent(template: NostrEventTemplate): Promise<NostrEvent> {
    const templateString = JSON.stringify(template);
    
    log.debug(`Sending sign_event request`);
    
    try {
      const signedEventJson = await this.sendRequest('sign_event', [templateString]) as string;
      
      try {
        let signedEvent: NostrEvent;
        
        if (typeof signedEventJson === 'string') {
          signedEvent = JSON.parse(signedEventJson);
        } else {
          signedEvent = signedEventJson as NostrEvent;
        }
        
        if (!signedEvent.id || !signedEvent.pubkey || !signedEvent.sig) {
          throw new Error('Invalid signed event: missing id, pubkey, or signature');
        }
        
        return signedEvent;
      } catch (parseError: unknown) {
        const parseErrorMsg = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(`Failed to parse signed event: ${parseErrorMsg}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to sign event: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Get the encoded bunker info for this connection
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