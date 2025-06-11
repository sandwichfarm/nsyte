#!/usr/bin/env -S deno test --allow-read --allow-write --allow-env --allow-run --allow-net

/**
 * Test runner for nsyte secrets management
 * Run with: deno run --allow-read --allow-write --allow-env --allow-run run-tests.ts
 * Or simply: deno test --allow-read --allow-write --allow-env --allow-run --allow-net
 */

// This file serves as documentation for running tests
// The actual tests are in tests/unit/

console.log("🧪 Running nsyte tests");
console.log("Run all unit tests with: deno test --allow-all tests/unit/");
console.log("Run integration tests with: deno test --allow-all tests/integration/");