import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  buildSiteAddress,
  computeManifestAggregateHash,
  createSnapshotTemplate,
  getOrComputeManifestAggregateTag,
  NSITE_SNAPSHOT_KIND,
} from "../../src/lib/manifest.ts";

function createManifest(overrides: Partial<{
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
}> = {}) {
  return {
    id: overrides.id ?? "manifest-id",
    kind: overrides.kind ?? 15128,
    pubkey: overrides.pubkey ?? "f".repeat(64),
    created_at: overrides.created_at ?? 123,
    content: "",
    sig: "sig",
    tags: overrides.tags ?? [["path", "/index.html", "a".repeat(64)]],
  };
}

describe("manifest snapshot helpers", () => {
  it("builds a root site address with an empty identifier", () => {
    const manifest = createManifest({ kind: 15128, pubkey: "a".repeat(64) });
    assertEquals(buildSiteAddress(manifest), `15128:${"a".repeat(64)}:`);
  });

  it("builds a named site address from the d tag", () => {
    const manifest = createManifest({
      kind: 35128,
      pubkey: "b".repeat(64),
      tags: [
        ["d", "blog"],
        ["path", "/index.html", "a".repeat(64)],
      ],
    });
    assertEquals(buildSiteAddress(manifest), `35128:${"b".repeat(64)}:blog`);
  });

  it("computes the aggregate hash from sorted path lines", async () => {
    const manifest = createManifest({
      tags: [
        ["path", "/b.html", "b".repeat(64)],
        ["path", "/a.html", "a".repeat(64)],
      ],
    });

    const hash = await computeManifestAggregateHash(manifest);
    assertEquals(hash.length, 64);
    assertEquals(/^[0-9a-f]{64}$/.test(hash), true);
  });

  it("reuses the source aggregate x tag when present", async () => {
    const manifest = createManifest({
      tags: [
        ["path", "/index.html", "a".repeat(64)],
        ["x", "1".repeat(64), "aggregate"],
      ],
    });

    assertEquals(await getOrComputeManifestAggregateTag(manifest), [
      "x",
      "1".repeat(64),
      "aggregate",
    ]);
  });

  it("computes an aggregate x tag when the source manifest omits one", async () => {
    const manifest = createManifest({
      tags: [
        ["path", "/index.html", "a".repeat(64)],
      ],
    });

    const tag = await getOrComputeManifestAggregateTag(manifest);
    assertEquals(tag[0], "x");
    assertEquals(tag[2], "aggregate");
    assertEquals(tag[1].length, 64);
  });

  it("rejects manifests with multiple aggregate x tags", async () => {
    const manifest = createManifest({
      tags: [
        ["path", "/index.html", "a".repeat(64)],
        ["x", "1".repeat(64), "aggregate"],
        ["x", "2".repeat(64), "aggregate"],
      ],
    });

    await assertRejects(
      () => getOrComputeManifestAggregateTag(manifest),
      Error,
      "multiple aggregate x tags",
    );
  });

  it("creates a named-site snapshot with required and optional copied tags", async () => {
    const manifest = createManifest({
      kind: 35128,
      pubkey: "c".repeat(64),
      tags: [
        ["d", "blog"],
        ["A", `35128:${"d".repeat(64)}:origin`],
        ["path", "/index.html", "a".repeat(64)],
        ["path", "/post.html", "b".repeat(64)],
        ["title", "My Blog"],
        ["description", "desc"],
        ["source", "https://example.com/repo"],
        ["server", "https://cdn.example.com"],
        ["relay", "wss://relay.example.com"],
        ["app", `31990:${"e".repeat(64)}:blog-app`, "wss://relay.example.com"],
      ],
    });

    const snapshot = await createSnapshotTemplate(manifest);

    assertEquals(snapshot.kind, NSITE_SNAPSHOT_KIND);
    assertEquals(snapshot.tags[0], ["a", `35128:${"c".repeat(64)}:blog`]);
    assertEquals(snapshot.tags.some((tag) => tag[0] === "A"), true);
    assertEquals(snapshot.tags.some((tag) => tag[0] === "d"), false);
    assertEquals(snapshot.tags.filter((tag) => tag[0] === "path").length, 2);
    assertEquals(snapshot.tags.some((tag) => tag[0] === "title" && tag[1] === "My Blog"), true);
    assertEquals(snapshot.tags.some((tag) => tag[0] === "source"), true);
    assertEquals(snapshot.tags.some((tag) => tag[0] === "app"), true);
    assertEquals(snapshot.tags.some((tag) => tag[0] === "server"), true);
    assertEquals(snapshot.tags.some((tag) => tag[0] === "relay"), true);
    assertEquals(snapshot.tags.filter((tag) => tag[0] === "x").length, 1);
  });

  it("creates a root-site snapshot and computes aggregate x when absent", async () => {
    const manifest = createManifest({
      kind: 15128,
      pubkey: "9".repeat(64),
      tags: [["path", "/index.html", "a".repeat(64)]],
    });

    const snapshot = await createSnapshotTemplate(manifest);
    assertEquals(snapshot.tags[0], ["a", `15128:${"9".repeat(64)}:`]);
    assertEquals(snapshot.tags.filter((tag) => tag[0] === "x").length, 1);
  });
});
