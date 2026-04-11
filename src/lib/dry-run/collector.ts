import type { EventTemplate } from "applesauce-core/helpers";
import type { ProjectConfig } from "../config.ts";
import type { FilePathMapping } from "../manifest.ts";
import {
  createSiteManifestTemplate,
  NSITE_NAME_SITE_KIND,
  NSITE_ROOT_SITE_KIND,
} from "../manifest.ts";
import type { DryRunEvent } from "./types.ts";

/** Options that affect which events would be published */
interface DeployEventOptions {
  publishAppHandler?: boolean;
  publishProfile?: boolean;
  publishRelayList?: boolean;
  publishServerList?: boolean;
  handlerKinds?: string;
  servers?: string;
  relays?: string;
}

/**
 * Collect all event templates that deploy would publish.
 * No signer interaction — only builds unsigned templates.
 */
export function collectDeployEvents(
  config: ProjectConfig,
  files: FilePathMapping[],
  options: DeployEventOptions = {},
): DryRunEvent[] {
  const events: DryRunEvent[] = [];

  // 1. Site manifest (always published)
  const siteId = config.id || undefined;
  const manifestRelays = options.relays?.split(",").map((r) => r.trim()).filter((r) => r) ||
    config.relays || [];
  const manifestServers = options.servers?.split(",").map((s) => s.trim()).filter((s) => s) ||
    config.servers || [];

  const manifestTemplate = createSiteManifestTemplate(files, siteId, {
    title: config.title,
    description: config.description,
    servers: manifestServers,
    relays: manifestRelays,
    source: config.source,
  });

  const manifestKind = siteId ? NSITE_NAME_SITE_KIND : NSITE_ROOT_SITE_KIND;
  events.push({
    label: `Site Manifest (kind ${manifestKind})`,
    kind: manifestKind,
    template: manifestTemplate,
    filename: `manifest-${manifestKind}.json`,
  });

  // 2. App handler (kind 31990) — if enabled
  const shouldPublishAppHandler = options.publishAppHandler || config.publishAppHandler;
  if (shouldPublishAppHandler) {
    const handlerTemplate = buildAppHandlerTemplate(config, options.handlerKinds);
    if (handlerTemplate) {
      events.push({
        label: "App Handler (kind 31990)",
        kind: 31990,
        template: handlerTemplate,
        filename: "app-handler-31990.json",
      });
    }
  }

  // 3. Profile (kind 0) — if enabled
  const shouldPublishProfile = options.publishProfile || config.publishProfile;
  if (shouldPublishProfile && config.profile) {
    events.push({
      label: "Profile (kind 0)",
      kind: 0,
      template: buildProfileTemplate(config),
      filename: "profile-0.json",
    });
  }

  // 4. Relay list (kind 10002) — if enabled
  const shouldPublishRelayList = options.publishRelayList || config.publishRelayList;
  if (shouldPublishRelayList) {
    const relays = manifestRelays;
    if (relays.length > 0) {
      events.push({
        label: "Relay List (kind 10002)",
        kind: 10002,
        template: buildRelayListTemplate(relays),
        filename: "relay-list-10002.json",
      });
    }
  }

  // 5. Server list (kind 10063) — if enabled
  const shouldPublishServerList = options.publishServerList || config.publishServerList;
  if (shouldPublishServerList) {
    const servers = manifestServers;
    if (servers.length > 0) {
      events.push({
        label: "Server List (kind 10063)",
        kind: 10063,
        template: buildServerListTemplate(servers),
        filename: "server-list-10063.json",
      });
    }
  }

  return events;
}

/**
 * Collect all event templates that announce would publish.
 * No signer interaction — only builds unsigned templates.
 */
export function collectAnnounceEvents(
  config: ProjectConfig,
): DryRunEvent[] {
  const events: DryRunEvent[] = [];

  const handlerTemplate = buildAppHandlerTemplate(config);
  if (handlerTemplate) {
    events.push({
      label: "App Handler (kind 31990)",
      kind: 31990,
      template: handlerTemplate,
      filename: "app-handler-31990.json",
    });
  }

  return events;
}

