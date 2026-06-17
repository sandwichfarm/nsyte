/**
 * napp detection + structural validation.
 *
 * NOTE on the error type: config-validator.ts will import `validateNappConfig` from
 * this module (Task 3 wiring). Importing `ValidationError` back from config-validator.ts
 * would create a module cycle, so we define a local structurally-identical alias here.
 * It matches `{ path: string; message: string }` exactly, so the errors returned by
 * `validateNappConfig` slot straight into the validator's `errors` array.
 */
import type { NappConfig } from "./types.ts";
import { validateCategories } from "./categories.ts";

/** Identical shape to config-validator.ts ValidationError (kept local to avoid a cycle). */
export interface ValidationError {
  path: string;
  message: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Validate a `{ value: string; lang?: string }` shape at the given path. */
function validateLangText(
  value: unknown,
  path: string,
  errors: ValidationError[],
): void {
  if (!isObject(value)) {
    errors.push({ path, message: "must be an object with a string 'value'" });
    return;
  }
  if (!isNonEmptyString(value.value)) {
    errors.push({ path, message: "'value' must be a non-empty string" });
  }
  if (value.lang !== undefined && typeof value.lang !== "string") {
    errors.push({ path, message: "'lang' must be a string when present" });
  }
}

/** Validate a NappAsset (`{ hash, mime, country? }`) shape at the given path. */
function validateAsset(
  value: unknown,
  path: string,
  errors: ValidationError[],
): void {
  if (!isObject(value)) {
    errors.push({ path, message: "must be an object with 'hash' and 'mime'" });
    return;
  }
  if (!isNonEmptyString(value.hash)) {
    errors.push({
      path: `${path}/hash`,
      message: "must be a non-empty string",
    });
  }
  if (!isNonEmptyString(value.mime)) {
    errors.push({
      path: `${path}/mime`,
      message: "must be a non-empty string",
    });
  }
  if (
    value.country !== undefined &&
    !(typeof value.country === "string" && /^[A-Za-z]{2}$/.test(value.country))
  ) {
    errors.push({
      path: `${path}/country`,
      message: "must be a 2-letter ISO 3166-1 alpha-2 code when present",
    });
  }
}

const HEX64 = /^[0-9a-fA-F]{64}$/;
const ALPHA2 = /^[A-Za-z]{2}$/;

/**
 * Structurally validate a napp section. Returns an array of errors (empty = valid).
 * This is intentionally stricter than the JSON schema: it enforces the deep NIP-5B
 * category table and the countries `*`-vs-codes rule that the schema pattern can't.
 */
export function validateNappConfig(napp: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isObject(napp)) {
    return [{ path: "/napp", message: "must be an object" }];
  }

  // name (required LangText)
  if (napp.name === undefined) {
    errors.push({ path: "/napp/name", message: "is required" });
  } else {
    validateLangText(napp.name, "/napp/name", errors);
  }

  // icon (required asset)
  if (napp.icon === undefined) {
    errors.push({ path: "/napp/icon", message: "is required" });
  } else {
    validateAsset(napp.icon, "/napp/icon", errors);
  }

  // categories (required string[])
  if (napp.categories === undefined) {
    errors.push({ path: "/napp/categories", message: "is required" });
  } else if (
    !Array.isArray(napp.categories) ||
    !napp.categories.every((c) => typeof c === "string")
  ) {
    errors.push({
      path: "/napp/categories",
      message: "must be an array of strings",
    });
  } else {
    for (const msg of validateCategories(napp.categories)) {
      errors.push({ path: "/napp/categories", message: msg });
    }
  }

  // countries (required string[]: exactly ["*"] OR non-empty alpha-2 list)
  if (napp.countries === undefined) {
    errors.push({ path: "/napp/countries", message: "is required" });
  } else if (
    !Array.isArray(napp.countries) ||
    !napp.countries.every((c) => typeof c === "string")
  ) {
    errors.push({
      path: "/napp/countries",
      message: "must be an array of strings",
    });
  } else {
    const countries = napp.countries as string[];
    const hasWildcard = countries.includes("*");
    if (countries.length === 0) {
      errors.push({
        path: "/napp/countries",
        message:
          'must be ["*"] (worldwide) or at least one ISO 3166-1 alpha-2 code',
      });
    } else if (
      hasWildcard && !(countries.length === 1 && countries[0] === "*")
    ) {
      errors.push({
        path: "/napp/countries",
        message: 'cannot mix "*" (worldwide) with specific country codes',
      });
    } else if (!hasWildcard && !countries.every((c) => ALPHA2.test(c))) {
      errors.push({
        path: "/napp/countries",
        message:
          'each entry must be a 2-letter ISO 3166-1 alpha-2 code (or use ["*"])',
      });
    }
  }

  // self (optional 64-hex)
  if (napp.self !== undefined) {
    if (!(typeof napp.self === "string" && HEX64.test(napp.self))) {
      errors.push({
        path: "/napp/self",
        message: "must be a 64-character hex pubkey",
      });
    }
  }

  // summary / description (optional LangText)
  if (napp.summary !== undefined) {
    validateLangText(napp.summary, "/napp/summary", errors);
  }
  if (napp.description !== undefined) {
    validateLangText(napp.description, "/napp/description", errors);
  }

  // keyart (optional asset)
  if (napp.keyart !== undefined) {
    validateAsset(napp.keyart, "/napp/keyart", errors);
  }

  // screenshots (optional asset[])
  if (napp.screenshots !== undefined) {
    if (!Array.isArray(napp.screenshots)) {
      errors.push({ path: "/napp/screenshots", message: "must be an array" });
    } else {
      napp.screenshots.forEach((shot, i) => {
        validateAsset(shot, `/napp/screenshots/${i}`, errors);
      });
    }
  }

  // tags (optional string[])
  if (napp.tags !== undefined) {
    if (
      !Array.isArray(napp.tags) ||
      !napp.tags.every((t) => typeof t === "string")
    ) {
      errors.push({
        path: "/napp/tags",
        message: "must be an array of strings",
      });
    }
  }

  return errors;
}

/**
 * Returns true iff `config` is an object with a `napp` property AND that napp section is
 * structurally valid. This guarantees `isNapp` is true ONLY for valid napp listings.
 */
export function isNapp(config: unknown): config is { napp: NappConfig } {
  if (!isObject(config) || config.napp === undefined) return false;
  return validateNappConfig(config.napp).length === 0;
}
