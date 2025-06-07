import { assertEquals, assertExists, assertRejects, assertThrows } from "std/assert/mod.ts";
import { stub } from "std/testing/mock.ts";
import type { ProjectConfig, Profile } from "../../src/lib/config.ts";

Deno.test("Configuration Handling - Validation", async (t) => {
  await t.step("should validate relay URLs", () => {
    const validateRelayUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "wss:" || parsed.protocol === "ws:";
      } catch {
        return false;
      }
    };

    // Valid relay URLs
    assertEquals(validateRelayUrl("wss://relay.example.com"), true);
    assertEquals(validateRelayUrl("ws://localhost:8080"), true);
    assertEquals(validateRelayUrl("wss://relay.domain.com:443/path"), true);

    // Invalid relay URLs
    assertEquals(validateRelayUrl("https://not-a-relay.com"), false);
    assertEquals(validateRelayUrl("invalid-url"), false);
    assertEquals(validateRelayUrl(""), false);
    assertEquals(validateRelayUrl("ftp://wrong-protocol.com"), false);
  });

  await t.step("should validate server URLs", () => {
    const validateServerUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    };

    // Valid server URLs
    assertEquals(validateServerUrl("https://server.example.com"), true);
    assertEquals(validateServerUrl("http://localhost:3000"), true);
    assertEquals(validateServerUrl("https://api.domain.com/blossom"), true);

    // Invalid server URLs
    assertEquals(validateServerUrl("wss://not-a-server.com"), false);
    assertEquals(validateServerUrl("invalid-url"), false);
    assertEquals(validateServerUrl(""), false);
    assertEquals(validateServerUrl("ftp://wrong-protocol.com"), false);
  });

  await t.step("should validate profile data", () => {
    const validateProfile = (profile: Profile) => {
      const errors: string[] = [];

      if (profile.name && profile.name.length > 100) {
        errors.push("Name too long (max 100 characters)");
      }

      if (profile.about && profile.about.length > 500) {
        errors.push("About too long (max 500 characters)");
      }

      if (profile.website) {
        try {
          new URL(profile.website);
        } catch {
          errors.push("Invalid website URL");
        }
      }

      if (profile.picture) {
        try {
          new URL(profile.picture);
        } catch {
          errors.push("Invalid picture URL");
        }
      }

      if (profile.nip05 && !profile.nip05.includes("@")) {
        errors.push("Invalid NIP-05 format (should be name@domain)");
      }

      return errors;
    };

    // Valid profile
    const validProfile: Profile = {
      name: "John Doe",
      about: "Software developer",
      website: "https://johndoe.com",
      picture: "https://example.com/avatar.jpg",
      nip05: "john@johndoe.com"
    };
    assertEquals(validateProfile(validProfile), []);

    // Invalid profile
    const invalidProfile: Profile = {
      name: "x".repeat(101), // Too long
      website: "not-a-url",
      picture: "also-not-a-url",
      nip05: "invalid-nip05"
    };
    const errors = validateProfile(invalidProfile);
    assertEquals(errors.length > 0, true);
    assertEquals(errors.some(e => e.includes("Name too long")), true);
    assertEquals(errors.some(e => e.includes("Invalid website URL")), true);
  });
});

