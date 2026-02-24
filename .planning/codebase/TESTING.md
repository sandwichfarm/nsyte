# Testing Patterns

**Analysis Date:** 2026-02-24

## Test Framework

**Runner:**
- Deno test runner (built-in)
- Config: `deno.json` and `deno.test.json`
- Deno test uses `@std/testing` module

**Assertion Library:**
- Standard library assertions from `@std/assert`:
  - `assertEquals(actual, expected)` - Strict equality
  - `assertExists(value)` - Check value is not null/undefined
  - `assertThrows(fn, ErrorType, message?)` - Assert error thrown
  - `assertRejects(promise, ErrorType, message?)` - Assert promise rejects
  - `assertStringIncludes(str, substring)` - Check substring present

**Run Commands:**
```bash
deno task test              # Run all tests with --allow-all
deno task test:unit         # Run unit tests only (tests/unit/)
deno task test:integration  # Run integration tests (tests/integration/)
deno task test:fast         # Quick smoke tests (60-second timeout)
deno task coverage          # Generate coverage report
deno task coverage:badge    # Generate coverage badge
```

## Test File Organization

**Location:**
- Unit tests: `tests/unit/{module}_test.ts` (co-located by concern)
- Integration tests: `tests/integration/{feature}_test.ts`
- Test utilities: `tests/utils/test-env.ts`
- 44 test files total across unit and integration suites

**Naming:**
- Pattern: `{module}_test.ts` where module matches source file
- Examples: `logger_test.ts`, `config_test.ts`, `files_test.ts`, `cli_test.ts`

**Structure:**
```
tests/
├── unit/                          # Unit tests
│   ├── logger_test.ts
│   ├── config_test.ts
│   ├── cli_test.ts
│   └── [44 test files total]
├── integration/                   # Integration tests
│   ├── cli_workflows_test.ts
│   ├── config_handling_test.ts
│   ├── secrets_test.ts
│   ├── ui_interaction_test.ts
│   └── upload_download_workflows_test.ts
└── utils/
    └── test-env.ts               # Shared test utilities
```

## Test Structure

**Suite Organization:**
```typescript
// Simple test (no suite)
Deno.test("files constants", async (t) => {
  await t.step("should export default ignore patterns", () => {
    assertExists(DEFAULT_IGNORE_PATTERNS);
  });
});

// Describe/it style (BDD)
import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";

describe("logger - comprehensive branch coverage", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe("formatLogMessage", () => {
    it("should format all log levels correctly", () => {
      // Test
    });
  });
});
```

**Patterns:**
- `beforeEach()` for common setup (mocks, state reset, env vars)
- `afterEach()` for cleanup (restore mocks, reset env vars, flush state)
- `describe()` blocks for grouping related tests by feature
- `it()` for individual test cases with clear descriptions
- Async tests use `async (t)` parameter and `await t.step()` for nested tests

## Mocking

**Framework:** `@std/testing/mock` module

**Patterns:**
```typescript
import { stub, spy, restore } from "@std/testing/mock";

// Stubbing console methods
let consoleLogStub = stub(console, "log", () => {});
let consoleErrorStub = stub(console, "error", () => {});

// Using spy to track calls
const mockEvent = {
  preventDefault: spy(),
};

// Restore all mocks
restore();
```

**Special Cases:**
- Deno.build cannot be stubbed: use `(Deno as any).build = {...}` instead
- ES module namespace exports are non-configurable: stub underlying Deno APIs
- @cliffy/ansi/colors wraps text in ANSI codes: use `includes()` not exact equality checks
- Real HTTP requests: use `sanitizeOps: false, sanitizeResources: false` in test config

**Capturing Output:**
```typescript
let logOutput: string[] = [];
let errorOutput: string[] = [];

console.log = (...args: unknown[]) => {
  logOutput.push(args.map(String).join(" "));
};
console.error = (...args: unknown[]) => {
  errorOutput.push(args.map(String).join(" "));
};

// After test, restore
console.log = originalConsoleLog;
console.error = originalConsoleError;
```

**What to Mock:**
- Console methods (log, error, warn, info)
- Global functions (Math.random, Deno.exit, addEventListener)
- External module exports when testing error paths
- Deno APIs sparingly (prefer real operations when safe)

**What NOT to Mock:**
- File system operations in unit tests (use temp directories)
- Logger internals (test through public API)
- TypeScript type operations (not runtime)
- Pure utility functions (test with real inputs)

## Fixtures and Factories

**Test Data:**
```typescript
// Mock config factory
function createMockConfig(env: TestEnvironment, config: any): Promise<void> {
  return Deno.writeTextFile(env.configFile, JSON.stringify(config, null, 2));
}

// Test environment setup
const config: ProjectConfig = {
  relays: ["wss://test.relay"],
  servers: ["https://test.server"],
};
```

**Location:**
- Test utilities in `tests/utils/test-env.ts`
- Environment helpers: `TestEnvironment`, `createTestEnvironment()`, `withTestEnvironment()`
- Variable helpers: `TestEnvVars` class for managing env vars across tests
- Console suppression: `suppressConsole()` function for quiet tests

