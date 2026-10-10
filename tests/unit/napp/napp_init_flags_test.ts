import "../../test-setup-global.ts";
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { decideRootSiteId, planNappInitFromFlags } from "../../../src/commands/napp.ts";

describe("planNappInitFromFlags (pure)", () => {
  it("parses full flags into answersFromFlags with no missing required", () => {
    const plan = planNappInitFromFlags({
      name: "My App",
      icon: "a".repeat(64),
      iconMime: "image/png",
      category: ["social:network", "napp.games:rpg"],
      countries: "US, de",
      summary: "Short",
      description: "Long",
      self: "b".repeat(64),
      keyart: "https://x/key.png",
      screenshot: ["s1", "s2"],
      tag: ["nostr", "social"],
      indexerRelay: ["wss://indexer"],
      id: "my-site",
      yes: true,
    });

    assertEquals(plan.prefill.name, "My App");
    assertEquals(plan.prefill.icon, "a".repeat(64));
    assertEquals(plan.prefill.iconMime, "image/png");
    assertEquals(plan.prefill.categories, [
      "napp.social:network",
      "napp.games:rpg",
    ]);
    assertEquals(plan.prefill.countries, ["US", "de"]);
    assertEquals(plan.prefill.summary, "Short");
    assertEquals(plan.prefill.description, "Long");
    assertEquals(plan.prefill.self, "b".repeat(64));
    assertEquals(plan.prefill.keyart, "https://x/key.png");
    assertEquals(plan.prefill.screenshots, ["s1", "s2"]);
    assertEquals(plan.prefill.tags, ["nostr", "social"]);
    assertEquals(plan.prefill.indexerRelays, ["wss://indexer"]);
    assertEquals(plan.id, "my-site");
    assertEquals(plan.yes, true);
    assertEquals(plan.missingRequired, []);
  });

  it("computes missingRequired when only --name is given", () => {
    const plan = planNappInitFromFlags({ name: "Only Name" });
    assert(plan.missingRequired.includes("icon"));
    assert(plan.missingRequired.includes("category"));
    assert(!plan.missingRequired.includes("name"));
  });

  it("keeps three repeated --category values", () => {
    const plan = planNappInitFromFlags({
      name: "n",
      icon: "i",
      category: ["a:b", "c:d", "e:f"],
    });
    assertEquals(plan.prefill.categories, ["napp.a:b", "napp.c:d", "napp.e:f"]);
    assertEquals(plan.missingRequired, []);
  });

  it("is pure: returns plain data and does not touch the filesystem", () => {
    const plan = planNappInitFromFlags({});
    assertEquals(typeof plan, "object");
    assert(Array.isArray(plan.missingRequired));
  });
});

describe("decideRootSiteId (pure)", () => {
  it("non-root: no notice, no setId", () => {
    const d = decideRootSiteId({ isRoot: false, interactive: false });
    assertEquals(d, { printNotice: false });
  });

  it("root + idFlag: setId and printNotice", () => {
    const d = decideRootSiteId({ isRoot: true, idFlag: "x", interactive: false });
    assertEquals(d, { setId: "x", printNotice: true });
  });

  it("root + no idFlag + non-interactive: printNotice, no setId", () => {
    const d = decideRootSiteId({ isRoot: true, interactive: false });
    assertEquals(d, { printNotice: true });
  });

  it("root + interactive + confirmed value: setId", () => {
    const d = decideRootSiteId({
      isRoot: true,
      interactive: true,
      confirmed: true,
      confirmedValue: "blog",
    });
    assertEquals(d, { setId: "blog", printNotice: true });
  });

  it("root + interactive + declined: no setId, printNotice", () => {
    const d = decideRootSiteId({
      isRoot: true,
      interactive: true,
      confirmed: false,
    });
    assertEquals(d, { printNotice: true });
  });
});
