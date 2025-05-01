import { assertEquals, assertExists } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import { readProjectFile, writeProjectFile } from "../../src/lib/config.ts";
import { join, dirname } from "std/path/mod.ts";
import { ensureDirSync } from "std/fs/ensure_dir.ts";

// Test data
const TEST_CONFIG_DIR = ".nsite-test";
const TEST_PROJECT_FILE = "project.json";
const TEST_PROJECT_DATA = {
  privateKey: "test-private-key",
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

// Mock the real config directory and file
const originalConfigDir = ".nsite";
const originalProjectFile = "config.json";

// Override the module's constants for testing
const originalCwd = Deno.cwd;

describe("Config Module", () => {
  const testDir = join(Deno.cwd(), TEST_CONFIG_DIR);
  const testFilePath = join(testDir, TEST_PROJECT_FILE);
  
  beforeEach(() => {
    // Create test directory if it doesn't exist
    ensureDirSync(testDir);
    
    // Mock the cwd function to return our test directory
    Deno.cwd = () => Deno.cwd().replace(TEST_CONFIG_DIR, "");
    
    // Clean up any existing test file
    try {
      Deno.removeSync(testFilePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  });
  
  afterEach(() => {
    // Restore the original cwd function
    Deno.cwd = originalCwd;
    
    // Clean up test files
    try {
      Deno.removeSync(testDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  });
  
  it("should write and read project data", () => {
    // Write test data
    writeProjectFile(TEST_PROJECT_DATA);
    
    // Read it back
    const readData = readProjectFile();
    
    // Check that it exists and matches
    assertExists(readData);
    assertEquals(readData?.privateKey, TEST_PROJECT_DATA.privateKey);
    assertEquals(readData?.relays, TEST_PROJECT_DATA.relays);
    assertEquals(readData?.servers, TEST_PROJECT_DATA.servers);
  });
  
  it("should return null for non-existent project file", () => {
    // Make sure the file doesn't exist
    try {
      Deno.removeSync(testFilePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
    
    // Try to read it
    const readData = readProjectFile();
    
    // Should be null
    assertEquals(readData, null);
  });
}); 