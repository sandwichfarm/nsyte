/**
 * NIP-5B napp Release Note event (kind 39108).
 *
 * This module builds the NIP-5B Release Note — a changelog for ONE app version, where the
 * "app version" is pinned to the website manifest's EVENT id. It mirrors the structure of
 * `createAppListingTemplate` / `createAppListingEvent` in `./listing.ts`: a pure template
 * builder plus a thin signing wrapper.
 *
 * SPEC DISCREPANCY (recorded here and in `.planning/milestones/v1.6-REQUIREMENTS.md`):
 * the NIP-5B event-DEFINITION example uses kind **39108**, but the spec's REQ example reads
 * `"kinds":[31908]`. We use **39108** — the event definition is authoritative — and treat
 * the 31908 in the REQ example as a transposition typo. Both literals (39108, 31908) are
 * named here so the discrepancy stays discoverable in code.
 */
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers";
import type { ISigner } from "applesauce-signers";
import { NSITE_RELEASE_NOTE_KIND } from "./listing.ts";

// Re-export the SINGLE 39108 definition (listing.ts is the home for napp kinds) so
// consumers can import the kind from either module without redefining the literal (DRY).
export { NSITE_RELEASE_NOTE_KIND } from "./listing.ts";

/** Seconds in one week — the `w` tag bucket width. */
export const SECONDS_IN_WEEK = 604800;

/** Floor a unix timestamp into its week bucket (the `w` tag value). */
export function weekBucket(ts: number): number {
  return Math.floor(ts / SECONDS_IN_WEEK);
}

/**
 * Structured changelog entries for a release note. Each category maps to a tag name
 * (`fix`/`add`/`try`/`cut`/`sub`); every string in an array becomes one tag.
 *
 * `sub` is the generic "substitute/changed" entry — used when the author does not
 * distinguish fix/add/try/cut.
 */
export interface ReleaseChanges {
  fix?: string[];
  add?: string[];
  try?: string[];
  cut?: string[];
  sub?: string[];
}

/** Fixed category iteration order so emitted tags are deterministic (matters for tests). */
const CHANGE_CATEGORIES = ["fix", "add", "try", "cut", "sub"] as const;

/**
 * PURE Release Note template builder.
 *
 * Tags are emitted in a deterministic order:
 *   1. d  — the website manifest's EVENT id (this release note's addressable d value,
 *           distinct per app version).
 *   2. D  — the website manifest's `d` tag (`config.id ?? ""`, same value the listing uses).
 *   3. ts — the manifest's created_at, as a STRING.
 *   4. w  — floor(created_at / 604800), as a STRING (week bucket).
 *   5. change entries — iterated in fixed category order, one `[category, text]` per entry,
 *      preserving array order; undefined/empty categories are skipped.
 *
 * d vs D are INTENTIONALLY different: d = manifest EVENT id, D = manifest `d` tag. See the
 * d-tag note in `.planning/milestones/v1.6-REQUIREMENTS.md`.
 */
export function createReleaseNoteTemplate(params: {
  manifestId: string;
  manifestDTag: string;
  manifestCreatedAt: number;
  changes: ReleaseChanges;
  createdAt?: number;
}): EventTemplate {
  const { manifestId, manifestDTag, manifestCreatedAt, changes } = params;

  const tags: string[][] = [];

  // d = manifest EVENT id; D = manifest `d` tag — intentionally different (REQUIREMENTS.md).
  tags.push(["d", manifestId]);
  tags.push(["D", manifestDTag]);
  tags.push(["ts", String(manifestCreatedAt)]);
  tags.push(["w", String(weekBucket(manifestCreatedAt))]);

  // Change entries: one tag per text, fixed category order, preserving array order.
  for (const category of CHANGE_CATEGORIES) {
    const entries = changes[category];
    if (!entries) continue;
    for (const text of entries) {
      tags.push([category, text]);
    }
  }

  return {
    kind: NSITE_RELEASE_NOTE_KIND,
    created_at: params.createdAt ?? Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}

/** Thin signing wrapper — mirrors `createAppListingEvent`. */
export async function createReleaseNoteEvent(
  signer: ISigner,
  params: {
    manifestId: string;
    manifestDTag: string;
    manifestCreatedAt: number;
    changes: ReleaseChanges;
    createdAt?: number;
  },
): Promise<NostrEvent> {
  return await signer.signEvent(createReleaseNoteTemplate(params));
}
