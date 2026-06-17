// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { ISigner } from "applesauce-signers";
import {
  createAppListingEvent,
  createAppListingTemplate,
  deriveListingDTag,
  NSITE_APP_LISTING_KIND,
  NSITE_RELEASE_NOTE_KIND,
} from "../../../src/lib/napp/listing.ts";
import type { NappConfig } from "../../../src/lib/napp/types.ts";

const minimalNapp: NappConfig = {
  name: { value: "My App" },
  icon: { hash: "iconhash", mime: "image/png" },
  categories: ["napp.games:rpg"],
  countries: ["*"],
};

const fullNapp: NappConfig = {
  name: { value: "My App", lang: "en" },
  icon: { hash: "iconhash", mime: "image/png", country: "US" },
  categories: ["napp.games:rpg", "napp.tools:dev"],
  countries: ["US", "DE"],
  self: "ab".repeat(32),
  summary: { value: "a short summary", lang: "en" },
  description: { value: "a long description", lang: "de" },
  keyart: { hash: "keyhash", mime: "image/jpeg", country: "GB" },
  screenshots: [
    { hash: "shot1", mime: "image/png" },
    { hash: "shot2", mime: "image/webp", country: "FR" },
  ],
  tags: ["foo", "bar"],
};

describe("kind constants", () => {
  it("NSITE_APP_LISTING_KIND is 37348", () => {
    assertEquals(NSITE_APP_LISTING_KIND, 37348);
  });
  it("NSITE_RELEASE_NOTE_KIND is 39108", () => {
    assertEquals(NSITE_RELEASE_NOTE_KIND, 39108);
  });
});

describe("createAppListingTemplate — d tag", () => {
  it('root-site napp ("") emits ["d", ""]', () => {
    const t = createAppListingTemplate("pub", minimalNapp, "");
    assertEquals(t.tags[0], ["d", ""]);
  });
  it('named-site napp emits ["d", "my-site"]', () => {
    const t = createAppListingTemplate("pub", minimalNapp, "my-site");
    assertEquals(t.tags[0], ["d", "my-site"]);
  });
});

describe("createAppListingTemplate — required tags (minimal)", () => {
  const t = createAppListingTemplate("pub", minimalNapp, "");
  it("kind / content / created_at", () => {
    assertEquals(t.kind, 37348);
    assertEquals(t.content, "");
    assertEquals(typeof t.created_at, "number");
  });
  it("name without lang has no 3rd element", () => {
    assertEquals(t.tags.find((x) => x[0] === "name"), ["name", "My App"]);
  });
  it("icon without country has no 4th element", () => {
    assertEquals(t.tags.find((x) => x[0] === "icon"), [
      "icon",
      "iconhash",
      "image/png",
    ]);
  });
  it('exactly one ["c","*"]', () => {
    const c = t.tags.filter((x) => x[0] === "c");
    assertEquals(c, [["c", "*"]]);
  });
  it('one ["l","napp.games:rpg"]', () => {
    const l = t.tags.filter((x) => x[0] === "l");
    assertEquals(l, [["l", "napp.games:rpg"]]);
  });
  it("no self tag when self absent", () => {
    assertEquals(t.tags.find((x) => x[0] === "self"), undefined);
  });
  it("no optional tags when absent", () => {
    for (const k of ["summary", "description", "keyart", "screenshot", "t"]) {
      assertEquals(
        t.tags.find((x) => x[0] === k),
        undefined,
        `unexpected ${k}`,
      );
    }
  });
  it("client tag present", () => {
    assertEquals(t.tags.find((x) => x[0] === "client"), ["client", "nsyte"]);
  });
});

