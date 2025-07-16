import { colors } from "@cliffy/ansi/colors";
import { Confirm, Input, Secret, Select } from "@cliffy/prompt";
import { ensureDirSync } from "@std/fs/ensure-dir";
import { dirname, join } from "@std/path";
import { NostrConnectSigner } from "applesauce-signers";
import { createLogger } from "./logger.ts";
import { getNbunkString, initiateNostrConnect } from "./nip46.ts";
import { generateKeyPair } from "./nostr.ts";
import { SecretsManager } from "./secrets/mod.ts";
import { validateConfigWithFeedback, formatValidationErrors } from "./config-validator.ts";

const log = createLogger("config");

export interface Profile {
  name?: string;
  about?: string;
  picture?: string;
  display_name?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
  banner?: string;
}

export type ProjectConfig = {
  bunkerPubkey?: string; // Only store the pubkey reference, not the full URL
  relays: string[];
  servers: string[];
  profile?: Profile;
  publishServerList: boolean;
  publishRelayList: boolean;
  publishProfile?: boolean;
  publishAppHandler?: boolean;
  fallback?: string;
  gatewayHostnames?: string[];
  appHandler?: {
    kinds: number[]; // Event kinds this nsite can handle/display
    name?: string; // Optional app name for the handler
    description?: string; // Optional description
    platforms?: {
      web?: {
        patterns?: Array<{
          url: string; // Full URL pattern (e.g., "https://example.com/e/<bech32>")
          entities?: string[];
        }>;
      };
      android?: string;
      ios?: string;
      macos?: string;
      windows?: string;
      linux?: string;
    };
  };
  publishFileMetadata?: boolean; // NIP-94 file metadata events
  application?: {
    // NIP-82 Software Application metadata
    id?: string; // Reverse-domain identifier (e.g., "com.example.app")
    summary?: string; // Short description
    icon?: string; // Icon URL
    images?: string[]; // Additional image URLs
    tags?: string[]; // Descriptive tags
    repository?: string; // Source code repository URL
    platforms?: string[]; // Platform identifiers (e.g., "web", "android", "ios")
    license?: string; // SPDX license ID
  };
};

export interface ProjectContext {
  config: ProjectConfig;
  authKeyHex?: string | null;
  privateKey?: string;
  error?: string;
}

const configDir = ".nsite";
const projectFile = "config.json";

export const popularRelays = [
  "wss://nostr.cercatrova.me",
  "wss://relay.primal.net",
  "wss://relay.wellorder.net",
  "wss://nos.lol",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
];

export const popularBlossomServers = [
  "https://cdn.hzrd149.com",
  "https://cdn.sovbit.host",
  "https://cdn.nostrcheck.me",
  "https://nostr.download",
];

export const defaultConfig: ProjectConfig = {
  relays: [],
  servers: [],
  publishServerList: false,
  publishRelayList: false,
  gatewayHostnames: [
    "nsite.lol",
  ],
  // appHandler is optional and not included by default
};

/**
 * Sanitize a bunker URL for storage by removing the secret parameter
 */
function sanitizeBunkerUrl(url: string): string {
  try {
    // Skip if not a bunker URL
    if (!url || !url.startsWith("bunker://")) {
      return url;
    }

    // Parse the URL using URL class
    const parsedUrl = new URL(url.replace("bunker://", "https://"));

    // Remove any secret parameter
    parsedUrl.searchParams.delete("secret");

    // Reconstruct the bunker URL without the secret
    const sanitized = `bunker://${parsedUrl.hostname}${parsedUrl.pathname}`;

    // Append relay parameters
    const relays = parsedUrl.searchParams.getAll("relay");
    const relayParams = relays.map((r) => `relay=${encodeURIComponent(r)}`).join("&");

    return relayParams ? `${sanitized}?${relayParams}` : sanitized;
  } catch (error) {
    log.warn(`Failed to sanitize bunker URL: ${error}`);
    return url; // Return original if parsing fails
  }
}

/**
 * Write project configuration to file
 */
