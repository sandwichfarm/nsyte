import "../../test-setup-global.ts";
import { assertEquals, assertMatch, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  appDecode,
  appEncode,
  BASE62_ALPHABET,
  base62ToBytes,
  bytesToBase62,
  decodeNappIdentifier,
  DEFAULT_NAPP_INDEXER_RELAYS,
  nappIdentifier,
  resolveIndexerRelays,
} from "../../../src/lib/napp/identifier.ts";

/**
 * EXTERNALLY-VERIFIED interop vectors.
 *
 * These were produced by running the genuine upstream 44Billion/nappup algorithm,
 * which round-trips the spec's own published vector. They are hard-coded here as the
 * primary interop assertions — if the port drifts from the reference, one of these
 * fails. Do NOT change the vectors; fix the port.
 */

// Vector 1: the spec's published entity (strongest assertion).
const SPEC_ENTITY = "+cA99KnC0UCyqHT5oI8fIkoza0jfB1lrvaWKmuh6h2EhTz2nw4R2a5qVNM";
const SPEC_DTAG = "0ufiaf2";
const SPEC_PUBKEY = "5a8bc85694d8fbb4f30208649c1c52509636d1e6fdb1f0f4c84a3f10f9383ec9";

// Vector 2: golden, no relays.
const GOLDEN_NO_RELAYS = "+ehjV4kucmWYSCIqa4YfqS08hdZu1kNgHTJT7epcHHWIOJPJvkdc5poyZ2ffrn";
// Vector 3: golden, 1 relay.
const GOLDEN_ONE_RELAY =
  "+2CQzXAhYFUBwLJDSw4KYzy3JgqAB2351RPc4q2OXt167Cm6gvMCvNlpUELbuDAu5Qqfi8HGwVvL4XRw37s6EXbsfKRu7D37";
const GOLDEN_DTAG = "my-website";
const GOLDEN_PUBKEY = "1".repeat(64);

describe("base62 codec", () => {
  it("encodes a single zero byte to a single leader", () => {
    assertEquals(bytesToBase62(new Uint8Array([0])), "0");
  });

  it("preserves both leading-zero leader chars for [0,0,1]", () => {
    const s = bytesToBase62(new Uint8Array([0, 0, 1]));
    // two leading zeros -> two leader chars, then the digit(s) for 1.
    assertEquals(s.startsWith("00"), true);
    assertEquals(s, "001");
    assertEquals(Array.from(base62ToBytes(s)), [0, 0, 1]);
  });

  it("round-trips arbitrary byte arrays including leading zeros", () => {
    const samples: number[][] = [
      [],
      [0],
      [0, 0, 0],
      [255],
      [0, 0, 255, 1, 7],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ];
    for (const arr of samples) {
      const b = new Uint8Array(arr);
      assertEquals(Array.from(base62ToBytes(bytesToBase62(b))), arr);
    }
    // random arrays
    for (let i = 0; i < 50; i++) {
      const len = Math.floor(Math.random() * 40);
      const b = new Uint8Array(len);
      crypto.getRandomValues(b);
      assertEquals(Array.from(base62ToBytes(bytesToBase62(b))), Array.from(b));
    }
  });

  it("uses the 0-9a-zA-Z alphabet", () => {
    assertEquals(
      BASE62_ALPHABET,
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    );
  });

  it("rejects an invalid base62 char", () => {
    assertThrows(() => base62ToBytes("!!!"));
  });
});

describe("appEncode / appDecode channels", () => {
  const pubkey = GOLDEN_PUBKEY;

  it("encodes channel main with a single + prefix and base62 body", () => {
    const entity = appEncode({ dTag: "x", pubkey, kind: 35128, relays: [] });
    assertMatch(entity, /^\+[0-9A-Za-z]+$/);
    assertEquals(entity.startsWith("++"), false);
  });

  it("maps kinds to prefixes ++ and +++", () => {
    const next = appEncode({ dTag: "x", pubkey, kind: 35129, relays: [] });
    const draft = appEncode({ dTag: "x", pubkey, kind: 35130, relays: [] });
    assertEquals(next.startsWith("++"), true);
    assertEquals(next.startsWith("+++"), false);
    assertEquals(draft.startsWith("+++"), true);
  });

  it("throws Wrong channel for an unknown kind with no explicit channel", () => {
    assertThrows(
      () => appEncode({ dTag: "x", pubkey, kind: 99999, relays: [] }),
      Error,
      "Wrong channel",
    );
  });

  it("throws a clear validation error (not a TypeError) for a malformed identifier missing TLV type 0/2", () => {
    // A valid prefix with an empty TLV body decodes to {} — type 0 (dTag) is absent.
    // Without the guard this threw `Cannot read properties of undefined (reading '0')`.
    const err = assertThrows(() => appDecode("+"), Error, "invalid app identifier");
    assertEquals(err instanceof TypeError, false);
  });

  it("round-trips with zero relays", () => {
    const ref = { dTag: "hello", pubkey, kind: 35128, relays: [] };
    const decoded = appDecode(appEncode(ref));
    assertEquals(decoded.dTag, "hello");
    assertEquals(decoded.pubkey, pubkey);
    assertEquals(decoded.relays, []);
    assertEquals(decoded.kind, 35128);
  });

  it("round-trips with multiple relays", () => {
    const ref = {
      dTag: "hello",
      pubkey,
      kind: 35128,
      relays: ["wss://a", "wss://b"],
    };
    const decoded = appDecode(appEncode(ref));
    assertEquals(decoded.dTag, "hello");
    assertEquals(decoded.pubkey, pubkey);
    assertEquals(decoded.relays, ["wss://a", "wss://b"]);
    assertEquals(decoded.kind, 35128);
  });

  it("rejects a pubkey TLV value that is not 32 bytes on decode", () => {
    // Encode a deliberately short (2-byte) pubkey; decode must reject the
    // non-32-byte pubkey TLV value.
    const entity = appEncode({
      dTag: "x",
      pubkey: "abcd",
      kind: 35128,
      relays: [],
    });
    assertThrows(() => appDecode(entity), Error, "invalid pubkey length");
  });
});

