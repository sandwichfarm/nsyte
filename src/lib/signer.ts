import { createLogger } from "./logger.ts";
import { NostrEvent, NostrEventTemplate } from "./nostr.ts";
import { Signer } from "./upload.ts";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { bech32 } from "@scure/base";

const log = createLogger("signer");

/**
 * Extract public key from private key
 */
function getPublicKey(privateKey: Uint8Array): string {
  return bytesToHex(schnorr.getPublicKey(privateKey));
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
 * Sign an event ID with a private key
 */
function signId(id: string, privateKey: Uint8Array): string {
  const signature = schnorr.sign(id, privateKey);
  return bytesToHex(signature);
}

/**
 * Parse a nostr private key from various formats
 */
function parsePrivateKey(key: string): Uint8Array {
  if (key.startsWith("nsec1")) {
    try {
      const { words } = bech32.decode(key, 1000);
      const data = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        data[i] = words[i];
      }
      return data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid nsec key format: ${errorMessage}`);
    }
  }
  
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return hexToBytes(key);
  }
  
  throw new Error("Private key must be a 64-character hex string or bech32 nsec format");
}

/**
 * Private key signer that works with hex and bech32 nsec keys
 */
export class PrivateKeySigner implements Signer {
  private privateKeyBytes: Uint8Array;
  private publicKeyHex: string;
  
  /**
   * Create a new private key signer
   */
  constructor(privateKey: string) {
    try {
      this.privateKeyBytes = parsePrivateKey(privateKey);
      
      this.publicKeyHex = getPublicKey(this.privateKeyBytes);
      
      log.debug(`Created private key signer for ${this.publicKeyHex.slice(0, 8)}...`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to create private key signer: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Get the public key
   */
  getPublicKey(): string {
    return this.publicKeyHex;
  }
  
  /**
   * Sign an event using the private key
   */
  async signEvent(template: NostrEventTemplate): Promise<NostrEvent> {
    const eventWithPubkey = {
      ...template,
      pubkey: this.publicKeyHex,
    };
    
    const id = calculateId(eventWithPubkey);
    
    const sig = signId(id, this.privateKeyBytes);
    
    return {
      ...eventWithPubkey,
      id,
      sig,
    };
  }
} 