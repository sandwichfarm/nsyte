import { assertEquals, assertExists } from "jsr:@std/assert";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { readProjectFile, writeProjectFile } from "../../src/lib/config.ts";
import { join } from "std/path/mod.ts";

// Test data matching ProjectConfig interface
const TEST_PROJECT_DATA = {
  relays: ["wss://test-relay1", "wss://test-relay2"],
  servers: ["https://test-server1", "https://test-server2"],
  profile: {
    name: "Test Project",
    about: "Test description",
  },
  publishServerList: true,
  publishRelayList: true,
  publishProfile: true,
};

// Paths
const CONFIG_DIR = ".nsite";
const PROJECT_FILE = "config.json";
const PROJECT_PATH = join(Deno.cwd(), CONFIG_DIR, PROJECT_FILE);

describe("ProjectConfig Module", () => {
  beforeEach(() => {
    // Clean up any existing config directory
    try {
      Deno.removeSync(join(Deno.cwd(), CONFIG_DIR), { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  });

  afterEach(() => {
    // Remove the config directory
    try {
      Deno.removeSync(join(Deno.cwd(), CONFIG_DIR), { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  });

  it("should write and read project data", () => {
    writeProjectFile(TEST_PROJECT_DATA);
    const readData = readProjectFile();
    assertExists(readData);
    assertEquals(readData?.relays, TEST_PROJECT_DATA.relays);
    assertEquals(readData?.servers, TEST_PROJECT_DATA.servers);
    assertEquals(readData?.profile, TEST_PROJECT_DATA.profile);
    assertEquals(readData?.publishServerList, TEST_PROJECT_DATA.publishServerList);
    assertEquals(readData?.publishRelayList, TEST_PROJECT_DATA.publishRelayList);
    assertEquals(readData?.publishProfile, TEST_PROJECT_DATA.publishProfile);
  });

  it("should return null for non-existent project file", () => {
    const readData = readProjectFile();
    assertEquals(readData, null);
  });
});
