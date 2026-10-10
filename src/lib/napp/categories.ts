/**
 * The fixed NIP-5B category/subcategory table and label validators.
 *
 * Per the NIP-5B spec (PR #2282 / 5B.md): a category label has the shape
 * `napp.<category>:<subcategory>`. Clients SHOULD ignore unknown category/subcategory
 * values, but OUR publisher rejects them at config-validation time so that authors fix
 * typos before publishing a malformed App Listing event. This is a deliberate
 * publisher-side strictness choice, not a deviation from the spec's client guidance.
 *
 * Subcategories are stored verbatim, including multi-word values such as
 * "text editor", "image editor", "audio editor", and "video editor".
 */

/** Maximum number of category labels allowed on a napp listing. */
export const MAX_NAPP_CATEGORIES = 3;

/** The fixed NIP-5B category -> subcategory table. */
export const NAPP_CATEGORIES: Record<string, readonly string[]> = {
  other: ["other"],
  games: [
    "other",
    "action",
    "rpg",
    "strategy",
    "shooter",
    "fighting",
    "simulation",
    "puzzle",
    "board",
    "gambling",
    "racing",
    "sports",
    "ar",
    "vr",
  ],
  money: [
    "other",
    "crypto",
    "loans",
    "investments",
    "wallet",
    "gambling",
    "raffle",
    "crowdfunding",
    "donation",
    "jobs",
  ],
  shopping: ["other", "marketplace", "store", "auction"],
  social: ["other", "network", "messenger", "blog", "dating"],
  audiovisual: ["other", "podcast", "music", "video", "news"],
  utilities: [
    "other",
    "weather",
    "office",
    "finances",
    "learning",
    "text editor",
    "image editor",
    "audio editor",
    "video editor",
    "ar",
    "vr",
    "ai",
  ],
};

const LABEL_SHAPE = /^napp\.[^:]+:[^:]+$/;

/**
 * Validate a single `napp.<category>:<subcategory>` label against the fixed table.
 * Returns `null` when valid, otherwise a clear error message that names the offending
 * category or subcategory.
 */
export function validateCategoryLabel(label: string): string | null {
  if (!label.startsWith("napp.")) {
    return `Category label "${label}" must start with "napp." (format: napp.<category>:<subcategory>)`;
  }
  if (!LABEL_SHAPE.test(label)) {
    return `Category label "${label}" must match napp.<category>:<subcategory>`;
  }

  const body = label.slice("napp.".length);
  const sepIndex = body.indexOf(":");
  const category = body.slice(0, sepIndex);
  const subcategory = body.slice(sepIndex + 1);

  const subcategories = NAPP_CATEGORIES[category];
  if (!subcategories) {
    return `Unknown napp category "${category}" in label "${label}"`;
  }
  if (!subcategories.includes(subcategory)) {
    return `Unknown napp subcategory "${subcategory}" for category "${category}" in label "${label}"`;
  }

  return null;
}

/**
 * Validate an array of category labels.
 * Returns an array of error strings (empty when all valid):
 *  - empty array -> "at least one category is required"
 *  - more than MAX_NAPP_CATEGORIES -> a limit error mentioning the limit and the count
 *  - then accumulates per-label errors from validateCategoryLabel.
 */
export function validateCategories(labels: string[]): string[] {
  const errors: string[] = [];

  if (labels.length === 0) {
    errors.push("at least one category is required");
    return errors;
  }

  if (labels.length > MAX_NAPP_CATEGORIES) {
    errors.push(
      `too many categories: ${labels.length} provided, at most ${MAX_NAPP_CATEGORIES} allowed`,
    );
  }

  for (const label of labels) {
    const err = validateCategoryLabel(label);
    if (err) errors.push(err);
  }

  return errors;
}
