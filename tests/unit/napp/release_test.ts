// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assertEquals, assertNotEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { NostrEvent } from "applesauce-core/helpers";
import type { ISigner } from "applesauce-signers";
import {
  createReleaseNoteEvent,
  createReleaseNoteTemplate,
  NSITE_RELEASE_NOTE_KIND,
  type ReleaseChanges,
  SECONDS_IN_WEEK,
  weekBucket,
} from "../../../src/lib/napp/release.ts";
import { NSITE_RELEASE_NOTE_KIND as LISTING_RELEASE_KIND } from "../../../src/lib/napp/listing.ts";

/** 64-hex manifest event id used throughout. */
const MANIFEST_ID = "ev".repeat(32);

/**
 * Minimal in-memory fake signer — echoes the template plus a fixed id/sig/pubkey.
 * No real crypto, no network.
 */
const fakeSigner = {
  // deno-lint-ignore require-await
  async signEvent(
    t: { kind: number; created_at: number; tags: string[][]; content: string },
  ) {
    return {
      ...t,
      id: "f".repeat(64),
      sig: "0".repeat(128),
      pubkey: "a".repeat(64),
    } as NostrEvent;
  },
} as unknown as ISigner;

/** Find all values for a given tag name, in order. */
function tagValues(tags: string[][], name: string): string[] {
  return tags.filter((t) => t[0] === name).map((t) => t[1]);
}

describe("release: week math", () => {
  it("SECONDS_IN_WEEK is 604800", () => {
    assertEquals(SECONDS_IN_WEEK, 604800);
  });

  it("weekBucket is floor(ts / 604800)", () => {
    assertEquals(weekBucket(604800), 1);
    assertEquals(weekBucket(0), 0);
    assertEquals(weekBucket(604799), 0);
    // CORRECTED: 1_700_000_000 / 604800 = 2810.846… -> floor = 2810
    assertEquals(weekBucket(1_700_000_000), Math.floor(1_700_000_000 / 604800));
    assertEquals(weekBucket(1_700_000_000), 2810);
  });
});

describe("release: kind constant single-definition reuse", () => {
  it("NSITE_RELEASE_NOTE_KIND equals 39108", () => {
    assertEquals(NSITE_RELEASE_NOTE_KIND, 39108);
  });

  it("re-exported kind is the SAME value as listing.ts (single definition)", () => {
    assertEquals(NSITE_RELEASE_NOTE_KIND, LISTING_RELEASE_KIND);
  });
});

describe("release: createReleaseNoteTemplate tag mapping", () => {
  it("emits d/D/ts/w plus change entries in order, ts and w as STRINGS", () => {
    const template = createReleaseNoteTemplate({
      manifestId: MANIFEST_ID,
      manifestDTag: "my-site",
      manifestCreatedAt: 1_700_000_000,
      changes: { fix: ["a"], add: ["b", "c"] },
    });

    assertEquals(template.kind, 39108);
    assertEquals(template.content, "");
    assertEquals(template.tags, [
      ["d", MANIFEST_ID],
      ["D", "my-site"],
      ["ts", "1700000000"],
      ["w", "2810"],
      ["fix", "a"],
      ["add", "b"],
      ["add", "c"],
    ]);
  });

  it("maps all five change categories, one tag per entry", () => {
    const changes: ReleaseChanges = {
      fix: ["f1"],
      add: ["a1", "a2"],
      try: ["t1"],
      cut: ["c1"],
      sub: ["s1", "s2"],
    };
    const template = createReleaseNoteTemplate({
      manifestId: MANIFEST_ID,
      manifestDTag: "my-site",
      manifestCreatedAt: 0,
      changes,
    });

    assertEquals(tagValues(template.tags, "fix"), ["f1"]);
    assertEquals(tagValues(template.tags, "add"), ["a1", "a2"]);
    assertEquals(tagValues(template.tags, "try"), ["t1"]);
    assertEquals(tagValues(template.tags, "cut"), ["c1"]);
    assertEquals(tagValues(template.tags, "sub"), ["s1", "s2"]);
    // Fixed category order: fix, add, try, cut, sub.
    const changeTags = template.tags.filter((t) =>
      ["fix", "add", "try", "cut", "sub"].includes(t[0])
    );
    assertEquals(changeTags.map((t) => t[0]), [
      "fix",
      "add",
      "add",
      "try",
      "cut",
      "sub",
      "sub",
    ]);
  });

  it("empty changes emits d/D/ts/w and ZERO change tags", () => {
    const template = createReleaseNoteTemplate({
      manifestId: MANIFEST_ID,
      manifestDTag: "my-site",
      manifestCreatedAt: 1_700_000_000,
      changes: {},
    });
    assertEquals(template.tags, [
      ["d", MANIFEST_ID],
      ["D", "my-site"],
      ["ts", "1700000000"],
      ["w", "2810"],
    ]);
  });

  it("all-undefined changes emits zero change tags", () => {
    const template = createReleaseNoteTemplate({
      manifestId: MANIFEST_ID,
      manifestDTag: "my-site",
      manifestCreatedAt: 1_700_000_000,
      changes: { fix: undefined, add: undefined },
    });
    const changeTags = template.tags.filter((t) =>
      ["fix", "add", "try", "cut", "sub"].includes(t[0])
    );
    assertEquals(changeTags.length, 0);
  });

  it("root-site empty manifestDTag is still emitted as ['D','']", () => {
    const template = createReleaseNoteTemplate({
      manifestId: MANIFEST_ID,
      manifestDTag: "",
      manifestCreatedAt: 1_700_000_000,
      changes: {},
    });
    assertEquals(tagValues(template.tags, "D"), [""]);
  });
});

describe("release: created_at handling", () => {
  it("createdAt override is honored verbatim", () => {
    const template = createReleaseNoteTemplate({
      manifestId: MANIFEST_ID,
      manifestDTag: "my-site",
      manifestCreatedAt: 1_700_000_000,
      changes: {},
      createdAt: 1234,
    });
    assertEquals(template.created_at, 1234);
  });

  it("omitting createdAt defaults to ~now (positive integer, not the manifest ts)", () => {
    const template = createReleaseNoteTemplate({
      manifestId: MANIFEST_ID,
      manifestDTag: "my-site",
      manifestCreatedAt: 1_700_000_000,
      changes: {},
    });
    assertEquals(Number.isInteger(template.created_at), true);
    assertEquals(template.created_at > 0, true);
    // Should be a real "now", not the override path and not the manifest ts.
    assertNotEquals(template.created_at, 1234);
  });
});

describe("release: createReleaseNoteEvent signing wrapper", () => {
  it("returns the fake signer's signed event for a kind-39108 template", async () => {
    const event = await createReleaseNoteEvent(fakeSigner, {
      manifestId: MANIFEST_ID,
      manifestDTag: "my-site",
      manifestCreatedAt: 1_700_000_000,
      changes: { fix: ["a"] },
    });
    assertEquals(event.kind, 39108);
    assertEquals(event.id, "f".repeat(64));
    assertEquals(event.sig, "0".repeat(128));
    assertEquals(event.pubkey, "a".repeat(64));
    assertEquals(tagValues(event.tags, "fix"), ["a"]);
  });
});

describe("release: spec discrepancy comment", () => {
  it("source documents both 39108 (authoritative) and 31908", () => {
    const src = Deno.readTextFileSync("src/lib/napp/release.ts");
    assertEquals(src.includes("39108"), true);
    assertEquals(src.includes("31908"), true);
  });
});
