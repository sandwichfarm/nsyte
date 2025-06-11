#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env --allow-run

/**
 * Run tests with coverage, excluding tests that might hang
 */

const EXCLUDED_TESTS = [
  "tests/unit/run_command_test.ts", // Contains tests that start actual HTTP server
  "tests/unit/run_command_core_test.ts", // Has ignored tests that might hang
];

async function main() {
  console.log("Running tests with coverage (excluding potentially hanging tests)...");
  console.log("Excluded tests:", EXCLUDED_TESTS);

  // Get all test files
  const testFiles: string[] = [];

  async function findTestFiles(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        await findTestFiles(path);
      } else if (
        entry.name.endsWith("_test.ts") || entry.name === "test-secrets.ts" ||
        entry.name === "secrets_test.ts"
      ) {
        const relativePath = path.replace("/Users/sandwich/Develop/nsyte/", "");
        if (!EXCLUDED_TESTS.includes(relativePath)) {
          testFiles.push(path);
        }
      }
    }
  }

  await findTestFiles("/Users/sandwich/Develop/nsyte/tests");

  console.log(`Found ${testFiles.length} test files to run`);

  // Run tests with coverage
  const cmd = new Deno.Command("deno", {
    args: [
      "test",
      "--allow-read",
      "--allow-write",
      "--allow-net",
      "--allow-env",
      "--allow-import",
      "--coverage=test-output/coverage",
      "--no-check",
      ...testFiles,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await cmd.output();

  if (code !== 0) {
    console.error("Tests failed");
    Deno.exit(code);
  }

  console.log("\nTests completed successfully!");
}

if (import.meta.main) {
  await main();
}
