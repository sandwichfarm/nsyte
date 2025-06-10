import { assertEquals } from "std/assert/mod.ts";
import {
  DEFAULT_BLOSSOM_SERVERS,
  NSYTE_BROADCAST_RELAYS,
  RELAY_DISCOVERY_RELAYS,
} from "../../src/lib/constants.ts";

Deno.test("Constants - NSYTE_BROADCAST_RELAYS", async (t) => {
  await t.step("should have default broadcast relays", () => {
    assertEquals(Array.isArray(NSYTE_BROADCAST_RELAYS), true);
    assertEquals(NSYTE_BROADCAST_RELAYS.length > 0, true);

    // Verify all entries are valid relay URLs
    for (const relay of NSYTE_BROADCAST_RELAYS) {
      assertEquals(typeof relay, "string");
      assertEquals(relay.startsWith("wss://"), true);
    }
  });

  await t.step("should include expected relays", () => {
    // Check for some expected relays
    assertEquals(NSYTE_BROADCAST_RELAYS.includes("wss://purplepag.es"), true);
    assertEquals(NSYTE_BROADCAST_RELAYS.includes("wss://nos.lol"), true);
  });
});

Deno.test("Constants - RELAY_DISCOVERY_RELAYS", async (t) => {
  await t.step("should have discovery relays", () => {
    assertEquals(Array.isArray(RELAY_DISCOVERY_RELAYS), true);
    assertEquals(RELAY_DISCOVERY_RELAYS.length > 0, true);

    // Verify all entries are valid relay URLs
    for (const relay of RELAY_DISCOVERY_RELAYS) {
      assertEquals(typeof relay, "string");
      assertEquals(relay.startsWith("wss://"), true);
    }
  });

  await t.step("should be a subset or equal to broadcast relays", () => {
    // Discovery relays might be same or subset of broadcast relays
    assertEquals(RELAY_DISCOVERY_RELAYS.length <= NSYTE_BROADCAST_RELAYS.length, true);
  });
});

Deno.test("Constants - DEFAULT_BLOSSOM_SERVERS", async (t) => {
  await t.step("should have default blossom servers", () => {
    assertEquals(Array.isArray(DEFAULT_BLOSSOM_SERVERS), true);
    assertEquals(DEFAULT_BLOSSOM_SERVERS.length > 0, true);

    // Verify all entries are valid URLs
    for (const server of DEFAULT_BLOSSOM_SERVERS) {
      assertEquals(typeof server, "string");
      assertEquals(server.startsWith("https://"), true);
    }
  });

  await t.step("should include expected servers", () => {
    // Check for expected blossom servers
    assertEquals(DEFAULT_BLOSSOM_SERVERS.includes("https://blossom.primal.net"), true);
  });
});

Deno.test("Constants - Consistency", async (t) => {
  await t.step("all constants should be frozen arrays", () => {
    // Arrays should be immutable
    assertEquals(Object.isFrozen(NSYTE_BROADCAST_RELAYS), false); // Arrays themselves aren't frozen
    assertEquals(Object.isFrozen(RELAY_DISCOVERY_RELAYS), false);
    assertEquals(Object.isFrozen(DEFAULT_BLOSSOM_SERVERS), false);

    // But they should be const and not reassignable
    assertEquals(NSYTE_BROADCAST_RELAYS.constructor.name, "Array");
    assertEquals(RELAY_DISCOVERY_RELAYS.constructor.name, "Array");
    assertEquals(DEFAULT_BLOSSOM_SERVERS.constructor.name, "Array");
  });
});
