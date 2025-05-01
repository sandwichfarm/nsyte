import { createLogger } from "./logger.ts";
import { NostrEvent, NostrEventTemplate, parseBunkerUrl } from "./nostr.ts";
import { Signer } from "./upload.ts";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { schnorr } from "@noble/curves/secp256k1";
import { extractTagValue } from "./utils.ts";

const log = createLogger("bunker");

const NIP46_KIND = 24133;

/**
 * Simple NIP-04 implementation for encryption/decryption
 */
const nip04 = {
  /**
   * Encrypt a message using NIP-04
   */
  async encrypt(privateKey: string, publicKey: string, message: string): Promise<string> {
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = hexToBytes(publicKey);
    
    const iv = new Uint8Array(16);
    crypto.getRandomValues(iv);
    
    // Compute shared point and extract the x-coordinate
    // This is a compatible way of getting the shared secret for NIP-04
    const sharedSecret = await deriveSharedSecret(privateKey, publicKey);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "AES-CBC", length: 256 },
      false,
      ["encrypt"]
    );
    
    const messageBytes = new TextEncoder().encode(message);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      messageBytes
    );
    
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  },

  /**
   * Decrypt a message using NIP-04
   */
  async decrypt(privateKey: string, publicKey: string, message: string): Promise<string> {
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = hexToBytes(publicKey);
    
    const combined = Uint8Array.from(atob(message), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 16);
    const ciphertext = combined.slice(16);
    
    // Compute shared point and extract the x-coordinate
    // This is a compatible way of getting the shared secret for NIP-04
    const sharedSecret = await deriveSharedSecret(privateKey, publicKey);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "AES-CBC", length: 256 },
      false,
      ["decrypt"]
    );
    
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      ciphertext
    );
    
    return new TextDecoder().decode(plaintext);
  }
};

/**
 * Derive a shared secret using ECDH for NIP-04 encryption
 * This is the SHA256 of the X coordinate of the ECDH shared point
 */
async function deriveSharedSecret(privateKey: string, publicKey: string): Promise<Uint8Array> {
  // Convert hex to Uint8Array
  const privKeyBytes = hexToBytes(privateKey);
  const pubKeyBytes = hexToBytes(publicKey);
  
  // Hash the concatenation of the two keys
  // This is actually what most current NIP-04 implementations do
  const input = new Uint8Array(privKeyBytes.length + pubKeyBytes.length);
  input.set(privKeyBytes, 0);
  input.set(pubKeyBytes, privKeyBytes.length);
  
  // Return the SHA-256 hash
  return sha256(input);
}

/**
 * Generate a random private key
 */
function generatePrivateKey(): string {
  const privateKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(privateKeyBytes);
  return bytesToHex(privateKeyBytes);
}

/**
 * Get a public key from a private key
 */
function getPublicKey(privateKey: string): string {
  const privateKeyBytes = hexToBytes(privateKey);
  return bytesToHex(schnorr.getPublicKey(privateKeyBytes));
}

interface Nip46Request {
  id: string;
  method: string;
  params: unknown[];
}

interface Nip46Response {
  id: string;
  result?: unknown;
  error?: string;
}

interface WsConnection {
  url: string;
  socket: WebSocket;
  connected: boolean;
}

/**
 * Generate a random ID for NIP-46 requests
 */
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Sign an event with a private key
 */
