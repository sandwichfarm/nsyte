/**
 * napp asset-input classification + local-file upload helper.
 *
 * Pure helpers (`classifyAssetInput`/`deriveAssetMime`/`parseCategoriesInput`/
 * `parseCountriesInput`/`isRootSite`/`rootSiteMigrationNotice`) plus the upload boundary
 * (`resolveNappAsset`/`uploadNappAsset`). The boundary keeps the existing paste-a-hash/URL
 * path working while making local-path uploads unit-testable via an injected upload fn.
 */
import { contentType } from "@std/media-types";
import { basename, dirname, extname } from "@std/path";
import { calculateFileHash } from "../files.ts";
import { processUploads, type UploadResponse } from "../upload.ts";
import type { FileEntry } from "../nostr.ts";
import type { ISigner } from "applesauce-signers";
import type { NappAsset } from "./types.ts";

const HEX64 = /^[0-9a-fA-F]{64}$/;

/** Classify a raw asset-input string into hash / url / path (anything else). PURE. */
export function classifyAssetInput(value: string): "hash" | "url" | "path" {
  if (HEX64.test(value)) return "hash";
  if (/^https?:\/\//i.test(value)) return "url";
  return "path";
}

/**
 * Map a recognizable image extension to its MIME via `@std/media-types`, falling back to
 * `"image/png"`. GUARD: `contentType` returns NON-image types for many extensions
 * (e.g. `.xyz`→`chemical/x-xyz`), so the result is used ONLY when it starts with
 * `"image/"`. PURE.
 */
export function deriveAssetMime(value: string): string {
  const ext = extname(value);
  if (ext) {
    const mime = contentType(ext);
    if (mime && mime.startsWith("image/")) {
      // Strip any parameters (e.g. "; charset=...") that may be appended.
      return mime.split(";")[0].trim();
    }
  }
  return "image/png";
}

/**
 * Normalize raw category inputs into `napp.<cat>:<sub>` labels: prepend `napp.` only when
 * missing, trim, drop blanks, preserve order. Validation / the ≤3 cap is left to
 * `validateNappConfig`/`validateCategories`. PURE.
 */
export function parseCategoriesInput(values: string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out.push(trimmed.startsWith("napp.") ? trimmed : `napp.${trimmed}`);
  }
  return out;
}

/**
 * Split a comma-separated countries string: trim, drop blanks; return `["*"]` when the
 * result is empty or exactly `["*"]`. Mirrors the existing wizard logic. PURE.
 */
export function parseCountriesInput(csv: string): string[] {
  const parts = csv.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "*")) {
    return ["*"];
  }
  return parts;
}

/** True iff `config.id` is missing/empty (a root site, kind 15128). PURE. */
export function isRootSite(config: { id?: string | null }): boolean {
  return config.id === undefined || config.id === null || config.id === "";
}

/** Multi-line warning shown before converting a ROOT site into a named napp. PURE. */
export function rootSiteMigrationNotice(): string {
  return [
    "This is a ROOT site (no id). napps require a NAMED site to be discoverable.",
    "Setting an id republishes your manifest from kind 15128 (root) to kind 35128 (named).",
    "The old root manifest is then ORPHANED — it is not deleted, just no longer your live site.",
    "Your gateway URLs change (e.g. npub1….nsite.lol → {id}.npub1….nsite.lol).",
    "nsyte never auto-migrates: an id is set ONLY when you pass --id or explicitly confirm.",
  ].join("\n");
}

/** Context the upload helper needs (servers/relays/signer). */
export interface UploadAssetContext {
  servers: string[];
  relays: string[];
  signer: ISigner;
}

/** Injectable upload boundary signature (default = real processUploads). */
export type ProcessFn = (
  files: FileEntry[],
  baseDir: string,
  servers: string[],
  signer: ISigner,
  relays: string[],
) => Promise<UploadResponse[]>;

/**
 * Resolve a raw asset input into a {@link NappAsset}. For hash/url it returns
 * `{ hash: value, mime: deriveAssetMime(value) }` WITHOUT calling `upload`; for a local
 * path it returns `await upload(value)`.
 */
export async function resolveNappAsset(
  value: string,
  upload: (localPath: string) => Promise<{ hash: string; mime: string }>,
): Promise<NappAsset> {
  const kind = classifyAssetInput(value);
  if (kind === "path") {
    const result = await upload(value);
    return { hash: result.hash, mime: result.mime };
  }
  return { hash: value, mime: deriveAssetMime(value) };
}

/**
 * Read a local file, compute its sha256 + mime, upload it to blossom, and return
 * `{ hash, mime }` ONLY when the upload succeeded. Throws a clear, distinct error when
 * servers/relays are empty, the file is missing/empty, or the upload did not succeed.
 *
 * `processFn` is injectable (default = the real {@link processUploads}) so tests can
 * verify FileEntry construction + success/failure handling without real blossom/relays.
 */
export async function uploadNappAsset(
  localPath: string,
  ctx: UploadAssetContext,
  processFn: ProcessFn = processUploads,
): Promise<{ hash: string; mime: string }> {
  if (!ctx.servers || ctx.servers.length === 0) {
    throw new Error(
      `Cannot upload "${localPath}": no blossom servers configured. ` +
        "Add servers to .nsite/config.json, or paste a sha256 hash / URL instead.",
    );
  }
  // Pre-empt processUploads' generic "No relays" error with our own clear message.
  if (!ctx.relays || ctx.relays.length === 0) {
    throw new Error(
      `Cannot upload "${localPath}": no relays configured. ` +
        "Add relays to .nsite/config.json, or paste a sha256 hash / URL instead.",
    );
  }

  let raw: Uint8Array;
  try {
    raw = await Deno.readFile(localPath);
  } catch {
    throw new Error(`Cannot upload "${localPath}": file not found or unreadable.`);
  }
  if (raw.length === 0) {
    throw new Error(`Cannot upload "${localPath}": file is empty.`);
  }
  // FileEntry.data is ByteArray (Uint8Array<ArrayBuffer>); Deno.readFile may return a
  // SharedArrayBuffer-backed view — copy into a plain ArrayBuffer to satisfy the type.
  const data = new Uint8Array(raw);

  const sha256 = await calculateFileHash(localPath);
  const mime = deriveAssetMime(localPath);
  const baseDir = dirname(localPath);
  const entry: FileEntry = {
    path: basename(localPath),
    sha256,
    data,
    size: data.length,
    contentType: mime,
  };

  const results = await processFn(
    [entry],
    baseDir,
    ctx.servers,
    ctx.signer,
    ctx.relays,
  );

  const result = results.find((r) => r.file.sha256 === sha256) ?? results[0];
  if (!result || result.success !== true) {
    throw new Error(
      `Upload of "${localPath}" failed${
        result?.error ? `: ${result.error}` : " on all configured servers."
      }`,
    );
  }

  return { hash: sha256, mime };
}
