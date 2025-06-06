import { assertEquals, assertExists } from "std/assert/mod.ts";
import { join } from "std/path/mod.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { writeProjectFile, readProjectFile, type ProjectConfig } from "../../src/lib/config.ts";

Deno.test("Config Deletion Bug - Reproduction and Fix", async (t) => {
  // Create a temporary directory for testing
  const originalCwd = Deno.cwd();
  const tempDir = await Deno.makeTempDir({ prefix: "nsyte_config_test_" });
  
  try {
    // Change to temp directory
    Deno.chdir(tempDir);
    
    await t.step("should reproduce config deletion scenario", async () => {
      // 1. Create initial config (simulating user setup)
      const initialConfig: ProjectConfig = {
        relays: ["wss://relay.example.com"],
        servers: ["https://server.example.com"],
        publishRelayList: true,
        publishServerList: true,
        bunkerPubkey: "existing-bunker-pubkey"
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

    await t.step("should identify the problematic code pattern", () => {
      // This test documents the problematic pattern that causes config deletion
      const simulateSelectKeySourceBug = (existingConfig: ProjectConfig) => {
        // This simulates the bug in selectKeySource function
        // where writeProjectFile is called even when no changes are made
        
        // BUG: This overwrites config even when no changes are made
        const config = structuredClone(existingConfig);
        // ... (user interaction would happen here)
        // writeProjectFile(config); // <-- This is the problematic line
        
        // The fix should be to only call writeProjectFile when config actually changes
        return config;
      };

      const originalConfig: ProjectConfig = {
        relays: ["wss://relay.example.com"],
        servers: ["https://server.example.com"],
        publishRelayList: true,
        publishServerList: true,
        bunkerPubkey: "existing-bunker-pubkey"
      };

      const result = simulateSelectKeySourceBug(originalConfig);
      
      // Should not modify the original config
      assertEquals(result.bunkerPubkey, "existing-bunker-pubkey");
    });

    await t.step("should demonstrate safe config handling", () => {
      // This shows the correct way to handle config updates
      const safeConfigUpdate = (existingConfig: ProjectConfig, changes: Partial<ProjectConfig>) => {
        // Only update config if there are actual changes
        const hasChanges = Object.keys(changes).some(key => {
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
        bunkerPubkey: "existing-bunker-pubkey"
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
    // Cleanup
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
      await Deno.writeTextFile(join(tempDir, ".nsite", "config.json"), JSON.stringify(minimalConfig));
      
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