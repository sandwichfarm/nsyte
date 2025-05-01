import { join, dirname } from "std/path/mod.ts";
import { ensureDirSync } from "std/fs/ensure_dir.ts";
import { createLogger } from "./logger.ts";
import { Input, Confirm, Select, Secret } from "cliffy/prompt/mod.ts";
import { colors } from "cliffy/ansi/colors.ts";
import { generateKeyPair } from "./nostr.ts";

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
  bunkerUrl?: string;
  bunkerSession?: string;
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
 * Write project configuration to file
 */
export function writeProjectFile(projectData: ProjectData): void {
  const projectPath = join(Deno.cwd(), configDir, projectFile);

  try {
    ensureDirSync(dirname(projectPath));

    Deno.writeTextFileSync(projectPath, JSON.stringify(projectData, null, 2));
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
 */
export async function setupProject(): Promise<ProjectContext> {
  let projectData = readProjectFile();
  let privateKey: string | undefined;
  
  if (!projectData) {
    console.log(colors.cyan("No existing project configuration found. Setting up a new one:"));
    const setupResult = await interactiveSetup();
    projectData = setupResult.projectData;
    privateKey = setupResult.privateKey;
    writeProjectFile(projectData);
  }

  if (!projectData.bunkerUrl && !privateKey) {
    console.log(colors.yellow("No key configuration found. Let's set that up:"));
    
    const keyChoice = await Select.prompt({
      message: "How would you like to manage your NOSTR key?",
      options: [
        { name: "Generate a new private key", value: "generate" },
        { name: "Use an existing private key", value: "existing" },
        { name: "Use an NSEC bunker (NIP-46)", value: "bunker" },
      ],
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
      
    } else if (keyChoice === "bunker") {
      projectData.bunkerUrl = await Input.prompt({
        message: "Enter your NSEC bunker URL (bunker://...):",
        validate: (input: string) => {
          return input.trim().startsWith("bunker://") || 
                "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
        }
      });
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
  
  const keyChoice = await Select.prompt({
    message: "How would you like to manage your NOSTR key?",
    options: [
      { name: "Generate a new private key", value: "generate" },
      { name: "Use an existing private key", value: "existing" },
      { name: "Use an NSEC bunker (NIP-46)", value: "bunker" },
    ],
  });

  let privateKey: string | undefined;
  let bunkerUrl: string | undefined;
  let bunkerSession: string | undefined;

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
    
  } else if (keyChoice === "bunker") {
    bunkerUrl = await Input.prompt({
      message: "Enter your NSEC bunker URL (bunker://...):",
      validate: (input: string) => {
        return input.trim().startsWith("bunker://") || 
               "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
      }
    });
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
    bunkerUrl,
    bunkerSession,
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