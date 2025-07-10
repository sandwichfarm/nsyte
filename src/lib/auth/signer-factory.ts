import { createLogger } from "../logger.ts";
import { importFromNbunk } from "../nip46.ts";
import { createNip46ClientFromUrl } from "../nostr.ts";
import { SecretsManager } from "../secrets/mod.ts";
import { PrivateKeySigner } from "../signer.ts";
import { getErrorMessage } from "../error-utils.ts";
import type { Signer } from "../upload.ts";

const log = createLogger("auth");

/**
 * Options for creating a signer
 */
export interface SignerOptions {
  /** Private key in hex format */
  privateKey?: string;
  /** NostrBunker nbunksec string */
  nbunksec?: string;
  /** Bunker URL for NIP-46 connection */
  bunkerUrl?: string;
  /** Bunker public key from config */
  bunkerPubkey?: string;
}

/**
 * Result of signer creation
 */
export interface SignerResult {
  signer: Signer;
  pubkey: string;
}

/**
 * Create a signer based on the provided options and priority order
 * 
 * Priority order:
 * 1. nbunksec from CLI (skip all other methods)
 * 2. bunker URL from CLI
 * 3. private key from CLI
 * 4. stored bunker from config
 * 
 * @param options - Signer options
 * @returns Signer instance or error
 */
export async function createSigner(options: SignerOptions): Promise<SignerResult | { error: string }> {
  // Priority 1: nbunksec from CLI (skip all other methods)
  if (options.nbunksec) {
    try {
      log.info("Using NostrBunker (nbunksec from CLI) for signing...");
      const bunkerSigner = await importFromNbunk(options.nbunksec);
      const pubkey = await bunkerSigner.getPublicKey();
      return { signer: bunkerSigner, pubkey };
    } catch (e: unknown) {
      return { error: `Failed to import nbunksec from CLI: ${getErrorMessage(e)}` };
    }
  }

  // Priority 2: bunker URL from CLI
  if (options.bunkerUrl) {
    try {
      log.info("Using NIP-46 bunker URL from CLI for signing...");
      const { client, userPubkey } = await createNip46ClientFromUrl(options.bunkerUrl);
      return { signer: client, pubkey: userPubkey };
    } catch (e: unknown) {
      return { error: `Failed to connect to bunker URL from CLI: ${getErrorMessage(e)}` };
    }
  }

  // Priority 3: private key from CLI
  if (options.privateKey) {
    try {
      log.info("Using private key from CLI for signing...");
      const privateKeySigner = new PrivateKeySigner(options.privateKey);
      const pubkey = await privateKeySigner.getPublicKey();
      return { signer: privateKeySigner, pubkey };
    } catch (e: unknown) {
      return { error: `Failed to use private key from CLI: ${getErrorMessage(e)}` };
    }
  }

  // Priority 4: stored bunker from config
  if (options.bunkerPubkey) {
    try {
      log.info(`Using stored bunker for ${options.bunkerPubkey.slice(0, 8)}... from config`);
      const secretsManager = SecretsManager.getInstance();
      const nbunkData = await secretsManager.getNbunk(options.bunkerPubkey);
      
      if (!nbunkData) {
        return { error: `No stored bunker found for pubkey ${options.bunkerPubkey}. Please re-authenticate.` };
      }
      
      const bunkerSigner = await importFromNbunk(nbunkData);
      const pubkey = await bunkerSigner.getPublicKey();
      return { signer: bunkerSigner, pubkey };
    } catch (e: unknown) {
      return { error: `Failed to use stored bunker from config: ${getErrorMessage(e)}` };
    }
  }

  return { 
    error: "No signing method provided. Please provide a private key, bunker URL, or nbunksec." 
  };
}

/**
 * Get authentication info for display
 */
export function getAuthInfo(options: SignerOptions): { method: string; details?: string } {
  if (options.nbunksec) {
    return { method: "NostrBunker (nbunksec)" };
  }
  
  if (options.bunkerUrl) {
    return { method: "NIP-46 Bunker", details: "from CLI" };
  }
  
  if (options.privateKey) {
    return { method: "Private Key", details: "from CLI" };
  }
  
  if (options.bunkerPubkey) {
    return { 
      method: "Stored Bunker", 
      details: `${options.bunkerPubkey.slice(0, 8)}...${options.bunkerPubkey.slice(-4)}` 
    };
  }
  
  return { method: "None" };
}