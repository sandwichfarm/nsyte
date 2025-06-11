import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { stub } from "std/testing/mock.ts";
import {
  createSigner,
  parseCommaSeparated,
  resolvePubkey,
  resolveRelays,
  type ResolverOptions,
  resolveServers,
} from "../../src/lib/resolver-utils.ts";
import type { ProjectConfig } from "../../src/lib/config.ts";
import { NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "../../src/lib/constants.ts";

Deno.test("parseCommaSeparated", async (t) => {
  await t.step("should parse comma-separated values", () => {
    assertEquals(parseCommaSeparated("a,b,c"), ["a", "b", "c"]);
    assertEquals(parseCommaSeparated("one, two, three"), ["one", "two", "three"]);
    assertEquals(parseCommaSeparated("  spaced  ,  values  "), ["spaced", "values"]);
  });

  await t.step("should handle single value", () => {
    assertEquals(parseCommaSeparated("single"), ["single"]);
    assertEquals(parseCommaSeparated("  single  "), ["single"]);
  });

  await t.step("should handle empty values", () => {
    assertEquals(parseCommaSeparated(""), []);
    assertEquals(parseCommaSeparated("  "), []);
    assertEquals(parseCommaSeparated("a,,b"), ["a", "b"]);
    assertEquals(parseCommaSeparated(",a,b,"), ["a", "b"]);
  });

  await t.step("should handle undefined", () => {
    assertEquals(parseCommaSeparated(undefined), []);
  });

  await t.step("should handle complex URLs", () => {
    const urls = "https://server1.com,wss://relay.example.com:443,https://server2.com/path";
    assertEquals(parseCommaSeparated(urls), [
      "https://server1.com",
      "wss://relay.example.com:443",
      "https://server2.com/path",
    ]);
  });
});

Deno.test("resolveRelays", async (t) => {
  await t.step("should use relays from options first", () => {
    const options: ResolverOptions = {
      relays: "wss://relay1.com,wss://relay2.com",
    };
    const config: ProjectConfig = {
      relays: ["wss://config-relay.com"],
      servers: [],
      bunkerPubkey: null,
    };

    const relays = resolveRelays(options, config);
    assertEquals(relays, ["wss://relay1.com", "wss://relay2.com"]);
  });

  await t.step("should use relays from config if no options", () => {
    const options: ResolverOptions = {};
    const config: ProjectConfig = {
      relays: ["wss://config-relay1.com", "wss://config-relay2.com"],
      servers: [],
      bunkerPubkey: null,
    };

    const relays = resolveRelays(options, config);
    assertEquals(relays, ["wss://config-relay1.com", "wss://config-relay2.com"]);
  });

  await t.step("should use default broadcast relays if no options or config", () => {
    const options: ResolverOptions = {};
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: null,
    };

    const relays = resolveRelays(options, config, false);
    assertEquals(relays, NSYTE_BROADCAST_RELAYS);
  });

  await t.step("should use discovery relays when specified", () => {
    const options: ResolverOptions = {};
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: null,
    };

    const relays = resolveRelays(options, config, true);
    assertEquals(relays, RELAY_DISCOVERY_RELAYS);
  });

  await t.step("should handle null config", () => {
    const options: ResolverOptions = {};

    const relays = resolveRelays(options, null);
    assertEquals(relays, NSYTE_BROADCAST_RELAYS);
  });

  await t.step("should handle empty relay string in options", () => {
    const options: ResolverOptions = {
      relays: "",
    };
    const config: ProjectConfig = {
      relays: ["wss://config-relay.com"],
      servers: [],
      bunkerPubkey: null,
    };

    const relays = resolveRelays(options, config);
    assertEquals(relays, []); // Empty string results in empty array
  });
});

Deno.test("resolveServers", async (t) => {
  await t.step("should use servers from options first", () => {
    const options: ResolverOptions = {
      servers: "https://server1.com,https://server2.com",
    };
    const config: ProjectConfig = {
      relays: [],
      servers: ["https://config-server.com"],
      bunkerPubkey: null,
    };

    const servers = resolveServers(options, config);
    assertEquals(servers, ["https://server1.com", "https://server2.com"]);
  });

  await t.step("should use servers from config if no options", () => {
    const options: ResolverOptions = {};
    const config: ProjectConfig = {
      relays: [],
      servers: ["https://config-server1.com", "https://config-server2.com"],
      bunkerPubkey: null,
    };

    const servers = resolveServers(options, config);
    assertEquals(servers, ["https://config-server1.com", "https://config-server2.com"]);
  });

  await t.step("should return empty array if no servers configured", () => {
    const options: ResolverOptions = {};
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: null,
    };

    const servers = resolveServers(options, config);
    assertEquals(servers, []);
  });

  await t.step("should handle null config", () => {
    const options: ResolverOptions = {};

    const servers = resolveServers(options, null);
    assertEquals(servers, []);
  });

  await t.step("should handle empty server string in options", () => {
    const options: ResolverOptions = {
      servers: "",
    };
    const config: ProjectConfig = {
      relays: [],
      servers: ["https://config-server.com"],
      bunkerPubkey: null,
    };

    const servers = resolveServers(options, config);
    assertEquals(servers, []); // Empty string results in empty array
  });
});

