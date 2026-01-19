import { Stub, stub } from "jsr:@std/testing/mock";

/**
 * Helper to stub Deno.exit for tests
 */
export function stubExit(): Stub {
  return stub(Deno, "exit", (code?: number) => {
    // Don't actually exit, just record the call
    return undefined as never;
  });
}

/**
 * Helper to stub console methods for tests
 */
export function stubConsole() {
  const logs: string[] = [];
  const errors: string[] = [];

  const logStub = stub(console, "log", (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });

  const errorStub = stub(console, "error", (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });

  return {
    logs,
    errors,
    restore: () => {
      logStub.restore();
      errorStub.restore();
    },
  };
}

/**
 * Helper to create a test directory and clean it up
 */
export function createTestDir(name: string) {
  const testDir = `./test_${name}_${Date.now()}`;

  const cleanup = () => {
    try {
      Deno.removeSync(testDir, { recursive: true });
    } catch {
      // Ignore errors
    }
  };

  // Clean up any existing directory
  cleanup();

  // Create fresh directory
  Deno.mkdirSync(testDir, { recursive: true });

  return { testDir, cleanup };
}