**Test Environment Isolation:**
```typescript
// Use withTestEnvironment decorator for automatic setup/teardown
Deno.test(
  "Config - File Operations",
  withTestEnvironment(async (env, t) => {
    // env.tempDir, env.configDir, env.configFile available
    // env.cleanup() called automatically
  }),
);
```

## Coverage

**Requirements:** No minimum enforced in codebase

**View Coverage:**
```bash
deno task coverage              # Generate coverage/
deno task coverage:report       # Generate coverage badge
```

**Execution Context:**
- Coverage includes `--allow-read`, `--allow-write`, `--allow-net`, `--allow-env`, `--allow-import`
- Coverage output: `test-output/coverage/` directory

## Test Types

**Unit Tests:**
- Scope: Single module functions in isolation
- Approach: Mock external dependencies, test pure logic
- Examples:
  - `logger_test.ts`: Tests logger creation, formatting, log level filtering (44 tests)
  - `files_test.ts`: Tests file scanning, ignore patterns, hashing
  - `error_utils_test.ts`: Tests error message extraction and formatting
  - `cli_test.ts`: Tests CLI argument parsing and error handling (60+ test cases)

**Integration Tests:**
- Scope: Multiple modules working together, real file I/O when necessary
- Approach: Use temp directories, minimal mocking
- Examples:
  - `cli_workflows_test.ts`: Tests command argument validation and workflows
  - `config_handling_test.ts`: Tests config file reading/writing with different paths
  - `secrets_test.ts`: Tests secret storage and retrieval
  - `upload_download_workflows_test.ts`: Tests upload/download command flows

**E2E Tests:**
- Not used in this codebase
- CLI is tested through integration tests with real file operations

## Common Patterns

**Async Testing:**
```typescript
// Using step function (Deno built-in)
Deno.test("async operations", async (t) => {
  await t.step("should handle async function", async () => {
    const result = await asyncFunction();
    assertEquals(result, expected);
  });
});

// Using describe/it (BDD style)
describe("async operations", () => {
  it("should handle async function", async () => {
    const result = await asyncFunction();
    assertEquals(result, expected);
  });
});
```

**Error Testing:**
```typescript
// Synchronous error
assertThrows(
  () => validateUploadArgs([]),
  Error,
  "Missing required argument"
);

// Asynchronous error
assertRejects(
  () => asyncFunction(),
  Error,
  "Operation failed"
);

// Try/catch in async test
try {
  await asyncFunction();
  assertEquals(true, false, "Should have thrown error");
} catch (error) {
  assertEquals(error instanceof Error, true);
  assertEquals((error as Error).message, "Expected message");
}
```

**Environment Variable Testing:**
```typescript
// Using TestEnvVars class
const envVars = createTestEnvVars();
envVars.set("LOG_LEVEL", "debug");
envVars.delete("DEBUG");
// ... run tests ...
envVars.restore();

// Or with withTestEnvironment (auto-cleanup via beforeEach/afterEach)
beforeEach(() => {
  originalLogLevel = Deno.env.get("LOG_LEVEL");
  Deno.env.set("LOG_LEVEL", "debug");
});

afterEach(() => {
  if (originalLogLevel !== undefined) {
    Deno.env.set("LOG_LEVEL", originalLogLevel);
  } else {
    Deno.env.delete("LOG_LEVEL");
  }
});
```

**File I/O Testing:**
```typescript
// Create temp directory per test
const tempDir = await Deno.makeTempDir({ prefix: "nsyte-test-" });
try {
  await Deno.writeTextFile(join(tempDir, "test.txt"), "content");
  const files = await getLocalFiles(tempDir);
  assertEquals(files.length > 0, true);
} finally {
  await Deno.remove(tempDir, { recursive: true });
}

// Or use withTestEnvironment which handles cleanup
Deno.test(
  "File operations",
  withTestEnvironment(async (env) => {
    await Deno.writeTextFile(join(env.tempDir, "test.txt"), "content");
    // Cleanup automatic via env.cleanup()
  }),
);
```

**State Isolation Between Tests:**
```typescript
// Reset global state in beforeEach
beforeEach(() => {
  logOutput = [];
  errorOutput = [];
  setProgressMode(false);
  getDisplayManager().setMode(DisplayMode.NON_INTERACTIVE);
});

// Restore everything in afterEach
afterEach(() => {
  restore(); // Restore all mocks
  envVars.restore(); // Restore env vars
  setProgressMode(false);
});
```

## Test Configuration

**deno.json:**
- Format config: indentWidth 2, lineWidth 100, singleQuote false, semiColons true
- Test include: `tests/` directory
- Imports: @std, @cliffy, applesauce, rxjs, and crypto libraries

**deno.test.json:**
- Extends `deno.json`
- Test files: includes `tests/`, excludes `tests/test-secrets.ts`
- Environment: `NSYTE_TEST_MODE=true`

**Permissions:**
- `--allow-all` for full test suite (file, net, env, sys, run)
- `--allow-read`, `--allow-write`, `--allow-net`, `--allow-env` for coverage
- `--no-check` flag for test execution (performance)

---

*Testing analysis: 2026-02-24*