Deno.test("Configuration Handling - Migration", async (t) => {
  await t.step("should migrate old config format", () => {
    const migrateConfig = (oldConfig: any): ProjectConfig => {
      // Handle legacy config structure
      const newConfig: ProjectConfig = {
        relays: [],
        servers: [],
        publishServerList: false,
        publishRelayList: false
      };

      // Migrate relays
      if (oldConfig.relays && Array.isArray(oldConfig.relays)) {
        newConfig.relays = oldConfig.relays.filter((r: any) => typeof r === "string");
      } else if (oldConfig.relay && typeof oldConfig.relay === "string") {
        newConfig.relays = [oldConfig.relay];
      }

      // Migrate servers
      if (oldConfig.servers && Array.isArray(oldConfig.servers)) {
        newConfig.servers = oldConfig.servers.filter((s: any) => typeof s === "string");
      } else if (oldConfig.server && typeof oldConfig.server === "string") {
        newConfig.servers = [oldConfig.server];
      }

      // Migrate bunker settings
      if (oldConfig.bunkerPubkey) {
        newConfig.bunkerPubkey = oldConfig.bunkerPubkey;
      }

      // Migrate publish settings
      newConfig.publishServerList = Boolean(oldConfig.publishServerList);
      newConfig.publishRelayList = Boolean(oldConfig.publishRelayList);

      // Migrate profile
      if (oldConfig.profile && typeof oldConfig.profile === "object") {
        newConfig.profile = { ...oldConfig.profile };
      }

      return newConfig;
    };

    // Test migration from old format
    const oldConfig = {
      relay: "wss://old-relay.com", // Single relay (old format)
      servers: ["https://server1.com", "https://server2.com"],
      bunkerPubkey: "pubkey123",
      publishServerList: true,
      profile: { name: "Test User" }
    };

    const migrated = migrateConfig(oldConfig);
    assertEquals(migrated.relays, ["wss://old-relay.com"]);
    assertEquals(migrated.servers, ["https://server1.com", "https://server2.com"]);
    assertEquals(migrated.bunkerPubkey, "pubkey123");
    assertEquals(migrated.publishServerList, true);
    assertEquals(migrated.profile?.name, "Test User");

    // Test migration with array format
    const newFormatConfig = {
      relays: ["wss://relay1.com", "wss://relay2.com"],
      servers: ["https://server.com"]
    };

    const migrated2 = migrateConfig(newFormatConfig);
    assertEquals(migrated2.relays, ["wss://relay1.com", "wss://relay2.com"]);
    assertEquals(migrated2.servers, ["https://server.com"]);
  });

  await t.step("should handle config versioning", () => {
    const addVersionToConfig = (config: ProjectConfig): ProjectConfig & { version: string } => {
      return {
        ...config,
        version: "1.0.0"
      };
    };

    const checkConfigVersion = (config: any): boolean => {
      return typeof config.version === "string" && /^\d+\.\d+\.\d+$/.test(config.version);
    };

    const baseConfig: ProjectConfig = {
      relays: ["wss://relay.com"],
      servers: ["https://server.com"],
      publishServerList: true,
      publishRelayList: false
    };

    const versionedConfig = addVersionToConfig(baseConfig);
    assertEquals(versionedConfig.version, "1.0.0");
    assertEquals(checkConfigVersion(versionedConfig), true);

    // Test invalid versions
    assertEquals(checkConfigVersion({ version: "invalid" }), false);
    assertEquals(checkConfigVersion({ version: 123 }), false);
    assertEquals(checkConfigVersion({}), false);
  });
});