Deno.test("resolvePubkey", async (t) => {
  await t.step("should use explicit pubkey from options", async () => {
    const options: ResolverOptions = {
      pubkey: "pubkey123abc",
    };

    const pubkey = await resolvePubkey(options, null, false);
    assertEquals(pubkey, "pubkey123abc");
  });

  await t.step("should derive pubkey from private key", async () => {
    const options: ResolverOptions = {
      privatekey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    };

    const pubkey = await resolvePubkey(options, null, false);
    assertExists(pubkey);
    assertEquals(typeof pubkey, "string");
    assertEquals(pubkey.length, 64); // Hex pubkey
  });

  await t.step("should use bunker pubkey from config", async () => {
    const options: ResolverOptions = {};
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: "bunker-pubkey-123",
    };

    const pubkey = await resolvePubkey(options, config, false);
    assertEquals(pubkey, "bunker-pubkey-123");
  });

  await t.step("should throw error in non-interactive mode without pubkey", async () => {
    const options: ResolverOptions = {};
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: null,
    };

    await assertRejects(
      async () => await resolvePubkey(options, config, false),
      Error,
      "No public key available",
    );
  });

  await t.step("should prioritize options over config", async () => {
    const options: ResolverOptions = {
      pubkey: "explicit-pubkey",
    };
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: "config-bunker-pubkey",
    };

    const pubkey = await resolvePubkey(options, config, false);
    assertEquals(pubkey, "explicit-pubkey");
  });

  await t.step("should prioritize privatekey over bunker in config", async () => {
    const options: ResolverOptions = {
      privatekey: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    };
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: "config-bunker-pubkey",
    };

    const pubkey = await resolvePubkey(options, config, false);
    assertExists(pubkey);
    assertEquals(pubkey !== "config-bunker-pubkey", true);
  });
});

Deno.test("createSigner", async (t) => {
  await t.step("should create signer from private key", async () => {
    const options: ResolverOptions = {
      privatekey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    };

    const signer = await createSigner(options, null);
    assertExists(signer);
    assertEquals(typeof signer.getPublicKey, "function");
    assertEquals(typeof signer.signEvent, "function");
  });

  await t.step("should return null if no signer options provided", async () => {
    const options: ResolverOptions = {};
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: null,
    };

    const signer = await createSigner(options, config);
    assertEquals(signer, null);
  });

  await t.step("should handle nbunksec option", async () => {
    const options: ResolverOptions = {
      nbunksec: "invalid-nbunk-string",
    };

    // This should throw for invalid nbunk format
    await assertRejects(
      async () => await createSigner(options, null),
      Error,
      "Failed to decode nbunksec string",
    );
  });

  await t.step("should handle bunker URL option", async () => {
    const options: ResolverOptions = {
      bunker: "invalid-bunker-url",
    };

    // This should throw for invalid bunker URL format
    await assertRejects(
      async () => await createSigner(options, null),
      Error,
      "Failed to connect to bunker",
    );
  });
});

Deno.test("ResolverOptions interface", async (t) => {
  await t.step("should accept all option types", () => {
    const options: ResolverOptions = {
      relays: "wss://relay1.com,wss://relay2.com",
      servers: "https://server1.com,https://server2.com",
      privatekey: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      pubkey: "pubkey123",
      bunker: "bunker://pubkey?relay=wss://relay.com",
      nbunksec: "nbunksec1...",
    };

    assertExists(options.relays);
    assertExists(options.servers);
    assertExists(options.privatekey);
    assertExists(options.pubkey);
    assertExists(options.bunker);
    assertExists(options.nbunksec);
  });

  await t.step("should accept partial options", () => {
    const options1: ResolverOptions = { relays: "wss://relay.com" };
    const options2: ResolverOptions = { privatekey: "key123" };
    const options3: ResolverOptions = {};

    assertEquals(Object.keys(options1).length, 1);
    assertEquals(Object.keys(options2).length, 1);
    assertEquals(Object.keys(options3).length, 0);
  });
});

Deno.test("Priority Resolution", async (t) => {
  await t.step("should follow correct priority for relays", () => {
    // Options > Config > Defaults
    const options1: ResolverOptions = { relays: "wss://option-relay.com" };
    const config1: ProjectConfig = {
      relays: ["wss://config-relay.com"],
      servers: [],
      bunkerPubkey: null,
    };

    assertEquals(resolveRelays(options1, config1), ["wss://option-relay.com"]);

    const options2: ResolverOptions = {};
    assertEquals(resolveRelays(options2, config1), ["wss://config-relay.com"]);

    const config2: ProjectConfig = {
      relays: [],
      servers: [],
      bunkerPubkey: null,
    };
    assertEquals(resolveRelays(options2, config2), NSYTE_BROADCAST_RELAYS);
  });

  await t.step("should follow correct priority for servers", () => {
    // Options > Config
    const options1: ResolverOptions = { servers: "https://option-server.com" };
    const config1: ProjectConfig = {
      relays: [],
      servers: ["https://config-server.com"],
      bunkerPubkey: null,
    };

    assertEquals(resolveServers(options1, config1), ["https://option-server.com"]);

    const options2: ResolverOptions = {};
    assertEquals(resolveServers(options2, config1), ["https://config-server.com"]);
  });
});
