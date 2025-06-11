#!/usr/bin/env -S deno run --allow-all

/**
 * Safe test runner that prevents keychain access
 */

// Import global test setup FIRST to block all system access
await import("./test-setup-global.ts");

console.log("🔒 Running tests with ALL system access blocked");

// Get test paths from arguments
const args = Deno.args;
let testPaths = ["tests/unit/", "tests/integration/"];

if (args.length > 0) {
  testPaths = args;
}

console.log(`🧪 Running tests in: ${testPaths.join(", ")}\n`);

// Run tests with Deno.test
const command = new Deno.Command("deno", {
  args: [
    "test",
    "--allow-all",
    "--no-prompt",
    "--no-check", // Skip type checking for now
    ...testPaths,
  ],
  env: {
    ...Deno.env.toObject(),
    NSYTE_DISABLE_KEYCHAIN: "true",
  },
  stdout: "inherit",
  stderr: "inherit",
});

const { code } = await command.output();

console.log(`\n🏁 Tests completed with exit code: ${code}`);
Deno.exit(code);
