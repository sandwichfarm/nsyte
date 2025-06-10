import { assertEquals, assertExists } from "std/assert/mod.ts";
import { join } from "std/path/mod.ts";
import { ensureDir } from "std/fs/mod.ts";
import {
  defaultConfig,
  ProjectConfig,
  readProjectFile,
  writeProjectFile,
} from "../../src/lib/config.ts";

Deno.test("lib/config", async (t) => {
  const testDir = join(Deno.cwd(), ".test_lib_config");
  const originalCwd = Deno.cwd();

  const setupTest = async () => {
    await ensureDir(testDir);
    Deno.chdir(testDir);
  };

  const cleanupTest = async () => {
    Deno.chdir(originalCwd);
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch {
      // Ignore
    }
  };

  await t.step("readProjectFile", async (t) => {
    await t.step("should return null when config doesn't exist", async () => {
      await setupTest();
      const config = readProjectFile();
      assertEquals(config, null);
      await cleanupTest();
    });

    await t.step("should read valid config", async () => {
      await setupTest();
      const testConfig: ProjectConfig = {
        relays: ["wss://relay1.test", "wss://relay2.test"],
        servers: ["https://server1.test"],
        publishServerList: true,
        publishRelayList: true,
      };

      // Create .nsite directory and config.json
      await ensureDir(".nsite");
      await Deno.writeTextFile(".nsite/config.json", JSON.stringify(testConfig, null, 2));

      const config = readProjectFile();
      assertExists(config);
      assertEquals(config.relays, ["wss://relay1.test", "wss://relay2.test"]);
      assertEquals(config.servers, ["https://server1.test"]);
      await cleanupTest();
    });

    await t.step("should handle invalid JSON", async () => {
      await setupTest();
      await ensureDir(".nsite");
      await Deno.writeTextFile(".nsite/config.json", "invalid json");
      const config = readProjectFile();
      assertEquals(config, null);
      await cleanupTest();
    });
  });

  await t.step("writeProjectFile", async (t) => {
    await t.step("should write config", async () => {
      await setupTest();
      const testConfig: ProjectConfig = {
        relays: ["wss://test.relay"],
        servers: ["https://test.server"],
        publishServerList: true,
        publishRelayList: true,
      };

      writeProjectFile(testConfig);

      const content = await Deno.readTextFile(".nsite/config.json");
      const parsed = JSON.parse(content);
      assertEquals(parsed.relays, ["wss://test.relay"]);
      assertEquals(parsed.servers, ["https://test.server"]);
      await cleanupTest();
    });

    await t.step("should create directory if needed", async () => {
      await setupTest();
      const testConfig: ProjectConfig = {
        relays: ["wss://test.relay"],
        servers: [],
        publishServerList: true,
        publishRelayList: true,
      };

      writeProjectFile(testConfig);

      const exists = await Deno.stat(".nsite/config.json").then(() => true).catch(() => false);
      assertEquals(exists, true);
      await cleanupTest();
    });
  });

  await t.step("defaultConfig", async (t) => {
    await t.step("should have expected default values", async () => {
      await setupTest();
      assertEquals(Array.isArray(defaultConfig.relays), true);
      assertEquals(Array.isArray(defaultConfig.servers), true);
      assertEquals(typeof defaultConfig.publishServerList, "boolean");
      assertEquals(typeof defaultConfig.publishRelayList, "boolean");
      await cleanupTest();
    });
  });

  await t.step("Config validation", async (t) => {
    await t.step("should handle config with all required fields", async () => {
      await setupTest();
      const testConfig: ProjectConfig = {
        relays: ["wss://relay1.test", "wss://relay2.test"],
        servers: ["https://server1.test"],
        publishServerList: true,
        publishRelayList: true,
        bunkerPubkey: "test-pubkey",
        profile: {
          name: "Test User",
          about: "Test description",
        },
      };

      writeProjectFile(testConfig);
      const readConfig = readProjectFile();

      assertExists(readConfig);
      assertEquals(readConfig.relays, testConfig.relays);
      assertEquals(readConfig.servers, testConfig.servers);
      assertEquals(readConfig.bunkerPubkey, testConfig.bunkerPubkey);
      assertEquals(readConfig.profile?.name, "Test User");
      await cleanupTest();
    });
  });

  await t.step("Config persistence", async (t) => {
    await t.step("should persist and read back config correctly", async () => {
      await setupTest();
      const testConfig: ProjectConfig = {
        relays: ["wss://relay.test"],
        servers: ["https://server.test"],
        publishServerList: false,
        publishRelayList: true,
      };

      writeProjectFile(testConfig);
      const config = readProjectFile();

      assertExists(config);
      assertEquals(config.relays, ["wss://relay.test"]);
      assertEquals(config.servers, ["https://server.test"]);
      assertEquals(config.publishServerList, false);
      assertEquals(config.publishRelayList, true);
      await cleanupTest();
    });

    await t.step("should return null when no config exists", async () => {
      await setupTest();
      const config = readProjectFile();
      assertEquals(config, null);
      await cleanupTest();
    });
  });
});
