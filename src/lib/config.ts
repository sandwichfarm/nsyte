import { join, dirname } from "std/path/mod.ts";
import { ensureDirSync } from "std/fs/ensure_dir.ts";
import { createLogger } from "./logger.ts";
import { Input, Confirm, Select, Secret } from "cliffy/prompt/mod.ts";
import { colors } from "cliffy/ansi/colors.ts";
import { generateKeyPair } from "./nostr.ts";
import { parseBunkerUrl, BunkerKeyManager } from "./nip46.ts";
import { SecretsManager } from "./secrets/mod.ts";

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

export interface ProjectData {
  bunkerPubkey?: string;  // Only store the pubkey reference, not the full URL
  relays: string[];
  servers: string[];
  profile?: Profile;
  publishServerList: boolean;
  publishRelayList: boolean;
  publishProfile?: boolean;
  fallback?: string;
}

export interface ProjectContext {
  projectData: ProjectData;
  privateKey?: string;
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
  "https://blossom.primal.net",
  "https://cdn.nostrcheck.me",
  "https://cdn.satellite.earth",
  "https://nostr.download",
];

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
    const relayParams = relays.map(r => `relay=${encodeURIComponent(r)}`).join("&");
    
    return relayParams ? `${sanitized}?${relayParams}` : sanitized;
  } catch (error) {
    log.warn(`Failed to sanitize bunker URL: ${error}`);
    return url; // Return original if parsing fails
  }
}

/**
 * Write project configuration to file
 */
