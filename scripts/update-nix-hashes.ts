/**
 * Refresh the fixed-output hashes in nix/package.nix.
 *
 * Builds each target; on a fixed-output hash mismatch, writes the hash Nix reports ("got:") back
 * into nix/package.nix. A target that already builds is rebuilt with --rebuild to confirm the
 * stored hash still matches what is fetched today.
 *
 * Usage: deno task nix:update
 */

const PACKAGE_FILE = "nix/package.nix";

const TARGETS = [
  { target: "path:.#denoDeps", attribute: "denoDepsHash" },
];

type BuildResult =
  | { status: "ok" }
  | { status: "mismatch"; hash: string }
  | { status: "failed" };

async function build(target: string, extraArgs: string[] = []): Promise<BuildResult> {
  const { success, stderr } = await new Deno.Command("nix", {
    args: ["build", target, "--no-link", "--print-build-logs", ...extraArgs],
    stdout: "inherit",
    stderr: "piped",
  }).output();

  const log = new TextDecoder().decode(stderr);
  await Deno.stderr.write(stderr);
  if (success) return { status: "ok" };

  const hashes = [...log.matchAll(/got:\s+(sha256-[A-Za-z0-9+/=]+)/g)].map((m) => m[1]);
  const hash = hashes.at(-1);
  return hash ? { status: "mismatch", hash } : { status: "failed" };
}

async function replaceHash(attribute: string, hash: string): Promise<void> {
  const source = await Deno.readTextFile(PACKAGE_FILE);
  const pattern = new RegExp(`^(\\s*${attribute} = )"sha256-[^"]*";`, "gm");
  const matches = source.match(pattern)?.length ?? 0;
  if (matches !== 1) {
    throw new Error(
      `Expected exactly one ${attribute} assignment in ${PACKAGE_FILE}, found ${matches}`,
    );
  }

  await Deno.writeTextFile(PACKAGE_FILE, source.replace(pattern, `$1"${hash}";`));
  console.log(`Updated ${attribute} to ${hash}`);
}

for (const { target, attribute } of TARGETS) {
  console.log(`Checking ${target}`);

  let result = await build(target);
  if (result.status === "ok") result = await build(target, ["--rebuild"]);

  if (result.status === "ok") {
    console.log(`${target} hash is current`);
  } else if (result.status === "mismatch") {
    await replaceHash(attribute, result.hash);
  } else {
    console.error(`Failed to build ${target} without a fixed-output hash mismatch`);
    Deno.exit(1);
  }
}
