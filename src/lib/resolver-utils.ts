import { colors } from "@cliffy/ansi/colors";
import { Select, Secret } from "@cliffy/prompt";
import type { NostrConnectSigner } from "applesauce-signers";
import { createLogger } from "./logger.ts";
import { readProjectFile, defaultConfig, type ProjectConfig } from "./config.ts";
import { generateKeyPair, createNip46ClientFromUrl } from "./nostr.ts";
import { PrivateKeySigner, type Signer } from "./signer.ts";
import { SecretsManager } from "./secrets/mod.ts";
import { importFromNbunk } from "./nip46.ts";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "./constants.ts";
import { getErrorMessage } from "./error-utils.ts";

const log = createLogger("resolver");

export interface ResolverOptions {
  relays?: string;
  servers?: string;
  privatekey?: string;
  pubkey?: string;
  bunker?: string;
  nbunksec?: string;
}

/**
 * Splits and filters a comma-separated string
 */
export function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Resolves relays from options, config, or defaults
 */
export function resolveRelays(
  options: ResolverOptions,
  config?: ProjectConfig | null,
  useDiscoveryRelays = false
): string[] {
  // Priority: CLI options > config > defaults
  if (options.relays) {
    return parseCommaSeparated(options.relays);
  }
  
  const projectConfig = config || readProjectFile();
  if (projectConfig?.relays && projectConfig.relays.length > 0) {
    return projectConfig.relays;
  }
  
  log.info("No relays configured, using default relays.");
  return useDiscoveryRelays ? RELAY_DISCOVERY_RELAYS : NSYTE_BROADCAST_RELAYS;
}

/**
 * Resolves servers from options or config
 */
export function resolveServers(
  options: ResolverOptions,
  config?: ProjectConfig | null
): string[] {
  // Priority: CLI options > config
  if (options.servers) {
    return parseCommaSeparated(options.servers);
  }
  
  const projectConfig = config || readProjectFile();
  return projectConfig?.servers || [];
}

/**
 * Resolves a public key from various sources
 */
export async function resolvePubkey(
  options: ResolverOptions,
  config?: ProjectConfig | null,
  interactive = true
): Promise<string> {
  // Explicit pubkey provided
  if (options.pubkey) {
    log.debug(`Using explicit pubkey: ${options.pubkey}`);
    return options.pubkey;
  }
  
  // Private key provided - derive pubkey
  if (options.privatekey) {
    const signer = new PrivateKeySigner(options.privatekey);
    const pubkey = await signer.getPublicKey();
    log.debug(`Using pubkey from private key: ${pubkey.slice(0, 8)}...`);
    return pubkey;
  }
  
  // nbunksec provided - derive pubkey without accessing SecretsManager
  if (options.nbunksec) {
    try {
      const signer = await importFromNbunk(options.nbunksec);
      const pubkey = await signer.getPublicKey();
      log.debug(`Using pubkey from nbunksec: ${pubkey.slice(0, 8)}...`);
      if ('close' in signer && typeof signer.close === 'function') {
        await signer.close();
      }
      return pubkey;
    } catch (error) {
      log.error(`Failed to get pubkey from nbunksec: ${getErrorMessage(error)}`);
      throw error;
    }
  }
  
  // Bunker URL provided - derive pubkey
  if (options.bunker) {
    try {
      const { client } = await createNip46ClientFromUrl(options.bunker);
      const pubkey = await client.getPublicKey();
      log.debug(`Using pubkey from bunker URL: ${pubkey.slice(0, 8)}...`);
      if ('close' in client && typeof client.close === 'function') {
        await client.close();
      }
      return pubkey;
    } catch (error) {
      log.error(`Failed to get pubkey from bunker URL: ${getErrorMessage(error)}`);
      throw error;
    }
  }
  
  // Check project config for bunker pubkey
  const projectConfig = config || readProjectFile() || defaultConfig;
  if (projectConfig.bunkerPubkey) {
    log.debug(`Using bunker pubkey from config: ${projectConfig.bunkerPubkey.slice(0, 8)}...`);
    return projectConfig.bunkerPubkey;
  }
  
  // Interactive mode
  if (!interactive) {
    throw new Error("No public key available. Provide --pubkey, --privatekey, or configure a bunker.");
  }
  
  // Interactive key selection
  const pubkey = await interactiveKeySelection();
  if (!pubkey) {
    throw new Error("Failed to obtain public key");
  }
  
  return pubkey;
}