export function writeProjectFile(projectData: ProjectData): void {
  const projectPath = join(Deno.cwd(), configDir, projectFile);

  try {
    ensureDirSync(dirname(projectPath));

    // Clone the data to avoid modifying the original
    const sanitizedData = { ...projectData };
    
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
export function readProjectFile(): ProjectData | null {
  const projectPath = join(Deno.cwd(), configDir, projectFile);

  try {
    if (!fileExists(projectPath)) {
      log.debug(`Project file not found at ${projectPath}`);
      return null;
    }

    const fileContent = Deno.readTextFileSync(projectPath);
    return JSON.parse(fileContent) as ProjectData;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to read project file: ${errorMessage}`);
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
  let projectData = readProjectFile();
  let privateKey: string | undefined;
  
  if (!projectData) {
    if (skipInteractive) {
      // Return a basic configuration without prompting
      projectData = {
        relays: [],
        servers: [],
        publishRelayList: false,
        publishServerList: false
      };
      return { projectData, privateKey: undefined };
    }
    
    console.log(colors.cyan("No existing project configuration found. Setting up a new one:"));
    const setupResult = await interactiveSetup();
    projectData = setupResult.projectData;
    privateKey = setupResult.privateKey;
    writeProjectFile(projectData);
  }

  if (!projectData.bunkerPubkey && !privateKey && !skipInteractive) {
    console.log(colors.yellow("No key configuration found. Let's set that up:"));
    
    // Check if there are any existing bunkers
    const secretsManager = SecretsManager.getInstance();
    const existingBunkers = secretsManager.getAllPubkeys();
    const hasBunkers = existingBunkers.length > 0;
    
    // Prepare options based on whether bunkers exist
    const keyOptions = [
      { name: "Generate a new private key", value: "generate" },
      { name: "Use an existing private key", value: "existing" }
    ];
    
    if (hasBunkers) {
      // Add options to use existing or connect to new when bunkers exist
      keyOptions.push(
        { name: "Use existing NSEC bunker (NIP-46)", value: "existing_bunker" },
        { name: "Connect to NSEC bunker (NIP-46)", value: "new_bunker" }
      );
    } else {
      // Just one bunker option when no bunkers exist
      keyOptions.push({ name: "Use an NSEC bunker (NIP-46)", value: "new_bunker" });
    }
    
    // Define the type for the key choice to avoid type errors
    type KeyChoice = "generate" | "existing" | "new_bunker" | "existing_bunker";
    
    const keyChoice = await Select.prompt<KeyChoice>({
      message: "How would you like to manage your NOSTR key?",
      options: keyOptions,
    });

    if (keyChoice === "generate") {
      const keyPair = generateKeyPair();
      privateKey = keyPair.privateKey;
      console.log(colors.green(`Generated new private key: ${keyPair.privateKey}`));
      console.log(colors.yellow("IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!"));
      console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
      
    } else if (keyChoice === "existing") {
      privateKey = await Secret.prompt({
        message: "Enter your NOSTR private key (nsec/hex):",
      });
      
    } else if (keyChoice === "new_bunker") {
      const bunkerUrl = await Input.prompt({
        message: "Enter your NSEC bunker URL (bunker://...):",
        validate: (input: string) => {
          return input.trim().startsWith("bunker://") || 
                "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
        }
      });
      
      try {
        // Extract just the pubkey from the URL for the config
        const bunkerPointer = parseBunkerUrl(bunkerUrl);
        projectData.bunkerPubkey = bunkerPointer.pubkey;
        
        // Store the bunker URL in the secrets file
        BunkerKeyManager.storeBunkerUrl(bunkerPointer.pubkey, bunkerUrl);
        
        console.log(colors.green(`Stored bunker connection for pubkey: ${bunkerPointer.pubkey.slice(0, 8)}...`));
      } catch (error) {
        log.error(`Failed to parse bunker URL: ${error}`);
        throw new Error(`Failed to parse bunker URL. Please check the format: ${error}`);
      }
    } else if (keyChoice === "existing_bunker") {
      // Present a list of existing bunkers to choose from
      const bunkerOptions = existingBunkers.map((pubkey: string) => {
        return {
          name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
          value: pubkey
        };
      });
      
      const selectedPubkey = await Select.prompt<string>({
        message: "Select an existing bunker:",
        options: bunkerOptions,
      });
      
      projectData.bunkerPubkey = selectedPubkey;
      console.log(colors.green(`Using existing bunker with pubkey: ${selectedPubkey.slice(0, 8)}...`));
    }
    
    writeProjectFile(projectData);
    console.log(colors.green("Key configuration set up successfully!"));
  }

  return { projectData, privateKey };
}

/**
 * Interactive project setup
 */
async function interactiveSetup(): Promise<ProjectContext> {
  console.log(colors.cyan("Welcome to nsyte setup!"));
  
  // Check if there are any existing bunkers
  const secretsManager = SecretsManager.getInstance();
  const existingBunkers = secretsManager.getAllPubkeys();
  const hasBunkers = existingBunkers.length > 0;
  
  // Prepare options based on whether bunkers exist
  const keyOptions = [
    { name: "Generate a new private key", value: "generate" },
    { name: "Use an existing private key", value: "existing" }
  ];
  
  if (hasBunkers) {
    // Add options to use existing or connect to new when bunkers exist
    keyOptions.push(
      { name: "Use existing NSEC bunker (NIP-46)", value: "existing_bunker" },
      { name: "Connect to NSEC bunker (NIP-46)", value: "new_bunker" }
    );
  } else {
    // Just one bunker option when no bunkers exist
    keyOptions.push({ name: "Use an NSEC bunker (NIP-46)", value: "new_bunker" });
  }
  
  // Define the type for the key choice to avoid type errors
  type KeyChoice = "generate" | "existing" | "new_bunker" | "existing_bunker";
  
  const keyChoice = await Select.prompt<KeyChoice>({
    message: "How would you like to manage your NOSTR key?",
    options: keyOptions,
  });

  let privateKey: string | undefined;
  let bunkerPubkey: string | undefined;

  if (keyChoice === "generate") {
    const keyPair = generateKeyPair();
    privateKey = keyPair.privateKey;
    console.log(colors.green(`Generated new private key: ${keyPair.privateKey}`));
    console.log(colors.yellow("IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!"));
    console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
    
  } else if (keyChoice === "existing") {
    privateKey = await Secret.prompt({
      message: "Enter your NOSTR private key (nsec/hex):",
    });
    
  } else if (keyChoice === "new_bunker") {
    const bunkerUrl = await Input.prompt({
      message: "Enter your NSEC bunker URL (bunker://...):",
      validate: (input: string) => {
        return input.trim().startsWith("bunker://") || 
               "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
      }
    });
    
    try {
      // Extract just the pubkey from the URL for the config
      const bunkerPointer = parseBunkerUrl(bunkerUrl);
      bunkerPubkey = bunkerPointer.pubkey;
      
      // Store the bunker URL in the secrets file
      BunkerKeyManager.storeBunkerUrl(bunkerPointer.pubkey, bunkerUrl);
      
      console.log(colors.green(`Stored bunker connection for pubkey: ${bunkerPointer.pubkey.slice(0, 8)}...`));
    } catch (error) {
      log.error(`Failed to parse bunker URL: ${error}`);
      throw new Error(`Failed to parse bunker URL. Please check the format: ${error}`);
    }
  } else if (keyChoice === "existing_bunker") {
    // Present a list of existing bunkers to choose from
    const bunkerOptions = existingBunkers.map((pubkey: string) => {
      return {
        name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        value: pubkey
      };
    });
    
    const selectedPubkey = await Select.prompt<string>({
      message: "Select an existing bunker:",
      options: bunkerOptions,
    });
    
    bunkerPubkey = selectedPubkey;
    console.log(colors.green(`Using existing bunker with pubkey: ${bunkerPubkey.slice(0, 8)}...`));
  }

  const projectName = await Input.prompt({
    message: "Enter website or project name:",
  });
  
  const projectAbout = await Input.prompt({
    message: "Enter website or project description:",
  });

  console.log(colors.cyan("\nEnter NOSTR relay URLs (leave empty when done):"));
  const relays = await promptForUrls("Enter relay URL:", popularRelays);

  console.log(colors.cyan("\nEnter blossom server URLs (leave empty when done):"));
  const servers = await promptForUrls("Enter blossom server URL:", popularBlossomServers);

  const publishProfile = await Confirm.prompt({
    message: "Publish profile information to NOSTR?",
    default: true,
  });

  const publishRelayList = await Confirm.prompt({
    message: "Publish relay list to NOSTR?",
    default: true,
  });

  const publishServerList = await Confirm.prompt({
    message: "Publish blossom server list to NOSTR?",
    default: true,
  });

  const projectData: ProjectData = {
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

  return { projectData, privateKey };
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
    
    if (url.startsWith("http://") || url.startsWith("https://") || 
        url.startsWith("ws://") || url.startsWith("wss://")) {
      urls.push(url);
    } else {
      console.log(colors.yellow("Invalid URL format. Please include the protocol (http://, https://, ws://, wss://)"));
    }
  }
  
  return urls;
} 