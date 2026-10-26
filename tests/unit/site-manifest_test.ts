// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { NostrEvent } from "applesauce-core/helpers";
import {
  fetchTrustedSiteManifestEvent,
  fetchTrustedSiteManifestHistory,
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
    assertEquals(fetchCalls[1], ["wss://relay-manifest/"]);
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

for (const history of [false, true]) {
  for (const additional of [false, true]) {
    Deno.test(`manifest ${history ? "history" : "latest"} queries only new relays (additional: ${additional})`, async () => {
      const tags = [
        ["relay", "wss://relay-config/"],
        ["relay", "wss://relay-outbox"],
        ...(additional ? [["relay", "wss://relay-new"], ["relay", "wss://relay-new/"]] : []),
      ];
      const first = createManifestEvent("first", 100, tags);
      const newer = createManifestEvent("newer", 200);
      const calls: string[][] = [];
      let discoveryCalls = 0;
      const getOutboxes = () => {
        discoveryCalls++;
        return Promise.resolve(["wss://relay-outbox"]);
      };
      const fetchEvents = (relays: string[], pubkey: string, identifier?: string) => {
        calls.push(relays);
        assertEquals(pubkey, "pubkey");
        assertEquals(identifier, "named-site");
        return Promise.resolve(calls.length === 1 ? [first] : [newer, first]);
      };
      if (history) {
        const events = await fetchTrustedSiteManifestHistory(
          ["wss://relay-config"],
          "pubkey",
          "named-site",
          { getOutboxes, fetchEvents },
        );
        assertEquals(events.map((event) => event.id), additional ? ["newer", "first"] : ["first"]);
      } else {
        const result = await fetchTrustedSiteManifestEvent(
          ["wss://relay-config"],
          "pubkey",
          "named-site",
          {
            getOutboxes,
            fetchManifest: async (...args) => {
              const events = await fetchEvents(...args);
              return events[0];
            },
          },
        );
        assertEquals(result.event?.id, additional ? "newer" : "first");
        assertEquals(
          result.relays,
          additional
            ? ["wss://relay-config/", "wss://relay-outbox/", "wss://relay-new/"]
            : ["wss://relay-config/", "wss://relay-outbox/"],
        );
      }
      assertEquals(discoveryCalls, 1);
      assertEquals(
        calls,
        additional
          ? [["wss://relay-config/", "wss://relay-outbox/"], ["wss://relay-new/"]]
          : [["wss://relay-config/", "wss://relay-outbox/"]],
      );
    });
  }
}

Deno.test("manifest discovery preserves the first result when new relays have no newer event", async () => {
  const first = createManifestEvent("first", 200, [["relay", "wss://relay-new"]]);
  for (const second of [null, createManifestEvent("older", 100)]) {
    let calls = 0;
    const result = await fetchTrustedSiteManifestEvent(
      ["wss://relay-config"],
      "pubkey",
      undefined,
      {
        getOutboxes: () => Promise.resolve(undefined),
        fetchManifest: () => Promise.resolve(++calls === 1 ? first : second),
      },
    );
    assertEquals(result.event, first);
    assertEquals(calls, 2);
    assertEquals(result.relays, ["wss://relay-config/", "wss://relay-new/"]);
  }
});

Deno.test("manifest history stops after an empty first pass", async () => {
  let calls = 0;
  const result = await fetchTrustedSiteManifestHistory(
    ["wss://relay-config"],
    "pubkey",
    undefined,
    {
      getOutboxes: () => Promise.resolve(undefined),
      fetchEvents: () => {
        calls++;
        return Promise.resolve([]);
      },
    },
  );
  assertEquals(result, []);
  assertEquals(calls, 1);
});
