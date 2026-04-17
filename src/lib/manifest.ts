import { encodeHex } from "@std/encoding/hex";
import { type EventTemplate, type NostrEvent, relaySet } from "applesauce-core/helpers";
import { getBlossomServersFromList } from "applesauce-common/helpers";

// Constants for nsite nsite manifest kinds
export const NSITE_ROOT_SITE_KIND = 15128;
export const NSITE_NAME_SITE_KIND = 35128;
export const NSITE_SNAPSHOT_KIND = 5128;

const SNAPSHOT_COPYABLE_TAGS = new Set([
  "A",
  "app",
  "description",
  "path",
  "relay",
  "server",
  "source",
  "title",
]);

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

/** Returns the named-site identifier from a manifest event */
export function getManifestIdentifier(manifest: NostrEvent): string | undefined {
  return manifest.tags.find((tag) => tag[0] === "d")?.[1];
}

/** Returns the first uppercase lineage tag from a manifest event */
export function getManifestLineageOrigin(manifest: NostrEvent): string | undefined {
  return manifest.tags.find((tag) => tag[0] === "A")?.[1];
}

/** Returns the aggregate x tag value if present */
export function getManifestAggregateHash(manifest: NostrEvent): string | undefined {
  return manifest.tags.find((tag) => tag[0] === "x" && tag[2] === "aggregate")?.[1];
}

/** Builds the canonical address string for a root or named site manifest */
export function buildSiteAddress(manifest: Pick<NostrEvent, "kind" | "pubkey" | "tags">): string {
  if (manifest.kind === NSITE_ROOT_SITE_KIND) {
    return `${NSITE_ROOT_SITE_KIND}:${manifest.pubkey}:`;
  }

  if (manifest.kind !== NSITE_NAME_SITE_KIND) {
    throw new Error(`Unsupported manifest kind for site address: ${manifest.kind}`);
  }

  const identifier = getManifestIdentifier(manifest as NostrEvent);
  if (!identifier) {
    throw new Error("Named site manifest is missing d tag");
  }

  return `${NSITE_NAME_SITE_KIND}:${manifest.pubkey}:${identifier}`;
}

/**
 * Computes the NIP-5A aggregate hash using only raw path tags.
 * The hash is the sha256 of sorted `<sha256> <absolute-path>\n` lines.
 */
export async function computeManifestAggregateHash(
  manifest: Pick<NostrEvent, "tags">,
): Promise<string> {
  const lines = manifest.tags
    .filter((tag) => tag[0] === "path")
    .map((tag) => {
      const path = tag[1];
      const sha256 = tag[2];
      if (!path || !sha256) {
        throw new Error("Manifest contains an invalid path tag");
      }

      return `${sha256} ${path}\n`;
    })
    .sort();

  if (lines.length === 0) {
    throw new Error("Manifest must include at least one path tag");
  }

  const data = new TextEncoder().encode(lines.join(""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(new Uint8Array(digest));
}

/**
 * Returns the aggregate x tag for a manifest, computing it from path tags when absent.
 * Rejects manifests that include multiple aggregate x tags.
 */
export async function getOrComputeManifestAggregateTag(
  manifest: Pick<NostrEvent, "tags">,
): Promise<["x", string, "aggregate"]> {
  const aggregateTags = manifest.tags.filter((tag) => tag[0] === "x" && tag[2] === "aggregate");

  if (aggregateTags.length > 1) {
    throw new Error("Manifest contains multiple aggregate x tags");
  }

  if (aggregateTags.length === 1) {
    const hash = aggregateTags[0][1];
    if (!hash) {
      throw new Error("Manifest aggregate x tag is missing a hash value");
    }

    return ["x", hash, "aggregate"];
  }

  return ["x", await computeManifestAggregateHash(manifest), "aggregate"];
}

/** Builds a snapshot event template from an existing root or named site manifest */
export async function createSnapshotTemplate(
  sourceManifest: NostrEvent,
): Promise<EventTemplate> {
  if (
    sourceManifest.kind !== NSITE_ROOT_SITE_KIND && sourceManifest.kind !== NSITE_NAME_SITE_KIND
  ) {
    throw new Error(`Snapshots can only be created from root or named site manifests`);
  }

  const tags: string[][] = [];
  tags.push(["a", buildSiteAddress(sourceManifest)]);

  const originTag = sourceManifest.tags.find((tag) => tag[0] === "A");
  if (originTag) {
    tags.push([...originTag]);
  }

  for (const tag of sourceManifest.tags) {
    if (!SNAPSHOT_COPYABLE_TAGS.has(tag[0]) || tag[0] === "A") {
      continue;
    }

    if (tag[0] === "x") {
      continue;
    }

    tags.push([...tag]);
  }

  tags.push(await getOrComputeManifestAggregateTag(sourceManifest));
  tags.push(["client", "nsyte"]);

  return {
    kind: NSITE_SNAPSHOT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
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
  metadata?: {
    title?: string;
    description?: string;
    servers?: string[];
    relays?: string[];
    source?: string;
  },
  createdAt?: number,
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

  // Add optional source tag (repository URL)
  if (metadata?.source) {
    tags.push(["source", metadata.source]);
  }

  tags.push(["client", "nsyte"]);

  // Use kind 35128 for named sites, 15128 for root site
  const kind = identifier ? NSITE_NAME_SITE_KIND : NSITE_ROOT_SITE_KIND;

  return {
    kind,
    created_at: createdAt ?? Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}
