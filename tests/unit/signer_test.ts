import { assertEquals, assertExists, assertRejects, assertThrows } from "std/assert/mod.ts";
import { PrivateKeySigner } from "../../src/lib/signer.ts";
import type { NostrEventTemplate } from "../../src/lib/nostr.ts";

Deno.test("PrivateKeySigner - Constructor", async (t) => {
  await t.step("should create signer with hex private key", () => {
    const privateKeyHex = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const signer = new PrivateKeySigner(privateKeyHex);
    
    assertExists(signer);
    assertEquals(signer instanceof PrivateKeySigner, true);
  });

  await t.step("should create signer with nsec private key", () => {
    // This is a test nsec key (do not use in production)
    // nsec for all zeros private key
    const nsecKey = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsscfuwn";
    const signer = new PrivateKeySigner(nsecKey);
    
    assertExists(signer);
    assertEquals(signer instanceof PrivateKeySigner, true);
  });

  await t.step("should throw on invalid hex key", () => {
    assertThrows(
      () => new PrivateKeySigner("invalid-hex"),
      Error,
      "Private key must be a 64-character hex string"
    );
    
    assertThrows(
      () => new PrivateKeySigner("12345"), // Too short
      Error,
      "Private key must be a 64-character hex string"
    );
    
    assertThrows(
      () => new PrivateKeySigner("gg" + "0".repeat(62)), // Invalid hex chars
      Error,
      "Private key must be a 64-character hex string"
    );
  });

  await t.step("should throw on invalid nsec key", () => {
    assertThrows(
      () => new PrivateKeySigner("nsec1invalid"),
      Error,
      "Invalid nsec key format"
    );
    
    assertThrows(
      () => new PrivateKeySigner("npub1234567890"), // Wrong prefix
      Error,
      "Private key must be a 64-character hex string"
    );
  });

  await t.step("should handle uppercase hex key", () => {
    const privateKeyUpper = "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";
    const signer = new PrivateKeySigner(privateKeyUpper);
    
    assertExists(signer);
  });
});

Deno.test("PrivateKeySigner - getPublicKey", async (t) => {
  await t.step("should return consistent public key", () => {
    const privateKey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const signer = new PrivateKeySigner(privateKey);
    
    const pubkey1 = signer.getPublicKey();
    const pubkey2 = signer.getPublicKey();
    
    assertEquals(pubkey1, pubkey2);
    assertEquals(typeof pubkey1, "string");
    assertEquals(pubkey1.length, 64); // 32 bytes hex encoded
  });

  await t.step("should return valid hex public key", () => {
    const privateKey = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const signer = new PrivateKeySigner(privateKey);
    
    const pubkey = signer.getPublicKey();
    
    // Should be valid hex
    assertEquals(/^[0-9a-f]{64}$/.test(pubkey), true);
  });

  await t.step("should derive same public key from same private key", () => {
    const privateKey = "deadbeef" + "0".repeat(56);
    
    const signer1 = new PrivateKeySigner(privateKey);
    const signer2 = new PrivateKeySigner(privateKey);
    
    assertEquals(signer1.getPublicKey(), signer2.getPublicKey());
  });
});