export function writeProjectFile(config: ProjectConfig): void {
  const projectPath = join(Deno.cwd(), configDir, projectFile);

  try {
    ensureDirSync(dirname(projectPath));

    // Clone the data to avoid modifying the original
    const sanitizedData = { ...config };

    // Sanitize bunker URL if present to remove secrets
    if (sanitizedData.bunkerPubkey) {
      sanitizedData.bunkerPubkey = sanitizeBunkerUrl(sanitizedData.bunkerPubkey);
    }

    Deno.writeTextFileSync(projectPath, JSON.stringify(sanitizedData, null, 2));
    log.success(`Project configuration saved to ${configDir}/${projectFile}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to save project configuration: ${errorMessage}`);
    throw error;
  }
}

/**
 * Read project configuration from file
 */
export function readProjectFile(validateSchema = true): ProjectConfig | null {
  const projectPath = join(Deno.cwd(), configDir, projectFile);

  try {
    if (!fileExists(projectPath)) {
      log.debug(`Project file not found at ${projectPath}`);
      return null;
    }

    const fileContent = Deno.readTextFileSync(projectPath);
    let config: unknown;
    
    try {
      config = JSON.parse(fileContent);
    } catch (e) {
      console.error(colors.red("\nFailed to parse configuration file:"));
      console.error(colors.red(`  ${e instanceof Error ? e.message : String(e)}`));
      console.error(colors.yellow("\nPlease ensure .nsite/config.json contains valid JSON."));
      throw new Error("Invalid JSON in configuration file");
    }
    
    // Validate configuration if requested
    if (validateSchema) {
      const validation = validateConfigWithFeedback(config);
      
      if (!validation.valid) {
        console.error(colors.red("\nConfiguration validation failed in .nsite/config.json:"));
        console.error(formatValidationErrors(validation.errors));
        
        if (validation.suggestions.length > 0) {
          console.log(colors.yellow("\nSuggestions:"));
          validation.suggestions.forEach(s => console.log(`  - ${s}`));
        }
        
        console.log(colors.dim("\nYou can run 'nsyte validate' for more detailed validation information."));
        
        throw new Error("Invalid configuration format");
      }
      
      if (validation.warnings.length > 0) {
        console.warn(colors.yellow("Configuration warnings:"));
        validation.warnings.forEach(w => console.warn(`  - ${w}`));
      }
    }
    
    return config as ProjectConfig;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to read project file: ${errorMessage}`);
    
    // Re-throw validation errors so they can be handled properly
    if (error instanceof Error && (
      error.message === "Invalid configuration format" || 
      error.message === "Invalid JSON in configuration file"
    )) {
      throw error;
    }
    
    return null;
  }
}

/**
 * Check if a file exists
 */
function fileExists(filePath: string): boolean {
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

/**
 * Setup project interactively
 * @param skipInteractive If true, will return a basic configuration without prompting
 */
export async function setupProject(skipInteractive = false): Promise<ProjectContext> {
  let config: ProjectConfig | null = null;
  let privateKey: string | undefined;
  
  try {
    config = readProjectFile();
  } catch (error) {
    // If there's a validation error, don't proceed with setup
    if (error instanceof Error && (
      error.message === "Invalid configuration format" || 
      error.message === "Invalid JSON in configuration file"
    )) {
      throw error;
    }
    // For other errors, continue with setup
    config = null;
  }

  if (!config) {
    if (skipInteractive) {
      // Return a basic configuration without prompting
      config = {
        relays: [],
        servers: [],
        publishRelayList: false,
        publishServerList: false,
      };
      log.debug("Running in non-interactive mode with no existing configuration");
      return { config, privateKey: undefined };
    }

    console.log(colors.cyan("No existing project configuration found. Setting up a new one:"));
    const setupResult = await interactiveSetup();
    config = setupResult.config;
    privateKey = setupResult.privateKey;
    writeProjectFile(config);
  }

  // In non-interactive mode, don't proceed with key setup prompts
  if (skipInteractive) {
    if (!config.bunkerPubkey && !privateKey) {
      log.error(
        "No key configuration found and running in non-interactive mode. Please provide key configuration via CLI arguments.",
      );
      Deno.exit(1);
    }
    return { config, privateKey };
  }

  // Only proceed with interactive key setup if we're in interactive mode
  if (!config.bunkerPubkey && !privateKey) {
    const keyResult = await selectKeySource(config);
    config = keyResult.config;
    privateKey = keyResult.privateKey;
  }

  return { config, privateKey };
}

async function connectToBunkerWithQR(): Promise<NostrConnectSigner> {
  const appName = "nsyte";
  const defaultRelays = ["wss://relay.nsec.app"];

  const relayInput = await Input.prompt({
    message: `Enter relays (comma-separated), or press Enter for default (${
      defaultRelays.join(", ")
    }):`,
    default: defaultRelays.join(", "),
  });

  let chosenRelays: string[];
  if (relayInput.trim() === "" || relayInput.trim() === defaultRelays.join(", ")) {
    chosenRelays = defaultRelays;
  } else {
    chosenRelays = relayInput.split(",").map((r) => r.trim()).filter((r) => r.length > 0);
  }

  if (chosenRelays.length === 0) {
    console.log(colors.yellow("No relays provided. Using default relays."));
    chosenRelays = defaultRelays;
  }

  console.log(
    colors.cyan(`Initiating Nostr Connect as '${appName}' on relays: ${chosenRelays.join(", ")}`),
  );
  return initiateNostrConnect(appName, chosenRelays);
}

async function connectToBunkerWithURI(): Promise<NostrConnectSigner> {
  const bunkerUrl = await Input.prompt({
    message: "Enter the bunker URL (bunker://...):",
    validate: (input: string) => {
      return input.trim().startsWith("bunker://") ||
        "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
    },
  });

  console.log(colors.cyan("Connecting to bunker via URL..."));
  return NostrConnectSigner.fromBunkerURI(bunkerUrl);
}

async function newBunker(
  config: ProjectConfig,
  secretsManager: SecretsManager,
): Promise<NostrConnectSigner | undefined> {
  let signer: NostrConnectSigner | null = null;

  const choice = await Select.prompt<string>({
    message: "How would you like to connect to the bunker?",
    options: [
      { name: "Scan QR Code (Nostr Connect)", value: "qr" },
      { name: "Enter Bunker URL manually", value: "url" },
    ],
  });

  try {
    signer = choice === "qr" ? await connectToBunkerWithQR() : await connectToBunkerWithURI();

    if (!signer) {
      throw new Error("Failed to establish signer connection");
    }

    return signer;
  } catch (error) {
    log.error(`Failed to connect to bunker: ${error}`);
    console.error(
      colors.red(
        `Failed to connect to bunker: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    Deno.exit(1);
  } finally {
    if (signer) {
      try {
        console.log(colors.cyan("Disconnecting from bunker..."));
        await signer.close();
        console.log(colors.green("Disconnected from bunker."));
      } catch (err) {
        console.error(colors.red(`Error during disconnect: ${err}`));
      }
    }
  }
}