describe("interop vectors (externally verified)", () => {
  it("VECTOR 1: decodes the spec entity to the expected fields", () => {
    const decoded = decodeNappIdentifier(SPEC_ENTITY);
    assertEquals(decoded.dTag, SPEC_DTAG);
    assertEquals(decoded.pubkey, SPEC_PUBKEY);
    assertEquals(decoded.kind, 35128);
    assertEquals(decoded.relays, []);
  });

  it("VECTOR 1: re-encodes the spec fields to the identical string", () => {
    const entity = nappIdentifier({
      dTag: SPEC_DTAG,
      pubkey: SPEC_PUBKEY,
      relays: [],
    });
    assertEquals(entity, SPEC_ENTITY);
  });

  it("VECTOR 2: golden no-relays vector reproduces byte-for-byte", () => {
    const entity = nappIdentifier({
      dTag: GOLDEN_DTAG,
      pubkey: GOLDEN_PUBKEY,
      relays: [],
    });
    assertEquals(entity, GOLDEN_NO_RELAYS);
    assertMatch(entity, /^\+[0-9A-Za-z]{48,}$/);
  });

  it("VECTOR 3: golden one-relay vector reproduces byte-for-byte", () => {
    const entity = nappIdentifier({
      dTag: GOLDEN_DTAG,
      pubkey: GOLDEN_PUBKEY,
      relays: ["wss://relay.example.com"],
    });
    assertEquals(entity, GOLDEN_ONE_RELAY);
    assertMatch(entity, /^\+[0-9A-Za-z]{48,}$/);
  });

  it("all vectors round-trip encode->decode->encode", () => {
    for (const entity of [SPEC_ENTITY, GOLDEN_NO_RELAYS, GOLDEN_ONE_RELAY]) {
      const decoded = decodeNappIdentifier(entity);
      const reencoded = nappIdentifier({
        dTag: decoded.dTag,
        pubkey: decoded.pubkey,
        relays: decoded.relays,
      });
      assertEquals(reencoded, entity);
    }
  });
});

describe("nappIdentifier wrappers", () => {
  it("produces a + identifier matching the shape regex", () => {
    const entity = nappIdentifier({
      dTag: "my-website",
      pubkey: GOLDEN_PUBKEY,
      relays: [],
    });
    assertMatch(entity, /^\+[0-9A-Za-z]{48,}$/);
  });

  it("round-trips dTag/pubkey/relays/kind through decode", () => {
    const entity = nappIdentifier({
      dTag: "x",
      pubkey: GOLDEN_PUBKEY,
      relays: ["wss://a", "wss://b"],
    });
    const decoded = decodeNappIdentifier(entity);
    assertEquals(decoded.dTag, "x");
    assertEquals(decoded.pubkey, GOLDEN_PUBKEY);
    assertEquals(decoded.relays, ["wss://a", "wss://b"]);
    assertEquals(decoded.kind, 35128);
  });
});

describe("indexer relays", () => {
  it("DEFAULT_NAPP_INDEXER_RELAYS is the 44billion relay", () => {
    assertEquals(DEFAULT_NAPP_INDEXER_RELAYS, ["wss://relay.44billion.net"]);
  });

  it("returns the configured override array when set", () => {
    assertEquals(
      resolveIndexerRelays({ napp: { indexerRelays: ["wss://x"] } }),
      ["wss://x"],
    );
  });

  it("returns the default when napp present but indexerRelays unset", () => {
    assertEquals(
      resolveIndexerRelays({ napp: {} }),
      DEFAULT_NAPP_INDEXER_RELAYS,
    );
  });

  it("returns the default for a plain config without a napp section", () => {
    assertEquals(
      resolveIndexerRelays({ relays: [], servers: [] }),
      DEFAULT_NAPP_INDEXER_RELAYS,
    );
  });

  it("returns the default for non-object config", () => {
    assertEquals(resolveIndexerRelays(null), DEFAULT_NAPP_INDEXER_RELAYS);
    assertEquals(resolveIndexerRelays(undefined), DEFAULT_NAPP_INDEXER_RELAYS);
  });
});
