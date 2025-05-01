import { createLogger } from "./logger.ts";
import { NostrEvent, NostrEventTemplate } from "./nostr.ts";
import { Signer } from "./upload.ts";
import * as nostrTools from "npm:nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";
import { join, dirname } from "std/path/mod.ts";
import { ensureDirSync } from "std/fs/ensure_dir.ts";

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
 * Manages the client keys for NIP-46 bunker connections
 */
class BunkerKeyManager {
  private static readonly CONFIG_DIR = ".nsite";
  private static readonly BUNKER_SECRETS_FILE = "bunker_secrets.json";
  
  /**
   * Get stored bunker information for a bunker pubkey
   */
  public static getBunkerInfo(bunkerPubkey: string): { clientKey: Uint8Array; bunkerUrl: string } | null {
    try {
      const data = this.loadSecrets();
      const bunkerData = data[bunkerPubkey];
      
      if (!bunkerData || !bunkerData.local_key) {
        return null;
      }
      
      // Convert hex string back to Uint8Array
      const clientKey = new Uint8Array(
        bunkerData.local_key.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      
      return {
        clientKey,
        bunkerUrl: bunkerData.bunker_url || ""
      };
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
      
      // Convert Uint8Array to hex string for storage
      data[bunkerPubkey] = {
        local_key: bytesToHex(clientKey),
        bunker_url: bunkerUrl
      };
      
      this.saveSecrets(data);
      log.debug(`Saved bunker info for ${bunkerPubkey.slice(0, 8)}...`);
    } catch (error) {
      log.warn(`Failed to save bunker info: ${error}`);
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
    // Get existing data to preserve bunker URL if it exists
    const data = this.loadSecrets();
    const existingData = data[bunkerPubkey] || {};
    
    data[bunkerPubkey] = {
      ...existingData,
      local_key: bytesToHex(clientKey)
    };
    
    this.saveSecrets(data);
    log.debug(`Saved client key for bunker ${bunkerPubkey.slice(0, 8)}...`);
  }
  
  /**
   * Load stored bunker secrets
   */
  private static loadSecrets(): Record<string, { local_key?: string; bunker_url?: string }> {
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
  private static saveSecrets(data: Record<string, { local_key?: string; bunker_url?: string }>): void {
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
    secretKey: Uint8Array,
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
    
    // Try to get existing bunker information
    let secretKey: Uint8Array | null = null;
    let storedBunkerUrl: string | null = null;
    
    const bunkerInfo = BunkerKeyManager.getBunkerInfo(bunkerPointer.pubkey);
    if (bunkerInfo) {
      secretKey = bunkerInfo.clientKey;
      storedBunkerUrl = bunkerInfo.bunkerUrl;
      
      // If stored URL exists, use its relays but keep the secret from the input URL
      if (storedBunkerUrl) {
        try {
          const storedPointer = parseBunkerUrl(storedBunkerUrl);
          // Use relays from stored URL but keep secret from input URL
          bunkerPointer.relays = storedPointer.relays;
          log.info("Using relays from previously saved bunker configuration");
        } catch (error) {
          log.warn(`Failed to parse stored bunker URL: ${error}`);
          // Keep using the original relays
        }
      }
      
      log.info("Using existing client key for this bunker");
    }
    
    // If no existing key, generate a new one and save it with the bunker URL
    if (!secretKey) {
      log.info("No existing client key found, generating a new one");
      secretKey = nostrTools.generateSecretKey();
      
      // Create a bunker URL to store - note we're using the original URL's structure but with secret removed
      // for security reasons - the secret is temporary and should not be stored
      const relayParams = bunkerPointer.relays.map(r => `relay=${encodeURIComponent(r)}`).join("&");
      const storableBunkerUrl = `bunker://${bunkerPointer.pubkey}?${relayParams}`;
      
      // Save both the client key and the storable bunker URL
      BunkerKeyManager.saveBunkerInfo(bunkerPointer.pubkey, secretKey, storableBunkerUrl);
    }
    
    const signer = new BunkerSigner(bunkerPointer, secretKey);
    
    try {
      await signer.connect();
      return signer;
    } catch (error: unknown) {
      await signer.disconnect();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to connect to bunker: ${errorMessage}`);
      throw new Error(`Failed to connect to bunker: ${errorMessage}`);
    }
  }
  
  /**
   * Connect to the bunker
   */
  private async connect(): Promise<void> {
    log.info(`Connecting to bunker ${this.bunkerPointer.pubkey.slice(0, 8)}... via ${this.bunkerPointer.relays.join(", ")}`);
    
    // Subscribe to responses from the bunker
    const sub = this.pool.subscribeMany(
      this.bunkerPointer.relays,
      [{
        kinds: [NIP46_KIND],
        "#p": [this.clientPubkey],
      }],
      {
        onevent: (event: NostrEvent) => {
          this.handleResponse(event);
        }
      }
    );
    
    this.subscription = sub;
    
    // Wait a moment for subscriptions to be established
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mark as connected to the relay - we need this to be true before sending requests
    this.connected = true;
    
    // Connect to the bunker
    const connectParams = [this.bunkerPointer.pubkey];
    if (this.bunkerPointer.secret) {
      connectParams.push(this.bunkerPointer.secret);
    }
    
    try {
      log.info("Waiting for bunker approval...");
      
      // Try to connect, which may return "already connected" - that's fine
      try {
        // Use shorter timeout for connect to avoid long waits
        await this.sendRequest('connect', connectParams, 15000);
      } catch (connectError: unknown) {
        const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);
        
        // If the error is "already connected", we can proceed
        if (errorMessage.includes("already connected")) {
          log.info("Bunker reports we're already connected, proceeding...");
        } 
        // If it's a timeout, we might still be connected, so try to proceed
        else if (errorMessage.includes("timed out")) {
          log.warn("Connect request timed out, trying to proceed anyway...");
        }
        else {
          throw connectError;
        }
      }
      
      // Skip explicit permission request and try to get the public key directly
      // This works better with bunkers that have already authorized this client
      try {
        log.info("Checking if user already authorized this client...");
        const userPubkey = await this.sendRequest('get_public_key', [], 10000) as string;
        this.userPubkey = userPubkey;
        log.info(`Connected to bunker, user pubkey: ${this.userPubkey.slice(0, 8)}...`);
        return; // Successfully connected with existing permissions
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("permission") || errorMessage.includes("not authorized")) {
          log.info("Permission needed, requesting authorization...");
          // Fall through to the permission request
        } else {
          log.warn(`Unexpected error checking permissions: ${errorMessage}`);
          // Still try permission request as fallback
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
    
    log.info("Requesting bunker permission - please approve in your bunker app");
    
    // Try each method
    for (const method of methods) {
      try {
        // Use a short timeout since we're trying multiple methods
        await this.sendRequest(method, [permissions], 8000);
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
      
      // Publish to all relays simultaneously for faster response
      let publishedSuccessfully = false;
      
      try {
        // Using try-catch to handle rate-limiting errors
        await this.pool.publish(this.bunkerPointer.relays, signedEvent);
        log.debug(`Request ${requestId} published to all relays`);
        publishedSuccessfully = true;
      } catch (error) {
        if (error instanceof Error) {
          // Check if it's a rate limiting error
          if (error.message.includes("rate-limit") || error.message.includes("noting too much")) {
            log.warn(`Rate limiting detected when publishing to relays: ${error.message}`);
          } else {
            log.warn(`Failed to publish to all relays at once: ${error}`);
          }
        } else {
          log.warn(`Failed to publish to all relays at once: ${error}`);
        }
        // Fall back to trying each relay individually
      }
      
      // If publishing to all relays at once failed, try individual relays
      if (!publishedSuccessfully) {
        for (const relay of this.bunkerPointer.relays) {
          try {
            // Use try-catch to handle potential rate limiting on individual relays
            await this.pool.publish([relay], signedEvent);
            log.debug(`Request ${requestId} published successfully to relay: ${relay}`);
            publishedSuccessfully = true;
            break; // Successfully published to one relay, so we can stop
          } catch (err) {
            if (err instanceof Error && (err.message.includes("rate-limit") || err.message.includes("noting too much"))) {
              log.warn(`Rate limited on relay ${relay}: ${err.message}`);
            } else {
              log.debug(`Failed to publish to ${relay}: ${err}`);
            }
            // Continue to the next relay
          }
        }
      }
      
      if (!publishedSuccessfully) {
        throw new Error("Failed to publish to any relay");
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
} 