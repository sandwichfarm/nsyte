import { npubEncode } from "nostr-tools/nip19";
import { createLogger } from "../logger.ts";
import { getErrorMessage } from "../error-utils.ts";
import type { ProjectConfig } from "../config.ts";
import type { Signer } from "../upload.ts";
import type { FileEntry } from "../nostr.ts";
import {
  createProfileEvent,
  createRelayListEvent,
  createServerListEvent,
  createAppHandlerEvent,
  publishEventsToRelays,
} from "../nostr.ts";

const log = createLogger("metadata-publisher");

/**
 * Options for publishing metadata
 */
export interface PublishOptions {
  publishProfile?: boolean;
  publishRelayList?: boolean;
  publishServerList?: boolean;
  publishAppHandler?: boolean;
  handlerKinds?: string;
}

/**
 * Status display interface
 */
export interface StatusDisplay {
  update(message: string): void;
  success(message: string): void;
  error(message: string): void;
}

/**
 * Publish profile metadata
 */
export async function publishProfile(
  config: ProjectConfig,
  signer: Signer,
  relays: string[],
  statusDisplay: StatusDisplay
): Promise<void> {
  if (!config.profile) {
    log.debug("No profile configuration found, skipping profile publishing");
    return;
  }

  statusDisplay.update("Publishing profile...");
  
  try {
    const profileEvent = await createProfileEvent(signer, config.profile);
    log.debug(`Created profile event: ${JSON.stringify(profileEvent)}`);
    await publishEventsToRelays(relays, [profileEvent]);
    statusDisplay.success("Profile published");
  } catch (e: unknown) {
    statusDisplay.error(`Failed to publish profile: ${getErrorMessage(e)}`);
    log.error(`Profile publication error: ${getErrorMessage(e)}`);
  }
}

/**
 * Publish relay list
 */
export async function publishRelayList(
  config: ProjectConfig,
  signer: Signer,
  relays: string[],
  statusDisplay: StatusDisplay
): Promise<void> {
  statusDisplay.update("Publishing relay list...");
  
  try {
    const relayListEvent = await createRelayListEvent(signer, config.relays);
    log.debug(`Created relay list event: ${JSON.stringify(relayListEvent)}`);
    await publishEventsToRelays(relays, [relayListEvent]);
    statusDisplay.success("Relay list published");
  } catch (e: unknown) {
    statusDisplay.error(`Failed to publish relay list: ${getErrorMessage(e)}`);
    log.error(`Relay list publication error: ${getErrorMessage(e)}`);
  }
}

/**
 * Publish server list
 */
export async function publishServerList(
  config: ProjectConfig,
  signer: Signer,
  relays: string[],
  statusDisplay: StatusDisplay
): Promise<void> {
  statusDisplay.update("Publishing blossom server list...");
  
  try {
    const serverListEvent = await createServerListEvent(signer, config.servers);
    log.debug(`Created server list event: ${JSON.stringify(serverListEvent)}`);
    await publishEventsToRelays(relays, [serverListEvent]);
    statusDisplay.success("Server list published");
  } catch (e: unknown) {
    statusDisplay.error(`Failed to publish server list: ${getErrorMessage(e)}`);
    log.error(`Server list publication error: ${getErrorMessage(e)}`);
  }
}

/**
 * Publish app handler
 */
