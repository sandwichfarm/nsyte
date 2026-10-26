import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import { nprofileEncode, npubEncode } from "applesauce-core/helpers";
import { resolveStoredBunkerPubkey } from "../../src/commands/bunker.ts";
import { clearNip05Cache } from "../../src/lib/nip05.ts";
import { encodeBunkerInfo } from "../../src/lib/nip46.ts";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";

const USER_PUBKEY = "1111111111111111111111111111111111111111111111111111111111111111";
const REMOTE_PUBKEY = "2222222222222222222222222222222222222222222222222222222222222222";
const OTHER_PUBKEY = "3333333333333333333333333333333333333333333333333333333333333333";
const LOCAL_KEY = "4444444444444444444444444444444444444444444444444444444444444444";

describe("resolveStoredBunkerPubkey", () => {
  // One bunker stored under the user's pubkey, whose nbunksec points at a different remote signer
  const stored = new Map([
    [
      USER_PUBKEY,
      encodeBunkerInfo({
        pubkey: REMOTE_PUBKEY,
        local_key: LOCAL_KEY,
        relays: ["wss://relay.example.com"],
      }),
    ],
  ]);

  beforeEach(() => {
    clearNip05Cache();
    stub(SecretsManager, "getInstance", () =>
      ({
        getAllPubkeys: () => Promise.resolve([...stored.keys()]),
        getNbunk: (pubkey: string) => Promise.resolve(stored.get(pubkey) ?? null),
      }) as unknown as SecretsManager);
  });

  afterEach(() => {
    restore();
  });

  it("should accept a hex pubkey", async () => {
    assertEquals(await resolveStoredBunkerPubkey(USER_PUBKEY), USER_PUBKEY);
  });

  it("should accept an npub", async () => {
    assertEquals(await resolveStoredBunkerPubkey(npubEncode(USER_PUBKEY)), USER_PUBKEY);
  });

  it("should accept an nprofile", async () => {
    const nprofile = nprofileEncode({ pubkey: USER_PUBKEY, relays: ["wss://relay.example.com"] });
    assertEquals(await resolveStoredBunkerPubkey(nprofile), USER_PUBKEY);
  });

  it("should accept a NIP-05 identifier", async () => {
    stub(globalThis, "fetch", (input: string | URL | Request) => {
      assertEquals(
        String(input),
        "https://example.com/.well-known/nostr.json?name=alice",
      );
      return Promise.resolve(Response.json({ names: { alice: USER_PUBKEY } }));
    });

    assertEquals(await resolveStoredBunkerPubkey("alice@example.com"), USER_PUBKEY);
  });

  it("should find a bunker stored under the user pubkey by its remote signer pubkey", async () => {
    assertEquals(await resolveStoredBunkerPubkey(npubEncode(REMOTE_PUBKEY)), USER_PUBKEY);
  });

  it("should return the normalized pubkey when no stored bunker matches", async () => {
    assertEquals(await resolveStoredBunkerPubkey(npubEncode(OTHER_PUBKEY)), OTHER_PUBKEY);
  });

  it("should reject input that is not a pubkey", async () => {
    await assertRejects(
      () => resolveStoredBunkerPubkey("not-a-pubkey"),
      Error,
      "Invalid pubkey format",
    );
  });
});
