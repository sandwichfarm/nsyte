/**
 * Test environment utilities to ensure tests don't interfere with developer's configuration
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";

export interface TestEnvironment {
  tempDir: string;
  configDir: string;
  configFile: string;
  originalCwd: string;
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated test environment with its own temporary .nsite directory
 */
export async function createTestEnvironment(): Promise<TestEnvironment> {
  const originalCwd = Deno.cwd();
  
  // Create a temporary directory for this test
  const tempDir = await Deno.makeTempDir({ prefix: "nsyte-test-" });
  const configDir = join(tempDir, ".nsite");
  const configFile = join(configDir, "config.json");
  
  // Ensure the config directory exists
  await ensureDir(configDir);
  
  // Change to the temp directory so config operations work correctly
  Deno.chdir(tempDir);
  
  return {
    tempDir,
    configDir,
    configFile,
    originalCwd,
    cleanup: async () => {
      // Restore original working directory first, before cleanup
      try {
        Deno.chdir(originalCwd);
      } catch (error) {
        // If changing back fails, try to get to a safe directory
        try {
          Deno.chdir("/tmp");
        } catch {
          // Last resort
          console.warn("Failed to change back to original directory");
        }
      }
      
      // Clean up temporary directory
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch (error) {
        // Ignore cleanup errors in tests, but log them for debugging
        console.warn(`Failed to cleanup test directory ${tempDir}:`, error);
      }
    }
  };
}

/**
 * Test decorator that automatically sets up and tears down test environment
 */
export function withTestEnvironment<T extends unknown[]>(
  testFn: (env: TestEnvironment, ...args: T) => Promise<void> | void
) {
  return async (...args: T) => {
    const env = await createTestEnvironment();
    try {
      await testFn(env, ...args);
    } finally {
      await env.cleanup();
    }
  };
}

/**
 * Create a mock config file in the test environment
 */
export async function createMockConfig(env: TestEnvironment, config: any): Promise<void> {
  await Deno.writeTextFile(env.configFile, JSON.stringify(config, null, 2));
}

/**
 * Check if a file exists in the test environment
 */
export async function testFileExists(env: TestEnvironment, relativePath: string): Promise<boolean> {
  const fullPath = join(env.tempDir, relativePath);
  return await exists(fullPath);
}

/**
 * Create a test file in the test environment
 */
export async function createTestFile(
  env: TestEnvironment, 
  relativePath: string, 
  content: string
): Promise<void> {
  const fullPath = join(env.tempDir, relativePath);
  const dir = join(fullPath, "..");
  await ensureDir(dir);
  await Deno.writeTextFile(fullPath, content);
}

/**
 * Environment variable helpers for tests
 */
export class TestEnvVars {
  private originalValues = new Map<string, string | undefined>();

  /**
   * Set an environment variable for the duration of the test
   */
  set(key: string, value: string): void {
    if (!this.originalValues.has(key)) {
      this.originalValues.set(key, Deno.env.get(key));
    }
    Deno.env.set(key, value);
  }

  /**
   * Delete an environment variable for the duration of the test
   */
  delete(key: string): void {
    if (!this.originalValues.has(key)) {
      this.originalValues.set(key, Deno.env.get(key));
    }
    Deno.env.delete(key);
  }

  /**
   * Restore all environment variables to their original values
   */
  restore(): void {
    for (const [key, originalValue] of this.originalValues) {
      if (originalValue === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, originalValue);
      }
    }
    this.originalValues.clear();
  }
}

/**
 * Create a test environment variable manager
 */
export function createTestEnvVars(): TestEnvVars {
  return new TestEnvVars();
}

/**
 * Suppress console output during tests
 */
export function suppressConsole(): () => void {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;

  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};

  return () => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.info = originalInfo;
  };
}

/**
 * Create a timeout that can be used in tests
 */
export function createTestTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Test timeout after ${ms}ms`)), ms);
  });
}