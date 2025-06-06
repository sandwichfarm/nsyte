import { assertEquals, assertExists, assertThrows, assertRejects } from "std/assert/mod.ts";
import {
  generateKeyPair,
  parseBunkerUrl,
  getTagValue,
  createProfileEvent,
  createRelayListEvent,
  createServerListEvent,
  createDeleteEvent,
  NSITE_KIND,
  USER_BLOSSOM_SERVER_LIST_KIND,
  type NostrEvent,
  type Profile,
  type FileEntry
} from "../../src/lib/nostr.ts";

// Mock signer for testing
const mockSigner = {
  signEvent: async (template: any) => {
    return {
      id: "mock_event_id_" + Math.random().toString(36).substring(7),
      pubkey: "mock_pubkey_64_chars_long_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      created_at: template.created_at,
      kind: template.kind,
      tags: template.tags,
      content: template.content,
      sig: "mock_signature_128_chars_long_" + "a".repeat(96)
    } as NostrEvent;
  },
  getPublicKey: async () => "mock_pubkey_64_chars_long_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
};

Deno.test("Nostr Module - generateKeyPair", async (t) => {
  await t.step("should generate valid key pair", () => {
    const keyPair = generateKeyPair();
    
    assertExists(keyPair.privateKey);
    assertExists(keyPair.publicKey);
    assertEquals(typeof keyPair.privateKey, "string");
    assertEquals(typeof keyPair.publicKey, "string");
    assertEquals(keyPair.privateKey.length, 64); // 32 bytes = 64 hex chars
    assertEquals(keyPair.publicKey.length, 64); // 32 bytes = 64 hex chars
    
    // Should be valid hex
    assertEquals(/^[0-9a-f]+$/i.test(keyPair.privateKey), true);
    assertEquals(/^[0-9a-f]+$/i.test(keyPair.publicKey), true);
  });

  await t.step("should generate different keys each time", () => {
    const keyPair1 = generateKeyPair();
    const keyPair2 = generateKeyPair();
    
    assertEquals(keyPair1.privateKey !== keyPair2.privateKey, true);
    assertEquals(keyPair1.publicKey !== keyPair2.publicKey, true);
  });
});

Deno.test("Nostr Module - parseBunkerUrl", async (t) => {
  await t.step("should parse valid bunker URL with all components", () => {
    const bunkerUrl = "bunker://pubkey123?relay=wss://relay1.com&relay=wss://relay2.com&secret=mysecret";
    const result = parseBunkerUrl(bunkerUrl);
    
    assertEquals(result.pubkey, "pubkey123");
    assertEquals(result.relays, ["wss://relay1.com", "wss://relay2.com"]);
    assertEquals(result.secret, "mysecret");
  });

  await t.step("should parse bunker URL without secret", () => {
    const bunkerUrl = "bunker://pubkey456?relay=wss://relay.com";
    const result = parseBunkerUrl(bunkerUrl);
    
    assertEquals(result.pubkey, "pubkey456");
    assertEquals(result.relays, ["wss://relay.com"]);
    assertEquals(result.secret, undefined);
  });

  await t.step("should parse bunker URL with no relays", () => {
    const bunkerUrl = "bunker://pubkey789";
    const result = parseBunkerUrl(bunkerUrl);
    
    assertEquals(result.pubkey, "pubkey789");
    assertEquals(result.relays, []);
    assertEquals(result.secret, undefined);
  });

  await t.step("should throw error for invalid prefix", () => {
    assertThrows(
      () => parseBunkerUrl("invalid://pubkey123"),
      Error,
      "Invalid bunker URL format. Must start with bunker://"
    );
  });

  await t.step("should throw error for malformed URL", () => {
    assertThrows(
      () => parseBunkerUrl("bunker://[invalid"),
      Error,
      "Invalid bunker URL format"
    );
  });
});

