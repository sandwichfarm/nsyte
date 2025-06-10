import { assertEquals, assertExists, assertMatch } from "std/assert/mod.ts";
import {
  type FileEntry,
  generateKeyPair,
  type NostrEvent,
  NSITE_KIND,
  NSYTE_BROADCAST_RELAYS,
  parseBunkerUrl,
  type Profile,
  RELAY_DISCOVERY_RELAYS,
  USER_BLOSSOM_SERVER_LIST_KIND,
} from "../../src/lib/nostr.ts";

Deno.test("nostr constants", async (t) => {
  await t.step("should export correct event kinds", () => {
    assertEquals(NSITE_KIND, 34128);
    assertEquals(USER_BLOSSOM_SERVER_LIST_KIND, 10063);
  });

  await t.step("should export relay arrays", () => {
    assertExists(NSYTE_BROADCAST_RELAYS);
    assertExists(RELAY_DISCOVERY_RELAYS);
    assertEquals(Array.isArray(NSYTE_BROADCAST_RELAYS), true);
    assertEquals(Array.isArray(RELAY_DISCOVERY_RELAYS), true);
    assertEquals(NSYTE_BROADCAST_RELAYS.length > 0, true);
    assertEquals(RELAY_DISCOVERY_RELAYS.length > 0, true);
  });

  await t.step("should have valid relay URLs", () => {
    for (const relay of NSYTE_BROADCAST_RELAYS) {
      assertMatch(relay, /^wss:\/\/.+/);
    }
    for (const relay of RELAY_DISCOVERY_RELAYS) {
      assertMatch(relay, /^wss:\/\/.+/);
    }
  });
});

Deno.test("generateKeyPair", async (t) => {
  await t.step("should generate valid key pair", () => {
    const { privateKey, publicKey } = generateKeyPair();

    // Check private key
    assertExists(privateKey);
    assertEquals(typeof privateKey, "string");
    assertEquals(privateKey.length, 64); // 32 bytes hex encoded
    assertMatch(privateKey, /^[0-9a-f]{64}$/);

    // Check public key
    assertExists(publicKey);
    assertEquals(typeof publicKey, "string");
    assertEquals(publicKey.length, 64); // 32 bytes hex encoded
    assertMatch(publicKey, /^[0-9a-f]{64}$/);
  });

  await t.step("should generate unique key pairs", () => {
    const keyPair1 = generateKeyPair();
    const keyPair2 = generateKeyPair();

    // Keys should be different
    assertEquals(keyPair1.privateKey !== keyPair2.privateKey, true);
    assertEquals(keyPair1.publicKey !== keyPair2.publicKey, true);
  });

  await t.step("should generate valid hex format for keys", () => {
    const { privateKey, publicKey } = generateKeyPair();

    // Verify both keys are valid hex strings
    assertMatch(privateKey, /^[0-9a-f]{64}$/);
    assertMatch(publicKey, /^[0-9a-f]{64}$/);
  });
});

Deno.test("parseBunkerUrl", async (t) => {
  await t.step("should parse valid bunker URL", () => {
    const bunkerUrl =
      "bunker://pubkey123?relay=wss://relay1.com&relay=wss://relay2.com&secret=secret123";
    const parsed = parseBunkerUrl(bunkerUrl);

    assertEquals(parsed.pubkey, "pubkey123");
    assertEquals(parsed.relays.length, 2);
    assertEquals(parsed.relays[0], "wss://relay1.com");
    assertEquals(parsed.relays[1], "wss://relay2.com");
    assertEquals(parsed.secret, "secret123");
  });

  await t.step("should parse bunker URL without secret", () => {
    const bunkerUrl = "bunker://pubkey456?relay=wss://relay.com";
    const parsed = parseBunkerUrl(bunkerUrl);

    assertEquals(parsed.pubkey, "pubkey456");
    assertEquals(parsed.relays.length, 1);
    assertEquals(parsed.relays[0], "wss://relay.com");
    assertEquals(parsed.secret, undefined);
  });

  await t.step("should handle multiple relays", () => {
    const bunkerUrl =
      "bunker://pubkey789?relay=wss://relay1.com&relay=wss://relay2.com&relay=wss://relay3.com";
    const parsed = parseBunkerUrl(bunkerUrl);

    assertEquals(parsed.relays.length, 3);
  });
});