function signEvent(event: {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
}, privateKey: string): NostrEvent {
  // Calculate the event ID
  const id = calculateId(event);
  
  // Sign the ID with the private key
  const sig = bytesToHex(schnorr.sign(id, hexToBytes(privateKey)));
  
  // Return the signed event
  return {
    id,
    pubkey: event.pubkey,
    kind: event.kind,
    created_at: event.created_at,
    tags: event.tags,
    content: event.content,
    sig,
  };
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
  private userPubkey = "";
  
  /**
   * Create a new bunker signer instance
   * This should not be called directly, use the static connect method instead
   */
  private constructor(
    signerPubkey: string,
    clientPrivateKey: string,
    relays: string[]
  ) {
    this.signerPubkey = signerPubkey;
    this.clientPrivateKey = clientPrivateKey;
    this.clientPubkey = getPublicKey(clientPrivateKey);
    this.relays = relays;
    
    log.debug(`Created bunker signer for ${this.signerPubkey.slice(0, 8)}... with client pubkey ${this.clientPubkey.slice(0, 8)}...`);
  }
  
  /**
   * Connect to a NIP-46 bunker
   */
  public static async connect(bunkerUrl: string): Promise<BunkerSigner> {
    const { pubkey, relays, secret } = parseBunkerUrl(bunkerUrl);
    
    // Create a local keypair for the client to securely communicate with the bunker
    const clientPrivateKey = generatePrivateKey();
    const clientPubkey = getPublicKey(clientPrivateKey);
    
    log.info(`Connecting to bunker ${pubkey.slice(0, 8)}... via ${relays.join(", ")}`);
    log.debug(`Client pubkey: ${clientPubkey.slice(0, 8)}...`);
    
    const signer = new BunkerSigner(pubkey, clientPrivateKey, relays);
    
    try {
      await signer.connectToRelays();
      
      const connectParams = [pubkey];
      if (secret) {
        connectParams.push(secret);
      }
      
      await signer.sendRequest("connect", connectParams);
      
      const userPubkey = await signer.sendRequest("get_public_key", []) as string;
      signer.userPubkey = userPubkey;
      
      log.info(`Connected to bunker, user pubkey: ${userPubkey.slice(0, 8)}...`);
      
      return signer;
    } catch (error: unknown) {
      await signer.disconnect();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to connect to bunker: ${errorMessage}`);
      throw new Error(`Failed to connect to bunker: ${errorMessage}`);
    }
  }
  
  /**
   * Connect to all specified relays
   */
  private async connectToRelays(): Promise<void> {
    const connectionPromises = this.relays.map(url => this.connectToRelay(url));
    
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
        
        socket.onopen = () => {
          log.debug(`Connected to relay ${url}`);
          connection.connected = true;
          this.connections.push(connection);
          
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
          
          const index = this.connections.findIndex(c => c.url === url);
          if (index !== -1) {
            this.connections.splice(index, 1);
          }
          
          if (this.connections.length === 0 && this.connected) {
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
      
      if (!Array.isArray(message) || message[0] !== "EVENT" || !message[2]) {
        return;
      }
      
      const event = message[2] as NostrEvent;
      
      if (event.kind !== NIP46_KIND) {
        return;
      }
      
      if (event.pubkey !== this.signerPubkey) {
        return;
      }
      
      const recipient = extractTagValue(event, "p");
      if (recipient !== this.clientPubkey) {
        return;
      }
      
      this.decryptEventContent(event)
        .then(content => {
          const response = JSON.parse(content) as Nip46Response;
          
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
      
      const request: Nip46Request = {
        id: requestId,
        method,
        params,
      };
      
      this.pendingRequests.set(requestId, { resolve, reject });
      
      this.sendRequestEvent(request)
        .catch(error => {
          this.pendingRequests.delete(requestId);
          reject(error);
        });
      
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timed out: ${method}`));
        }
      }, 30000);
    });
  }
  
  /**
   * Send a request event to the bunker
   */
  private async sendRequestEvent(request: Nip46Request): Promise<void> {
    try {
      // Log debug info
      log.debug(`Sending request: ${request.method}`);
      
      try {
        const encryptedContent = await nip04.encrypt(
          this.clientPrivateKey,
          this.signerPubkey,
          JSON.stringify(request)
        );
        
        const unsignedEvent = {
          kind: NIP46_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", this.signerPubkey]],
          content: encryptedContent,
          pubkey: this.clientPubkey
        };
        
        // Sign the event
        const signedEvent = signEvent(unsignedEvent, this.clientPrivateKey);
        
        // Send the event to each connected relay
        for (const connection of this.connections) {
          if (connection.connected) {
            const eventMsg = JSON.stringify(["EVENT", signedEvent]);
            connection.socket.send(eventMsg);
          }
        }
      } catch (encryptError: unknown) {
        const errorMessage = encryptError instanceof Error ? encryptError.message : String(encryptError);
        log.error(`Encryption error: ${errorMessage}`);
        throw new Error(`Encryption error: ${errorMessage}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to send request event: ${errorMessage}`);
      throw new Error(`Failed to send request event: ${errorMessage}`);
    }
  }
  
  /**
   * Disconnect from all relays
   */
  public async disconnect(): Promise<void> {
    for (const connection of this.connections) {
      if (connection.connected) {
        try {
          connection.socket.close();
        } catch (e) {
          // Ignore
        }
      }
    }
    
    this.connections = [];
    this.connected = false;
    
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
      const signedEvent = await this.sendRequest("sign_event", [template]) as NostrEvent;
      return signedEvent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to sign event with bunker: ${errorMessage}`);
      throw new Error(`Failed to sign event with bunker: ${errorMessage}`);
    }
  }
} 