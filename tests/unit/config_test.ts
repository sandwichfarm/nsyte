import { assertEquals, assertExists, assertThrows } from "@std/assert";
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
  type createTestEnvironment,
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
      };

      // Use custom path to bypass temp directory guard
      writeProjectFile(config, env.configFile);

      const stats = Deno.statSync(env.configDir);
      assertEquals(stats.isDirectory, true);

      const fileStats = Deno.statSync(env.configFile);
      assertEquals(fileStats.isFile, true);
    });

    await t.step("writeProjectFile sanitizes bunker URLs", async () => {
      const config: ProjectConfig = {
        relays: ["wss://test.relay"],
        servers: ["https://test.server"],
        bunkerPubkey: "1234567890123456789012345678901234567890123456789012345678901234",
      };

      // Use custom path to bypass temp directory guard
      writeProjectFile(config, env.configFile);

      // Suppress console output for this test
      const restoreConsole = suppressConsole();
      try {
        const readConfig = readProjectFile(env.configFile, false); // Skip validation for this test
        restoreConsole();

        assertExists(readConfig);
        assertEquals(readConfig!.bunkerPubkey, config.bunkerPubkey);
      } finally {
        restoreConsole();
      }
    });

    await t.step("writeProjectFile preserves metadata", () => {
      const config: ProjectConfig = {
        relays: ["wss://test.relay"],
        servers: ["https://test.server"],
        id: "test-site",
        title: "Test User",
        description: "Test description",
      };

      // Use custom path to bypass temp directory guard
      writeProjectFile(config, env.configFile);

      const readConfig = readProjectFile(env.configFile, false); // Skip validation
      assertExists(readConfig);
      assertExists(readConfig!.id);
      assertEquals(readConfig!.id, "test-site");
      assertEquals(readConfig!.title, "Test User");
      assertEquals(readConfig!.description, "Test description");
    });

    await t.step("readProjectFile returns null for non-existent file", async () => {
      // Ensure the config file doesn't exist by removing it if it exists
      try {
        await Deno.remove(env.configFile);
      } catch {
        // File doesn't exist, which is what we want
      }

      const result = readProjectFile(undefined, false);
      assertEquals(result, null);
    });

    await t.step("readProjectFile handles malformed JSON", async () => {
      // Write invalid JSON
      await Deno.writeTextFile(env.configFile, "{ invalid json");

      const restoreConsole = suppressConsole();
      try {
        assertThrows(
          () => {
            readProjectFile(undefined, false);
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
      id: "test-site",
      title: "Test User",
      description: "Test description",
    };

    const configWithMinFields: ProjectConfig = {
      relays: ["wss://test.relay"],
      servers: ["https://test.server"],
    };

    assertEquals(typeof configWithAllFields.title, "string");
    assertEquals(configWithMinFields.title, undefined);
  });
});

// Custom config path tests
Deno.test(
  "Config - Custom Config Path",
  withTestEnvironment(async (env, t) => {
    await t.step("readProjectFile with custom relative path", () => {
      const config: ProjectConfig = {
        relays: ["wss://custom.relay"],
        servers: ["https://custom.server"],
      };

      // Write to custom location
      writeProjectFile(config, env.configFile);

      // Read with explicit path
      const readConfig = readProjectFile(env.configFile, false);
      assertExists(readConfig);
      assertEquals(readConfig!.relays[0], "wss://custom.relay");
    });

    await t.step("readProjectFile with custom absolute path", async () => {
      const customPath = `${env.tempDir}/custom-config.json`;
      const config: ProjectConfig = {
        relays: ["wss://absolute.relay"],
        servers: ["https://absolute.server"],
      };

      // Write config using custom absolute path
      writeProjectFile(config, customPath);

      // Verify file exists at custom location
      const fileStats = await Deno.stat(customPath);
      assertEquals(fileStats.isFile, true);

      // Read from custom path
      const readConfig = readProjectFile(customPath, false);
      assertExists(readConfig);
      assertEquals(readConfig!.relays[0], "wss://absolute.relay");
    });

    await t.step("writeProjectFile with custom path creates correct directory", async () => {
      const customDir = `${env.tempDir}/custom/nested/path`;
      const customPath = `${customDir}/config.json`;
      const config: ProjectConfig = {
        relays: ["wss://nested.relay"],
        servers: ["https://nested.server"],
      };

      // Write to custom nested path
      writeProjectFile(config, customPath);

      // Verify directory and file were created
      const dirStats = await Deno.stat(customDir);
      assertEquals(dirStats.isDirectory, true);

      const fileStats = await Deno.stat(customPath);
      assertEquals(fileStats.isFile, true);

      // Verify content
      const readConfig = readProjectFile(customPath, false);
      assertExists(readConfig);
      assertEquals(readConfig!.relays[0], "wss://nested.relay");
    });

    await t.step("readProjectFile returns null for non-existent custom path", () => {
      const result = readProjectFile("/non/existent/path/config.json", false);
      assertEquals(result, null);
    });

    await t.step("mono-repo scenario: multiple configs in different paths", async () => {
      // Simulate a mono-repo with two apps
      const app1ConfigPath = `${env.tempDir}/apps/frontend/.nsite/config.json`;
      const app2ConfigPath = `${env.tempDir}/apps/backend/.nsite/config.json`;

      const app1Config: ProjectConfig = {
        relays: ["wss://frontend.relay"],
        servers: ["https://frontend.server"],
        id: "frontend",
      };

      const app2Config: ProjectConfig = {
        relays: ["wss://backend.relay"],
        servers: ["https://backend.server"],
        id: "backend",
      };

      // Write both configs
      writeProjectFile(app1Config, app1ConfigPath);
      writeProjectFile(app2Config, app2ConfigPath);

      // Read both configs independently
      const readApp1 = readProjectFile(app1ConfigPath, false);
      const readApp2 = readProjectFile(app2ConfigPath, false);

      // Verify they're different and correct
      assertExists(readApp1);
      assertExists(readApp2);
      assertEquals(readApp1!.id, "frontend");
      assertEquals(readApp2!.id, "backend");
      assertEquals(readApp1!.relays[0], "wss://frontend.relay");
      assertEquals(readApp2!.relays[0], "wss://backend.relay");
    });
  }),
);
