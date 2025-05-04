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

const getPublicKey = (secretKey: string): string => {
  return (nostrTools.getPublicKey as any)(secretKey);
};

const finalizeEvent = (event: NostrEventTemplate, secretKey: string): NostrEvent => {
  return (nostrTools.finalizeEvent as any)(event, secretKey);
};

const nip04Encrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  try {
    return await (nostrTools.nip04.encrypt as any)(privateKey, publicKey, content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`NIP-04 encryption failed: ${errorMessage}`);
    throw error;
  }
};

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

const nip44Encrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  if (!nostrTools.nip44 || typeof nostrTools.nip44.encrypt !== 'function') {
    log.error("NIP-44 encryption is not available in the nostr-tools library");
    throw new Error("NIP-44 encryption not available - update your nostr-tools version");
  }
  
  try {
    return await (nostrTools.nip44.encrypt as any)(privateKey, publicKey, content);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`NIP-44 encryption failed: ${errorMessage}`);
    throw error;
  }
};

const nip44Decrypt = async (
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> => {
  if (!nostrTools.nip44 || typeof nostrTools.nip44.decrypt !== 'function') {
    log.error("NIP-44 decryption is not available in the nostr-tools library");
    throw new Error("NIP-44 decryption not available - update your nostr-tools version");
  }
  
  try {
    return await (nostrTools.nip44.decrypt as any)(privateKey, publicKey, content);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`NIP-44 decryption failed: ${errorMessage}`);
    throw error;
  }
};

export enum EncryptionProtocol {
  NIP04 = "NIP-04",
  NIP44 = "NIP-44"
}

let defaultEncryptionProtocol = EncryptionProtocol.NIP04;

/**
 * Set the encryption protocol to use for bunker communication
 */
export function setEncryptionProtocol(protocol: EncryptionProtocol): void {
  log.info(`Setting bunker encryption protocol to ${protocol}`);
  defaultEncryptionProtocol = protocol;
}

function detectBestEncryptionProtocol(): EncryptionProtocol {
  if (nostrTools.nip44 && typeof nostrTools.nip44.encrypt === 'function') {
    log.debug("NIP-44 encryption is available, but using NIP-04 by default for compatibility");
    return EncryptionProtocol.NIP04;
  } else {
    log.debug("NIP-44 encryption is not available, using NIP-04");
    return EncryptionProtocol.NIP04;
  }
}

defaultEncryptionProtocol = detectBestEncryptionProtocol();

