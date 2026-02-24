#!/usr/bin/env -S deno run --allow-run

/**
 * Pre-flight check: verify Deno runtime is installed and meets nsyte's minimum version (2.x).
 *
 * Exit 0: Deno 2.x found.
 * Exit 1: Deno not found, or version is older than 2.x.
 */

async function checkDeno(): Promise<void> {
  let result: Deno.CommandOutput;

  try {
    result = await new Deno.Command("deno", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    }).output();
  } catch {
    console.error("✗ Deno not found. Install from: https://deno.land/");
    Deno.exit(1);
  }

  if (result.code !== 0) {
    console.error("✗ Deno not found. Install from: https://deno.land/");
    Deno.exit(1);
  }

  const output = new TextDecoder().decode(result.stdout);
  const match = output.match(/deno (\d+\.\d+\.\d+)/);

  if (!match) {
    console.log("✓ Deno found (could not parse version string)");
    return;
  }

  const version = match[1];
  const major = parseInt(version.split(".")[0], 10);

  if (major < 2) {
    console.error(`✗ Deno ${version} found but nsyte requires Deno 2.x`);
    Deno.exit(1);
  }

  console.log(`✓ Deno ${version} (meets nsyte requirement: 2.x)`);
}

if (import.meta.main) {
  await checkDeno();
}
