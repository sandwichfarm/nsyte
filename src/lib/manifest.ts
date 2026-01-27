import { type EventTemplate, type NostrEvent, relaySet } from "applesauce-core/helpers";
import { getBlossomServersFromList } from "applesauce-common/helpers";

// Constants for nsite nsite manifest kinds
export const NSITE_ROOT_SITE_KIND = 15128;
export const NSITE_NAME_SITE_KIND = 35128;

/** Returns the servers from a manifest event */
export function getManifestServers(manifest: NostrEvent): URL[] {
  return getBlossomServersFromList(manifest);
}

/** Returns the relays from a manifest event */
export function getManifestRelays(manifest: NostrEvent): string[] {
  return relaySet(manifest.tags.filter((tag) => tag[0] === "relay").map((tag) => tag[1]));
}

/** Returns the title from a manifest event */
export function getManifestTitle(manifest: NostrEvent): string | undefined {
  return manifest.tags.find((tag) => tag[0] === "title")?.[1];
}

/** Returns the description from a manifest event */
export function getManifestDescription(manifest: NostrEvent): string | undefined {
  return manifest.tags.find((tag) => tag[0] === "description")?.[1];
}

/**
 * File path mapping for site manifest
 */
export interface FilePathMapping {
  path: string;
  sha256: string;
}

/** Returns the files from a manifest event */
export function getManifestFiles(manifest: NostrEvent): FilePathMapping[] {
  return manifest.tags.filter((tag) => tag[0] === "path").map((tag) => ({
    path: tag[1],
    sha256: tag[2],
  }));
}

/**
 * Create a site manifest event (NIP-XX)
 * @param signer - Signer for the event
 * @param pubkey - Public key of the site owner
 * @param files - Array of file path mappings (path -> sha256)
 * @param identifier - Optional site identifier for named sites (kind 35128). If not provided, creates root site (kind 15128)
 * @param metadata - Optional metadata (title, description, servers, relays)
 */
export function createSiteManifestTemplate(
  files: FilePathMapping[],
  identifier?: string,
  metadata?: { title?: string; description?: string; servers?: string[]; relays?: string[] },
): EventTemplate {
  const tags: string[][] = [];

  // Add d tag for named sites (kind 35128)
  if (identifier) {
    tags.push(["d", identifier]);
  }

  // Add path tags for all files
  for (const file of files) {
    const normalizedPath = file.path.startsWith("/") ? file.path : `/${file.path}`;
    tags.push(["path", normalizedPath, file.sha256]);
  }

  // Add optional server tags
  if (metadata?.servers && metadata.servers.length > 0) {
    for (const server of metadata.servers) {
      tags.push(["server", server]);
    }
  }

  // Add optional relay tags
  if (metadata?.relays && metadata.relays.length > 0) {
    for (const relay of metadata.relays) {
      tags.push(["relay", relay]);
    }
  }

  // Add optional title and description
  if (metadata?.title) {
    tags.push(["title", metadata.title]);
  }
  if (metadata?.description) {
    tags.push(["description", metadata.description]);
  }

  tags.push(["client", "nsyte"]);

  // Use kind 35128 for named sites, 15128 for root site
  const kind = identifier ? NSITE_NAME_SITE_KIND : NSITE_ROOT_SITE_KIND;

  return {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}
