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

// Git commit and tag
const tag = `v${version}`;
const commitMsg = `chore: bump version to ${version}`;

const add = new Deno.Command("git", { args: ["add", "VERSION", "src/version.ts", "deno.json"] });
const addResult = await add.output();
if (!addResult.success) {
  console.error("git add failed");
  Deno.exit(1);
}

const commit = new Deno.Command("git", { args: ["commit", "-m", commitMsg] });
const commitResult = await commit.output();
if (!commitResult.success) {
  console.error("git commit failed (maybe no changes?)");
}

const gitTag = new Deno.Command("git", { args: ["tag", tag] });
const tagResult = await gitTag.output();
if (!tagResult.success) {
  console.error(`git tag ${tag} failed (tag may already exist)`);
  Deno.exit(1);
}

console.log(`Version synced and tagged as ${tag}`);
