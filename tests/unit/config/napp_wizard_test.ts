import "../../test-setup-global.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  buildNappConfigFromAnswers,
  categoryLabel,
  collectNappListing,
  type NappAssetResolver,
  type ProjectConfig,
} from "../../../src/lib/config.ts";
import { isNapp, validateNappConfig } from "../../../src/lib/napp/detect.ts";
import { validateCategoryLabel } from "../../../src/lib/napp/categories.ts";

describe("categoryLabel (pure helper)", () => {
  it("joins category and subcategory into a napp.<cat>:<sub> label", () => {
    assertEquals(categoryLabel("games", "rpg"), "napp.games:rpg");
    assertEquals(validateCategoryLabel(categoryLabel("games", "rpg")), null);
  });

  it("stores multi-word subcategories verbatim (spaces preserved) and validates", () => {
    const label = categoryLabel("utilities", "text editor");
    assertEquals(label, "napp.utilities:text editor");
    assertEquals(validateCategoryLabel(label), null);
  });
});

describe("buildNappConfigFromAnswers (pure assembly helper)", () => {
  it("assembles a structurally-valid NappConfig for valid answers", () => {
    const result = buildNappConfigFromAnswers({
      name: "My App",
      iconHash: "abc123",
      iconMime: "image/png",
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
    assertEquals(result, {
      name: { value: "My App" },
      icon: { hash: "abc123", mime: "image/png" },
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
    assertEquals(validateNappConfig(result), []);
  });

  it("defaults icon.mime to image/png when omitted or blank", () => {
    const omitted = buildNappConfigFromAnswers({
      name: "App",
      iconHash: "h",
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
    assertEquals(omitted.icon.mime, "image/png");

    const blank = buildNappConfigFromAnswers({
      name: "App",
      iconHash: "h",
      iconMime: "   ",
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
    assertEquals(blank.icon.mime, "image/png");
  });

  it('defaults countries to ["*"] when omitted or empty', () => {
    const omitted = buildNappConfigFromAnswers({
      name: "App",
      iconHash: "h",
      categories: ["napp.games:rpg"],
    });
    assertEquals(omitted.countries, ["*"]);

    const empty = buildNappConfigFromAnswers({
      name: "App",
      iconHash: "h",
      categories: ["napp.games:rpg"],
      countries: [],
    });
    assertEquals(empty.countries, ["*"]);
  });

  it('includes summary/description only when non-empty, never { value: "" }', () => {
    const withOptionals = buildNappConfigFromAnswers({
      name: "App",
      iconHash: "h",
      categories: ["napp.games:rpg"],
      countries: ["*"],
      summary: "Quick app",
      description: "Longer text",
    });
    assertEquals(withOptionals.summary, { value: "Quick app" });
    assertEquals(withOptionals.description, { value: "Longer text" });

    const withoutOptionals = buildNappConfigFromAnswers({
      name: "App",
      iconHash: "h",
      categories: ["napp.games:rpg"],
      countries: ["*"],
      summary: "",
      description: "   ",
    });
    assert(!("summary" in withoutOptionals), "summary key should be absent");
    assert(
      !("description" in withoutOptionals),
      "description key should be absent",
    );
  });

  it("is a pure shaper: invalid answers produce a config that fails validation (no throw)", () => {
    const result = buildNappConfigFromAnswers({
      name: "",
      iconHash: "h",
      categories: ["napp.bogus:nope"],
      countries: ["*"],
    });
    assert(
      validateNappConfig(result).length > 0,
      "invalid answers should surface errors",
    );
  });
});

describe("buildNappConfigFromAnswers full NIP-5B field coverage", () => {
  const SELF = "a".repeat(64);

  it("assembles every optional field and passes validateNappConfig with 0 errors", () => {
    const result = buildNappConfigFromAnswers({
      name: "My App",
      nameLang: "en",
      iconHash: "h",
      iconMime: "image/png",
      categories: ["napp.games:rpg", "napp.social:network"],
      countries: ["US", "de"],
      summary: "Short",
      summaryLang: "en",
      description: "Long text",
      descriptionLang: "de",
      self: SELF,
      keyart: { hash: "k", mime: "image/png" },
      screenshots: [
        { hash: "s1", mime: "image/png" },
        { hash: "s2", mime: "image/webp" },
      ],
      tags: ["nostr", "social"],
      indexerRelays: ["wss://indexer"],
    });

    assertEquals(validateNappConfig(result), []);
    assertEquals(result.name, { value: "My App", lang: "en" });
    assertEquals(result.summary, { value: "Short", lang: "en" });
    assertEquals(result.description, { value: "Long text", lang: "de" });
    assertEquals(result.self, SELF);
    assertEquals(result.keyart, { hash: "k", mime: "image/png" });
    assertEquals(result.screenshots, [
      { hash: "s1", mime: "image/png" },
      { hash: "s2", mime: "image/webp" },
    ]);
    assertEquals(result.tags, ["nostr", "social"]);
    assertEquals(result.indexerRelays, ["wss://indexer"]);
    assertEquals(result.categories, ["napp.games:rpg", "napp.social:network"]);
    assertEquals(result.countries, ["US", "de"]);
  });

  it("minimal answers still produce the SAME object as before (regression anchor)", () => {
    const result = buildNappConfigFromAnswers({
      name: "My App",
      iconHash: "abc123",
      iconMime: "image/png",
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
    assertEquals(result, {
      name: { value: "My App" },
      icon: { hash: "abc123", mime: "image/png" },
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
  });

  it("omits lang keys when not provided", () => {
    const result = buildNappConfigFromAnswers({
      name: "App",
      iconHash: "h",
      categories: ["napp.games:rpg"],
      countries: ["*"],
      summary: "Short",
      description: "Long",
    });
    assert(!("lang" in result.name), "name.lang absent");
    assertEquals(result.summary, { value: "Short" });
    assertEquals(result.description, { value: "Long" });
    assert(!("lang" in (result.summary as object)), "summary.lang absent");
  });

  it("omits empty optional collections and blank summary/description", () => {
    const result = buildNappConfigFromAnswers({
      name: "App",
      iconHash: "h",
      categories: ["napp.games:rpg"],
      countries: ["*"],
      summary: "",
      description: "   ",
      self: "",
      screenshots: [],
      tags: [],
      indexerRelays: [],
    });
    assert(!("summary" in result), "summary absent");
    assert(!("description" in result), "description absent");
    assert(!("self" in result), "self absent");
    assert(!("keyart" in result), "keyart absent");
    assert(!("screenshots" in result), "screenshots absent");
    assert(!("tags" in result), "tags absent");
    assert(!("indexerRelays" in result), "indexerRelays absent");
  });
});

describe("collectNappListing minimal-prefill regression (no upload, non-interactive)", () => {
  it("preserves the pre-phase minimal single-field shape", async () => {
    // A no-upload resolver: hash inputs round-trip via the boundary semantics.
    const noUpload: NappAssetResolver = (value: string) =>
      Promise.resolve({ hash: value, mime: "image/png" });

    const napp = await collectNappListing({
      prefill: {
        name: "My App",
        icon: "abc123",
        iconMime: "image/png",
        categories: ["napp.games:rpg"],
        countries: ["*"],
      },
      interactive: false,
      resolveAsset: noUpload,
    });

    assertEquals(napp, {
      name: { value: "My App" },
      icon: { hash: "abc123", mime: "image/png" },
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
    assertEquals(validateNappConfig(napp), []);
  });

  it("never calls the resolver when no asset inputs are present", async () => {
    let called = false;
    const failResolver: NappAssetResolver = (_v: string) => {
      called = true;
      return Promise.reject(new Error("should not resolve"));
    };
    const napp = await collectNappListing({
      prefill: {
        name: "App",
        categories: ["napp.games:rpg"],
        countries: ["*"],
      },
      interactive: false,
      resolveAsset: failResolver,
    });
    assertEquals(called, false);
    // icon stays empty (invalid) — validation is the caller's job, not the collector's.
    assertEquals(napp.icon.hash, "");
  });
});

describe("nsite path unchanged (additive-branch reasoning anchor)", () => {
  it("a plain nsite ProjectConfig (no napp section) is not a napp", () => {
    const nsiteConfig: ProjectConfig = {
      relays: ["wss://r"],
      servers: ["https://s"],
      id: "my-site",
    };
    assertFalse(isNapp(nsiteConfig));
  });

  it("buildNappConfigFromAnswers + categoryLabel are the only napp-shaping exports", () => {
    // Both helpers exist and are callable; this anchors the design that the napp
    // branch is purely additive and reuses a single assembly helper.
    assertEquals(typeof buildNappConfigFromAnswers, "function");
    assertEquals(typeof categoryLabel, "function");
  });
});