Deno.test("Nostr Module - getTagValue", async (t) => {
  const mockEvent: NostrEvent = {
    id: "event123",
    pubkey: "pubkey123",
    created_at: 1234567890,
    kind: 1,
    tags: [
      ["e", "event_id_reference"],
      ["p", "pubkey_reference"],
      ["t", "hashtag"],
      ["r", "relay_url"],
      ["d", "identifier"]
    ],
    content: "Test event",
    sig: "signature123"
  };

  await t.step("should extract existing tag value", () => {
    assertEquals(getTagValue(mockEvent, "e"), "event_id_reference");
    assertEquals(getTagValue(mockEvent, "p"), "pubkey_reference");
    assertEquals(getTagValue(mockEvent, "t"), "hashtag");
    assertEquals(getTagValue(mockEvent, "r"), "relay_url");
    assertEquals(getTagValue(mockEvent, "d"), "identifier");
  });

  await t.step("should return undefined for non-existent tag", () => {
    assertEquals(getTagValue(mockEvent, "nonexistent"), undefined);
    assertEquals(getTagValue(mockEvent, "x"), undefined);
  });

  await t.step("should return undefined for empty tag", () => {
    const eventWithEmptyTag: NostrEvent = {
      ...mockEvent,
      tags: [["empty"], ["incomplete"]]
    };
    assertEquals(getTagValue(eventWithEmptyTag, "empty"), undefined);
    assertEquals(getTagValue(eventWithEmptyTag, "incomplete"), undefined);
  });

  await t.step("should handle event with no tags", () => {
    const eventWithNoTags: NostrEvent = {
      ...mockEvent,
      tags: []
    };
    assertEquals(getTagValue(eventWithNoTags, "any"), undefined);
  });
});

