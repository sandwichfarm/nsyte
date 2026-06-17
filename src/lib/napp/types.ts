/**
 * NIP-5B napp ("nostr app") config types.
 *
 * Design decision: the "value + optional language" pattern (used for human-readable
 * fields like name/summary/description) is modeled as a `{ value: string; lang?: string }`
 * object (`LangText`) rather than a tuple. This round-trips cleanly to nostr tags — a
 * `["name", value, lang?]` tag simply drops the third element when `lang` is undefined —
 * and is self-describing when serialized to JSON in `.nsite/config.json`.
 *
 * camelCase is used throughout to match the existing nsyte config style.
 */

/** A localizable text value. `lang` is an ISO 639-1 language code (e.g. "en", "de"). */
export interface LangText {
  value: string;
  lang?: string;
}

/**
 * An image/media asset reference used for `icon`, `keyart`, and `screenshots` entries.
 * - `hash`: a sha256/blossom hash OR a URL pointing at the asset.
 * - `mime`: the asset's MIME type (e.g. "image/png").
 * - `country`: optional ISO 3166-1 alpha-2 code, for region-specific assets.
 */
export interface NappAsset {
  hash: string;
  mime: string;
  country?: string;
}

/**
 * The optional NIP-5B napp listing section of a project config.
 *
 * Present (and structurally valid) => the project is a napp; see `isNapp()` in `./detect.ts`.
 *
 * NOTE: `indexerRelays` is intentionally deferred to Phase 22 to keep this foundation
 * phase minimal — do NOT add it here.
 */
export interface NappConfig {
  /** Display name of the app. */
  name: LangText;
  /** App icon asset. */
  icon: NappAsset;
  /**
   * `napp.<category>:<subcategory>` labels. Min 1, max 3.
   * Validated against the fixed NIP-5B table in `./categories.ts`.
   */
  categories: string[];
  /**
   * Availability: either `["*"]` (worldwide) or a list of ISO 3166-1 alpha-2
   * codes. Maps to `c` tags on the published event later.
   */
  countries: string[];
  /** Optional author/self hex pubkey (64 hex chars). */
  self?: string;
  /** Optional short summary. */
  summary?: LangText;
  /** Optional long description. */
  description?: LangText;
  /** Optional key art / hero image asset. */
  keyart?: NappAsset;
  /** Optional screenshot assets. */
  screenshots?: NappAsset[];
  /** Optional free-form `t` tags. */
  tags?: string[];
}
