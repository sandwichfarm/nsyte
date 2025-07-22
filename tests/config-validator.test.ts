import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import {
  suggestConfigFixes,
  validateConfig,
  validateConfigWithFeedback,
} from "../src/lib/config-validator.ts";

Deno.test("Config Validator - Valid minimal config", () => {
  const config = {
    relays: ["wss://relay.damus.io"],
    servers: ["https://cdn.hzrd149.com"],
  };

  const result = validateConfig(config);
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("Config Validator - Valid full config", () => {
  const config = {
    relays: ["wss://relay.damus.io", "wss://nos.lol"],
    servers: ["https://cdn.hzrd149.com"],
    bunkerPubkey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    profile: {
      name: "Test Project",
      about: "A test project",
      picture: "https://example.com/avatar.png",
    },
    publishServerList: true,
    publishRelayList: false,
    publishFileMetadata: true,
    application: {
      id: "com.example.test",
      platforms: ["web", "linux"],
      license: "MIT",
    },
  };

  const result = validateConfig(config);
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("Config Validator - Invalid relay URLs", () => {
  const config = {
    relays: ["http://wrong-protocol.com", "not-a-url"],
    servers: ["https://cdn.hzrd149.com"],
  };

  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.length, 2);
  assertEquals(result.errors[0].path.includes("/relays/"), true);
});

Deno.test("Config Validator - Invalid server URLs", () => {
  const config = {
    relays: ["wss://relay.damus.io"],
    servers: ["ftp://wrong-protocol.com", "ws://not-http"],
  };

  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.length, 2);
  assertEquals(result.errors[0].path.includes("/servers/"), true);
});

Deno.test("Config Validator - Invalid bunker pubkey", () => {
  const config = {
    relays: ["wss://relay.damus.io"],
    servers: ["https://cdn.hzrd149.com"],
    bunkerPubkey: "invalid-hex",
  };

  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].path, "/bunkerPubkey");
});

Deno.test("Config Validator - Missing required fields", () => {
  const config = {
    servers: ["https://cdn.hzrd149.com"],
  };

  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].message.includes("relays"), true);
});

Deno.test("Config Validator - Invalid platform values", () => {
  const config = {
    relays: ["wss://relay.damus.io"],
    servers: ["https://cdn.hzrd149.com"],
    application: {
      id: "com.example.test",
      platforms: ["web", "invalid-platform"],
    },
  };

  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].path.includes("/platforms/"), true);
});

Deno.test("Config Validator - With feedback and suggestions", () => {
  const config = {
    relays: ["not-a-relay"],
    servers: ["ftp://wrong.com"],
    bunkerPubkey: "short",
    application: {
      platforms: ["invalid"],
    },
  };

  const feedback = validateConfigWithFeedback(config);
  assertEquals(feedback.valid, false);
  assertExists(feedback.errors);
  assertExists(feedback.suggestions);
  assertEquals(feedback.warnings.length, 0);

  // Check suggestions
  assertEquals(
    feedback.suggestions.includes("Relay URLs must start with 'wss://' or 'ws://'"),
    true,
  );
  assertEquals(
    feedback.suggestions.includes("Server URLs must start with 'https://' or 'http://'"),
    true,
  );
  assertEquals(
    feedback.suggestions.includes("Bunker public key must be a 64-character hex string"),
    true,
  );
});

Deno.test("Config Validator - App handler validation", () => {
  const invalidConfig = {
    relays: ["wss://relay.damus.io"],
    servers: ["https://cdn.hzrd149.com"],
    appHandler: {
      enabled: true,
      // Missing required 'kinds' field
    },
  };

  const result = validateConfig(invalidConfig);
  assertEquals(result.valid, false);

  const validConfig = {
    relays: ["wss://relay.damus.io"],
    servers: ["https://cdn.hzrd149.com"],
    appHandler: {
      enabled: true,
      kinds: [1, 30023],
      name: "Test Handler",
    },
  };

  const validResult = validateConfig(validConfig);
  assertEquals(validResult.valid, true);
});

Deno.test("Config Validator - Event kind range validation", () => {
  const config = {
    relays: ["wss://relay.damus.io"],
    servers: ["https://cdn.hzrd149.com"],
    appHandler: {
      enabled: true,
      kinds: [1, 30023, 99999], // 99999 is out of range
    },
  };

  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].path.includes("/kinds/"), true);
});