Deno.test("Nostr Module - createProfileEvent", async (t) => {
  await t.step("should create profile event with complete profile", async () => {
    const profile: Profile = {
      name: "Test User",
      about: "Test description",
      picture: "https://example.com/avatar.jpg",
      display_name: "Test Display",
      website: "https://example.com",
      nip05: "test@example.com",
      lud16: "test@wallet.com",
      banner: "https://example.com/banner.jpg"
    };

    const event = await createProfileEvent(mockSigner, profile);
    
    assertEquals(event.kind, 0);
    assertEquals(event.pubkey, "mock_pubkey_64_chars_long_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assertExists(event.created_at);
    assertEquals(typeof event.created_at, "number");
    assertEquals(JSON.parse(event.content), profile);
    
    // Should have client tag
    const clientTag = event.tags.find(tag => tag[0] === "client");
    assertExists(clientTag);
    assertEquals(clientTag[1], "nsyte");
  });

  await t.step("should create profile event with minimal profile", async () => {
    const profile: Profile = {
      name: "Minimal User"
    };

    const event = await createProfileEvent(mockSigner, profile);
    
    assertEquals(event.kind, 0);
    assertEquals(JSON.parse(event.content), profile);
  });

  await t.step("should create profile event with empty profile", async () => {
    const profile: Profile = {};

    const event = await createProfileEvent(mockSigner, profile);
    
    assertEquals(event.kind, 0);
    assertEquals(JSON.parse(event.content), profile);
  });
});

Deno.test("Nostr Module - createRelayListEvent", async (t) => {
  await t.step("should create relay list event with multiple relays", async () => {
    const relays = ["wss://relay1.com", "wss://relay2.com", "wss://relay3.com"];
    
    const event = await createRelayListEvent(mockSigner, relays);
    
    assertEquals(event.kind, 10002);
    assertEquals(event.content, "");
    
    // Check relay tags
    const relayTags = event.tags.filter(tag => tag[0] === "r");
    assertEquals(relayTags.length, 3);
    
    relayTags.forEach((tag, index) => {
      assertEquals(tag[0], "r");
      assertEquals(tag[1], relays[index]);
      assertEquals(tag[2], "read");
      assertEquals(tag[3], "write");
    });
    
    // Should have client tag
    const clientTag = event.tags.find(tag => tag[0] === "client");
    assertExists(clientTag);
    assertEquals(clientTag[1], "nsyte");
  });

  await t.step("should create relay list event with single relay", async () => {
    const relays = ["wss://single-relay.com"];
    
    const event = await createRelayListEvent(mockSigner, relays);
    
    assertEquals(event.kind, 10002);
    const relayTags = event.tags.filter(tag => tag[0] === "r");
    assertEquals(relayTags.length, 1);
    assertEquals(relayTags[0][1], "wss://single-relay.com");
  });

  await t.step("should create relay list event with empty relay list", async () => {
    const relays: string[] = [];
    
    const event = await createRelayListEvent(mockSigner, relays);
    
    assertEquals(event.kind, 10002);
    const relayTags = event.tags.filter(tag => tag[0] === "r");
    assertEquals(relayTags.length, 0);
    
    // Should still have client tag
    const clientTag = event.tags.find(tag => tag[0] === "client");
    assertExists(clientTag);
  });
});

Deno.test("Nostr Module - createServerListEvent", async (t) => {
  await t.step("should create server list event with multiple servers", async () => {
    const servers = ["https://server1.com", "https://server2.com", "https://server3.com"];
    
    const event = await createServerListEvent(mockSigner, servers);
    
    assertEquals(event.kind, USER_BLOSSOM_SERVER_LIST_KIND);
    assertEquals(event.content, "");
    
    // Check server tags
    const serverTags = event.tags.filter(tag => tag[0] === "server");
    assertEquals(serverTags.length, 3);
    
    serverTags.forEach((tag, index) => {
      assertEquals(tag[0], "server");
      assertEquals(tag[1], servers[index]);
    });
    
    // Should have client tag
    const clientTag = event.tags.find(tag => tag[0] === "client");
    assertExists(clientTag);
    assertEquals(clientTag[1], "nsyte");
  });

  await t.step("should create server list event with empty server list", async () => {
    const servers: string[] = [];
    
    const event = await createServerListEvent(mockSigner, servers);
    
    assertEquals(event.kind, USER_BLOSSOM_SERVER_LIST_KIND);
    const serverTags = event.tags.filter(tag => tag[0] === "server");
    assertEquals(serverTags.length, 0);
  });
});

Deno.test("Nostr Module - createDeleteEvent", async (t) => {
  await t.step("should create delete event with multiple event IDs", async () => {
    const eventIds = ["event1", "event2", "event3"];
    
    const event = await createDeleteEvent(mockSigner, eventIds);
    
    assertEquals(event.kind, 5);
    assertEquals(event.content, "Deleted by nsyte-cli");
    
    // Check event tags
    const eventTags = event.tags.filter(tag => tag[0] === "e");
    assertEquals(eventTags.length, 3);
    
    eventTags.forEach((tag, index) => {
      assertEquals(tag[0], "e");
      assertEquals(tag[1], eventIds[index]);
    });
    
    // Should have client tag
    const clientTag = event.tags.find(tag => tag[0] === "client");
    assertExists(clientTag);
    assertEquals(clientTag[1], "nsyte");
  });

  await t.step("should create delete event with single event ID", async () => {
    const eventIds = ["single_event"];
    
    const event = await createDeleteEvent(mockSigner, eventIds);
    
    assertEquals(event.kind, 5);
    const eventTags = event.tags.filter(tag => tag[0] === "e");
    assertEquals(eventTags.length, 1);
    assertEquals(eventTags[0][1], "single_event");
  });

  await t.step("should create delete event with empty event ID list", async () => {
    const eventIds: string[] = [];
    
    const event = await createDeleteEvent(mockSigner, eventIds);
    
    assertEquals(event.kind, 5);
    const eventTags = event.tags.filter(tag => tag[0] === "e");
    assertEquals(eventTags.length, 0);
  });
});

Deno.test("Nostr Module - Constants and Exports", async (t) => {
  await t.step("should export correct constants", () => {
    assertEquals(NSITE_KIND, 34128);
    assertEquals(USER_BLOSSOM_SERVER_LIST_KIND, 10063);
  });

  await t.step("should have correct event kind values", () => {
    assertEquals(typeof NSITE_KIND, "number");
    assertEquals(typeof USER_BLOSSOM_SERVER_LIST_KIND, "number");
    assertEquals(NSITE_KIND > 30000, true); // Replaceable events
    assertEquals(USER_BLOSSOM_SERVER_LIST_KIND > 10000, true); // Replaceable events
  });
});

Deno.test("Nostr Module - Event Template Validation", async (t) => {
  await t.step("should create events with valid timestamps", async () => {
    const profile: Profile = { name: "Test" };
    const event = await createProfileEvent(mockSigner, profile);
    
    const now = Math.floor(Date.now() / 1000);
    const eventTime = event.created_at;
    
    // Should be within reasonable time range (5 seconds)
    assertEquals(Math.abs(eventTime - now) < 5, true);
  });

  await t.step("should create events with proper structure", async () => {
    const event = await createProfileEvent(mockSigner, { name: "Test" });
    
    // Required fields
    assertExists(event.id);
    assertExists(event.pubkey);
    assertExists(event.created_at);
    assertExists(event.kind);
    assertExists(event.tags);
    assertExists(event.content);
    assertExists(event.sig);
    
    // Correct types
    assertEquals(typeof event.id, "string");
    assertEquals(typeof event.pubkey, "string");
    assertEquals(typeof event.created_at, "number");
    assertEquals(typeof event.kind, "number");
    assertEquals(Array.isArray(event.tags), true);
    assertEquals(typeof event.content, "string");
    assertEquals(typeof event.sig, "string");
  });
});