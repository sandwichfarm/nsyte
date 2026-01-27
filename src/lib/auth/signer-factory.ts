import type { ISigner } from "applesauce-signers";
import { PrivateKeySigner } from "applesauce-signers/signers";
import { getErrorMessage } from "../error-utils.ts";
import { createLogger } from "../logger.ts";
import { importFromNbunk } from "../nip46.ts";
import { createNip46ClientFromUrl } from "../nostr.ts";
import { SecretsManager } from "../secrets/mod.ts";
import { detectSecretFormat } from "./secret-detector.ts";

const log = createLogger("auth");

/**
 * Options for creating a signer
 */
export interface SignerOptions {
  /** Unified secret parameter (auto-detects format: nsec, nbunksec, bunker URL, or hex) */
  sec?: string;
  /** Bunker public key from config */
  bunkerPubkey?: string;
}

/**
 * Result of signer creation
 */
export interface SignerResult {
  signer: ISigner;
  pubkey: string;
}

/**
 * Create a signer based on the provided options and priority order
 *
 * Priority order:
 * 1. sec parameter (auto-detects format)
 * 2. stored bunker from config
 *
 * @param options - Signer options
 * @returns Signer instance or error
 */
export async function createSigner(
  options: SignerOptions,
): Promise<SignerResult | { error: string }> {
  // Priority 1: sec parameter (unified secret parameter)
  if (options.sec) {
    const detected = detectSecretFormat(options.sec);
    if (!detected) {
      return {
        error:
          `Invalid secret format. Expected nsec, nbunksec, bunker:// URL, or 64-character hex string.`,
      };
    }

    try {
      switch (detected.format) {
        case "nbunksec": {
          log.info("Using NostrBunker (nbunksec from --sec) for signing...");
          const bunkerSigner = await importFromNbunk(detected.value);
          const pubkey = await bunkerSigner.getPublicKey();
          return { signer: bunkerSigner, pubkey };
        }
        case "bunker-url": {
          log.info("Using NIP-46 bunker URL (from --sec) for signing...");
          const { client, userPubkey } = await createNip46ClientFromUrl(detected.value);
          return { signer: client, pubkey: userPubkey };
        }
        case "nsec":
        case "hex": {
          log.info("Using private key (from --sec) for signing...");
          const privateKeySigner = PrivateKeySigner.fromKey(detected.value);
          const pubkey = await privateKeySigner.getPublicKey();
          return { signer: privateKeySigner, pubkey };
        }
      }
    } catch (e: unknown) {
      return {
        error: `Failed to use secret from --sec parameter: ${getErrorMessage(e)}`,
      };
    }
  }

  // Priority 2: stored bunker from config
  if (options.bunkerPubkey) {
    try {
      log.info(`Using stored bunker for ${options.bunkerPubkey.slice(0, 8)}... from config`);
      const secretsManager = SecretsManager.getInstance();
      const nbunkData = await secretsManager.getNbunk(options.bunkerPubkey);

      if (!nbunkData) {
        return {
          error:
            `No stored bunker found for pubkey ${options.bunkerPubkey}. Please re-authenticate.`,
        };
      }

      const bunkerSigner = await importFromNbunk(nbunkData);
      const pubkey = await bunkerSigner.getPublicKey();
      return { signer: bunkerSigner, pubkey };
    } catch (e: unknown) {
      return { error: `Failed to use stored bunker from config: ${getErrorMessage(e)}` };
    }
  }

  return {
    error:
      "No signing method provided. Please provide --sec with nsec, nbunksec, bunker URL, or hex key.",
  };
}

/**
 * Get authentication info for display
 */
export function getAuthInfo(options: SignerOptions): { method: string; details?: string } {
  if (options.sec) {
    const detected = detectSecretFormat(options.sec);
    if (detected) {
      switch (detected.format) {
        case "nbunksec":
          return { method: "NostrBunker (nbunksec)", details: "from --sec" };
        case "bunker-url":
          return { method: "NIP-46 Bunker", details: "from --sec" };
        case "nsec":
        case "hex":
          return { method: "Private Key", details: "from --sec" };
      }
    }
  }

  if (options.bunkerPubkey) {
    return {
      method: "Stored Bunker",
      details: `${options.bunkerPubkey.slice(0, 8)}...${options.bunkerPubkey.slice(-4)}`,
    };
  }

  return { method: "None" };
}
