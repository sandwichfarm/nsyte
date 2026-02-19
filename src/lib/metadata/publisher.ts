import { npubEncode } from "applesauce-core/helpers";
import type { ISigner } from "applesauce-signers";
import type { ProjectConfig } from "../config.ts";
import { getErrorMessage } from "../error-utils.ts";
import { createLogger } from "../logger.ts";
import {
  createAppHandlerEvent,
  createProfileEvent,
  createRelayListEvent,
  createServerListEvent,
  publishEventsToRelays,
} from "../nostr.ts";

const log = createLogger("metadata-publisher");

/**
 * Options for publishing metadata
 */
export interface PublishOptions {
  publishAppHandler?: boolean;
  publishProfile?: boolean;
  publishRelayList?: boolean;
  publishServerList?: boolean;
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
 * Publish app handler
 */
export async function publishAppHandler(
  config: ProjectConfig,
  signer: ISigner,
  relays: string[],
  statusDisplay: StatusDisplay,
  options: { handlerKinds?: string } = {},
): Promise<void> {
  statusDisplay.update("Publishing NIP-89 app handler...");

  try {
    // Get event kinds from command line or config
    let kinds: number[] = [];
    if (options.handlerKinds) {
      kinds = options.handlerKinds.split(",").map((k) => parseInt(k.trim())).filter((k) =>
        !isNaN(k)
      );
    } else if (config.appHandler?.kinds) {
      kinds = config.appHandler.kinds;
    }

    if (kinds.length === 0) {
      statusDisplay.error("No event kinds specified for app handler");
      log.error("App handler requires event kinds to be specified");
      return;
    }

    // Determine handler ID: prefer appHandler.id, fallback to site id
    // For root sites (id is null/empty), appHandler.id is REQUIRED
    const isRootSite = config.id === null || config.id === "" || config.id === undefined;
    let handlerId: string;

    if (config.appHandler?.id) {
      // Explicitly configured handler ID takes priority
      handlerId = config.appHandler.id;
    } else if (!isRootSite && config.id) {
      // Named site: use the site id (type guard ensures it's a string)
      handlerId = config.id;
    } else {
      // Root site without appHandler.id: ERROR
      statusDisplay.error(
        "App handler requires 'id' field when site is a root site (no site id configured)",
      );
      log.error(
        "Root sites must specify 'appHandler.id' in config to publish app handlers",
      );
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
    // Map config fields to NIP-01 ProfileContent format
    const metadata = config.appHandler?.name ||
        config.appHandler?.description ||
        config.appHandler?.icon
      ? {
        name: config.appHandler.name,
        about: config.appHandler.description, // NIP-01 uses 'about', not 'description'
        picture: config.appHandler.icon, // Map icon to picture for NIP-01 format
      }
      : undefined;

    // Prepare handlers object
    const handlers: Record<string, unknown> = {
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
      handlerId,
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
 * Publish kind 0 profile metadata
 */
export async function publishProfile(
  config: ProjectConfig,
  signer: ISigner,
  relays: string[],
  statusDisplay: StatusDisplay,
): Promise<void> {
  statusDisplay.update("Publishing profile (kind 0)...");

  try {
    if (!config.profile || Object.keys(config.profile).length === 0) {
      throw new Error("No profile data configured");
    }

    const pubkey = await signer.getPublicKey();
    log.debug(`Creating profile event for ${npubEncode(pubkey)}`);

    // Create and sign the event
    const event = await createProfileEvent(signer, config.profile);

    // Publish to relays
    await publishEventsToRelays(relays, [event]);

    statusDisplay.success(
      `Profile published successfully to ${relays.length} relay(s)`,
    );
    log.info(`Published profile: ${JSON.stringify(config.profile)}`);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    statusDisplay.error(`Failed to publish profile: ${message}`);
    log.error(`Profile publication error: ${message}`);
    throw e; // Re-throw to allow caller to handle
  }
}

/**
 * Publish kind 10002 relay list
 */
export async function publishRelayList(
  config: ProjectConfig,
  signer: ISigner,
  relays: string[],
  statusDisplay: StatusDisplay,
): Promise<void> {
  statusDisplay.update("Publishing relay list (kind 10002)...");

  try {
    if (!config.relays || config.relays.length === 0) {
      throw new Error("No relays configured");
    }

    const pubkey = await signer.getPublicKey();
    log.debug(`Creating relay list event for ${npubEncode(pubkey)}`);

    // Create and sign the event (all relays as outbox/write)
    const event = await createRelayListEvent(signer, config.relays);

    // Publish to relays
    await publishEventsToRelays(relays, [event]);

    statusDisplay.success(
      `Relay list published successfully to ${relays.length} relay(s)`,
    );
    log.info(`Published ${config.relays.length} relays to relay list`);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    statusDisplay.error(`Failed to publish relay list: ${message}`);
    log.error(`Relay list publication error: ${message}`);
    throw e; // Re-throw to allow caller to handle
  }
}

/**
 * Publish kind 10063 Blossom server list
 */
export async function publishServerList(
  config: ProjectConfig,
  signer: ISigner,
  relays: string[],
  statusDisplay: StatusDisplay,
): Promise<void> {
  statusDisplay.update("Publishing Blossom server list (kind 10063)...");

  try {
    if (!config.servers || config.servers.length === 0) {
      throw new Error("No Blossom servers configured");
    }

    const pubkey = await signer.getPublicKey();
    log.debug(`Creating server list event for ${npubEncode(pubkey)}`);

    // Create and sign the event
    const event = await createServerListEvent(signer, config.servers);

    // Publish to relays
    await publishEventsToRelays(relays, [event]);

    statusDisplay.success(
      `Blossom server list published successfully to ${relays.length} relay(s)`,
    );
    log.info(`Published ${config.servers.length} servers to server list`);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    statusDisplay.error(`Failed to publish server list: ${message}`);
    log.error(`Server list publication error: ${message}`);
    throw e; // Re-throw to allow caller to handle
  }
}

/**
 * Publish all configured metadata
 */
export async function publishMetadata(
  config: ProjectConfig,
  signer: ISigner,
  relays: string[],
  statusDisplay: StatusDisplay,
  options: PublishOptions,
): Promise<void> {
  try {
    // Check both command-line options AND config settings
    const shouldPublishAppHandler = options.publishAppHandler || config.publishAppHandler || false;
    const shouldPublishProfile = options.publishProfile || config.publishProfile || false;
    const shouldPublishRelayList = options.publishRelayList || config.publishRelayList || false;
    const shouldPublishServerList = options.publishServerList || config.publishServerList || false;

    log.debug(
      `Publish flags - combined: appHandler=${shouldPublishAppHandler}, profile=${shouldPublishProfile}, relayList=${shouldPublishRelayList}, serverList=${shouldPublishServerList}`,
    );

    const hasAnyPublishing = shouldPublishAppHandler || shouldPublishProfile ||
      shouldPublishRelayList || shouldPublishServerList;

    if (!hasAnyPublishing) {
      log.debug("No metadata publishing requested");
      return;
    }

    // Validate root site restriction for user-level metadata
    const isRootSite = config.id === null || config.id === "" || config.id === undefined;
    const wantsUserMetadata = shouldPublishProfile || shouldPublishRelayList ||
      shouldPublishServerList;

    if (!isRootSite && wantsUserMetadata) {
      const message =
        "Profile, relay list, and server list can only be published from root sites (id must be null or empty)";
      statusDisplay.error(message);
      log.error(message);
      return;
    }

    // Publish each type if requested - each allowed to fail independently
    if (shouldPublishAppHandler) {
      try {
        await publishAppHandler(config, signer, relays, statusDisplay, {
          handlerKinds: options.handlerKinds,
        });
      } catch (e) {
        log.error(`App handler publishing failed: ${getErrorMessage(e)}`);
      }
    }

    if (shouldPublishProfile) {
      try {
        await publishProfile(config, signer, relays, statusDisplay);
      } catch (e) {
        log.error(`Profile publishing failed: ${getErrorMessage(e)}`);
      }
    }

    if (shouldPublishRelayList) {
      try {
        await publishRelayList(config, signer, relays, statusDisplay);
      } catch (e) {
        log.error(`Relay list publishing failed: ${getErrorMessage(e)}`);
      }
    }

    if (shouldPublishServerList) {
      try {
        await publishServerList(config, signer, relays, statusDisplay);
      } catch (e) {
        log.error(`Server list publishing failed: ${getErrorMessage(e)}`);
      }
    }
  } catch (e: unknown) {
    const errMsg = `Error during metadata publishing: ${getErrorMessage(e)}`;
    statusDisplay.error(errMsg);
    log.error(errMsg);
  }
}