/**
 * Interactive key selection menu - extracted from ls.ts and config.ts
 */
async function interactiveKeySelection(): Promise<string | undefined> {
  const secretsManager = SecretsManager.getInstance();
  const existingBunkers = await secretsManager.getAllPubkeys();
  const hasBunkers = existingBunkers.length > 0;
  
  const keyOptions = [
    { name: "Generate a new private key", value: "generate" },
    { name: "Use an existing private key", value: "existing" }
  ];
  
  if (hasBunkers) {
    keyOptions.push(
      { name: "Use an existing NSEC bunker", value: "existing_bunker" },
      { name: "Connect to a new NSEC bunker", value: "new_bunker" }
    );
  } else {
    keyOptions.push({ name: "Connect to an NSEC bunker", value: "new_bunker" });
  }
  
  type KeyChoice = "generate" | "existing" | "new_bunker" | "existing_bunker";
  
  const keyChoice = await Select.prompt<KeyChoice>({
    message: "How would you like to manage your nostr key?",
    options: keyOptions,
  });
  
  let pubkey: string | undefined;
  let signer: PrivateKeySigner | NostrConnectSigner | undefined;
  
  switch (keyChoice) {
    case "generate": {
      const keyPair = generateKeyPair();
      signer = new PrivateKeySigner(keyPair.privateKey);
      pubkey = await signer.getPublicKey();
      console.log(colors.green(`Generated new private key: ${keyPair.privateKey}`));
      console.log(colors.yellow("IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!"));
      console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
      break;
    }
    
    case "existing": {
      const nsec = await Secret.prompt({
        message: "Enter your private key (nsec/hex):",
      });
      signer = new PrivateKeySigner(nsec);
      pubkey = await signer.getPublicKey();
      log.debug(`Using provided private key: ${pubkey.slice(0, 8)}...`);
      break;
    }
    
    case "existing_bunker": {
      const bunkerOptions = existingBunkers.map((pubkey: string) => ({
        name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        value: pubkey
      }));
      
      const selectedPubkey = await Select.prompt<string>({
        message: "Select an existing bunker:",
        options: bunkerOptions,
      });
      
      const nbunkString = await secretsManager.getNbunk(selectedPubkey);
      if (nbunkString) {
        try {
          log.info("Attempting connection using stored nbunksec...");
          signer = await importFromNbunk(nbunkString);
          pubkey = await signer.getPublicKey();
          log.info(`Session established with bunker, user pubkey: ${pubkey.slice(0, 8)}...`);
        } catch (error) {
          const errorMsg = getErrorMessage(error);
          log.error(`Failed to connect using stored nbunksec: ${errorMsg}`);
          console.error(colors.red(`Error connecting to configured bunker: ${errorMsg}`));
          console.log(colors.yellow("Try running 'nsyte bunker connect' again."));
          Deno.exit(1);
        }
      }
      break;
    }
    
    case "new_bunker": {
      console.error(colors.yellow("Please use 'nsyte bunker connect' to connect to a new bunker."));
      Deno.exit(1);
    }
  }
  
  // Close bunker connection if needed
  if (signer && 'close' in signer) {
    try {
      await signer.close();
      log.debug("Closed bunker connection.");
    } catch (err) {
      log.warn(`Error closing bunker connection: ${getErrorMessage(err)}`);
    }
  }
  
  return pubkey;
}

/**
 * Creates a signer from various options
 */
export async function createSigner(
  options: ResolverOptions,
  config?: ProjectConfig | null
): Promise<Signer | null> {
  // nbunksec option (for CI)
  if (options.nbunksec) {
    log.info("Using nbunksec from command line...");
    return await importFromNbunk(options.nbunksec);
  }
  
  // Bunker URL option
  if (options.bunker) {
    const { client } = await createNip46ClientFromUrl(options.bunker);
    return client;
  }
  
  // Private key option
  if (options.privatekey) {
    return new PrivateKeySigner(options.privatekey);
  }
  
  // Check project config for bunker
  const projectConfig = config || readProjectFile();
  if (projectConfig?.bunkerPubkey) {
    const secretsManager = SecretsManager.getInstance();
    const nbunkString = await secretsManager.getNbunk(projectConfig.bunkerPubkey);
    if (nbunkString) {
      log.info("Using configured bunker from project...");
      return await importFromNbunk(nbunkString);
    }
  }
  
  return null;
}