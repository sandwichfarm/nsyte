import { colors } from "@cliffy/ansi/colors";
import { Secret, Select } from "@cliffy/prompt";
import { type ISigner, type NostrConnectSigner, PrivateKeySigner } from "applesauce-signers";
import { defaultConfig, type ProjectConfig, readProjectFile } from "./config.ts";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "./constants.ts";
import { getErrorMessage } from "./error-utils.ts";
import { createLogger } from "./logger.ts";
import { importFromNbunk } from "./nip46.ts";
import { normalizePubkeyInput } from "./nip05.ts";
import { createNip46ClientFromUrl, generateKeyPair } from "./nostr.ts";
import { SecretsManager } from "./secrets/mod.ts";
import { detectSecretFormat } from "./auth/secret-detector.ts";

const log = createLogger("resolver");

export interface ResolverOptions {
  relays?: string;
  servers?: string;
  /** Unified secret parameter (auto-detects format: nsec, nbunksec, bunker URL, or hex) */
  sec?: string;
  pubkey?: string;
}

/**
 * Splits and filters a comma-separated string
 */
export function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Resolves relays from options, config, or defaults
 */
export function resolveRelays(
  options: ResolverOptions,
  config?: ProjectConfig | null,
  useDiscoveryRelays = false,
): string[] {
  // Priority: CLI options > config > defaults
  if (options.relays !== undefined) {
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
  config?: ProjectConfig | null,
): string[] {
  // Priority: CLI options > config
  if (options.servers !== undefined) {
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
  interactive = true,
): Promise<string> {
  // Explicit pubkey provided
  if (options.pubkey) {
    log.debug(`Using explicit pubkey: ${options.pubkey}`);
    // Normalize the pubkey (handles npub, hex, and NIP-05 identifiers)
    try {
      const normalized = await normalizePubkeyInput(options.pubkey);
      log.debug(`Normalized to: ${normalized.slice(0, 8)}...`);
      return normalized;
    } catch (error) {
      throw new Error(
        `Failed to resolve pubkey from --pubkey parameter: ${getErrorMessage(error)}`,
      );
    }
  }

  // sec parameter (unified secret parameter) - highest priority
  if (options.sec) {
    const detected = detectSecretFormat(options.sec);
    if (!detected) {
      throw new Error(
        `Invalid secret format in --sec. Expected nsec, nbunksec, bunker:// URL, or 64-character hex string.`,
      );
    }

    try {
      switch (detected.format) {
        case "nbunksec": {
          const signer = await importFromNbunk(detected.value);
          const pubkey = await signer.getPublicKey();
          log.debug(`Using pubkey from nbunksec (--sec): ${pubkey.slice(0, 8)}...`);
          if ("close" in signer && typeof signer.close === "function") {
            await signer.close();
          }
          return pubkey;
        }
        case "bunker-url": {
          const { client } = await createNip46ClientFromUrl(detected.value);
          const pubkey = await client.getPublicKey();
          log.debug(`Using pubkey from bunker URL (--sec): ${pubkey.slice(0, 8)}...`);
          if ("close" in client && typeof client.close === "function") {
            await client.close();
          }
          return pubkey;
        }
        case "nsec":
        case "hex": {
          const signer = PrivateKeySigner.fromKey(detected.value);
          const pubkey = await signer.getPublicKey();
          log.debug(`Using pubkey from private key (--sec): ${pubkey.slice(0, 8)}...`);
          return pubkey;
        }
      }
    } catch (error) {
      log.error(
        `Failed to get pubkey from --sec parameter: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  // Check project config for bunker pubkey
  const projectConfig = config || readProjectFile() || defaultConfig;
  if (projectConfig.bunkerPubkey) {
    log.debug(
      `Using bunker pubkey from config: ${
        projectConfig.bunkerPubkey.slice(
          0,
          8,
        )
      }...`,
    );
    return projectConfig.bunkerPubkey;
  }

  // Interactive mode
  if (!interactive) {
    throw new Error(
      "No public key available. Provide --pubkey, --sec, or configure a bunker.",
    );
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
    { name: "Use an existing private key", value: "existing" },
  ];

  if (hasBunkers) {
    keyOptions.push(
      { name: "Use an existing NSEC bunker", value: "existing_bunker" },
      { name: "Connect to a new NSEC bunker", value: "new_bunker" },
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
      signer = PrivateKeySigner.fromKey(keyPair.privateKey);
      pubkey = await signer.getPublicKey();
      console.log(
        colors.green(`Generated new private key: ${keyPair.privateKey}`),
      );
      console.log(
        colors.yellow(
          "IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!",
        ),
      );
      console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
      break;
    }

    case "existing": {
      const nsec = await Secret.prompt({
        message: "Enter your private key (nsec/hex):",
      });
      signer = PrivateKeySigner.fromKey(nsec);
      pubkey = await signer.getPublicKey();
      log.debug(`Using provided private key: ${pubkey.slice(0, 8)}...`);
      break;
    }

    case "existing_bunker": {
      const bunkerOptions = existingBunkers.map((pubkey: string) => ({
        name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        value: pubkey,
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
          log.info(
            `Session established with bunker, user pubkey: ${
              pubkey.slice(
                0,
                8,
              )
            }...`,
          );
        } catch (error) {
          const errorMsg = getErrorMessage(error);
          log.error(`Failed to connect using stored nbunksec: ${errorMsg}`);
          console.error(
            colors.red(`Error connecting to configured bunker: ${errorMsg}`),
          );
          console.log(
            colors.yellow("Try running 'nsyte bunker connect' again."),
          );
          Deno.exit(1);
        }
      }
      break;
    }

    case "new_bunker": {
      console.error(
        colors.yellow(
          "Please use 'nsyte bunker connect' to connect to a new bunker.",
        ),
      );
      Deno.exit(1);
    }
  }

  // Close bunker connection if needed
  if (signer && "close" in signer) {
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
  config?: ProjectConfig | null,
): Promise<ISigner | null> {
  // sec parameter (unified secret parameter) - highest priority
  if (options.sec) {
    const detected = detectSecretFormat(options.sec);
    if (!detected) {
      log.error(
        `Invalid secret format in --sec. Expected nsec, nbunksec, bunker:// URL, or 64-character hex string.`,
      );
      return null;
    }

    try {
      switch (detected.format) {
        case "nbunksec": {
          log.info("Using nbunksec from --sec parameter...");
          return await importFromNbunk(detected.value);
        }
        case "bunker-url": {
          log.info("Using bunker URL from --sec parameter...");
          const { client } = await createNip46ClientFromUrl(detected.value);
          return client;
        }
        case "nsec":
        case "hex": {
          log.info("Using private key from --sec parameter...");
          return PrivateKeySigner.fromKey(detected.value);
        }
      }
    } catch (error) {
      log.error(
        `Failed to create signer from --sec parameter: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  // Check project config for bunker
  const projectConfig = config || readProjectFile();
  if (projectConfig?.bunkerPubkey) {
    const secretsManager = SecretsManager.getInstance();
    const nbunkString = await secretsManager.getNbunk(
      projectConfig.bunkerPubkey,
    );
    if (nbunkString) {
      log.info("Using configured bunker from project...");
      return await importFromNbunk(nbunkString);
    }
  }

  return null;
}
