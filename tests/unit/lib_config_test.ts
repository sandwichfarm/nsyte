import { assertEquals, assertExists } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://jsr.io/@std/testing/1.0.12/bdd.ts";
import { join } from "std/path/mod.ts";
import { ensureDir } from "std/fs/mod.ts";
import {
  ProjectConfig,
  readProjectConfig,
  writeProjectConfig,
  getProjectBunker,
  setProjectBunker,
  clearProjectBunker,
  getDefaultRelays,
  setDefaultRelays,
  clearDefaultRelays,
  getConfig
} from "../../src/lib/config.ts";

describe("lib/config", () => {
  const testDir = join(Deno.cwd(), ".test_lib_config");
  const testConfigPath = join(testDir, ".nsite");

  beforeEach(async () => {
    await ensureDir(testDir);
  });

  afterEach(async () => {
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch {
      // Ignore
    }
  });

  describe("readProjectConfig", () => {
    it("should return null when config doesn't exist", async () => {
      const config = await readProjectConfig(testConfigPath);
      assertEquals(config, null);
    });

    it("should read valid config", async () => {
      const testConfig: ProjectConfig = {
        version: "1.0",
        bunker: "test-bunker",
        relays: ["wss://relay1.test", "wss://relay2.test"]
      };
      
      await Deno.writeTextFile(testConfigPath, JSON.stringify(testConfig, null, 2));
      
      const config = await readProjectConfig(testConfigPath);
      assertExists(config);
      assertEquals(config.version, "1.0");
      assertEquals(config.bunker, "test-bunker");
      assertEquals(config.relays, ["wss://relay1.test", "wss://relay2.test"]);
    });

    it("should handle invalid JSON", async () => {
      await Deno.writeTextFile(testConfigPath, "invalid json");
      const config = await readProjectConfig(testConfigPath);
      assertEquals(config, null);
    });
  });

  describe("writeProjectConfig", () => {
    it("should write config", async () => {
      const testConfig: ProjectConfig = {
        version: "1.0",
        bunker: "test-bunker"
      };
      
      await writeProjectConfig(testConfigPath, testConfig);
      
      const content = await Deno.readTextFile(testConfigPath);
      const parsed = JSON.parse(content);
      assertEquals(parsed.version, "1.0");
      assertEquals(parsed.bunker, "test-bunker");
    });

    it("should create directory if needed", async () => {
      const nestedPath = join(testDir, "nested", ".nsite");
      const testConfig: ProjectConfig = {
        version: "1.0"
      };
      
      await writeProjectConfig(nestedPath, testConfig);
      
      const exists = await Deno.stat(nestedPath).then(() => true).catch(() => false);
      assertEquals(exists, true);
    });
  });

  describe("Project Bunker functions", () => {
    it("should get/set/clear project bunker", async () => {
      // Initially should be null
      let bunker = await getProjectBunker(testConfigPath);
      assertEquals(bunker, null);
      
      // Set bunker
      await setProjectBunker(testConfigPath, "test-bunker-123");
      
      // Get bunker
      bunker = await getProjectBunker(testConfigPath);
      assertEquals(bunker, "test-bunker-123");
      
      // Clear bunker
      await clearProjectBunker(testConfigPath);
      
      // Should be null again
      bunker = await getProjectBunker(testConfigPath);
      assertEquals(bunker, null);
    });
  });

  describe("Default Relays functions", () => {
    it("should get/set/clear default relays", async () => {
      // Initially should be null
      let relays = await getDefaultRelays(testConfigPath);
      assertEquals(relays, null);
      
      // Set relays
      const testRelays = ["wss://relay1.test", "wss://relay2.test"];
      await setDefaultRelays(testConfigPath, testRelays);
      
      // Get relays
      relays = await getDefaultRelays(testConfigPath);
      assertEquals(relays, testRelays);
      
      // Clear relays
      await clearDefaultRelays(testConfigPath);
      
      // Should be null again
      relays = await getDefaultRelays(testConfigPath);
      assertEquals(relays, null);
    });
  });

  describe("getConfig", () => {
    it("should return full config object", async () => {
      const testConfig: ProjectConfig = {
        version: "1.0",
        bunker: "test-bunker",
        relays: ["wss://relay.test"]
      };
      
      await writeProjectConfig(testConfigPath, testConfig);
      
      const config = await getConfig(testConfigPath);
      assertExists(config);
      assertEquals(config.version, "1.0");
      assertEquals(config.bunker, "test-bunker");
      assertEquals(config.relays, ["wss://relay.test"]);
    });

    it("should return null when no config exists", async () => {
      const config = await getConfig(testConfigPath);
      assertEquals(config, null);
    });
  });
});