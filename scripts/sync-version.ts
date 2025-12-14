/**
 * Syncs VERSION, src/version.ts, and deno.json version to the provided value.
 *
 * Usage:
 *   deno run --allow-read --allow-write scripts/sync-version.ts 1.2.3
 *   VERSION=1.2.3 deno run --allow-read --allow-write scripts/sync-version.ts
 */

const versionArg = Deno.args[0] || Deno.env.get("VERSION");

if (!versionArg) {
  console.error("Version not provided. Pass it as an argument or set VERSION env.");
  Deno.exit(1);
}

const version = versionArg.startsWith("v") ? versionArg.slice(1) : versionArg;

await Deno.writeTextFile("VERSION", `${version}\n`);
await Deno.writeTextFile("src/version.ts", `export const version = "${version}";\n`);

const denoJsonPath = "deno.json";
const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
denoJson.version = version;
await Deno.writeTextFile(denoJsonPath, JSON.stringify(denoJson, null, 2) + "\n");
