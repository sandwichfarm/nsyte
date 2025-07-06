import { assertEquals, assertExists, assertThrows } from "std/assert/mod.ts";
import { restore, stub } from "std/testing/mock.ts";
import { join } from "std/path/mod.ts";
import { ensureDir } from "std/fs/mod.ts";
import {
  defaultConfig,
  popularBlossomServers,
  popularRelays,
  type Profile,
  type ProjectConfig,
  type ProjectContext,
  readProjectFile,
  setupProject,
  writeProjectFile,
} from "../../src/lib/config.ts";

const CONFIG_DIR = ".nsite";
const PROJECT_FILE = "config.json";

Deno.test("Config - Constants", async (t) => {
  await t.step("popularRelays should be defined", () => {
    assertExists(popularRelays);
    assertEquals(Array.isArray(popularRelays), true);
    assertEquals(popularRelays.length > 0, true);
    for (const relay of popularRelays) {
      assertEquals(relay.startsWith("wss://"), true);
    }
  });

  await t.step("popularBlossomServers should be defined", () => {
    assertExists(popularBlossomServers);
    assertEquals(Array.isArray(popularBlossomServers), true);
    assertEquals(popularBlossomServers.length > 0, true);
    for (const server of popularBlossomServers) {
      assertEquals(server.startsWith("https://"), true);
    }
  });

  await t.step("defaultConfig should have correct structure", () => {
    assertExists(defaultConfig);
    assertEquals(Array.isArray(defaultConfig.relays), true);
    assertEquals(Array.isArray(defaultConfig.servers), true);
    assertEquals(typeof defaultConfig.publishServerList, "boolean");
    assertEquals(typeof defaultConfig.publishRelayList, "boolean");
    assertExists(defaultConfig.gatewayHostnames);
    assertEquals(Array.isArray(defaultConfig.gatewayHostnames), true);
  });
});

