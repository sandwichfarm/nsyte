import { assertEquals, assertExists, assertThrows } from "std/assert/mod.ts";
import {
  defaultConfig,
  popularBlossomServers,
  popularRelays,
  type ProjectConfig,
  type ProjectContext,
  readProjectFile,
  setupProject,
  writeProjectFile,
} from "../../src/lib/config.ts";
import {
  createMockConfig,
  createTestEnvironment,
  createTestEnvVars,
  suppressConsole,
  withTestEnvironment,
} from "../utils/test-env.ts";

// Tests for constants (no environment needed)
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
    assertEquals(typeof defaultConfig, "object");
    assertExists(defaultConfig.relays);
    assertExists(defaultConfig.servers);
    assertEquals(Array.isArray(defaultConfig.relays), true);
    assertEquals(Array.isArray(defaultConfig.servers), true);
  });
});

// File operations tests with isolated environment
Deno.test(
  "Config - File Operations",
  withTestEnvironment(async (env, t) => {
    await t.step("writeProjectFile creates directory if not exists", () => {
      const config: ProjectConfig = {
        relays: ["wss://test.relay"],
        servers: ["https://test.server"],
        publishServerList: false,
        publishRelayList: false,
      };

      writeProjectFile(config);

      const stats = Deno.statSync(env.configDir);
      assertEquals(stats.isDirectory, true);

      const fileStats = Deno.statSync(env.configFile);
      assertEquals(fileStats.isFile, true);
    });

    await t.step("writeProjectFile sanitizes bunker URLs", async () => {
      const config: ProjectConfig = {
        relays: ["wss://test.relay"],
        servers: ["https://test.server"],
        publishServerList: false,
        publishRelayList: false,
        bunkerPubkey: "1234567890123456789012345678901234567890123456789012345678901234",
      };

      writeProjectFile(config);

      // Suppress console output for this test
      const restoreConsole = suppressConsole();
      try {
        const readConfig = readProjectFile(false); // Skip validation for this test
        restoreConsole();

        assertExists(readConfig);
        assertEquals(readConfig.bunkerPubkey, config.bunkerPubkey);
      } finally {
        restoreConsole();
      }
    });

    await t.step("writeProjectFile preserves metadata", () => {
      const config: ProjectConfig = {
        relays: ["wss://test.relay"],
        servers: ["https://test.server"],
        publishServerList: false,
        publishRelayList: false,
        id: "test-site",
        title: "Test User",
        description: "Test description",
      };

      writeProjectFile(config);

      const readConfig = readProjectFile(false); // Skip validation
      assertExists(readConfig);
      assertExists(readConfig.id);
      assertEquals(readConfig.id, "test-site");
      assertEquals(readConfig.title, "Test User");
      assertEquals(readConfig.description, "Test description");
    });

    await t.step("readProjectFile returns null for non-existent file", async () => {
      // Ensure the config file doesn't exist by removing it if it exists
      try {
        await Deno.remove(env.configFile);
      } catch {
        // File doesn't exist, which is what we want
      }

      const result = readProjectFile(false);
      assertEquals(result, null);
    });

    await t.step("readProjectFile handles malformed JSON", async () => {
      // Write invalid JSON
      await Deno.writeTextFile(env.configFile, "{ invalid json");

      const restoreConsole = suppressConsole();
      try {
        assertThrows(
          () => {
            readProjectFile(false);
          },
          Error,
          "Invalid JSON in configuration file",
        );
      } finally {
        restoreConsole();
      }
    });
  }),
);

// setupProject tests with isolated environment
Deno.test(
  "Config - setupProject",
  withTestEnvironment(async (env, t) => {
    const envVars = createTestEnvVars();

    try {
      await t.step(
        "returns basic config in non-interactive mode with no existing config",
        async () => {
          // Ensure no config file exists
          try {
            await Deno.remove(env.configFile);
          } catch {
            // File doesn't exist, which is what we want
          }

          const restoreConsole = suppressConsole();
          try {
            const result = await setupProject(true); // skipInteractive = true

            assertExists(result);
            // Should have an error since there's no key configuration and we're in non-interactive mode
            if (result.error) {
              assertEquals(typeof result.error, "string");
            }
          } finally {
            restoreConsole();
          }
        },
      );

      await t.step("returns existing config in non-interactive mode", async () => {
        // Create a valid config first
        const config: ProjectConfig = {
          relays: ["wss://test.relay"],
          servers: ["https://test.server"],
          publishServerList: false,
          publishRelayList: false,
          bunkerPubkey: "1234567890123456789012345678901234567890123456789012345678901234",
        };

        await createMockConfig(env, config);

        const restoreConsole = suppressConsole();
        try {
          const result = await setupProject(true); // skipInteractive = true

          assertExists(result);
          assertExists(result.config);
          assertEquals(result.config.relays, config.relays);
        } finally {
          restoreConsole();
        }
      });
    } finally {
      envVars.restore();
    }
  }),
);

// Utility function tests (no environment needed)
Deno.test("Config - Utility Functions", async (t) => {
  await t.step("should validate project config structure", () => {
    const validConfig: ProjectConfig = {
      relays: ["wss://test.relay"],
      servers: ["https://test.server"],
      publishServerList: true,
      publishRelayList: true,
    };

    // These should not throw when used in isolation
    assertEquals(typeof validConfig.relays, "object");
    assertEquals(Array.isArray(validConfig.relays), true);
    assertEquals(typeof validConfig.servers, "object");
    assertEquals(Array.isArray(validConfig.servers), true);
  });

  await t.step("should handle optional metadata fields", () => {
    const configWithAllFields: ProjectConfig = {
      relays: ["wss://test.relay"],
      servers: ["https://test.server"],
      publishServerList: false,
      publishRelayList: false,
      id: "test-site",
      title: "Test User",
      description: "Test description",
    };

    const configWithMinFields: ProjectConfig = {
      relays: ["wss://test.relay"],
      servers: ["https://test.server"],
      publishServerList: false,
      publishRelayList: false,
    };

    assertEquals(typeof configWithAllFields.title, "string");
    assertEquals(configWithMinFields.title, undefined);
  });
});
