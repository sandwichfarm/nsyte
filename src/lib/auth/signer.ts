import { createLogger } from "../logger.ts";
import { importFromNbunk } from "../nip46.ts";
import { createNip46ClientFromUrl } from "../nostr.ts";
import { SecretsManager } from "../secrets/mod.ts";
import { PrivateKeySigner } from "../signer.ts";
import { getErrorMessage } from "../error-utils.ts";
import type { ProjectConfig } from "../config.ts";
import type { Nip07Interface } from "applesauce-signers";

// Re-export the Signer type
export interface Signer extends Nip07Interface {}

const log = createLogger("signer");

export interface InitSignerOptions {
  nbunksec?: string;
  bunker?: string;
  nonInteractive?: boolean;
}

/**
 * Initialize a signer with proper timeout handling and error messages
 * This is the shared implementation used by both deploy command and console
 */
export async function initSigner(
  authKeyHex: string | null | undefined,
  options: InitSignerOptions,
  config?: ProjectConfig | null
): Promise<Signer | { error: string }> {
  // Priority 1: nbunksec from options
  if (options.nbunksec) {
    try {
      log.info("Using NostrBunker (nbunksec) for signing...");
      const bunkerSigner = await importFromNbunk(options.nbunksec);
      await bunkerSigner.getPublicKey();
      return bunkerSigner;
    } catch (e: unknown) {
      return { error: `Failed to import nbunksec: ${getErrorMessage(e)}` };
    }
  }

  // Priority 2: bunker URL from options
  if (options.bunker) {
    try {
      log.info(`Using NostrBunker (URL: ${options.bunker}) for signing...`);
      const { client } = await createNip46ClientFromUrl(options.bunker);
      return client;
    } catch (e: unknown) {
      return { error: `Failed to connect to bunker URL: ${getErrorMessage(e)}` };
    }
  }

  // Priority 3: hex private key
  if (authKeyHex) {
    log.info("Using private key for signing...");
    try {
      return new PrivateKeySigner(authKeyHex);
    } catch (e: unknown) {
      return { error: `Invalid private key provided: ${getErrorMessage(e)}` };
    }
  }

  // Priority 4: project bunker with stored nbunksec
  if (config?.bunkerPubkey) {
    log.info(
      `Attempting to use configured bunker (pubkey: ${
        config.bunkerPubkey.substring(0, 8)
      }...) for signing...`
    );
    
    const secretsManager = SecretsManager.getInstance();
    const nbunkString = await secretsManager.getNbunk(config.bunkerPubkey);
    
    if (nbunkString) {
      try {
        log.debug("Found stored nbunksec for configured bunker. Importing...");
        const bunkerSigner = await importFromNbunk(nbunkString);
        log.debug("importFromNbunk completed, about to call getPublicKey()...");
        
        // Add timeout to getPublicKey as it might hang
        const getPublicKeyPromise = bunkerSigner.getPublicKey();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("getPublicKey timeout after 15s")), 15000);
        });
        
        log.debug("Waiting for getPublicKey or timeout...");
        const pubkey = await Promise.race([getPublicKeyPromise, timeoutPromise]) as string;
        log.debug(`getPublicKey completed: ${pubkey.substring(0, 8)}...`);
        return bunkerSigner;
      } catch (e: unknown) {
        const baseMsg = `Failed to use stored nbunksec for configured bunker ${
          config.bunkerPubkey.substring(0, 8)
        }...: ${getErrorMessage(e)}`;
        
        if (options.nonInteractive) {
          return {
            error:
              `${baseMsg} In non-interactive mode, cannot re-prompt. Please check bunker or provide key via CLI.`,
          };
        } else {
          return {
            error:
              `${baseMsg} The stored secret may be invalid. Consider re-configuring the bunker connection.`,
          };
        }
      }
    } else {
      const baseMsg = `No stored secret (nbunksec) found for configured bunker: ${
        config.bunkerPubkey.substring(0, 8)
      }...`;
      
      if (options.nonInteractive) {
        return {
          error:
            `${baseMsg} In non-interactive mode, cannot prompt for new bunker details. Please run interactively or provide key/nbunksec via CLI.`,
        };
      } else {
        return {
          error:
            `${baseMsg} Please re-configure the bunker connection or provide a key/nbunksec via CLI.`,
        };
      }
    }
  }

  return {
    error:
      "No valid signing method could be initialized (private key, nbunksec, or bunker). Please check your configuration or CLI arguments.",
  };
}