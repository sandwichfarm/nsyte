import { createLogger } from "./logger.ts";
import { NostrEvent, NostrEventTemplate } from "./nostr.ts";
import { Signer } from "./upload.ts";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { extractTagValue } from "./utils.ts";

const log = createLogger("bunker");

// NIP-46 kind for Nostr Connect messages
const NIP46_KIND = 24133;

/**
 * Simple NIP-04 implementation for encryption/decryption
 */
const nip04 = {
  /**
   * Encrypt a message using NIP-04
   */
  async encrypt(privateKey: string, publicKey: string, message: string): Promise<string> {
    // Convert keys to proper format
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = hexToBytes(publicKey);
    
    // Generate a random 128-bit IV
    const iv = new Uint8Array(16);
    crypto.getRandomValues(iv);
    
    // Derive a shared secret
    const sharedSecret = getSharedSecret(privateKeyBytes, publicKeyBytes);
    const sharedX = sharedSecret.slice(1, 33); // Use x-coordinate only
    
    // Create a key from the shared secret
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      sharedX,
      { name: "AES-CBC", length: 256 },
      false,
      ["encrypt"]
    );
    
    // Encrypt the message
    const messageBytes = new TextEncoder().encode(message);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      messageBytes
    );
    
    // Return base64-encoded IV + ciphertext
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  },

  /**
   * Decrypt a message using NIP-04
   */
  async decrypt(privateKey: string, publicKey: string, message: string): Promise<string> {
    // Convert keys to proper format
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = hexToBytes(publicKey);
    
    // Decode the base64 message
    const combined = Uint8Array.from(atob(message), c => c.charCodeAt(0));
    
    // Extract IV (first 16 bytes) and ciphertext
    const iv = combined.slice(0, 16);
    const ciphertext = combined.slice(16);
    
    // Derive a shared secret
    const sharedSecret = getSharedSecret(privateKeyBytes, publicKeyBytes);
    const sharedX = sharedSecret.slice(1, 33); // Use x-coordinate only
    
    // Create a key from the shared secret
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      sharedX,
      { name: "AES-CBC", length: 256 },
      false,
      ["decrypt"]
    );
    
    // Decrypt the message
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      ciphertext
    );
    
    // Return the decoded message
    return new TextDecoder().decode(plaintext);
  }
};

// Interface for NIP-46 request
interface Nip46Request {
  id: string;
  method: string;
  params: unknown[];
}

// Interface for NIP-46 response
interface Nip46Response {
  id: string;
  result?: unknown;
  error?: string;
}

// Interface for a WebSocket connection
interface WsConnection {
  url: string;
  socket: WebSocket;
  connected: boolean;
}

/**
 * Calculate the event ID (SHA-256 hash of the serialized event)
 */
function calculateId(event: { created_at: number; kind: number; tags: string[][]; content: string; pubkey: string }): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}

/**
 * Generate a random ID for NIP-46 requests
 */
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a keypair for client-side authentication
 */
function generateClientKeypair(): { privateKey: string; publicKey: string } {
  // Generate a random private key
  const privateKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(privateKeyBytes);
  const privateKey = bytesToHex(privateKeyBytes);
  
  // Derive the public key
  const publicKey = bytesToHex(schnorr.getPublicKey(privateKeyBytes));
  
  return { privateKey, publicKey };
}

/**
 * Parse a bunker URL into its components
 * Format: bunker://<pubkey>?relay=wss://...&relay=wss://...&secret=...
 */
