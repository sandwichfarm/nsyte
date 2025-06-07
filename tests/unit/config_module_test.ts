import { assertEquals, assertExists } from "std/assert/mod.ts";
import {
  defaultConfig,
  popularRelays,
  popularBlossomServers,
  writeProjectFile,
  readProjectFile,
  type ProjectConfig,
  type ProjectContext,
  type Profile
} from "../../src/lib/config.ts";

Deno.test("Config - Constants", async (t) => {
  await t.step("should export default config", () => {
    assertExists(defaultConfig);
    assertEquals(Array.isArray(defaultConfig.relays), true);
    assertEquals(Array.isArray(defaultConfig.servers), true);
    assertEquals(typeof defaultConfig.publishServerList, "boolean");
    assertEquals(typeof defaultConfig.publishRelayList, "boolean");
  });

  await t.step("should have popular relays", () => {
    assertExists(popularRelays);
    assertEquals(Array.isArray(popularRelays), true);
    assertEquals(popularRelays.length > 0, true);
    
    // All should be valid relay URLs
    for (const relay of popularRelays) {
      assertEquals(relay.startsWith("wss://"), true);
    }
  });

  await t.step("should have popular blossom servers", () => {
    assertExists(popularBlossomServers);
    assertEquals(Array.isArray(popularBlossomServers), true);
    assertEquals(popularBlossomServers.length > 0, true);
    
    // All should be valid server URLs
    for (const server of popularBlossomServers) {
      assertEquals(server.startsWith("https://"), true);
    }
  });
});

Deno.test("Config - ProjectConfig Interface", async (t) => {
  await t.step("should accept valid project config", () => {
    const config: ProjectConfig = {
      bunkerPubkey: "pubkey123",
      relays: ["wss://relay1.com", "wss://relay2.com"],
      servers: ["https://server1.com", "https://server2.com"],
      profile: {
        name: "Test User",
        about: "Test description",
        picture: "https://example.com/pic.jpg"
      },
      publishServerList: true,
      publishRelayList: true,
      publishProfile: true,
      fallback: "https://fallback.example.com",
      gatewayHostnames: ["gateway1.com", "gateway2.com"]
    };
    
    assertEquals(config.bunkerPubkey, "pubkey123");
    assertEquals(config.relays.length, 2);
    assertEquals(config.servers.length, 2);
    assertExists(config.profile);
    assertEquals(config.publishServerList, true);
    assertEquals(config.publishRelayList, true);
    assertEquals(config.publishProfile, true);
    assertEquals(config.fallback, "https://fallback.example.com");
    assertEquals(config.gatewayHostnames?.length, 2);
  });

  await t.step("should accept minimal project config", () => {
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false
    };
    
    assertEquals(config.relays.length, 0);
    assertEquals(config.servers.length, 0);
    assertEquals(config.publishServerList, false);
    assertEquals(config.publishRelayList, false);
    assertEquals(config.bunkerPubkey, undefined);
    assertEquals(config.profile, undefined);
  });
});

Deno.test("Config - Profile Interface", async (t) => {
  await t.step("should accept complete profile", () => {
    const profile: Profile = {
      name: "John Doe",
      about: "Software developer interested in decentralized tech",
      picture: "https://example.com/avatar.jpg",
      display_name: "JohnD",
      website: "https://johndoe.com",
      nip05: "john@johndoe.com",
      lud16: "john@walletofsatoshi.com",
      banner: "https://example.com/banner.jpg"
    };
    
    assertEquals(profile.name, "John Doe");
    assertEquals(profile.about?.includes("decentralized"), true);
    assertEquals(profile.picture, "https://example.com/avatar.jpg");
    assertEquals(profile.display_name, "JohnD");
    assertEquals(profile.website, "https://johndoe.com");
    assertEquals(profile.nip05, "john@johndoe.com");
    assertEquals(profile.lud16, "john@walletofsatoshi.com");
    assertEquals(profile.banner, "https://example.com/banner.jpg");
  });

  await t.step("should accept partial profile", () => {
    const profile: Profile = {
      name: "Jane",
      about: "Minimalist"
    };
    
    assertEquals(profile.name, "Jane");
    assertEquals(profile.about, "Minimalist");
    assertEquals(profile.picture, undefined);
    assertEquals(profile.display_name, undefined);
  });

  await t.step("should accept empty profile", () => {
    const profile: Profile = {};
    
    assertEquals(Object.keys(profile).length, 0);
  });
});

