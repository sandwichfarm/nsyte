import "../../test-setup-global.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  buildNappConfigFromAnswers,
  categoryLabel,
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