Deno.test("Configuration Handling - Environment Override", async (t) => {
  await t.step("should handle environment variable overrides", () => {
    const applyEnvironmentOverrides = (config: ProjectConfig, env: Record<string, string>) => {
      const overriddenConfig = { ...config };

      // Override relays from environment
      if (env.NSITE_RELAYS) {
        overriddenConfig.relays = env.NSITE_RELAYS.split(",").map(r => r.trim());
      }

      // Override servers from environment
      if (env.NSITE_SERVERS) {
        overriddenConfig.servers = env.NSITE_SERVERS.split(",").map(s => s.trim());
      }

      // Override publish settings
      if (env.NSITE_PUBLISH_RELAYS) {
        overriddenConfig.publishRelayList = env.NSITE_PUBLISH_RELAYS.toLowerCase() === "true";
      }

      if (env.NSITE_PUBLISH_SERVERS) {
        overriddenConfig.publishServerList = env.NSITE_PUBLISH_SERVERS.toLowerCase() === "true";
      }

      // Override bunker pubkey
      if (env.NSITE_BUNKER_PUBKEY) {
        overriddenConfig.bunkerPubkey = env.NSITE_BUNKER_PUBKEY;
      }

      return overriddenConfig;
    };

    const baseConfig: ProjectConfig = {
      relays: ["wss://default-relay.com"],
      servers: ["https://default-server.com"],
      publishServerList: false,
      publishRelayList: false
    };

    const env = {
      NSITE_RELAYS: "wss://env-relay1.com,wss://env-relay2.com",
      NSITE_SERVERS: "https://env-server.com",
      NSITE_PUBLISH_RELAYS: "true",
      NSITE_BUNKER_PUBKEY: "env-pubkey"
    };

    const overriddenConfig = applyEnvironmentOverrides(baseConfig, env);

    assertEquals(overriddenConfig.relays, ["wss://env-relay1.com", "wss://env-relay2.com"]);
    assertEquals(overriddenConfig.servers, ["https://env-server.com"]);
    assertEquals(overriddenConfig.publishRelayList, true);
    assertEquals(overriddenConfig.bunkerPubkey, "env-pubkey");
    assertEquals(overriddenConfig.publishServerList, false); // Not overridden
  });

  await t.step("should validate environment overrides", () => {
    const validateEnvironmentOverrides = (env: Record<string, string>) => {
      const errors: string[] = [];

      if (env.NSITE_RELAYS) {
        const relays = env.NSITE_RELAYS.split(",").map(r => r.trim());
        for (const relay of relays) {
          try {
            const url = new URL(relay);
            if (url.protocol !== "wss:" && url.protocol !== "ws:") {
              errors.push(`Invalid relay protocol: ${relay}`);
            }
          } catch {
            errors.push(`Invalid relay URL: ${relay}`);
          }
        }
      }

      if (env.NSITE_SERVERS) {
        const servers = env.NSITE_SERVERS.split(",").map(s => s.trim());
        for (const server of servers) {
          try {
            const url = new URL(server);
            if (url.protocol !== "https:" && url.protocol !== "http:") {
              errors.push(`Invalid server protocol: ${server}`);
            }
          } catch {
            errors.push(`Invalid server URL: ${server}`);
          }
        }
      }

      if (env.NSITE_PUBLISH_RELAYS && 
          !["true", "false"].includes(env.NSITE_PUBLISH_RELAYS.toLowerCase())) {
        errors.push("NSITE_PUBLISH_RELAYS must be 'true' or 'false'");
      }

      return errors;
    };

    // Valid environment
    const validEnv = {
      NSITE_RELAYS: "wss://relay1.com,wss://relay2.com",
      NSITE_SERVERS: "https://server.com",
      NSITE_PUBLISH_RELAYS: "true"
    };
    assertEquals(validateEnvironmentOverrides(validEnv), []);

    // Invalid environment
    const invalidEnv = {
      NSITE_RELAYS: "invalid-url,https://wrong-protocol.com",
      NSITE_SERVERS: "wss://wrong-protocol.com",
      NSITE_PUBLISH_RELAYS: "maybe"
    };
    const errors = validateEnvironmentOverrides(invalidEnv);
    assertEquals(errors.length > 0, true);
  });
});

Deno.test("Configuration Handling - Default Values", async (t) => {
  await t.step("should provide sensible defaults", () => {
    const createDefaultConfig = (): ProjectConfig => {
      return {
        relays: [
          "wss://nos.lol",
          "wss://relay.damus.io",
          "wss://relay.nostr.band"
        ],
        servers: [
          "https://blossom.hzrd149.com",
          "https://cdn.satellite.earth"
        ],
        publishServerList: true,
        publishRelayList: true,
        publishProfile: false
      };
    };

    const defaultConfig = createDefaultConfig();
    
    assertExists(defaultConfig.relays);
    assertEquals(defaultConfig.relays.length > 0, true);
    assertExists(defaultConfig.servers);
    assertEquals(defaultConfig.servers.length > 0, true);
    assertEquals(typeof defaultConfig.publishServerList, "boolean");
    assertEquals(typeof defaultConfig.publishRelayList, "boolean");

    // Validate default relay URLs
    for (const relay of defaultConfig.relays) {
      assertEquals(relay.startsWith("wss://"), true);
    }

    // Validate default server URLs
    for (const server of defaultConfig.servers) {
      assertEquals(server.startsWith("https://"), true);
    }
  });

  await t.step("should handle missing config gracefully", () => {
    const loadConfigWithFallback = (configData?: any): ProjectConfig => {
      if (!configData) {
        return {
          relays: ["wss://relay.nostr.band"],
          servers: ["https://blossom.hzrd149.com"],
          publishServerList: true,
          publishRelayList: true
        };
      }

      // Ensure required fields exist
      return {
        relays: configData.relays || ["wss://relay.nostr.band"],
        servers: configData.servers || [],
        publishServerList: configData.publishServerList ?? true,
        publishRelayList: configData.publishRelayList ?? true,
        bunkerPubkey: configData.bunkerPubkey,
        profile: configData.profile
      };
    };

    // Test with no config
    const fallbackConfig = loadConfigWithFallback();
    assertEquals(fallbackConfig.relays.length, 1);
    assertEquals(fallbackConfig.publishServerList, true);

    // Test with partial config
    const partialConfig = loadConfigWithFallback({ 
      relays: ["wss://custom-relay.com"],
      publishServerList: false
    });
    assertEquals(partialConfig.relays, ["wss://custom-relay.com"]);
    assertEquals(partialConfig.publishServerList, false);
    assertEquals(partialConfig.servers, []); // Default empty array
  });
});

