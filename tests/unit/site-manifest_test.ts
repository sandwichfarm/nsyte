// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { NostrEvent } from "applesauce-core/helpers";
import {
  fetchTrustedSiteManifestEvent,
  listTrustedRemoteFiles,
} from "../../src/lib/site-manifest.ts";

function createManifestEvent(
  id: string,
  createdAt: number,
  tags: string[][] = [],
): NostrEvent {
  return {
    id,
    kind: 15128,
    pubkey: "pubkey",
    created_at: createdAt,
    content: "",
    sig: "sig",
    tags,
  } as NostrEvent;
}

describe("fetchTrustedSiteManifestEvent", () => {
  it("re-checks manifest-tagged relays before trusting a manifest", async () => {
    const firstManifest = createManifestEvent("first", 100, [["relay", "wss://relay-manifest"]]);
    const latestManifest = createManifestEvent("latest", 200, [["relay", "wss://relay-manifest"]]);

    const fetchCalls: string[][] = [];
    const result = await fetchTrustedSiteManifestEvent(
      ["wss://relay-config"],
      "pubkey",
      undefined,
      {
        getOutboxes: () => Promise.resolve(["wss://relay-outbox"]),
        fetchManifest: (relays: string[]) => {
          fetchCalls.push(relays);
          return Promise.resolve(
            relays.includes("wss://relay-manifest/") ? latestManifest : firstManifest,
          );
        },
      },
    );

    assertExists(result.event);
    assertEquals(result.event.id, "latest");
    assertEquals(fetchCalls.length, 2);
    assertEquals(fetchCalls[0], ["wss://relay-config/", "wss://relay-outbox/"]);
    assertEquals(fetchCalls[1], [
      "wss://relay-config/",
      "wss://relay-outbox/",
      "wss://relay-manifest/",
    ]);
    assertEquals(result.relays, [
      "wss://relay-config/",
      "wss://relay-outbox/",
      "wss://relay-manifest/",
    ]);
  });

  it("returns the initial result when no manifest-tagged relays exist", async () => {
    const manifest = createManifestEvent("only", 100);

    const fetchCalls: string[][] = [];
    const result = await fetchTrustedSiteManifestEvent(
      ["wss://relay-config"],
      "pubkey",
      undefined,
      {
        getOutboxes: () => Promise.resolve(["wss://relay-outbox"]),
        fetchManifest: (relays: string[]) => {
          fetchCalls.push(relays);
          return Promise.resolve(manifest);
        },
      },
    );

    assertExists(result.event);
    assertEquals(result.event.id, "only");
    assertEquals(fetchCalls.length, 1);
    assertEquals(result.relays, ["wss://relay-config/", "wss://relay-outbox/"]);
  });

  it("builds file entries from the trusted manifest", async () => {
    const manifest = createManifestEvent("manifest", 100, [
      ["path", "/index.html", "hash-index"],
      ["path", "/app.js", "hash-app"],
    ]);

    const files = await listTrustedRemoteFiles(["wss://relay-config"], "pubkey", undefined, {
      getOutboxes: () => Promise.resolve(["wss://relay-outbox"]),
      fetchManifest: () => Promise.resolve(manifest),
    });

    assertEquals(files.map((file) => file.path), ["/app.js", "/index.html"]);
    assertEquals(files.map((file) => file.sha256), ["hash-app", "hash-index"]);
    assertEquals(files.every((file) => file.event?.id === "manifest"), true);
  });
});