Deno.test("Profile interface", async (t) => {
  await t.step("should accept valid profile data", () => {
    const profile: Profile = {
      name: "Test User",
      about: "A test user profile",
      picture: "https://example.com/avatar.jpg",
      display_name: "Test Display Name",
      website: "https://example.com",
      nip05: "test@example.com",
      lud16: "test@walletofsatoshi.com",
      banner: "https://example.com/banner.jpg",
    };

    assertEquals(profile.name, "Test User");
    assertEquals(profile.about, "A test user profile");
    assertEquals(profile.picture, "https://example.com/avatar.jpg");
    assertEquals(profile.display_name, "Test Display Name");
    assertEquals(profile.website, "https://example.com");
    assertEquals(profile.nip05, "test@example.com");
    assertEquals(profile.lud16, "test@walletofsatoshi.com");
    assertEquals(profile.banner, "https://example.com/banner.jpg");
  });

  await t.step("should accept partial profile data", () => {
    const minimalProfile: Profile = {
      name: "Minimal User",
    };

    assertEquals(minimalProfile.name, "Minimal User");
    assertEquals(minimalProfile.about, undefined);
    assertEquals(minimalProfile.picture, undefined);
  });

  await t.step("should accept empty profile", () => {
    const emptyProfile: Profile = {};

    assertEquals(Object.keys(emptyProfile).length, 0);
  });
});

Deno.test("FileEntry interface", async (t) => {
  await t.step("should accept valid file entry data", () => {
    const fileEntry: FileEntry = {
      path: "/test/file.txt",
      data: new Uint8Array([1, 2, 3, 4]),
      size: 4,
      sha256: "abcdef0123456789",
      contentType: "text/plain",
    };

    assertEquals(fileEntry.path, "/test/file.txt");
    assertEquals(fileEntry.data?.length, 4);
    assertEquals(fileEntry.size, 4);
    assertEquals(fileEntry.sha256, "abcdef0123456789");
    assertEquals(fileEntry.contentType, "text/plain");
  });

  await t.step("should accept minimal file entry", () => {
    const minimalEntry: FileEntry = {
      path: "/minimal.txt",
    };

    assertEquals(minimalEntry.path, "/minimal.txt");
    assertEquals(minimalEntry.data, undefined);
    assertEquals(minimalEntry.size, undefined);
    assertEquals(minimalEntry.sha256, undefined);
    assertEquals(minimalEntry.contentType, undefined);
  });

  await t.step("should handle various path formats", () => {
    const entries: FileEntry[] = [
      { path: "file.txt" },
      { path: "/file.txt" },
      { path: "/dir/file.txt" },
      { path: "./file.txt" },
      { path: "../file.txt" },
      { path: "dir/subdir/file.txt" },
    ];

    for (const entry of entries) {
      assertExists(entry.path);
      assertEquals(typeof entry.path, "string");
      assertEquals(entry.path.length > 0, true);
    }
  });
});

Deno.test("NostrEvent interface", async (t) => {
  await t.step("should accept valid event data", () => {
    const event: NostrEvent = {
      id: "event123",
      pubkey: "pubkey123",
      created_at: 1234567890,
      kind: 1,
      tags: [["p", "pubkey456"], ["e", "event789"]],
      content: "Test event content",
      sig: "signature123",
    };

    assertEquals(event.id, "event123");
    assertEquals(event.pubkey, "pubkey123");
    assertEquals(event.created_at, 1234567890);
    assertEquals(event.kind, 1);
    assertEquals(event.tags.length, 2);
    assertEquals(event.content, "Test event content");
    assertEquals(event.sig, "signature123");
  });

  await t.step("should handle different event kinds", () => {
    const kinds = [0, 1, 3, 7, 10002, NSITE_KIND, USER_BLOSSOM_SERVER_LIST_KIND];

    for (const kind of kinds) {
      const event: NostrEvent = {
        id: `event-${kind}`,
        pubkey: "pubkey123",
        created_at: Date.now(),
        kind,
        tags: [],
        content: "",
        sig: "sig123",
      };

      assertEquals(event.kind, kind);
    }
  });
});