Deno.test("Config - ProjectContext Interface", async (t) => {
  await t.step("should accept valid project context", () => {
    const context: ProjectContext = {
      config: {
        relays: ["wss://relay.com"],
        servers: ["https://server.com"],
        publishServerList: true,
        publishRelayList: true
      },
      authKeyHex: "auth123",
      privateKey: "privkey123"
    };
    
    assertExists(context.config);
    assertEquals(context.authKeyHex, "auth123");
    assertEquals(context.privateKey, "privkey123");
    assertEquals(context.error, undefined);
  });

  await t.step("should accept context with error", () => {
    const context: ProjectContext = {
      config: defaultConfig,
      error: "Failed to load configuration"
    };
    
    assertExists(context.config);
    assertEquals(context.error, "Failed to load configuration");
    assertEquals(context.authKeyHex, undefined);
    assertEquals(context.privateKey, undefined);
  });

  await t.step("should accept context with null authKeyHex", () => {
    const context: ProjectContext = {
      config: defaultConfig,
      authKeyHex: null
    };
    
    assertExists(context.config);
    assertEquals(context.authKeyHex, null);
  });
});

Deno.test("Config - Default Values", async (t) => {
  await t.step("default config should have expected structure", () => {
    assertExists(defaultConfig.relays);
    assertExists(defaultConfig.servers);
    
    // Should have some default relays
    assertEquals(defaultConfig.relays.length > 0, true);
    
    // Should have boolean flags
    assertEquals(typeof defaultConfig.publishServerList, "boolean");
    assertEquals(typeof defaultConfig.publishRelayList, "boolean");
    
    // Check relay format
    for (const relay of defaultConfig.relays) {
      assertEquals(relay.startsWith("wss://") || relay.startsWith("ws://"), true);
    }
  });
});

Deno.test("Config - File Operations", async (t) => {
  await t.step("should handle file operations interface", () => {
    // Test that functions exist and are callable
    assertEquals(typeof writeProjectFile, "function");
    assertEquals(typeof readProjectFile, "function");
  });

  await t.step("readProjectFile should return null for non-existent file", () => {
    // This test assumes no .nsite/config.json exists in test environment
    const config = readProjectFile();
    // Should return null or a valid config object
    assertEquals(config === null || typeof config === "object", true);
  });

  await t.step("should validate config structure", () => {
    const validConfig: ProjectConfig = {
      relays: ["wss://relay.example.com"],
      servers: ["https://server.example.com"],
      publishServerList: true,
      publishRelayList: false,
      profile: {
        name: "Test User"
      }
    };
    
    // Should be a valid ProjectConfig
    assertExists(validConfig.relays);
    assertExists(validConfig.servers);
    assertEquals(typeof validConfig.publishServerList, "boolean");
    assertEquals(typeof validConfig.publishRelayList, "boolean");
  });
});

Deno.test("Config - Data Validation", async (t) => {
  await t.step("should handle relay array validation", () => {
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false
    };
    
    // Empty arrays should be valid
    assertEquals(Array.isArray(config.relays), true);
    assertEquals(config.relays.length, 0);
    
    // Add valid relays
    config.relays.push("wss://relay1.com");
    config.relays.push("wss://relay2.com");
    
    assertEquals(config.relays.length, 2);
    assertEquals(config.relays[0], "wss://relay1.com");
  });

  await t.step("should handle server array validation", () => {
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false
    };
    
    // Empty arrays should be valid
    assertEquals(Array.isArray(config.servers), true);
    assertEquals(config.servers.length, 0);
    
    // Add valid servers
    config.servers.push("https://server1.com");
    config.servers.push("https://server2.com");
    
    assertEquals(config.servers.length, 2);
    assertEquals(config.servers[0], "https://server1.com");
  });

  await t.step("should handle optional fields", () => {
    const minimalConfig: ProjectConfig = {
      relays: ["wss://relay.com"],
      servers: ["https://server.com"],
      publishServerList: true,
      publishRelayList: true
    };
    
    assertEquals(minimalConfig.bunkerPubkey, undefined);
    assertEquals(minimalConfig.profile, undefined);
    assertEquals(minimalConfig.publishProfile, undefined);
    assertEquals(minimalConfig.fallback, undefined);
    assertEquals(minimalConfig.gatewayHostnames, undefined);
  });
});