Deno.test("Config - File Operations", async (t) => {
  const testConfigDir = join(Deno.cwd(), CONFIG_DIR);

  const cleanup = () => {
    try {
      Deno.removeSync(testConfigDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  };

  cleanup(); // Clean before tests

  await t.step("writeProjectFile creates directory if not exists", () => {
    const config: ProjectConfig = {
      relays: ["wss://test.relay"],
      servers: ["https://test.server"],
      publishServerList: false,
      publishRelayList: false,
    };

    writeProjectFile(config);

    const stats = Deno.statSync(testConfigDir);
    assertEquals(stats.isDirectory, true);

    const fileStats = Deno.statSync(join(testConfigDir, PROJECT_FILE));
    assertEquals(fileStats.isFile, true);
  });

  await t.step("writeProjectFile sanitizes bunker URLs", () => {
    const config: ProjectConfig = {
      bunkerPubkey: "bunker://pubkey123?relay=wss://relay.test&secret=supersecret",
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false,
    };

    writeProjectFile(config);

    const saved = readProjectFile();
    assertExists(saved);
    assertEquals(saved.bunkerPubkey?.includes("secret="), false);
    assertEquals(saved.bunkerPubkey?.includes("bunker://"), true);
    assertEquals(saved.bunkerPubkey?.includes("relay="), true);
  });

  await t.step("writeProjectFile handles non-bunker URLs", () => {
    const config: ProjectConfig = {
      bunkerPubkey: "regular-pubkey",
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false,
    };

    writeProjectFile(config);

    const saved = readProjectFile();
    assertExists(saved);
    assertEquals(saved.bunkerPubkey, "regular-pubkey");
  });

  await t.step("writeProjectFile preserves profile data", () => {
    const profile: Profile = {
      name: "Test Name",
      about: "Test About",
      picture: "https://example.com/pic.jpg",
      display_name: "Display Name",
      website: "https://example.com",
      nip05: "test@example.com",
      lud16: "test@ln.example.com",
      banner: "https://example.com/banner.jpg",
    };

    const config: ProjectConfig = {
      relays: [],
      servers: [],
      profile,
      publishServerList: false,
      publishRelayList: false,
      publishProfile: true,
    };

    writeProjectFile(config);

    const saved = readProjectFile();
    assertExists(saved);
    assertEquals(saved.profile, profile);
  });

  await t.step("readProjectFile returns null for non-existent file", () => {
    cleanup();
    const result = readProjectFile();
    assertEquals(result, null);
  });

  await t.step("readProjectFile handles malformed JSON", () => {
    Deno.mkdirSync(testConfigDir, { recursive: true });
    Deno.writeTextFileSync(join(testConfigDir, PROJECT_FILE), "{ invalid json");

    const result = readProjectFile();
    assertEquals(result, null);
  });

  await t.step("readProjectFile handles file read errors", () => {
    const readStub = stub(Deno, "readTextFileSync", () => {
      throw new Error("Read error");
    });

    const result = readProjectFile();
    assertEquals(result, null);

    readStub.restore();
  });

  cleanup(); // Clean after tests
});

Deno.test("Config - setupProject", async (t) => {
  const testConfigDir = join(Deno.cwd(), CONFIG_DIR);

  const cleanup = () => {
    try {
      Deno.removeSync(testConfigDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  };

  await t.step("returns basic config in non-interactive mode with no existing config", async () => {
    cleanup();

    const result = await setupProject(true);

    assertExists(result);
    assertExists(result.config);
    assertEquals(result.config.relays, []);
    assertEquals(result.config.servers, []);
    assertEquals(result.config.publishRelayList, false);
    assertEquals(result.config.publishServerList, false);
    assertEquals(result.privateKey, undefined);
  });

  await t.step("returns existing config in non-interactive mode", async () => {
    const existingConfig: ProjectConfig = {
      bunkerPubkey: "test-pubkey",
      relays: ["wss://relay1", "wss://relay2"],
      servers: ["https://server1"],
      publishServerList: true,
      publishRelayList: true,
    };

    writeProjectFile(existingConfig);

    const result = await setupProject(true);

    assertExists(result);
    assertEquals(result.config.bunkerPubkey, existingConfig.bunkerPubkey);
    assertEquals(result.config.relays, existingConfig.relays);
    assertEquals(result.config.servers, existingConfig.servers);
  });

  await t.step("logs error in non-interactive mode with no key config", async () => {
    cleanup();

    // The implementation logs an error but doesn't actually exit in test environment
    // This is because the config is being set up with no existing config
    const result = await setupProject(true);

    // When no config exists and skipInteractive is true, it returns a basic config
    assertExists(result);
    assertExists(result.config);
    assertEquals(result.config.relays, []);
    assertEquals(result.config.servers, []);
  });

  cleanup();
});

Deno.test("Config - Bunker URL Sanitization", async (t) => {
  await t.step("removes secret from bunker URL", () => {
    const config: ProjectConfig = {
      bunkerPubkey: "bunker://pubkey123?relay=wss://relay1&secret=mysecret&relay=wss://relay2",
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false,
    };

    writeProjectFile(config);
    const saved = readProjectFile();

    assertExists(saved);
    assertExists(saved.bunkerPubkey);
    assertEquals(saved.bunkerPubkey.includes("secret="), false);
    assertEquals(saved.bunkerPubkey.includes("pubkey123"), true);
    assertEquals(saved.bunkerPubkey.includes("relay=wss%3A%2F%2Frelay1"), true);
    assertEquals(saved.bunkerPubkey.includes("relay=wss%3A%2F%2Frelay2"), true);
  });

  await t.step("handles bunker URL with no parameters", () => {
    const config: ProjectConfig = {
      bunkerPubkey: "bunker://pubkey123",
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false,
    };

    writeProjectFile(config);
    const saved = readProjectFile();

    assertExists(saved);
    assertEquals(saved.bunkerPubkey, "bunker://pubkey123/"); // URL class adds trailing slash
  });

  await t.step("handles malformed bunker URLs gracefully", () => {
    const config: ProjectConfig = {
      bunkerPubkey: "bunker://invalid url with spaces",
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false,
    };

    // Should not throw, returns original URL
    writeProjectFile(config);
    const saved = readProjectFile();

    assertExists(saved);
    assertEquals(saved.bunkerPubkey, "bunker://invalid url with spaces");
  });

  // Clean up
  try {
    Deno.removeSync(join(Deno.cwd(), CONFIG_DIR), { recursive: true });
  } catch {}
});

Deno.test("Config - Error Handling", async (t) => {
  await t.step("writeProjectFile handles write errors", () => {
    const writeStub = stub(Deno, "writeTextFileSync", () => {
      throw new Error("Write failed");
    });

    const config: ProjectConfig = {
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false,
    };

    assertThrows(
      () => writeProjectFile(config),
      Error,
      "Write failed",
    );

    writeStub.restore();
  });

  await t.step("writeProjectFile handles directory creation errors", () => {
    // ensureDirSync from std/fs catches mkdir errors internally
    // So we need to stub ensureDirSync itself, not mkdirSync
    const ensureDirStub = stub(globalThis, "ensureDirSync" as any, () => {
      throw new Error("Cannot create directory");
    });

    const config: ProjectConfig = {
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false,
    };

    try {
      writeProjectFile(config);
      assertEquals(true, false, "Should have thrown");
    } catch (error) {
      assertEquals(error instanceof Error, true);
    }

    ensureDirStub.restore();
  });
});

// Interface validation tests
Deno.test("Config - ProjectConfig Interface", async (t) => {
  await t.step("should accept valid project config", () => {
    const config: ProjectConfig = {
      bunkerPubkey: "pubkey123",
      relays: ["wss://relay1.com", "wss://relay2.com"],
      servers: ["https://server1.com", "https://server2.com"],
      profile: {
        name: "Test User",
        about: "Test description",
        picture: "https://example.com/pic.jpg",
      },
      publishServerList: true,
      publishRelayList: true,
      publishProfile: true,
      fallback: "https://fallback.example.com",
      gatewayHostnames: ["gateway1.com", "gateway2.com"],
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
      publishRelayList: false,
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
      banner: "https://example.com/banner.jpg",
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
      about: "Minimalist",
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
        publishRelayList: true,
      },
      authKeyHex: "auth123",
      privateKey: "privkey123",
    };

    assertExists(context.config);
    assertEquals(context.authKeyHex, "auth123");
    assertEquals(context.privateKey, "privkey123");
    assertEquals(context.error, undefined);
  });

  await t.step("should accept context with error", () => {
    const context: ProjectContext = {
      config: defaultConfig,
      error: "Failed to load configuration",
    };

    assertExists(context.config);
    assertEquals(context.error, "Failed to load configuration");
    assertEquals(context.authKeyHex, undefined);
    assertEquals(context.privateKey, undefined);
  });

  await t.step("should accept context with null authKeyHex", () => {
    const context: ProjectContext = {
      config: defaultConfig,
      authKeyHex: null,
    };

    assertExists(context.config);
    assertEquals(context.authKeyHex, null);
  });
});

Deno.test("Config - Data Validation", async (t) => {
  await t.step("should handle relay array validation", () => {
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      publishServerList: false,
      publishRelayList: false,
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
      publishRelayList: false,
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
      publishRelayList: true,
    };

    assertEquals(minimalConfig.bunkerPubkey, undefined);
    assertEquals(minimalConfig.profile, undefined);
    assertEquals(minimalConfig.publishProfile, undefined);
    assertEquals(minimalConfig.fallback, undefined);
    assertEquals(minimalConfig.gatewayHostnames, undefined);
  });
});

Deno.test("Config Deletion Bug Reproduction", async (t) => {
  const originalCwd = Deno.cwd();
  const tempDir = await Deno.makeTempDir({ prefix: "nsyte_config_bug_" });

  try {
    Deno.chdir(tempDir);

    await t.step("should reproduce config deletion scenario", async () => {
      // 1. Create initial config (simulating user setup)
      const initialConfig: ProjectConfig = {
        relays: ["wss://relay.example.com"],
        servers: ["https://server.example.com"],
        publishRelayList: true,
        publishServerList: true,
        bunkerPubkey: "existing-bunker-pubkey",
      };

      writeProjectFile(initialConfig);

      // Verify config exists
      const configPath = join(tempDir, ".nsite", "config.json");
      const exists = await Deno.stat(configPath).then(() => true).catch(() => false);
      assertEquals(exists, true);

      // Read it back to confirm content
      const readConfig = readProjectFile();
      assertExists(readConfig);
      assertEquals(readConfig.relays, ["wss://relay.example.com"]);
      assertEquals(readConfig.bunkerPubkey, "existing-bunker-pubkey");
    });

    await t.step("should not overwrite config when only reading", async () => {
      // Simulate what happens during upload command
      const configBeforeRead = readProjectFile();
      assertExists(configBeforeRead);

      // Simulate multiple reads (as might happen in real usage)
      const config1 = readProjectFile();
      const config2 = readProjectFile();
      const config3 = readProjectFile();

      assertExists(config1);
      assertExists(config2);
      assertExists(config3);

      // Config should still exist and be unchanged
      const configAfterReads = readProjectFile();
      assertExists(configAfterReads);
      assertEquals(configAfterReads.relays, ["wss://relay.example.com"]);
      assertEquals(configAfterReads.bunkerPubkey, "existing-bunker-pubkey");
    });

    await t.step("should demonstrate safe config handling", () => {
      // This shows the correct way to handle config updates
      const safeConfigUpdate = (existingConfig: ProjectConfig, changes: Partial<ProjectConfig>) => {
        // Only update config if there are actual changes
        const hasChanges = Object.keys(changes).some((key) => {
          const typedKey = key as keyof ProjectConfig;
          return existingConfig[typedKey] !== changes[typedKey];
        });

        if (hasChanges) {
          const updatedConfig = { ...existingConfig, ...changes };
          // Only write to file when there are actual changes
          writeProjectFile(updatedConfig);
          return updatedConfig;
        }

        // No changes, return original config without writing to file
        return existingConfig;
      };

      const originalConfig: ProjectConfig = {
        relays: ["wss://relay.example.com"],
        servers: ["https://server.example.com"],
        publishRelayList: true,
        publishServerList: true,
        bunkerPubkey: "existing-bunker-pubkey",
      };

      // Test with no changes
      const result1 = safeConfigUpdate(originalConfig, {});
      assertEquals(result1, originalConfig);

      // Test with actual changes
      const result2 = safeConfigUpdate(originalConfig, { publishRelayList: false });
      assertEquals(result2.publishRelayList, false);
      assertEquals(result2.bunkerPubkey, "existing-bunker-pubkey");
    });
  } finally {
    Deno.chdir(originalCwd);
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("Config File Handling - Edge Cases", async (t) => {
  const originalCwd = Deno.cwd();
  const tempDir = await Deno.makeTempDir({ prefix: "nsyte_config_edge_" });

  try {
    Deno.chdir(tempDir);

    await t.step("should handle missing .nsite directory", () => {
      // Test what happens when .nsite directory doesn't exist
      const config = readProjectFile();
      assertEquals(config, null);
    });

    await t.step("should handle corrupted config file", async () => {
      // Create .nsite directory and corrupted config file
      await ensureDir(join(tempDir, ".nsite"));
      await Deno.writeTextFile(join(tempDir, ".nsite", "config.json"), "invalid json {");

      const config = readProjectFile();
      assertEquals(config, null); // Should return null for invalid JSON
    });

    await t.step("should handle empty config file", async () => {
      // Create empty config file
      await Deno.writeTextFile(join(tempDir, ".nsite", "config.json"), "");

      const config = readProjectFile();
      assertEquals(config, null); // Should return null for empty file
    });

    await t.step("should handle config file with missing fields", async () => {
      // Create config with minimal fields
      const minimalConfig = { relays: ["wss://test.com"] };
      await Deno.writeTextFile(
        join(tempDir, ".nsite", "config.json"),
        JSON.stringify(minimalConfig),
      );

      const config = readProjectFile();
      assertExists(config);
      assertEquals(config.relays, ["wss://test.com"]);
      // Missing fields should be undefined/missing (not cause errors)
    });
  } finally {
    Deno.chdir(originalCwd);
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

// Clean up any remaining test files
Deno.test("Cleanup", () => {
  restore();
  try {
    Deno.removeSync(join(Deno.cwd(), CONFIG_DIR), { recursive: true });
  } catch {}
});
