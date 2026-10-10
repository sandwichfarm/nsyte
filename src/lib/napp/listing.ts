/**
 * NIP-5B napp App Listing event (kind 37348).
 *
 * This module is the single home for the napp event kinds and the pure builder that
 * maps a validated `NappConfig` plus the website manifest's `d` tag into a fully-tagged
 * kind-37348 App Listing event. It mirrors the structure of `createSiteManifestTemplate`
 * / `createSiteManifestEvent` in `../manifest.ts` and `../nostr.ts`: a pure template
 * builder plus a thin signing wrapper.
 */
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers";
import type { ISigner } from "applesauce-signers";
import type { NappConfig } from "./types.ts";
import { getManifestIdentifier, NSITE_NAME_SITE_KIND } from "../manifest.ts";

/** NIP-5B App Listing — addressable / parameterized-replaceable event. */
export const NSITE_APP_LISTING_KIND = 37348;

/**
 * NIP-5B Release Note kind. Reserved here (the single home for napp kinds) so the
 * NIP-46 signing permissions can authorize it now. Phase 23 builds the actual 39108
 * event; this phase does NOT construct any release-note event.
 */
export const NSITE_RELEASE_NOTE_KIND = 39108;

/** Build an asset-style tag, dropping the trailing `country` element when undefined. */
function assetTag(
  name: string,
  hash: string,
  mime: string,
  country?: string,
): string[] {
  return country ? [name, hash, mime, country] : [name, hash, mime];
}

/** Build a localizable-text tag, dropping the trailing `lang` element when undefined. */
function langTag(name: string, value: string, lang?: string): string[] {
  return lang ? [name, value, lang] : [name, value];
}

/**
 * Derive the shared `d` tag for the App Listing — the SINGLE SOURCE OF TRUTH so the
 * listing's `d` tag never drifts from the website manifest's `d` tag (T-21-01).
 *
 * CRITICAL d-tag rule: the website manifest only carries a `d` tag for NAMED sites
 * (kind 35128, where d = config.id). ROOT sites (kind 15128) are plain replaceable
 * events with NO `d` tag, so a root-site napp shares an EMPTY-STRING `d` tag — a valid
 * addressable-event `d`, matching NIP-5A root addressing.
 *
 * Two input shapes are accepted:
 *  - a signed manifest event (has `kind` + `tags`): returns `getManifestIdentifier(...) ?? ""`,
 *    which yields the d for named sites and "" for root sites.
 *  - a config-shaped object pre-publish (has `id`): returns `source.id ?? ""`.
 */
export function deriveListingDTag(
  source: { id?: string | null } | NostrEvent,
): string {
  // Signed manifest event branch: has a numeric kind and a tags array.
  if (
    typeof (source as NostrEvent).kind === "number" &&
    Array.isArray((source as NostrEvent).tags)
  ) {
    const event = source as NostrEvent;
    // Named sites (35128) carry the d tag; root sites (15128) have none.
    // getManifestIdentifier(root) ?? "" already returns "", so the kind guard is
    // only for clarity.
    if (event.kind === NSITE_NAME_SITE_KIND) {
      return getManifestIdentifier(event) ?? "";
    }
    return getManifestIdentifier(event) ?? "";
  }

  // Config-shaped object branch (pre-publish): the deploy/dry-run path has config in hand.
  return (source as { id?: string | null }).id ?? "";
}

/**
 * PURE App Listing template builder (mirror of `createSiteManifestTemplate`).
 *
 * Tags are emitted in a deterministic order (matters for tests/snapshots):
 *   1. d (always; "" allowed for root)  2. name  3. icon  4. one c per country
 *   5. self (only if configured)  6. summary  7. description  8. keyart
 *   9. one screenshot per entry  10. one l per category  11. one t per free tag
 *   12. client.
 *
 * The `pubkey` parameter is accepted for signature symmetry with `createAppListingEvent`
 * / `createSiteManifestEvent`. It is intentionally NOT used to default `self`: `self` is
 * emitted ONLY when explicitly configured — never auto-defaulted to the author pubkey
 * (T-21-02). `manifestDTag` MUST equal the website manifest's `d` tag; callers derive it
 * via `deriveListingDTag(...)`.
 */
export function createAppListingTemplate(
  _pubkey: string,
  napp: NappConfig,
  manifestDTag: string,
  createdAt?: number,
): EventTemplate {
  const tags: string[][] = [];

  // 1. d — ALWAYS emitted (empty string allowed for root-site napps).
  tags.push(["d", manifestDTag]);

  // 2. name (lang optional).
  tags.push(langTag("name", napp.name.value, napp.name.lang));

  // 3. icon (country optional).
  tags.push(
    assetTag("icon", napp.icon.hash, napp.icon.mime, napp.icon.country),
  );

  // 4. one c tag per country ("*" worldwide -> a single ["c","*"]).
  for (const code of napp.countries) {
    tags.push(["c", code]);
  }

  // 5. self — ONLY when explicitly configured (never default to the author pubkey).
  if (napp.self) {
    tags.push(["self", napp.self]);
  }

  // 6. summary.
  if (napp.summary) {
    tags.push(langTag("summary", napp.summary.value, napp.summary.lang));
  }

  // 7. description.
  if (napp.description) {
    tags.push(
      langTag("description", napp.description.value, napp.description.lang),
    );
  }

  // 8. keyart.
  if (napp.keyart) {
    tags.push(
      assetTag(
        "keyart",
        napp.keyart.hash,
        napp.keyart.mime,
        napp.keyart.country,
      ),
    );
  }

  // 9. one screenshot per entry, in order.
  for (const shot of napp.screenshots ?? []) {
    tags.push(assetTag("screenshot", shot.hash, shot.mime, shot.country));
  }

  // 10. one l tag per category label.
  for (const label of napp.categories) {
    tags.push(["l", label]);
  }

  // 11. one t tag per free-form tag.
  for (const tag of napp.tags ?? []) {
    tags.push(["t", tag]);
  }

  // 12. client (mirror the manifest/handler builders).
  tags.push(["client", "nsyte"]);

  return {
    kind: NSITE_APP_LISTING_KIND,
    created_at: createdAt ?? Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}

/**
 * Thin signing wrapper — mirrors `createSiteManifestEvent`.
 */
export async function createAppListingEvent(
  signer: ISigner,
  pubkey: string,
  napp: NappConfig,
  manifestDTag: string,
  createdAt?: number,
): Promise<NostrEvent> {
  return await signer.signEvent(
    createAppListingTemplate(pubkey, napp, manifestDTag, createdAt),
  );
}
