// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { NostrEvent } from "applesauce-core/helpers";
import {
  buildReleaseChangesFromFlags,
  hasAnyChange,
  registerNappCommand,
  resolveManifestVersion,
} from "../../../src/commands/napp.ts";

describe("buildReleaseChangesFromFlags", () => {
  it("includes only present, non-empty categories", () => {
    const changes = buildReleaseChangesFromFlags({
      fix: ["a"],
      add: ["b"],
      sub: undefined,
    });
    assertEquals(changes, { fix: ["a"], add: ["b"] });
  });

  it("omits empty arrays", () => {
    const changes = buildReleaseChangesFromFlags({ fix: [], add: ["b"] });
    assertEquals(changes, { add: ["b"] });
  });

  it("no flags -> empty changes object", () => {
    assertEquals(buildReleaseChangesFromFlags({}), {});
  });

  it("collects all five categories when present", () => {
    const changes = buildReleaseChangesFromFlags({
      fix: ["f"],
      add: ["a"],
      try: ["t"],
      cut: ["c"],
      sub: ["s"],
    });
    assertEquals(changes, {
      fix: ["f"],
      add: ["a"],
      try: ["t"],
      cut: ["c"],
      sub: ["s"],
    });
  });
});

describe("hasAnyChange", () => {
  it("empty object is false", () => {
    assertFalse(hasAnyChange({}));
  });

  it("a category with entries is true", () => {
    assert(hasAnyChange({ cut: ["x"] }));
  });

  it("a category with an empty array is false", () => {
    assertFalse(hasAnyChange({ add: [] }));
  });
});

describe("resolveManifestVersion", () => {
  it("pins id/d/created_at from a named-site manifest", () => {
    const manifest = {
      id: "f".repeat(64),
      created_at: 1_700_000_000,
      tags: [["d", "my-site"]],
    } as unknown as NostrEvent;
    assertEquals(resolveManifestVersion(manifest), {
      manifestId: "f".repeat(64),
      manifestDTag: "my-site",
      manifestCreatedAt: 1_700_000_000,
    });
  });

  it("root manifest (no d tag) yields empty manifestDTag", () => {
    const manifest = {
      id: "a".repeat(64),
      created_at: 1_700_000_000,
      tags: [["client", "nsyte"]],
    } as unknown as NostrEvent;
    assertEquals(resolveManifestVersion(manifest), {
      manifestId: "a".repeat(64),
      manifestDTag: "",
      manifestCreatedAt: 1_700_000_000,
    });
  });
});

describe("registerNappCommand (safe registration)", () => {
  it("does not throw", () => {
    registerNappCommand();
  });
});
