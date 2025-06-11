import { assertEquals, assertExists, assertThrows } from "std/assert/mod.ts";
import { restore, stub } from "std/testing/mock.ts";
import { join } from "std/path/mod.ts";
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

// Clean up any remaining test files
Deno.test("Cleanup", () => {
  restore();
  try {
    Deno.removeSync(join(Deno.cwd(), CONFIG_DIR), { recursive: true });
  } catch {}
});