Deno.test("Configuration Handling - File Operations", async (t) => {
  await t.step("should handle config file errors gracefully", () => {
    const handleConfigFileError = (error: Error) => {
      const message = error.message.toLowerCase();

      if (message.includes("no such file") || message.includes("enoent")) {
        return {
          type: "file_not_found",
          suggestion: "Run 'nsyte init' to create a configuration file",
          canContinue: true
        };
      }

      if (message.includes("permission denied") || message.includes("eacces")) {
        return {
          type: "permission_denied",
          suggestion: "Check file permissions for .nsite/config.json",
          canContinue: false
        };
      }

      if (message.includes("invalid json") || message.includes("syntax")) {
        return {
          type: "invalid_json",
          suggestion: "Fix JSON syntax in .nsite/config.json",
          canContinue: false
        };
      }

      return {
        type: "unknown",
        suggestion: "Check the configuration file",
        canContinue: false
      };
    };

    const fileNotFoundError = new Error("ENOENT: no such file or directory");
    const fileNotFoundResult = handleConfigFileError(fileNotFoundError);
    assertEquals(fileNotFoundResult.type, "file_not_found");
    assertEquals(fileNotFoundResult.canContinue, true);

    const permissionError = new Error("EACCES: permission denied");
    const permissionResult = handleConfigFileError(permissionError);
    assertEquals(permissionResult.type, "permission_denied");
    assertEquals(permissionResult.canContinue, false);

    const jsonError = new Error("Invalid JSON syntax");
    const jsonResult = handleConfigFileError(jsonError);
    assertEquals(jsonResult.type, "invalid_json");
    assertEquals(jsonResult.canContinue, false);
  });

  await t.step("should validate config before saving", () => {
    const validateConfigBeforeSave = (config: ProjectConfig) => {
      const errors: string[] = [];

      // Validate relays
      if (!Array.isArray(config.relays)) {
        errors.push("Relays must be an array");
      } else {
        for (const relay of config.relays) {
          if (typeof relay !== "string") {
            errors.push("All relays must be strings");
          } else {
            try {
              const url = new URL(relay);
              if (!["wss:", "ws:"].includes(url.protocol)) {
                errors.push(`Invalid relay protocol: ${relay}`);
              }
            } catch {
              errors.push(`Invalid relay URL: ${relay}`);
            }
          }
        }
      }

      // Validate servers
      if (!Array.isArray(config.servers)) {
        errors.push("Servers must be an array");
      } else {
        for (const server of config.servers) {
          if (typeof server !== "string") {
            errors.push("All servers must be strings");
          } else {
            try {
              const url = new URL(server);
              if (!["https:", "http:"].includes(url.protocol)) {
                errors.push(`Invalid server protocol: ${server}`);
              }
            } catch {
              errors.push(`Invalid server URL: ${server}`);
            }
          }
        }
      }

      // Validate boolean flags
      if (typeof config.publishServerList !== "boolean") {
        errors.push("publishServerList must be a boolean");
      }
      if (typeof config.publishRelayList !== "boolean") {
        errors.push("publishRelayList must be a boolean");
      }

      return errors;
    };

    // Valid config
    const validConfig: ProjectConfig = {
      relays: ["wss://relay.com"],
      servers: ["https://server.com"],
      publishServerList: true,
      publishRelayList: false
    };
    assertEquals(validateConfigBeforeSave(validConfig), []);

    // Invalid config
    const invalidConfig = {
      relays: "not-an-array",
      servers: ["invalid-url"],
      publishServerList: "not-a-boolean",
      publishRelayList: false
    } as any;
    const errors = validateConfigBeforeSave(invalidConfig);
    assertEquals(errors.length > 0, true);
    assertEquals(errors.some(e => e.includes("must be an array")), true);
    assertEquals(errors.some(e => e.includes("must be a boolean")), true);
  });
});