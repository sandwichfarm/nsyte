import { createLogger } from "./logger.ts";
import { NostrEvent, NostrEventTemplate } from "./nostr.ts";
import { Signer } from "./upload.ts";
import * as nostrTools from "npm:nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";

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
    
    // Generate a new secret key for the client
    const secretKey = nostrTools.generateSecretKey();
    
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
      
      // Increase timeout for connect since it requires user interaction
      const connectTimeout = 120000; // 2 minutes
      try {
        await this.sendRequest('connect', connectParams, connectTimeout);
      } catch (connectError: unknown) {
        const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);
        
        // If the error is "already connected", we can proceed
        if (errorMessage.includes("already connected")) {
          log.info("Bunker reports we're already connected, proceeding...");
        } else {
          // For other errors, rethrow
          throw connectError;
        }
      }
      
      // Try to get public key - this might require permission
      try {
        const userPubkey = await this.sendRequest('get_public_key', [], 30000) as string;
        this.userPubkey = userPubkey;
        log.info(`Connected to bunker, user pubkey: ${this.userPubkey.slice(0, 8)}...`);
      } catch (pubkeyError: unknown) {
        const errorMessage = pubkeyError instanceof Error ? pubkeyError.message : String(pubkeyError);
        
        // If we hit a permission error, try requesting permission explicitly
        if (errorMessage.includes("no permission") || errorMessage.includes("permission denied")) {
          log.info("Permission required, requesting access from bunker...");
          
          // Request permissions for key operations
          const permissions = ["get_public_key", "sign_event"];
          await this.sendRequest('request_permission', permissions, 60000);
          
          // Try again to get public key
          this.userPubkey = await this.sendRequest('get_public_key', [], 30000) as string;
          log.info(`Connected to bunker, user pubkey: ${this.userPubkey.slice(0, 8)}...`);
        } else {
          throw pubkeyError;
        }
      }
    } catch (error) {
      this.connected = false;
      throw error;
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
      
      // Try to publish to each relay and use the first successful one
      let publishedSuccessfully = false;
      
      for (const relay of this.bunkerPointer.relays) {
        try {
          await this.pool.publish([relay], signedEvent);
          log.debug(`Request ${requestId} published successfully to relay: ${relay}`);
          publishedSuccessfully = true;
          break; // Successfully published to one relay, so we can stop
        } catch (err) {
          log.debug(`Failed to publish to ${relay}: ${err}`);
          // Continue to the next relay
        }
      }
      
      // If all individual relays failed, try publishing to all at once
      if (!publishedSuccessfully) {
        log.warn(`Failed to publish to individual relays, trying all relays together`);
        await this.pool.publish(this.bunkerPointer.relays, signedEvent);
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