/**
 * `nsyte napp` command — Manage napp (NIP-5B) operations.
 *
 * Modeled on `registerBunkerCommand` (src/commands/bunker.ts): a nested Cliffy
 * `Command` whose parent shows help and whose subcommands are chained with
 * `.command(...).action(...).reset()` (the LAST subcommand omits `.reset()`).
 *
 * Currently exposes a single `id` subcommand that prints the shareable `+` app
 * identifier for this napp. Future phases append `release`/`init`/`validate` by
 * inserting more `.reset().command(...).action(...)` chains before the final one.
 */
import { colors } from "@cliffy/ansi/colors";
import { Command } from "@cliffy/command";
import { type ProjectConfig, readProjectFile } from "../lib/config.ts";
import { getErrorMessage } from "../lib/error-utils.ts";
import { createLogger } from "../lib/logger.ts";
import { isNapp } from "../lib/napp/detect.ts";
import { nappIdentifier } from "../lib/napp/identifier.ts";
import { type ResolverOptions, resolvePubkey } from "../lib/resolver-utils.ts";
import nsyte from "./root.ts";

const log = createLogger("napp");

/**
 * PURE, signer-free core of `napp id`: build the shareable `+` identifier from a
 * resolved project config and the author pubkey.
 *
 * Throws (with a clear, actionable message) when:
 *  - the project is not a napp (no/invalid `napp` section), or
 *  - the project is a ROOT site (empty/missing `config.id`) — root sites have no `d`
 *    tag and cannot be encoded into a `+` identifier.
 *
 * Relay hints are OPTIONAL: the first up to 2 configured relays become type-1 TLV
 * hints. Decoding tolerates zero relays, so a config with no relays is fine.
 */
export function resolveNappIdentifier(config: ProjectConfig, pubkey: string): string {
  if (!isNapp(config)) {
    throw new Error(
      "This project is not a napp — add a `napp` section to .nsite/config.json (see `nsyte napp init`).",
    );
  }

  // Read config.id from the original ProjectConfig binding (isNapp narrows to
  // `{ napp: NappConfig }`, which lacks `id`).
  const dTag = typeof config.id === "string" ? config.id : "";
  if (!dTag) {
    throw new Error(
      "napp identifiers require a named site — set `id` in .nsite/config.json (root sites have no d tag and cannot be encoded).",
    );
  }

  // Optional relay hints: first up to 2 configured relays. Decoding tolerates zero.
  const relays = (config.relays ?? []).slice(0, 2);

  return nappIdentifier({ dTag, pubkey, relays });
}

/** `napp id` action: resolve config + author pubkey (no signing) and print the identifier. */
async function nappIdAction(options: { config?: string | boolean }): Promise<void> {
  const configPath = typeof options.config === "string" ? options.config : undefined;
  const projectConfig = readProjectFile(configPath);

  if (!projectConfig) {
    console.error(colors.red("No .nsite/config.json found."));
    Deno.exit(1);
  }

  // Resolve the author pubkey WITHOUT signing (cheapest correct path — same as status.ts).
  const pubkey = await resolvePubkey(options as ResolverOptions, projectConfig);

  try {
    const id = resolveNappIdentifier(projectConfig, pubkey);
    // Keep stdout clean and pipe-friendly: just the +... identifier on its own line.
    console.log(id);
  } catch (e) {
    log.debug(`napp id failed: ${getErrorMessage(e)}`);
    console.error(colors.red(getErrorMessage(e)));
    Deno.exit(1);
  }
}

/** Register the `napp` command (and its subcommands) on the root program. */
export function registerNappCommand(): void {
  const napp = new Command()
    .description("Manage napp (NIP-5B) operations")
    .action(async () => {
      // Show help when no subcommand is provided.
      await napp.showHelp();
    })
    // Future phases append `release`/`init`/`validate` here as
    //   .reset().command("...", "...").action(...)
    // chains BEFORE the final subcommand (the last one omits `.reset()`).
    // id subcommand (LAST/only — no trailing .reset()).
    // The global `-c/--config` (+ resolver flags) live on the parent program, so the
    // action's options object carries them at runtime even though this standalone
    // Command's generics don't surface them — read them via a cast.
    .command("id", "Print the shareable + app identifier for this napp")
    .action(async (options) => {
      await nappIdAction(options as unknown as { config?: string | boolean });
    });

  nsyte.command("napp", napp);
}