/**
 * Build an app handler event template (kind 31990) without signing.
 * Mirrors the template construction in nostr.ts createAppHandlerEvent().
 */
function buildAppHandlerTemplate(
  config: ProjectConfig,
  handlerKindsStr?: string,
): EventTemplate | null {
  let kinds: number[] = [];
  if (handlerKindsStr) {
    kinds = handlerKindsStr.split(",").map((k) => parseInt(k.trim())).filter((k) => !isNaN(k));
  } else if (config.appHandler?.kinds) {
    kinds = config.appHandler.kinds;
  }

  if (kinds.length === 0) return null;

  const isRootSite = !config.id;
  let handlerId: string;
  if (config.appHandler?.id) {
    handlerId = config.appHandler.id;
  } else if (!isRootSite && config.id) {
    handlerId = config.id;
  } else {
    return null; // Cannot determine handler ID
  }

  const gatewayHostname = config.gatewayHostnames?.[0] || "nsite.lol";
  // Use placeholder for npub-dependent URL in dry-run
  const gatewayUrl = `https://<npub>.${gatewayHostname}`;

  const tags: string[][] = [
    ["d", handlerId],
    ["client", "nsyte"],
  ];

  for (const kind of kinds) {
    tags.push(["k", kind.toString()]);
  }

  // Web handler URLs (using placeholder gateway URL)
  if (config.appHandler?.platforms?.web?.patterns) {
    for (const pattern of config.appHandler.platforms.web.patterns) {
      if (pattern.entities && pattern.entities.length > 0) {
        for (const entity of pattern.entities) {
          tags.push(["web", pattern.url, entity]);
        }
      } else {
        tags.push(["web", pattern.url]);
      }
    }
  } else {
    tags.push(["web", `${gatewayUrl}/e/<bech32>`, "nevent"]);
    tags.push(["web", `${gatewayUrl}/a/<bech32>`, "naddr"]);
    tags.push(["web", `${gatewayUrl}/p/<bech32>`, "nprofile"]);
    tags.push(["web", `${gatewayUrl}/e/<bech32>`]);
  }

  // Native platform handlers
  if (config.appHandler?.platforms) {
    const { android, ios, macos, windows, linux } = config.appHandler.platforms;
    if (android) tags.push(["android", android]);
    if (ios) tags.push(["ios", ios]);
    if (macos) tags.push(["macos", macos]);
    if (windows) tags.push(["windows", windows]);
    if (linux) tags.push(["linux", linux]);
  }

  // NIP-01 style metadata content
  let content = "";
  if (config.appHandler?.name || config.appHandler?.description || config.appHandler?.icon) {
    const profile: Record<string, string> = {};
    if (config.appHandler.name) profile.name = config.appHandler.name;
    if (config.appHandler.description) profile.about = config.appHandler.description;
    if (config.appHandler.icon) profile.picture = config.appHandler.icon;
    content = JSON.stringify(profile);
  }

  return {
    kind: 31990,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
}

/**
 * Build a profile event template (kind 0) without signing.
 */
function buildProfileTemplate(config: ProjectConfig): EventTemplate {
  const profile = config.profile || {};
  return {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(profile),
  };
}

/**
 * Build a relay list event template (kind 10002) without signing.
 */
function buildRelayListTemplate(relays: string[]): EventTemplate {
  // NIP-65: include "write" marker to match production event shape
  const tags: string[][] = relays.map((relay) => ["r", relay, "write"]);
  return {
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}

/**
 * Build a server list event template (kind 10063) without signing.
 */
function buildServerListTemplate(servers: string[]): EventTemplate {
  const tags: string[][] = servers.map((server) => ["server", server]);
  return {
    kind: 10063,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}