async function encryptContent(
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> {
  if (defaultEncryptionProtocol === EncryptionProtocol.NIP44) {
    return await nip44Encrypt(privateKey, publicKey, content);
  } else {
    return await nip04Encrypt(privateKey, publicKey, content);
  }
}

async function decryptContent(
  privateKey: string,
  publicKey: string,
  content: string
): Promise<string> {
  if (defaultEncryptionProtocol === EncryptionProtocol.NIP44) {
    return await nip44Decrypt(privateKey, publicKey, content);
  } else {
    return await nip04Decrypt(privateKey, publicKey, content);
  }
}

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
 * Encode bunker information in NIP-19 style with "nbunksec" prefix
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
 * Decode a NIP-19 style "nbunksec" string into bunker information
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
 * Compute checksum for a bunker identifier
 */
export function computeBunkerChecksum(pubkey: string, relays: string[]): string {
  const sortedRelays = [...relays].sort();
  
  const data = pubkey + sortedRelays.join(",");
  const hash = sha256(new TextEncoder().encode(data));
  
  return bytesToHex(hash.slice(0, 8));
}

/**
 * Get stored bunker information for a bunker pubkey
 */
export function getBunkerInfo(bunkerPubkey: string): { clientKey: Uint8Array; bunkerUrl: string; nbunkString?: string } | null {
  try {
    const secretsManager = SecretsManager.getInstance();
    const nbunkString = secretsManager.getNbunk(bunkerPubkey);
    
    if (!nbunkString) {
      return null;
    }
    
    log.debug(`Found nbunksec in system secrets for ${bunkerPubkey.slice(0, 8)}...`);
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
    
    log.debug(`Saved bunker info for ${bunkerPubkey.slice(0, 8)}... as nbunksec`);
  } catch (error) {
    log.warn(`Failed to save bunker info: ${error}`);
  }
}

/**
 * Store a bunker URL in the secrets system
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
 * Get just the client key for backward compatibility
 */
export function getClientKey(bunkerPubkey: string): Uint8Array | null {
  const info = getBunkerInfo(bunkerPubkey);
  return info?.clientKey || null;
}

/**
 * Save just the client key for backward compatibility
 */
export function saveClientKey(bunkerPubkey: string, clientKey: Uint8Array): void {
  const existingInfo = getBunkerInfo(bunkerPubkey);
  
  if (existingInfo && existingInfo.bunkerUrl) {
    saveBunkerInfo(bunkerPubkey, clientKey, existingInfo.bunkerUrl);
  } else {
    const bunkerInfo: BunkerInfo = {
      pubkey: bunkerPubkey,
      relays: ["wss://dummy.relay"],
      local_key: bytesToHex(clientKey)
    };
    
    const nbunkString = encodeBunkerInfo(bunkerInfo);
    
    const secretsManager = SecretsManager.getInstance();
    secretsManager.storeNbunk(bunkerPubkey, nbunkString);
    
    log.debug(`Saved client key for bunker ${bunkerPubkey.slice(0, 8)}... as nbunksec`);
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
    
    if (!bunkerPointer.secret) {
      log.warn("NO SECRET in bunker URL - connection will likely fail!");
    } else {
      log.debug("Secret parameter found in bunker URL");
    }
    
    const secretKey = nostrTools.generateSecretKey();
    log.debug("Generated new client key for this connection");
    
    const signer = new BunkerSigner(bunkerPointer, secretKey);
    
    try {
      await signer.connect();
      
      log.debug("Connection successful - now saving client key");
      
      saveBunkerInfo(bunkerPointer.pubkey, secretKey, bunkerUrl);
      
      return signer;
    } catch (error: unknown) {
      await signer.disconnect();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to connect to bunker: ${errorMessage}`);
      throw new Error(`Failed to connect to bunker: ${errorMessage}`);
    }
  }
  
  /**
   * Import from an nbunksec string
   */
  public static async importFromNbunk(nbunkString: string): Promise<BunkerSigner> {
    try {
      const info = decodeBunkerInfo(nbunkString);
      
      const secretKey = new Uint8Array(
        info.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      
      const bunkerPointer: BunkerPointer = {
        pubkey: info.pubkey,
        relays: info.relays,
        secret: null
      };
      
      const signer = new BunkerSigner(bunkerPointer, secretKey);
      
      try {
        await signer.connect();
        
        log.info("Connection successful - saving nbunksec");
        const dummyUrl = `bunker://${info.pubkey}?${info.relays.map(r => `relay=${encodeURIComponent(r)}`).join("&")}`;
        saveBunkerInfo(info.pubkey, secretKey, dummyUrl);
        
        return signer;
      } catch (error: unknown) {
        await signer.disconnect();
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Failed to connect to bunker from nbunksec: ${errorMessage}`);
        throw new Error(`Failed to connect to bunker from nbunksec: ${errorMessage}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to import from nbunksec: ${errorMessage}`);
      throw new Error(`Failed to import from nbunksec: ${errorMessage}`);
    }
  }
  
  /**
   * Connect to the bunker
   */
  private async connect(): Promise<void> {
    log.info(`Connecting to bunker ${this.bunkerPointer.pubkey.slice(0, 8)}... via ${this.bunkerPointer.relays.join(", ")}`);
    
    if (!this.bunkerPointer.secret) {
      log.warn("No secret parameter provided in bunker URL - this will likely fail");
    } else {
      log.debug("Using secret from URL for connection");
    }
    
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
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    this.connected = true;
    
    try {
      const connectParams = [this.bunkerPointer.pubkey];
      if (this.bunkerPointer.secret) {
        log.debug("Adding secret to connect request");
        connectParams.push(this.bunkerPointer.secret);
      }
      
      log.info("Sending connect request to bunker...");
      
      try {
        const event = await this.prepareRequestEvent('connect', connectParams);
        const directSuccess = await this.publishDirectly(event);
        
        if (!directSuccess) {
          await this.sendRequest('connect', connectParams, 90000);
        }
        
        log.info("Connect request succeeded");
      } catch (connectError: unknown) {
        const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);
        
        if (errorMessage.includes("already connected")) {
          log.info("Bunker reports we're already connected, proceeding...");
        } else if (errorMessage.includes("unauthorized") || errorMessage.includes("permission")) {
          throw new Error("Unauthorized - the secret parameter may be incorrect or missing");
        } else {
          throw connectError;
        }
      }
      
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
      
      await this.requestPermissions();
      
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
              
              success = true;
              
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
    const permissions = ["get_public_key", "sign_event"];
    
    const methods = [
      'request_permissions',
      'request_permission',
      'authorize'
    ];
    
    log.info("Requesting bunker permission - check your bunker app for approval prompt");
    
    for (const method of methods) {
      try {
        const event = await this.prepareRequestEvent(method, [permissions]);
        const directSuccess = await this.publishDirectly(event);
        
        if (!directSuccess) {
          await this.sendRequest(method, [permissions], 8000);
        }
        
        log.info(`Permission request sent with ${method}, waiting for approval...`);
        return;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes("method not found") || 
            errorMessage.includes("unknown method") || 
            errorMessage.includes("not implemented") ||
            errorMessage.includes("no such method")) {
          continue;
        }
        
        if (errorMessage.includes("already authorized") || 
            errorMessage.includes("already granted") ||
            errorMessage.includes("permission already") ||
            errorMessage.includes("already has permission")) {
          log.info("Permission already granted");
          return;
        }
        
        log.warn(`Error requesting permission with ${method}: ${errorMessage}`);
      }
    }
    
    log.warn("Could not automatically request permissions. Please approve this client in your bunker app.");
    
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
      const decrypted = await decryptContent(
        this.secretKeyHex,
        event.pubkey, 
        event.content
      );
      
      const response = JSON.parse(decrypted);
      
      if (response.error) {
        const methodInfo = response.id ? ` for request ${response.id}` : '';
        
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
      
      const timeoutHandle = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          log.error(`Request timed out: ${method} (id: ${id})`);
          reject(new Error(`Request timed out: ${method}`));
        }
      }, timeoutMs);
      
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
      
      log.debug(`Publishing ${request.method} request to ${this.bunkerPointer.relays.length} relays (id: ${requestId})`);
      
      const relayStatuses = new Map<string, string>();
      
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
        
      }
      
      const criticalMethods = ['connect', 'request_permissions', 'request_permission', 'authorize', 'get_public_key'];
      const needsDirectPublish = criticalMethods.includes(request.method);
      
      if (needsDirectPublish) {
        log.debug(`Using direct publishing for critical method: ${request.method}`);
        
        const directSuccess = await this.publishDirectly(signedEvent);
        if (directSuccess) {
          log.debug(`Direct publish succeeded for ${request.method}`);
        } else {
          log.warn(`Direct publish failed for critical method: ${request.method}`);
        }
      }
      
      const needsIndividualPublish = !allRelaysPublished || criticalMethods.includes(request.method);
      
      if (needsIndividualPublish) {
        log.debug(`${!allRelaysPublished ? "Trying" : "Also trying"} individual relay publishing for ${request.method}`);
        
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
        
        const results = await Promise.all(individualPublishPromises);
        const successCount = results.filter(r => r).length;
        
        if (successCount > 0) {
          log.debug(`Successfully published to ${successCount}/${this.bunkerPointer.relays.length} relays individually`);
          
          log.debug("Relay publish statuses:");
          for (const [relay, status] of relayStatuses.entries()) {
            log.debug(`  - ${relay}: ${status}`);
          }
          
          return;
        }
        
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
    } catch (e: unknown) {
      log.debug(`Disconnected from bunker: ${e}`);
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
    const maxRetries = 3;
    let lastError: unknown = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const templateString = JSON.stringify(template);
        
        if (attempt > 1) {
          log.info(`Retry attempt ${attempt}/${maxRetries} for sign_event`);
        }
        
        log.debug(`Sending sign_event request with template: ${templateString.slice(0, 100)}...`);
        
        const signedEventJson = await this.sendRequest('sign_event', [templateString], 60000) as string;
        
        try {
          let signedEvent: NostrEvent;
          
          if (typeof signedEventJson === 'string') {
            log.debug(`Received sign_event response as string, parsing`);
            signedEvent = JSON.parse(signedEventJson);
          } else if (typeof signedEventJson === 'object') {
            log.debug(`Received sign_event response as object`);
            signedEvent = signedEventJson as NostrEvent;
          } else {
            throw new Error(`Unexpected response type from bunker: ${typeof signedEventJson}`);
          }
          
          if (!signedEvent.id || !signedEvent.pubkey || !signedEvent.sig) {
            throw new Error('Invalid signed event: missing id, pubkey, or signature');
          }
          
          return signedEvent;
        } catch (parseError: unknown) {
          const parseErrorMsg = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(`Failed to parse signed event: ${parseErrorMsg}. Received: ${typeof signedEventJson === 'string' ? signedEventJson.slice(0, 100) : JSON.stringify(signedEventJson).slice(0, 100)}...`);
        }
      } catch (error: unknown) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (attempt < maxRetries) {
          log.warn(`Sign event attempt ${attempt} failed: ${errorMessage}. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        } else {
          log.error(`Failed to sign event with bunker after ${maxRetries} attempts: ${errorMessage}`);
        }
      }
    }
    
    const finalError = lastError instanceof Error ? lastError.message : String(lastError);
    const errorMsg = `Failed to sign event with bunker: ${finalError}`;
    
    if (finalError.includes("timeout")) {
      log.error("Bunker signing timed out. This could be due to:");
      log.error("1. The bunker app is not open or responding");
      log.error("2. The bunker has not approved the signing request");
      log.error("3. Network issues between the client and relays");
      log.error("Please check your bunker app and try again.");
    } else if (finalError.includes("permission") || finalError.includes("unauthorized")) {
      log.error("Permission error. The bunker has not authorized signing for this client.");
      log.error("Please approve the NIP-46 permission request in your bunker app.");
    } else if (finalError.includes("parse") || finalError.includes("unmarshal")) {
      log.error("The bunker could not parse the sign request. This is likely a compatibility issue.");
      log.error("Please check that your bunker implementation supports NIP-46 fully.");
      log.error("The event template should be a JSON string, not an object.");
    }
    
    throw new Error(errorMsg);
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
   * Get the nbunksec string for this connection
   */
  public getNbunkString(): string {
    const bunkerInfo: BunkerInfo = {
      pubkey: this.bunkerPointer.pubkey,
      relays: this.bunkerPointer.relays,
      local_key: this.secretKeyHex
    };
    
    return encodeBunkerInfo(bunkerInfo);
  }

  /**
   * Set the encryption protocol for bunker signer
   */
  public setEncryptionProtocol(protocol: EncryptionProtocol): void {
    log.info(`Bunker signer for ${this.bunkerPointer.pubkey.slice(0, 8)}... using ${protocol} encryption`);
    defaultEncryptionProtocol = protocol;
  }

  /**
   * Static method to explicitly use NIP-04 encryption for all bunker communication
   */
  public static useNip04Encryption(): void {
    log.info("Setting all bunker communication to use NIP-04 encryption");
    defaultEncryptionProtocol = EncryptionProtocol.NIP04;
  }

  /**
   * Static method to explicitly use NIP-44 encryption for all bunker communication
   */
  public static useNip44Encryption(): void {
    if (!nostrTools.nip44 || typeof nostrTools.nip44.encrypt !== 'function') {
      log.error("NIP-44 encryption is not available in the nostr-tools library");
      throw new Error("NIP-44 encryption not available - make sure you have the latest nostr-tools version");
    }
    
    log.info("Setting all bunker communication to use NIP-44 encryption");
    defaultEncryptionProtocol = EncryptionProtocol.NIP44;
  }
} 