export async function publishAppHandler(
  config: ProjectConfig,
  signer: Signer,
  relays: string[],
  statusDisplay: StatusDisplay,
  options: { handlerKinds?: string } = {}
): Promise<void> {
  statusDisplay.update("Publishing NIP-89 app handler...");

  try {
    // Get event kinds from command line or config
    let kinds: number[] = [];
    if (options.handlerKinds) {
      kinds = options.handlerKinds.split(",").map(k => parseInt(k.trim())).filter(k => !isNaN(k));
    } else if (config.appHandler?.kinds) {
      kinds = config.appHandler.kinds;
    }

    if (kinds.length === 0) {
      statusDisplay.error("No event kinds specified for app handler");
      log.error("App handler requires event kinds to be specified");
      return;
    }

    // Get the gateway URL
    const gatewayHostname = config.gatewayHostnames?.[0] || "nsite.lol";
    
    // Add timeout to prevent hanging on getPublicKey
    const getPublicKeyPromise = signer.getPublicKey();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout getting public key from signer")), 10000);
    });
    
    let publisherPubkey: string;
    try {
      publisherPubkey = await Promise.race([getPublicKeyPromise, timeoutPromise]) as string;
    } catch (e) {
      throw new Error(`Failed to get public key from signer: ${getErrorMessage(e)}`);
    }
    
    const npub = npubEncode(publisherPubkey);
    const gatewayUrl = `https://${npub}.${gatewayHostname}`;

    // Get metadata from config if available
    const metadata = config.appHandler?.name || config.appHandler?.description
      ? {
          name: config.appHandler.name || config.profile?.name,
          description: config.appHandler.description || config.profile?.about,
          picture: config.profile?.picture,
        }
      : undefined;

    // Prepare handlers object
    const handlers: any = {
      web: {
        url: gatewayUrl,
        patterns: config.appHandler?.platforms?.web?.patterns,
      },
    };

    // Add other platform handlers if configured
    if (config.appHandler?.platforms) {
      const { android, ios, macos, windows, linux } = config.appHandler.platforms;
      if (android) handlers.android = android;
      if (ios) handlers.ios = ios;
      if (macos) handlers.macos = macos;
      if (windows) handlers.windows = windows;
      if (linux) handlers.linux = linux;
    }

    const handlerEvent = await createAppHandlerEvent(
      signer,
      kinds,
      handlers,
      metadata,
    );
    
    log.debug(`Created app handler event: ${JSON.stringify(handlerEvent)}`);
    await publishEventsToRelays(relays, [handlerEvent]);
    statusDisplay.success(`App handler published for kinds: ${kinds.join(", ")}`);
  } catch (e: unknown) {
    statusDisplay.error(`Failed to publish app handler: ${getErrorMessage(e)}`);
    log.error(`App handler publication error: ${getErrorMessage(e)}`);
  }
}

/**
 * Publish all configured metadata
 */
export async function publishMetadata(
  config: ProjectConfig,
  signer: Signer,
  relays: string[],
  statusDisplay: StatusDisplay,
  options: PublishOptions,
  includedFiles: FileEntry[] = []
): Promise<void> {
  try {
    // Check both command-line options AND config settings
    const shouldPublishProfile = options.publishProfile || config.publishProfile || false;
    const shouldPublishRelayList = options.publishRelayList || config.publishRelayList || false;
    const shouldPublishServerList = options.publishServerList || config.publishServerList || false;
    const shouldPublishAppHandler = options.publishAppHandler || config.publishAppHandler || false;

    log.debug(
      `Publish flags - combined: profile=${shouldPublishProfile}, relayList=${shouldPublishRelayList}, serverList=${shouldPublishServerList}, appHandler=${shouldPublishAppHandler}`,
    );

    if (!shouldPublishProfile && !shouldPublishRelayList && !shouldPublishServerList && !shouldPublishAppHandler) {
      log.debug("No metadata publishing requested");
      return;
    }

    if (shouldPublishProfile) {
      await publishProfile(config, signer, relays, statusDisplay);
    }

    if (shouldPublishRelayList) {
      await publishRelayList(config, signer, relays, statusDisplay);
    }

    if (shouldPublishServerList) {
      await publishServerList(config, signer, relays, statusDisplay);
    }

    if (shouldPublishAppHandler) {
      await publishAppHandler(config, signer, relays, statusDisplay, {
        handlerKinds: options.handlerKinds,
      });
    }
  } catch (e: unknown) {
    const errMsg = `Error during metadata publishing: ${getErrorMessage(e)}`;
    statusDisplay.error(errMsg);
    log.error(errMsg);
  }
}