#!/usr/bin/env -S deno run --allow-all

/**
 * Test runner with comprehensive mocking setup
 */

import { stub } from "jsr:@std/testing/mock";

// Global test setup
async function setupTestEnvironment() {
  console.log("🔧 Setting up test environment...");

  // 1. Mock keychain to always return null (force encrypted storage)
  const keychainModule = await import("../src/lib/secrets/keychain.ts");
  stub(keychainModule, "getKeychainProvider", () => {
    console.debug("Mock: getKeychainProvider returning null");
    return Promise.resolve(null);
  });

  // 2. Mock Deno.exit to prevent tests from exiting
  const originalExit = Deno.exit;
  (Deno as any).exit = (code?: number) => {
    console.debug(`Mock: Deno.exit(${code}) prevented`);
    throw new Error(`Test tried to exit with code ${code}`);
  };

  // 3. Mock interactive prompts
  try {
    const confirmModule = await import("@cliffy/prompt/confirm");
    stub(confirmModule.Confirm, "prompt", () => {
      throw new Error("Interactive Confirm.prompt blocked in tests");
    });
  } catch { /* Module not loaded */ }

  try {
    const selectModule = await import("@cliffy/prompt/select");
    stub(selectModule.Select, "prompt", () => {
      throw new Error("Interactive Select.prompt blocked in tests");
    });
  } catch { /* Module not loaded */ }

  try {
    const inputModule = await import("@cliffy/prompt/input");
    stub(inputModule.Input, "prompt", () => {
      throw new Error("Interactive Input.prompt blocked in tests");
    });
  } catch { /* Module not loaded */ }

  try {
    const secretModule = await import("@cliffy/prompt/secret");
    stub(secretModule.Secret, "prompt", () => {
      throw new Error("Interactive Secret.prompt blocked in tests");
    });
  } catch { /* Module not loaded */ }

  // 4. Reset SecretsManager singleton for each test run
  const secretsModule = await import("../src/lib/secrets/manager.ts");
  (secretsModule.SecretsManager as any).instance = null;

  console.log("✅ Test environment ready");
}

// Run setup
await setupTestEnvironment();

// Determine which tests to run
const args = Deno.args;
let testPaths = ["tests/unit/", "tests/integration/"];

if (args.length > 0) {
  testPaths = args;
}

console.log(`\n🧪 Running tests in: ${testPaths.join(", ")}\n`);

// Run tests
const command = new Deno.Command("deno", {
  args: [
    "test",
    "--allow-all",
    "--no-prompt",
    "--no-check", // Skip type checking for now
    ...testPaths,
  ],
  stdout: "inherit",
  stderr: "inherit",
});

const { code } = await command.output();

console.log(`\n🏁 Tests completed with exit code: ${code}`);
Deno.exit(code);
