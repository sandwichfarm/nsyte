import "../../test-setup-global.ts";
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  DEFAULT_NAPP_INDEXER_RELAYS,
  resolveIndexerRelays,
} from "../../../src/lib/napp/identifier.ts";
import { validateConfig } from "../../../src/lib/config-validator.ts";

function nappConfig(napp: Record<string, unknown> = {}) {
  return {
    relays: ["wss://relay.damus.io"],
    servers: ["https://cdn.hzrd149.com"],
    napp: {
      name: { value: "My App" },
      icon: { hash: "abc123", mime: "image/png" },
      categories: ["napp.games:rpg"],
      countries: ["*"],
      ...napp,
    },
  };
}

describe("resolveIndexerRelays (config targeting)", () => {
  it("applies the default when napp present but indexerRelays unset", () => {
    assertEquals(
      resolveIndexerRelays({ napp: { name: { value: "x" } } }),
      DEFAULT_NAPP_INDEXER_RELAYS,
    );
  });

  it("respects a configured indexerRelays override", () => {
    assertEquals(
      resolveIndexerRelays({ napp: { indexerRelays: ["wss://custom"] } }),
      ["wss://custom"],
    );
  });

  it("returns the default for a plain config with no napp section", () => {
    assertEquals(
      resolveIndexerRelays({ relays: [], servers: [] }),
      DEFAULT_NAPP_INDEXER_RELAYS,
    );
  });
});

describe("schema (indexerRelays is optional + additive)", () => {
  it("accepts a napp with indexerRelays", () => {
    const result = validateConfig(
      nappConfig({ indexerRelays: ["wss://x", "ws://y"] }),
    );
    assertEquals(result.valid, true);
    assertEquals(result.errors.length, 0);
  });

  it("still accepts a napp without indexerRelays (optional)", () => {
    const result = validateConfig(nappConfig());
    assertEquals(result.valid, true);
    assertEquals(result.errors.length, 0);
  });
});

describe("deploy listing publish targeting (dedupe union)", () => {
  it("publishes to the deduped union of resolved + indexer relays", () => {
    // This mirrors the exact set logic used in maybePublishAppListing:
    //   Array.from(new Set([...resolvedRelays, ...indexerRelays]))
    const resolvedRelays = ["wss://a", "wss://b"];
    const indexerRelays = ["wss://b", "wss://relay.44billion.net"];
    const publishRelays = Array.from(new Set([...resolvedRelays, ...indexerRelays]));
    assertEquals(publishRelays, ["wss://a", "wss://b", "wss://relay.44billion.net"]);
  });

  it("keeps every resolved relay even when no indexer overlap", () => {
    const resolvedRelays = ["wss://a", "wss://b", "wss://c"];
    const indexerRelays = DEFAULT_NAPP_INDEXER_RELAYS;
    const publishRelays = Array.from(new Set([...resolvedRelays, ...indexerRelays]));
    assertEquals(publishRelays, [
      "wss://a",
      "wss://b",
      "wss://c",
      "wss://relay.44billion.net",
    ]);
  });
});