export function parseBunkerUrl(url: string): {
  signerPubkey: string;
  relays: string[];
  secret?: string;
} {
  if (!url.startsWith("bunker://")) {
    throw new Error("Invalid bunker URL format. Must start with bunker://");
  }
  
  try {
    // Convert to URL object for parsing
    const parsedUrl = new URL(url.replace("bunker://", "https://"));
    
    // Extract pubkey (the hostname)
    const signerPubkey = parsedUrl.hostname;
    
    // Extract relays
    const relays = parsedUrl.searchParams.getAll("relay");
    if (relays.length === 0) {
      throw new Error("Bunker URL must include at least one relay parameter");
    }
    
    // Extract secret (optional)
    const secret = parsedUrl.searchParams.get("secret") || undefined;
    
    return { signerPubkey, relays, secret };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse bunker URL: ${errorMessage}`);
  }
}

/**
 * Compute a shared secret from private and public keys
 * 
 * This is a simplified implementation that doesn't use proper ECDH,
 * but matches the NIP-04 implementation in most clients
 */
function getSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  // For NIP-04, the shared secret is computed as sha256(publicKey · privateKey)
  const combined = new Uint8Array(privateKey.length + publicKey.length);
  combined.set(privateKey);
  combined.set(publicKey, privateKey.length);
  
  // Hash the combined value
  return sha256(combined);
}

/**
 * NIP-46 Bunker Signer Implementation
 */
export class BunkerSigner implements Signer {
  private signerPubkey: string;
  private clientPrivateKey: string;
  private clientPubkey: string;
  private relays: string[];
  private connections: WsConnection[] = [];
  private connected = false;
  private pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = new Map();
  private userPubkey: string;
  
  /**
   * Create a new bunker signer instance
   * This should not be called directly, use the static connect method instead
   */
  private constructor(
    signerPubkey: string,
    clientKeypair: { privateKey: string; publicKey: string },
    relays: string[],
    userPubkey: string
  ) {
    this.signerPubkey = signerPubkey;
    this.clientPrivateKey = clientKeypair.privateKey;
    this.clientPubkey = clientKeypair.publicKey;
    this.relays = relays;
    this.userPubkey = userPubkey;
    
    log.debug(`Created bunker signer for ${this.signerPubkey.slice(0, 8)}...`);
  }
  
  /**
   * Connect to a NIP-46 bunker
   */
  public static async connect(bunkerUrl: string): Promise<BunkerSigner> {
    const { signerPubkey, relays, secret } = parseBunkerUrl(bunkerUrl);
    
    // Generate a client keypair for this session
    const clientKeypair = generateClientKeypair();
    
    log.info(`Connecting to bunker ${signerPubkey.slice(0, 8)}... via ${relays.join(", ")}`);
    
    // Create the bunker signer instance with a temporary user pubkey
    // We'll update this after connecting
    const signer = new BunkerSigner(signerPubkey, clientKeypair, relays, "");
    
    // Connect to the relays
    await signer.connectToRelays();
    
    // Send connect request with secret if provided
    const connectParams = [signerPubkey];
    if (secret) {
      connectParams.push(secret);
    }
    
    try {
      // Send connect request
      await signer.sendRequest("connect", connectParams);
      
      // Get the user's public key
      const userPubkey = await signer.sendRequest("get_public_key", []) as string;
      
      // Update the user pubkey
      signer.userPubkey = userPubkey;
      
      log.info(`Connected to bunker, user pubkey: ${userPubkey.slice(0, 8)}...`);
      
      return signer;
    } catch (error: unknown) {
      // Close connections
      signer.disconnect();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to bunker: ${errorMessage}`);
    }
  }
  
  /**
   * Connect to all specified relays
   */
  private async connectToRelays(): Promise<void> {
    const connectionPromises = this.relays.map(url => this.connectToRelay(url));
    
    // Wait for all connections to be established
    await Promise.all(connectionPromises);
    
    if (this.connections.length === 0) {
      throw new Error("Failed to connect to any relay");
    }
    
    this.connected = true;
  }
  
  /**
   * Connect to a single relay
   */
  private async connectToRelay(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(url);
        
        const connection: WsConnection = {
          url,
          socket,
          connected: false,
        };
        
        // Set up event handlers
        socket.onopen = () => {
          log.debug(`Connected to relay ${url}`);
          connection.connected = true;
          this.connections.push(connection);
          
          // Subscribe to responses directed to our client pubkey
          const subscriptionId = "sub_" + Math.random().toString(36).substring(2, 10);
          const subscriptionMsg = JSON.stringify([
            "REQ",
            subscriptionId,
            {
              kinds: [NIP46_KIND],
              "#p": [this.clientPubkey],
            },
          ]);
          
          socket.send(subscriptionMsg);
          resolve();
        };
        
        socket.onmessage = (event) => {
          this.handleRelayMessage(event.data);
        };
        
        socket.onerror = (error) => {
          log.error(`WebSocket error with relay ${url}: ${error.toString()}`);
          if (!connection.connected) {
            reject(new Error(`Failed to connect to relay ${url}`));
          }
        };
        
        socket.onclose = () => {
          log.debug(`Disconnected from relay ${url}`);
          connection.connected = false;
          
          // Remove from connections array
          const index = this.connections.findIndex(c => c.url === url);
          if (index !== -1) {
            this.connections.splice(index, 1);
          }
          
          // If this was the last connection, set connected to false
          if (this.connections.length === 0) {
            this.connected = false;
          }
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Failed to connect to relay ${url}: ${errorMessage}`);
        reject(error);
      }
    });
  }
  
  /**
   * Handle incoming relay messages
   */
  private handleRelayMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      // Check if this is an EVENT message with our expected format
      if (!Array.isArray(message) || message[0] !== "EVENT" || !message[2]) {
        return;
      }
      
      const event = message[2] as NostrEvent;
      
      // Check if this is a NIP-46 event
      if (event.kind !== NIP46_KIND) {
        return;
      }
      
      // Check if this event is from the signer to us
      if (event.pubkey !== this.signerPubkey) {
        return;
      }
      
      // Check if we are the recipient
      const recipient = extractTagValue(event, "p");
      if (recipient !== this.clientPubkey) {
        return;
      }
      
      // Decrypt the content
      this.decryptEventContent(event)
        .then(content => {
          // Parse the response
          const response = JSON.parse(content) as Nip46Response;
          
          // Find the pending request
          const pendingRequest = this.pendingRequests.get(response.id);
          if (!pendingRequest) {
            return;
          }
          
          // Remove from pending requests
          this.pendingRequests.delete(response.id);
          
          // Resolve or reject the promise
          if (response.error) {
            pendingRequest.reject(new Error(response.error));
          } else {
            pendingRequest.resolve(response.result);
          }
        })
        .catch(error => {
          log.error(`Failed to decrypt event content: ${error instanceof Error ? error.message : String(error)}`);
        });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to handle relay message: ${errorMessage}`);
    }
  }
  
  /**
   * Decrypt the content of a NIP-46 event
   */
  private async decryptEventContent(event: NostrEvent): Promise<string> {
    try {
      // Decrypt using NIP-04
      return await nip04.decrypt(this.clientPrivateKey, event.pubkey, event.content);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to decrypt event content: ${errorMessage}`);
    }
  }
  
  /**
   * Send a request to the bunker
   */
  private async sendRequest(method: string, params: unknown[]): Promise<unknown> {
    if (!this.connected) {
      throw new Error("Not connected to any relay");
    }
    
    return new Promise((resolve, reject) => {
      const requestId = generateRequestId();
      
      // Create the request
      const request: Nip46Request = {
        id: requestId,
        method,
        params,
      };
      
      // Store the pending request
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Send the request
      this.sendRequestEvent(request)
        .catch(error => {
          // Remove from pending requests
          this.pendingRequests.delete(requestId);
          reject(error);
        });
      
      // Set a timeout for the request
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timed out: ${method}`));
        }
      }, 30000); // 30 second timeout
    });
  }
  
  /**
   * Send a request event to the bunker
   */
  private async sendRequestEvent(request: Nip46Request): Promise<void> {
    try {
      // Encrypt the request
      const encryptedContent = await nip04.encrypt(
        this.clientPrivateKey,
        this.signerPubkey,
        JSON.stringify(request)
      );
      
      // Create the event
      const event: NostrEventTemplate = {
        kind: NIP46_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.signerPubkey]],
        content: encryptedContent,
      };
      
      // Calculate the event ID
      const id = calculateId({
        ...event,
        pubkey: this.clientPubkey,
      });
      
      // Sign the event
      const privateKeyBytes = hexToBytes(this.clientPrivateKey);
      const sig = bytesToHex(schnorr.sign(id, privateKeyBytes));
      
      // Create the final event
      const signedEvent: NostrEvent = {
        ...event,
        id,
        pubkey: this.clientPubkey,
        sig,
      };
      
      // Send the event to all connected relays
      for (const connection of this.connections) {
        if (connection.connected) {
          const eventMsg = JSON.stringify(["EVENT", signedEvent]);
          connection.socket.send(eventMsg);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send request event: ${errorMessage}`);
    }
  }
  
  /**
   * Disconnect from all relays
   */
  public disconnect(): void {
    for (const connection of this.connections) {
      if (connection.connected) {
        connection.socket.close();
      }
    }
    
    this.connections = [];
    this.connected = false;
    
    // Reject all pending requests
    for (const [id, { reject }] of this.pendingRequests.entries()) {
      reject(new Error("Disconnected from relays"));
      this.pendingRequests.delete(id);
    }
  }
  
  /**
   * Get the public key
   */
  public getPublicKey(): string {
    return this.userPubkey;
  }
  
  /**
   * Sign an event using the bunker
   */
  public async signEvent(template: NostrEventTemplate): Promise<NostrEvent> {
    try {
      // Send sign_event request
      const signedEvent = await this.sendRequest("sign_event", [template]) as NostrEvent;
      return signedEvent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to sign event with bunker: ${errorMessage}`);
    }
  }
} 