async function selectKeySource(
  existingConfig?: ProjectConfig,
): Promise<{ config: ProjectConfig; privateKey?: string }> {
  console.log(colors.yellow("No key configuration found. Let's set that up:"));

  let privateKey: string | undefined;
  const config: ProjectConfig = existingConfig
    ? structuredClone(existingConfig)
    : structuredClone(defaultConfig);

  // Store the original bunkerPubkey to check if it changed
  const originalBunkerPubkey = config.bunkerPubkey;
  let configChanged = false;

  // Check if there are any existing bunkers
  const secretsManager = SecretsManager.getInstance();
  const existingBunkers = await secretsManager.getAllPubkeys();
  const hasBunkers = existingBunkers.length > 0;

  let nbunkString: string | undefined;

  // Prepare options based on whether bunkers exist
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

  // Define the type for the key choice to avoid type errors
  type KeyChoice = "generate" | "existing" | "new_bunker" | "existing_bunker";

  const keyChoice = await Select.prompt<KeyChoice>({
    message: "How would you like to manage your nostr key?",
    options: keyOptions,
  });

  if (keyChoice === "generate") {
    const keyPair = generateKeyPair();
    privateKey = keyPair.privateKey;
    console.log(colors.green(`Generated new private key: ${keyPair.privateKey}`));
    console.log(
      colors.yellow(
        "IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!",
      ),
    );
    console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
    // Note: privateKey is returned but not stored in config, so no config change
  } else if (keyChoice === "existing") {
    privateKey = await Secret.prompt({
      message: "Enter your nostr private key (nsec/hex):",
    });
    // Note: privateKey is returned but not stored in config, so no config change
  } else if (keyChoice === "new_bunker") {
    const signer = await newBunker(config, secretsManager);
    if (signer) {
      config.bunkerPubkey = await signer.getPublicKey();
      const nbunkString = getNbunkString(signer);
      await secretsManager.storeNbunk(config.bunkerPubkey, nbunkString);
      console.log(
        colors.green(
          `Successfully connected to bunker ${
            config.bunkerPubkey.slice(0, 8)
          }... \nGenerated and stored nbunksec string.`,
        ),
      );
      configChanged = true;
    }
  } else if (keyChoice === "existing_bunker") {
    // Present a list of existing bunkers to choose from
    const bunkerOptions = existingBunkers.map((pubkey: string) => {
      return {
        name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        value: pubkey,
      };
    });

    const selectedPubkey = await Select.prompt<string>({
      message: "Select an existing bunker:",
      options: bunkerOptions,
    });

    config.bunkerPubkey = selectedPubkey;
    console.log(
      colors.green(`Using existing bunker with pubkey: ${selectedPubkey.slice(0, 8)}...`),
    );
    configChanged = originalBunkerPubkey !== selectedPubkey;
  }

  // Only write config if it actually changed
  if (configChanged || !existingConfig) {
    writeProjectFile(config);
    console.log(colors.green("Key configuration set up successfully!"));
  } else {
    console.log(colors.green("Key configuration completed."));
  }

  return { config, privateKey };
}