Deno.test("PrivateKeySigner - signEvent", async (t) => {
  await t.step("should sign event template", async () => {
    const privateKey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const signer = new PrivateKeySigner(privateKey);
    
    const template: NostrEventTemplate = {
      kind: 1,
      created_at: 1234567890,
      tags: [["p", "pubkey123"], ["t", "test"]],
      content: "Test event content"
    };
    
    const signedEvent = await signer.signEvent(template);
    
    assertExists(signedEvent);
    assertExists(signedEvent.id);
    assertExists(signedEvent.pubkey);
    assertExists(signedEvent.sig);
    
    assertEquals(signedEvent.kind, template.kind);
    assertEquals(signedEvent.created_at, template.created_at);
    assertEquals(signedEvent.tags, template.tags);
    assertEquals(signedEvent.content, template.content);
  });

  await t.step("should add pubkey to signed event", async () => {
    const privateKey = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const signer = new PrivateKeySigner(privateKey);
    
    const template: NostrEventTemplate = {
      kind: 0,
      created_at: Date.now(),
      tags: [],
      content: "{}"
    };
    
    const signedEvent = await signer.signEvent(template);
    
    assertEquals(signedEvent.pubkey, signer.getPublicKey());
  });

  await t.step("should generate valid event ID", async () => {
    const privateKey = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    const signer = new PrivateKeySigner(privateKey);
    
    const template: NostrEventTemplate = {
      kind: 1,
      created_at: 1000000000,
      tags: [],
      content: "Hello Nostr"
    };
    
    const signedEvent = await signer.signEvent(template);
    
    // Event ID should be 64-char hex string (32 bytes)
    assertEquals(typeof signedEvent.id, "string");
    assertEquals(signedEvent.id.length, 64);
    assertEquals(/^[0-9a-f]{64}$/.test(signedEvent.id), true);
  });

  await t.step("should generate valid signature", async () => {
    const privateKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const signer = new PrivateKeySigner(privateKey);
    
    const template: NostrEventTemplate = {
      kind: 1,
      created_at: 1234567890,
      tags: [],
      content: "Test message"
    };
    
    const signedEvent = await signer.signEvent(template);
    
    // Signature should be 128-char hex string (64 bytes)
    assertEquals(typeof signedEvent.sig, "string");
    assertEquals(signedEvent.sig.length, 128);
    assertEquals(/^[0-9a-f]{128}$/.test(signedEvent.sig), true);
  });

  await t.step("should sign different events differently", async () => {
    const privateKey = "1111111111111111111111111111111111111111111111111111111111111111";
    const signer = new PrivateKeySigner(privateKey);
    
    const template1: NostrEventTemplate = {
      kind: 1,
      created_at: 1000000000,
      tags: [],
      content: "Message 1"
    };
    
    const template2: NostrEventTemplate = {
      kind: 1,
      created_at: 1000000001, // Different timestamp
      tags: [],
      content: "Message 1" // Same content
    };
    
    const event1 = await signer.signEvent(template1);
    const event2 = await signer.signEvent(template2);
    
    // Different events should have different IDs and signatures
    assertEquals(event1.id !== event2.id, true);
    assertEquals(event1.sig !== event2.sig, true);
  });

  await t.step("should handle events with complex tags", async () => {
    const privateKey = "2222222222222222222222222222222222222222222222222222222222222222";
    const signer = new PrivateKeySigner(privateKey);
    
    const template: NostrEventTemplate = {
      kind: 1,
      created_at: 1234567890,
      tags: [
        ["p", "pubkey1", "relay1"],
        ["e", "eventid1", "relay2", "marker"],
        ["t", "hashtag"],
        ["custom", "value1", "value2", "value3"]
      ],
      content: "Complex event"
    };
    
    const signedEvent = await signer.signEvent(template);
    
    assertExists(signedEvent);
    assertEquals(signedEvent.tags.length, 4);
    assertEquals(signedEvent.tags[0][0], "p");
    assertEquals(signedEvent.tags[3].length, 4);
  });

  await t.step("should handle events with empty content", async () => {
    const privateKey = "3333333333333333333333333333333333333333333333333333333333333333";
    const signer = new PrivateKeySigner(privateKey);
    
    const template: NostrEventTemplate = {
      kind: 3,
      created_at: Date.now(),
      tags: [["p", "follow1"], ["p", "follow2"]],
      content: ""
    };
    
    const signedEvent = await signer.signEvent(template);
    
    assertExists(signedEvent);
    assertEquals(signedEvent.content, "");
  });

  await t.step("should handle events with JSON content", async () => {
    const privateKey = "4444444444444444444444444444444444444444444444444444444444444444";
    const signer = new PrivateKeySigner(privateKey);
    
    const profileData = {
      name: "Test User",
      about: "Test profile",
      picture: "https://example.com/pic.jpg"
    };
    
    const template: NostrEventTemplate = {
      kind: 0,
      created_at: Date.now(),
      tags: [],
      content: JSON.stringify(profileData)
    };
    
    const signedEvent = await signer.signEvent(template);
    
    assertExists(signedEvent);
    assertEquals(signedEvent.content, JSON.stringify(profileData));
    
    // Content should be parseable
    const parsed = JSON.parse(signedEvent.content);
    assertEquals(parsed.name, "Test User");
  });
});

Deno.test("PrivateKeySigner - Error Handling", async (t) => {
  await t.step("should handle empty private key", () => {
    assertThrows(
      () => new PrivateKeySigner(""),
      Error,
      "Private key must be a 64-character hex string"
    );
  });

  await t.step("should handle null/undefined in constructor", () => {
    assertThrows(
      () => new PrivateKeySigner(null as any),
      Error
    );
    
    assertThrows(
      () => new PrivateKeySigner(undefined as any),
      Error
    );
  });

  await t.step("should maintain immutability", async () => {
    const privateKey = "5555555555555555555555555555555555555555555555555555555555555555";
    const signer = new PrivateKeySigner(privateKey);
    
    const template: NostrEventTemplate = {
      kind: 1,
      created_at: 1234567890,
      tags: [["test", "value"]],
      content: "Original content"
    };
    
    const originalTags = [...template.tags];
    const originalContent = template.content;
    
    await signer.signEvent(template);
    
    // Original template should not be modified
    assertEquals(template.tags, originalTags);
    assertEquals(template.content, originalContent);
    assertEquals((template as any).pubkey, undefined);
    assertEquals((template as any).id, undefined);
    assertEquals((template as any).sig, undefined);
  });
});