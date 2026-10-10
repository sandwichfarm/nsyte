import { assertEquals } from "@std/assert";
import {
  MAX_NAPP_CATEGORIES,
  NAPP_CATEGORIES,
  validateCategories,
  validateCategoryLabel,
} from "../../../src/lib/napp/categories.ts";

Deno.test("validateCategoryLabel - valid label returns null", () => {
  assertEquals(validateCategoryLabel("napp.games:rpg"), null);
  assertEquals(validateCategoryLabel("napp.money:wallet"), null);
  assertEquals(validateCategoryLabel("napp.other:other"), null);
  // Multi-word subcategories must be accepted verbatim.
  assertEquals(validateCategoryLabel("napp.utilities:text editor"), null);
  assertEquals(validateCategoryLabel("napp.utilities:image editor"), null);
  assertEquals(validateCategoryLabel("napp.utilities:audio editor"), null);
  assertEquals(validateCategoryLabel("napp.utilities:video editor"), null);
});

Deno.test("validateCategoryLabel - unknown category returns error naming it", () => {
  const err = validateCategoryLabel("napp.bogus:rpg");
  assertEquals(typeof err, "string");
  assertEquals(err!.includes("bogus"), true);
});

Deno.test("validateCategoryLabel - unknown subcategory returns error naming it", () => {
  const err = validateCategoryLabel("napp.games:notreal");
  assertEquals(typeof err, "string");
  assertEquals(err!.includes("notreal"), true);
});

Deno.test("validateCategoryLabel - missing napp. prefix returns error", () => {
  const err = validateCategoryLabel("games:rpg");
  assertEquals(typeof err, "string");
});

Deno.test("validateCategoryLabel - malformed (no subcategory) returns error", () => {
  assertEquals(typeof validateCategoryLabel("napp.games"), "string");
  assertEquals(typeof validateCategoryLabel("napp.games:rpg:extra"), "string");
});

Deno.test("validateCategories - all valid returns []", () => {
  assertEquals(
    validateCategories(["napp.games:rpg", "napp.money:wallet"]),
    [],
  );
});

Deno.test("validateCategories - more than 3 labels returns limit error", () => {
  const errs = validateCategories([
    "napp.games:rpg",
    "napp.money:wallet",
    "napp.social:blog",
    "napp.shopping:store",
  ]);
  assertEquals(errs.length >= 1, true);
  const joined = errs.join(" ");
  assertEquals(joined.includes(String(MAX_NAPP_CATEGORIES)), true);
});

Deno.test("validateCategories - empty array returns required error", () => {
  const errs = validateCategories([]);
  assertEquals(errs.length >= 1, true);
});

Deno.test("validateCategories - accumulates per-label errors", () => {
  const errs = validateCategories(["napp.bogus:rpg", "napp.games:notreal"]);
  assertEquals(errs.length, 2);
});

Deno.test("NAPP_CATEGORIES - table has exact NIP-5B entries", () => {
  assertEquals(Object.keys(NAPP_CATEGORIES).sort(), [
    "audiovisual",
    "games",
    "money",
    "other",
    "shopping",
    "social",
    "utilities",
  ]);
  assertEquals(NAPP_CATEGORIES["other"], ["other"]);
  assertEquals(NAPP_CATEGORIES["utilities"].includes("text editor"), true);
  assertEquals(NAPP_CATEGORIES["games"].length, 14);
});