describe("createAppListingTemplate — optionals (full)", () => {
  const t = createAppListingTemplate("pub", fullNapp, "id");
  it("name with lang", () => {
    assertEquals(t.tags.find((x) => x[0] === "name"), ["name", "My App", "en"]);
  });
  it("icon with country", () => {
    assertEquals(t.tags.find((x) => x[0] === "icon"), [
      "icon",
      "iconhash",
      "image/png",
      "US",
    ]);
  });
  it('countries ["US","DE"] -> two c tags, no "*"', () => {
    const c = t.tags.filter((x) => x[0] === "c");
    assertEquals(c, [["c", "US"], ["c", "DE"]]);
  });
  it("self emitted with the configured pubkey", () => {
    assertEquals(t.tags.find((x) => x[0] === "self"), [
      "self",
      "ab".repeat(32),
    ]);
  });
  it("summary + description with lang", () => {
    assertEquals(t.tags.find((x) => x[0] === "summary"), [
      "summary",
      "a short summary",
      "en",
    ]);
    assertEquals(
      t.tags.find((x) => x[0] === "description"),
      ["description", "a long description", "de"],
    );
  });
  it("keyart with country", () => {
    assertEquals(t.tags.find((x) => x[0] === "keyart"), [
      "keyart",
      "keyhash",
      "image/jpeg",
      "GB",
    ]);
  });
  it("two screenshots in order, trailing country dropped", () => {
    const s = t.tags.filter((x) => x[0] === "screenshot");
    assertEquals(s, [
      ["screenshot", "shot1", "image/png"],
      ["screenshot", "shot2", "image/webp", "FR"],
    ]);
  });
  it("two l tags", () => {
    assertEquals(t.tags.filter((x) => x[0] === "l"), [
      ["l", "napp.games:rpg"],
      ["l", "napp.tools:dev"],
    ]);
  });
  it("two t tags", () => {
    assertEquals(t.tags.filter((x) => x[0] === "t"), [["t", "foo"], [
      "t",
      "bar",
    ]]);
  });
});

describe("createAppListingTemplate — createdAt override", () => {
  it("uses provided createdAt", () => {
    const t = createAppListingTemplate("pub", minimalNapp, "", 1234567890);
    assertEquals(t.created_at, 1234567890);
  });
});

describe("createAppListingEvent", () => {
  it("returns a signed event with id/pubkey/sig", async () => {
    const stub = {
      signEvent: async (template: unknown) => ({
        ...(template as Record<string, unknown>),
        id: "deadbeef",
        pubkey: "00".repeat(32),
        sig: "00".repeat(64),
      }),
    } as unknown as ISigner;
    const ev = await createAppListingEvent(
      stub,
      "pub",
      minimalNapp,
      "my-site",
      42,
    );
    assertEquals(ev.kind, 37348);
    assertEquals(ev.id, "deadbeef");
    assertEquals(ev.sig, "00".repeat(64));
    assertEquals(ev.pubkey, "00".repeat(32));
    assertEquals(ev.created_at, 42);
    assertEquals(ev.tags[0], ["d", "my-site"]);
  });
});

describe("deriveListingDTag", () => {
  it('config { id: "x" } -> "x"', () => {
    assertEquals(deriveListingDTag({ id: "x" }), "x");
  });
  it('config {} -> ""', () => {
    assertEquals(deriveListingDTag({}), "");
  });
  it('config { id: null } -> ""', () => {
    assertEquals(deriveListingDTag({ id: null }), "");
  });
  it("named manifest event with d tag -> that d", () => {
    const manifest = {
      kind: 35128,
      tags: [["d", "my-site"], ["client", "nsyte"]],
      content: "",
      created_at: 1,
      pubkey: "p",
      id: "i",
      sig: "s",
    };
    assertEquals(deriveListingDTag(manifest as never), "my-site");
  });
  it('root manifest event (no d tag) -> ""', () => {
    const manifest = {
      kind: 15128,
      tags: [["client", "nsyte"]],
      content: "",
      created_at: 1,
      pubkey: "p",
      id: "i",
      sig: "s",
    };
    assertEquals(deriveListingDTag(manifest as never), "");
  });
});
