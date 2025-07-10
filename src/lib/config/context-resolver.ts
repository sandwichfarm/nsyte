import { colors } from "@cliffy/ansi/colors";
import { defaultConfig, type ProjectConfig, type ProjectContext, readProjectFile, setupProject } from "../config.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("config-resolver");

/**
 * Configuration resolution options
 */
export interface ConfigResolveOptions {
  // CLI options
  servers?: string;
  relays?: string;
  publishServerList?: boolean;
  publishRelayList?: boolean;
  publishProfile?: boolean;
  privatekey?: string;
  nbunksec?: string;
  bunker?: string;
  fallback?: string;
  
  // Mode
  nonInteractive: boolean;
}

/**
 * Resolve project configuration from various sources
 * 
 * Priority order:
 * 1. CLI options
 * 2. Config file
 * 3. Interactive setup
 * 4. Defaults
 */
export async function resolveProjectContext(options: ConfigResolveOptions): Promise<ProjectContext> {
  let config: ProjectConfig | null = null;
  let authKeyHex: string | null | undefined = options.privatekey || undefined;

  if (options.nonInteractive) {
    return resolveNonInteractive(options, authKeyHex);
  } else {
    return resolveInteractive(options, authKeyHex);
  }
}

/**
 * Resolve configuration in non-interactive mode
 */
function resolveNonInteractive(options: ConfigResolveOptions, authKeyHex: string | null | undefined): ProjectContext {
  log.debug("Resolving project context in non-interactive mode.");
  
  let existingProjectData: ProjectConfig | null = null;
  
  try {
    existingProjectData = readProjectFile();
  } catch (error) {
    // Configuration exists but is invalid
    console.error(colors.red("\nConfiguration file exists but contains errors."));
    console.error(colors.yellow("Please fix the errors above or delete .nsite/config.json to start fresh.\n"));
    return {
      config: defaultConfig,
      authKeyHex,
      error: "Configuration validation failed",
    };
  }
  
  if (!existingProjectData) {
    existingProjectData = defaultConfig;
  }

  // Validate required fields
  if (!options.servers && (!existingProjectData?.servers || existingProjectData.servers.length === 0)) {
    return {
      config: existingProjectData,
      authKeyHex,
      error: "Missing servers: Provide --servers or configure in .nsite/config.json.",
    };
  }
  
  if (!options.relays && (!existingProjectData?.relays || existingProjectData.relays.length === 0)) {
    return {
      config: existingProjectData,
      authKeyHex,
      error: "Missing relays: Provide --relays or configure in .nsite/config.json.",
    };
  }

  if (!authKeyHex && !options.nbunksec && !options.bunker) {
    if (!existingProjectData.bunkerPubkey) {
      return {
        config: existingProjectData,
        authKeyHex,
        error: "Missing key: Provide --privatekey, --nbunksec, --bunker, or configure bunker in .nsite/config.json.",
      };
    }
  }

  // Build final config by merging CLI options with existing config
  const config: ProjectConfig = {
    servers: options.servers 
      ? options.servers.split(",").filter(s => s.trim())
      : existingProjectData?.servers || [],
    relays: options.relays
      ? options.relays.split(",").filter(r => r.trim())
      : existingProjectData?.relays || [],
    publishServerList: options.publishServerList !== undefined
      ? options.publishServerList
      : existingProjectData?.publishServerList || false,
    publishRelayList: options.publishRelayList !== undefined
      ? options.publishRelayList
      : existingProjectData?.publishRelayList || false,
    publishProfile: options.publishProfile !== undefined
      ? options.publishProfile
      : existingProjectData?.publishProfile || false,
    profile: existingProjectData?.profile,
    bunkerPubkey: existingProjectData?.bunkerPubkey,
    fallback: options.fallback || existingProjectData?.fallback,
    gatewayHostnames: existingProjectData?.gatewayHostnames || ["nsite.lol"],
  };

  return { config, authKeyHex };
}

/**
 * Resolve configuration in interactive mode
 */
async function resolveInteractive(options: ConfigResolveOptions, authKeyHex: string | null | undefined): Promise<ProjectContext> {
  log.debug("Resolving project context in interactive mode.");
  
  let currentProjectData: ProjectConfig | null = null;
  let keyFromInteractiveSetup: string | undefined;

  try {
    currentProjectData = readProjectFile();
  } catch (error) {
    // Configuration exists but is invalid
    console.error(colors.red("\nConfiguration file exists but contains errors."));
    console.error(colors.yellow("Please fix the errors above or delete .nsite/config.json to start fresh.\n"));
    return {
      config: defaultConfig,
      authKeyHex: undefined,
      error: "Configuration validation failed",
    };
  }

  if (!currentProjectData) {
    log.info("No .nsite/config.json found, running initial project setup.");
    const setupResult = await setupProject(false);
    if (!setupResult.config) {
      return {
        config: defaultConfig,
        authKeyHex: undefined,
        error: "Project setup failed or was aborted.",
      };
    }
    currentProjectData = setupResult.config;
    keyFromInteractiveSetup = setupResult.privateKey;
  } else {
    // Check if we need key setup
    if (!options.privatekey && !options.nbunksec && !options.bunker && !currentProjectData.bunkerPubkey) {
      log.info("Project is configured but no signing method found. Running key setup...");
      const keySetupResult = await setupProject(false);
      if (!keySetupResult.config) {
        return {
          config: currentProjectData,
          authKeyHex: undefined,
          error: "Key setup for existing project failed or was aborted.",
        };
      }
      currentProjectData = keySetupResult.config;
      keyFromInteractiveSetup = keySetupResult.privateKey;
    }
  }

  // Ensure gateway hostnames
  if (!currentProjectData?.gatewayHostnames) {
    currentProjectData.gatewayHostnames = ["nsite.lol"];
  }

  // Determine auth key
  if (options.privatekey) {
    authKeyHex = options.privatekey;
  } else if (keyFromInteractiveSetup) {
    authKeyHex = keyFromInteractiveSetup;
  }

  return { config: currentProjectData, authKeyHex };
}

/**
 * Validate that a project context has all required fields
 */
export function validateProjectContext(context: ProjectContext): string | null {
  if (!context.config) {
    return "Configuration is missing";
  }

  if (!context.config.servers || context.config.servers.length === 0) {
    return "Servers configuration is missing or empty";
  }

  if (!context.config.relays || context.config.relays.length === 0) {
    return "Relays configuration is missing or empty";
  }

  return null;
}