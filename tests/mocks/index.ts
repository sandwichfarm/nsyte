import { stub, type Stub } from "std/testing/mock.ts";
import type { SecretsManager } from "../../src/lib/secrets/mod.ts";
import type { ProjectConfig } from "../../src/lib/config.ts";

// Import the comprehensive mock
export * from "./secrets-manager.ts";

/**
 * Stub Deno.exit properly with correct typing
 */
export function stubExit(): Stub {
  // Create a mock function that matches Deno.exit signature but doesn't actually exit
  const mockExit = ((code?: number): never => {
    // Record the exit code for assertions if needed
    (mockExit as any).lastExitCode = code;
    // Don't actually exit, just return undefined
    return undefined as never;
  }) as (code?: number) => never;
  
  return stub(Deno, "exit", mockExit);
}

/**
 * Create a mock SecretsManager instance
 */
export function createMockSecretsManager(
  data: Record<string, string> = {}
): Partial<SecretsManager> & {
  storeNbunk: (pubkey: string, nbunk: string) => Promise<boolean>;
  getNbunk: (pubkey: string) => Promise<string | null>;
  getAllPubkeys: () => Promise<string[]>;
  deleteNbunk: (pubkey: string) => Promise<boolean>;
} {
  const storage = new Map(Object.entries(data));
  
  return {
    storeNbunk: async (pubkey: string, nbunk: string) => {
      storage.set(pubkey, nbunk);
      return true;
    },
    getNbunk: async (pubkey: string) => {
      return storage.get(pubkey) || null;
    },
    getAllPubkeys: async () => {
      return Array.from(storage.keys());
    },
    deleteNbunk: async (pubkey: string) => {
      return storage.delete(pubkey);
    },
    initialize: async () => true,
  };
}

/**
 * Create a minimal project config for testing
 */
export function createTestConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    relays: [],
    servers: [],
    publishServerList: false,
    publishRelayList: false,
    ...overrides,
  };
}

/**
 * Capture console output during tests
 */
export function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
    getOutput: () => [...logs, ...errors].join("\n"),
  };
}

/**
 * Create a test directory with automatic cleanup
 */
export function createTestDirectory(prefix: string = "test") {
  const dir = Deno.makeTempDirSync({ prefix: `nsyte_${prefix}_` });
  
  return {
    path: dir,
    cleanup: () => {
      try {
        Deno.removeSync(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Mock all interactive prompts to throw errors
 */
export async function mockInteractivePrompts() {
  const modules = [
    { path: "@cliffy/prompt/confirm", name: "Confirm" },
    { path: "@cliffy/prompt/select", name: "Select" },
    { path: "@cliffy/prompt/input", name: "Input" },
    { path: "@cliffy/prompt/secret", name: "Secret" },
  ];

  const stubs: Stub[] = [];

  for (const { path, name } of modules) {
    try {
      const module = await import(path);
      if (module[name]) {
        const s = stub(module[name], "prompt", () => {
          throw new Error(`Interactive ${name}.prompt() called in test`);
        });
        stubs.push(s);
      }
    } catch {
      // Module not loaded, skip
    }
  }

  return {
    restore: () => stubs.forEach(s => s.restore()),
  };
}

/**
 * Setup common test mocks - call this at the beginning of test files
 */
export async function setupTestMocks() {
  const stubs: Stub[] = [];

  try {
    // Mock keychain to always return null
    const keychainModule = await import("../../src/lib/secrets/keychain.ts");
    const keychainStub = stub(keychainModule, "getKeychainProvider", () => Promise.resolve(null));
    stubs.push(keychainStub);
  } catch {
    // Module not loaded yet
  }

  return {
    restore: () => stubs.forEach(s => s.restore()),
  };
}