/**
 * Interactive project setup
 */
async function interactiveSetup(): Promise<ProjectContext> {
  console.log(colors.cyan("Welcome to nsyte setup!"));

  // Check if there are any existing bunkers
  const secretsManager = SecretsManager.getInstance();
  const existingBunkers = await secretsManager.getAllPubkeys();
  const hasBunkers = existingBunkers.length > 0;

  // Prepare options based on whether bunkers exist
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

  // Define the type for the key choice to avoid type errors
  type KeyChoice = "generate" | "existing" | "new_bunker" | "existing_bunker";

  const keyChoice = await Select.prompt<KeyChoice>({
    message: "How would you like to manage your nostr key?",
    options: keyOptions,
  });

  let privateKey: string | undefined;
  let bunkerPubkey: string | undefined;

  if (keyChoice === "generate") {
    const keyPair = generateKeyPair();
    privateKey = keyPair.privateKey;
    console.log(colors.green(`Generated new private key: ${keyPair.privateKey}`));
    console.log(
      colors.yellow(
        "IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!",
      ),
    );
    console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
  } else if (keyChoice === "existing") {
    privateKey = await Secret.prompt({
      message: "Enter your nostr private key (nsec/hex):",
    });
  } else if (keyChoice === "new_bunker") {
    const choice = await Select.prompt<string>({
      message: "How would you like to connect to the bunker?",
      options: [
        { name: "Scan QR Code (Nostr Connect)", value: "qr" },
        { name: "Enter Bunker URL manually", value: "url" },
      ],
    });

    let signer: NostrConnectSigner | null = null;

    try {
      if (choice === "qr") {
        const appName = "nsyte";
        const defaultRelays = ["wss://relay.nsec.app"];

        const relayInput = await Input.prompt({
          message: `Enter relays (comma-separated), or press Enter for default (${
            defaultRelays.join(", ")
          }):`,
          default: defaultRelays.join(", "),
        });

        let chosenRelays: string[];
        if (relayInput.trim() === "" || relayInput.trim() === defaultRelays.join(", ")) {
          chosenRelays = defaultRelays;
        } else {
          chosenRelays = relayInput.split(",").map((r) => r.trim()).filter((r) => r.length > 0);
        }

        if (chosenRelays.length === 0) {
          console.log(colors.yellow("No relays provided. Using default relays."));
          chosenRelays = defaultRelays;
        }

        console.log(
          colors.cyan(
            `Initiating Nostr Connect as '${appName}' on relays: ${chosenRelays.join(", ")}`,
          ),
        );
        signer = await initiateNostrConnect(appName, chosenRelays);
      } else {
        const bunkerUrl = await Input.prompt({
          message: "Enter the bunker URL (bunker://...):",
          validate: (input: string) => {
            return input.trim().startsWith("bunker://") ||
              "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
          },
        });

        console.log(colors.cyan("Connecting to bunker via URL..."));
        signer = await NostrConnectSigner.fromBunkerURI(bunkerUrl);
      }

      if (!signer) {
        throw new Error("Failed to establish signer connection");
      }

      bunkerPubkey = await signer.getPublicKey();
      const nbunkString = getNbunkString(signer);
      await secretsManager.storeNbunk(bunkerPubkey, nbunkString);

      console.log(colors.green(`Successfully connected to bunker ${bunkerPubkey.slice(0, 8)}...
Generated and stored nbunksec string.`));
    } catch (error) {
      log.error(`Failed to connect to bunker: ${error}`);
      console.error(
        colors.red(
          `Failed to connect to bunker: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      Deno.exit(1);
    } finally {
      if (signer) {
        try {
          console.log(colors.cyan("Disconnecting from bunker..."));
          await signer.close();
          console.log(colors.green("Disconnected from bunker."));
        } catch (err) {
          console.error(colors.red(`Error during disconnect: ${err}`));
        }
      }
    }
  } else if (keyChoice === "existing_bunker") {
    // Present a list of existing bunkers to choose from
    const bunkerOptions = existingBunkers.map((pubkey: string) => {
      return {
        name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        value: pubkey,
      };
    });

    const selectedPubkey = await Select.prompt<string>({
      message: "Select an existing bunker:",
      options: bunkerOptions,
    });

    bunkerPubkey = selectedPubkey;
    console.log(
      colors.green(`Using existing bunker with pubkey: ${selectedPubkey.slice(0, 8)}...`),
    );
  }

  const projectName = await Input.prompt({
    message: "Enter website or project name:",
  });

  const projectAbout = await Input.prompt({
    message: "Enter website or project description:",
  });

  console.log(colors.cyan("\nEnter nostr relay URLs (leave empty when done):"));
  const relays = await promptForUrls("Enter relay URL:", popularRelays);

  console.log(colors.cyan("\nEnter blossom server URLs (leave empty when done):"));
  const servers = await promptForUrls("Enter blossom server URL:", popularBlossomServers);

  const publishProfile = await Confirm.prompt({
    message: "Publish profile information to nostr?",
    default: true,
  });

  const publishRelayList = await Confirm.prompt({
    message: "Publish relay list to nostr?",
    default: true,
  });

  const publishServerList = await Confirm.prompt({
    message: "Publish blossom server list to nostr?",
    default: true,
  });

  const config: ProjectConfig = {
    bunkerPubkey,
    relays,
    servers,
    profile: {
      name: projectName,
      display_name: projectName,
      about: projectAbout,
    },
    publishProfile,
    publishRelayList,
    publishServerList,
  };

  return { config, privateKey };
}

/**
 * Prompt for URLs with suggestions
 */
async function promptForUrls(message: string, suggestions: string[]): Promise<string[]> {
  const urls: string[] = [];

  while (true) {
    const url = await Input.prompt({
      message,
      suggestions,
      list: true,
    });

    if (!url) break;

    if (
      url.startsWith("http://") || url.startsWith("https://") ||
      url.startsWith("ws://") || url.startsWith("wss://")
    ) {
      urls.push(url);
    } else {
      console.log(
        colors.yellow(
          "Invalid URL format. Please include the protocol (http://, https://, ws://, wss://)",
        ),
      );
    }
  }

  return urls;
}
