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
import { Input, Select } from "@cliffy/prompt";
import { walk } from "@std/fs";
import type { NostrEvent } from "applesauce-core/helpers";
import {
  buildNappConfigFromAnswers,
  categoryLabel,
  type ProjectConfig,
  readProjectFile,
  writeProjectFile,
} from "../lib/config.ts";
import { getErrorMessage } from "../lib/error-utils.ts";
import { createLogger } from "../lib/logger.ts";
import { NAPP_CATEGORIES } from "../lib/napp/categories.ts";
import { isNapp, validateNappConfig } from "../lib/napp/detect.ts";
import { nappIdentifier, resolveIndexerRelays } from "../lib/napp/identifier.ts";
import { createReleaseNoteEvent, type ReleaseChanges } from "../lib/napp/release.ts";
import { getManifestIdentifier } from "../lib/manifest.ts";
import { fetchSiteManifestEvent, publishEventsToRelaysDetailed } from "../lib/nostr.ts";
import { createSigner } from "../lib/auth/signer-factory.ts";
import { type ResolverOptions, resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
import { getDisplayManager } from "../lib/display-mode.ts";
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

// ---------------------------------------------------------------------------
// `napp release` — pure, signer-free, network-free core (unit-testable)
// ---------------------------------------------------------------------------

/** The five changelog flag arrays, as they arrive from Cliffy's `collect:true`. */
interface ReleaseFlags {
  fix?: string[];
  add?: string[];
  try?: string[];
  cut?: string[];
  sub?: string[];
}

/**
 * Build a {@link ReleaseChanges} object from the repeatable changelog flags, including a
 * category ONLY when its array is present and non-empty. Entries are kept as-is.
 */
export function buildReleaseChangesFromFlags(flags: ReleaseFlags): ReleaseChanges {
  const changes: ReleaseChanges = {};
  const categories = ["fix", "add", "try", "cut", "sub"] as const;
  for (const category of categories) {
    const entries = flags[category];
    if (Array.isArray(entries) && entries.length > 0) {
      changes[category] = entries;
    }
  }
  return changes;
}

/** True iff any change category has at least one entry. */
export function hasAnyChange(changes: ReleaseChanges): boolean {
  const categories = ["fix", "add", "try", "cut", "sub"] as const;
  return categories.some((c) => (changes[c]?.length ?? 0) > 0);
}

/**
 * Pin the app version from the fetched site manifest. The release note's `d` = this
 * manifest's EVENT id; `D` = its `d` tag (empty for a root site, which has no d tag).
 */
export function resolveManifestVersion(
  manifest: NostrEvent,
): { manifestId: string; manifestDTag: string; manifestCreatedAt: number } {
  return {
    manifestId: manifest.id,
    manifestDTag: getManifestIdentifier(manifest) ?? "",
    manifestCreatedAt: manifest.created_at,
  };
}

/**
 * `napp release` action: resolve config + author pubkey + signer, fetch the current site
 * manifest to pin the app version, collect change entries (flags and/or interactive
 * prompt), sign the kind-39108 event, and publish to dedupe(write ∪ indexer) relays.
 *
 * This command SIGNS + PUBLISHES (unlike `napp id`, which only prints). It is NOT
 * unit-tested directly (it fetches/signs/publishes); the unit tests cover the pure
 * helpers above.
 */
async function nappReleaseAction(
  options: {
    config?: string | boolean;
    sec?: string;
    pubkey?: string;
    relays?: string;
    createdAt?: number;
    fix?: string[];
    add?: string[];
    try?: string[];
    cut?: string[];
    sub?: string[];
  },
): Promise<void> {
  const configPath = typeof options.config === "string" ? options.config : undefined;
  const projectConfig = readProjectFile(configPath);
  if (!projectConfig) {
    console.error(colors.red("No .nsite/config.json found."));
    Deno.exit(1);
  }

  // Gate on napp: release notes are a napp-only concept.
  if (!isNapp(projectConfig)) {
    console.error(
      colors.red(
        "This project is not a napp — add a `napp` section to .nsite/config.json (see `nsyte napp init`).",
      ),
    );
    Deno.exit(1);
  }

  // Resolve author pubkey (for the manifest FETCH) and write relays.
  const pubkey = await resolvePubkey(options as ResolverOptions, projectConfig);
  const resolvedRelays = resolveRelays(options as ResolverOptions, projectConfig);

  // Build the signer via the same factory deploy uses (sec > stored bunkerPubkey).
  const signerResult = await createSigner({
    sec: options.sec,
    bunkerPubkey: projectConfig.bunkerPubkey,
  });
  if ("error" in signerResult) {
    console.error(colors.red(signerResult.error));
    Deno.exit(1);
  }
  const signer = signerResult.signer;

  // Fetch the CURRENT manifest (app version). Named sites query by config.id; root sites
  // (no id) fetch the root manifest (kind 15128).
  const identifier = typeof projectConfig.id === "string" && projectConfig.id
    ? projectConfig.id
    : undefined;
  const manifest = await fetchSiteManifestEvent(resolvedRelays, pubkey, identifier);
  if (!manifest) {
    console.error(
      colors.red(
        "No site manifest found for this pubkey on the configured relays. Deploy your site first (`nsyte deploy`) before publishing a release note.",
      ),
    );
    Deno.exit(1);
  }
  const version = resolveManifestVersion(manifest);

  // Collect changes from flags; fall back to a simple interactive prompt.
  let changes = buildReleaseChangesFromFlags(options);
  if (!hasAnyChange(changes)) {
    if (getDisplayManager().isInteractive()) {
      // Simple prompt collects GENERIC `sub` entries; flag users get fine-grained
      // fix/add/try/cut. Loop until the author submits a blank line.
      const collected: string[] = [];
      while (true) {
        const entry = await Input.prompt({ message: "Changelog entry (blank to finish):" });
        if (!entry || entry.trim().length === 0) break;
        collected.push(entry.trim());
      }
      if (collected.length > 0) {
        changes = { sub: collected };
      }
    }
    if (!hasAnyChange(changes)) {
      console.error(
        colors.red(
          "No changelog entries. Provide at least one of --fix/--add/--try/--cut/--sub, or run interactively.",
        ),
      );
      Deno.exit(1);
    }
  }

  // Build + sign the kind-39108 event.
  const releaseEvent = await createReleaseNoteEvent(signer, {
    ...version,
    changes,
    createdAt: options.createdAt,
  });

  // Publish to the deduped UNION of write relays and indexer relays (mirror deploy).
  const indexerRelays = resolveIndexerRelays(projectConfig);
  const publishRelays = Array.from(new Set([...resolvedRelays, ...indexerRelays]));
  console.log(colors.gray(`Indexer relays: ${indexerRelays.join(", ")}`));
  const result = await publishEventsToRelaysDetailed(publishRelays, [releaseEvent]);

  const eventResult = result.eventResults[0];
  const relayResults = eventResult?.relayResults ?? [];
  for (const r of relayResults) {
    if (r.ok) {
      console.log(colors.green(`  ✓ ${r.relay}`));
    } else {
      console.log(colors.red(`  ✗ ${r.relay}${r.message ? ` (${r.message})` : ""}`));
    }
  }

  if (result.allEventsPublished) {
    console.log(colors.green(`Release note published (kind 39108): ${releaseEvent.id}`));
  } else {
    console.error(colors.red("Failed to publish release note to all relays."));
    Deno.exit(1);
  }
}

// ---------------------------------------------------------------------------
// `napp init` — retrofit a napp section onto an existing project config
// ---------------------------------------------------------------------------

/**
 * Collect napp listing answers via the SAME prompt sequence as the init wizard, then
 * shape them with the SINGLE assembly helper. Interactive (not unit-tested); the pure
 * assembly/validation it feeds is covered by the wizard + init tests.
 */
async function collectNappAnswers(): Promise<ReturnType<typeof buildNappConfigFromAnswers>> {
  const name = await Input.prompt({
    message: "App name:",
    validate: (v: string) => v.trim().length > 0 || "Name is required",
  });
  const iconHash = await Input.prompt({
    message: "Icon (sha256 hash or URL):",
    validate: (v: string) => v.trim().length > 0 || "Icon is required",
  });
  const iconMime = await Input.prompt({ message: "Icon MIME type:", default: "image/png" });

  const category = await Select.prompt<string>({
    message: "Category",
    options: Object.keys(NAPP_CATEGORIES).map((c) => ({ name: c, value: c })),
  });
  const subcategory = await Select.prompt<string>({
    message: "Subcategory",
    options: NAPP_CATEGORIES[category].map((s) => ({ name: s, value: s })),
  });
  const label = categoryLabel(category, subcategory);

  const countriesInput = await Input.prompt({
    message: "Countries (comma-separated ISO codes, or * for worldwide):",
    default: "*",
  });
  const countries = countriesInput.split(",").map((c) => c.trim()).filter((c) => c.length > 0);

  const summary = await Input.prompt({ message: "Summary (optional):" });
  const description = await Input.prompt({ message: "Description (optional):" });

  return buildNappConfigFromAnswers({
    name,
    iconHash,
    iconMime,
    categories: [label],
    countries: (countries.length === 0 || (countries.length === 1 && countries[0] === "*"))
      ? ["*"]
      : countries,
    summary,
    description,
  });
}

/**
 * `napp init` action: read the existing project config, refuse to overwrite an existing
 * napp, collect listing answers, validate, and write `{ ...projectConfig, napp }` back —
 * the spread preserves all unrelated keys (T-24-01).
 */
async function nappInitAction(options: { config?: string | boolean }): Promise<void> {
  const configPath = typeof options.config === "string" ? options.config : undefined;
  const projectConfig = readProjectFile(configPath);

  if (!projectConfig) {
    console.error(
      colors.red(
        "No .nsite/config.json found — run `nsyte init` first to create a project, then `nsyte napp init` to retrofit a napp section.",
      ),
    );
    Deno.exit(1);
  }

  if (isNapp(projectConfig)) {
    console.log(
      colors.yellow(
        "This project is already a napp. Edit the `napp` section in .nsite/config.json directly, or remove it and re-run.",
      ),
    );
    return;
  }

  const napp = await collectNappAnswers();
  const errors = validateNappConfig(napp);
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(colors.red(`  ${e.path}: ${e.message}`));
    }
    console.error(colors.red("napp section is invalid; not written. Fix the inputs and re-run."));
    Deno.exit(1);
  }

  const updated: ProjectConfig = { ...projectConfig, napp };
  writeProjectFile(updated, configPath);
  console.log(
    colors.green(
      "Added `napp` section to .nsite/config.json. Run `nsyte napp validate` to check readiness.",
    ),
  );
}

// ---------------------------------------------------------------------------
// `napp validate` — structural validation (hard-fail) + NIP-07 heuristic (warn-only)
// ---------------------------------------------------------------------------

/** Evidence tokens (lowercased) that indicate NIP-07 (`window.nostr`) support. */
const NIP07_TOKENS = ["window.nostr", "nostr-login", "nip07", "getpublickey"] as const;

/** True iff `text` contains any NIP-07 evidence token (case-insensitive). */
export function detectNip07InText(text: string): boolean {
  const lower = text.toLowerCase();
  return NIP07_TOKENS.some((t) => lower.includes(t));
}

/**
 * Recursively scan `dir` for built JS/HTML files containing NIP-07 evidence. Read-only
 * over a fixed extension allow-list; walks ONLY the given dir (T-24-04). A missing dir
 * returns false without throwing (T-24-05) — the heuristic is advisory.
 */
export async function scanDirForNip07Evidence(dir: string): Promise<boolean> {
  try {
    for await (
      const entry of walk(dir, {
        exts: ["js", "mjs", "html", "htm"],
        includeDirs: false,
      })
    ) {
      const text = await Deno.readTextFile(entry.path);
      if (detectNip07InText(text)) return true;
    }
  } catch {
    // Missing/unreadable dir => no evidence (advisory, never blocks).
    return false;
  }
  return false;
}

/** Structured result of `napp validate`. Structural errors drive `ok`; NIP-07 is advisory. */
export interface NappValidateReport {
  ok: boolean;
  structuralErrors: { path: string; message: string }[];
  nip07: "pass" | "warn";
}

/**
 * Assemble the validate report. Structural errors are the ONLY hard failure; the NIP-07
 * signal sets a pass/warn note and NEVER flips `ok` to false.
 */
export function assembleValidateReport(input: {
  structuralErrors: { path: string; message: string }[];
  nip07Found: boolean;
}): NappValidateReport {
  return {
    ok: input.structuralErrors.length === 0,
    structuralErrors: input.structuralErrors,
    nip07: input.nip07Found ? "pass" : "warn",
  };
}

/**
 * `napp validate` action: structural `validateNappConfig` errors (hard-fail) plus a
 * best-effort NIP-07 heuristic over the optional `[dir]` (warn-only). Surfaces the `+`
 * identifier informationally (root sites have none — skip silently).
 */
async function nappValidateAction(
  dir: string | undefined,
  options: { config?: string | boolean },
): Promise<void> {
  const configPath = typeof options.config === "string" ? options.config : undefined;
  const projectConfig = readProjectFile(configPath);

  if (!projectConfig) {
    console.error(colors.red("No .nsite/config.json found."));
    Deno.exit(1);
  }

  if (!isNapp(projectConfig)) {
    console.error(
      colors.red(
        "This project is not a napp — run `nsyte napp init` to add a `napp` section.",
      ),
    );
    Deno.exit(1);
  }

  const structuralErrors = validateNappConfig(projectConfig.napp);

  const scanDir = dir ?? ".";
  const nip07Found = await scanDirForNip07Evidence(scanDir);

  const report = assembleValidateReport({ structuralErrors, nip07Found });

  if (report.structuralErrors.length > 0) {
    for (const e of report.structuralErrors) {
      console.error(colors.red(`  ${e.path}: ${e.message}`));
    }
  } else {
    console.log(colors.green("✓ napp config is structurally valid."));
  }

  if (report.nip07 === "pass") {
    console.log(colors.green(`✓ NIP-07 usage detected in ${scanDir}.`));
  } else {
    console.log(
      colors.yellow(
        `⚠ NIP-07 support not detected in ${scanDir} — a napp SHOULD support NIP-07 (window.nostr). This is a heuristic; verify manually.`,
      ),
    );
  }

  // Informational identifier (best-effort; root sites have none).
  try {
    const pubkey = await resolvePubkey(options as ResolverOptions, projectConfig);
    const id = resolveNappIdentifier(projectConfig, pubkey);
    console.log(colors.gray(`App identifier: ${id}`));
  } catch {
    // Root sites / unresolvable pubkey — informational only, never a validate failure.
  }

  if (!report.ok) Deno.exit(1);
}

/** Register the `napp` command (and its subcommands) on the root program. */
export function registerNappCommand(): void {
  const napp = new Command()
    .description("Manage napp (NIP-5B) operations")
    .action(async () => {
      // Show help when no subcommand is provided.
      await napp.showHelp();
    })
    // id subcommand — followed by `.reset()` so `release` can be appended below.
    // The global `-c/--config` (+ `--created-at`) live on the parent program, so the
    // action's options object carries them at runtime even though this standalone
    // Command's generics don't surface them — read them via a cast. `--sec/--relays/
    // --pubkey` are NOT globals, so the `release` subcommand declares its own below.
    .command("id", "Print the shareable + app identifier for this napp")
    .action(async (options) => {
      await nappIdAction(options as unknown as { config?: string | boolean });
    })
    // Future phases append `init`/`validate` here as
    //   .reset().command("...", "...").action(...)
    // chains BEFORE the final subcommand (the last one omits `.reset()`).
    // release subcommand (LAST — no trailing .reset()).
    .reset()
    .command("release", "Publish a kind-39108 changelog for the current app version")
    .option("--sec <secret:string>", "Private key (nsec/hex), nbunksec, or bunker:// URL to sign with")
    .option("--relays <relays:string>", "Comma-separated relay URLs (overrides config)")
    .option("--pubkey <pubkey:string>", "Public key (hex/npub) to resolve the manifest for")
    .option("--fix <text:string>", "Bug-fix changelog entry (repeatable)", { collect: true })
    .option("--add <text:string>", "Added-feature changelog entry (repeatable)", { collect: true })
    .option("--try <text:string>", "Experimental changelog entry (repeatable)", { collect: true })
    .option("--cut <text:string>", "Removed-feature changelog entry (repeatable)", { collect: true })
    .option("--sub <text:string>", "Generic changed/substitute changelog entry (repeatable)", {
      collect: true,
    })
    .action(async (options) => {
      await nappReleaseAction(
        options as unknown as {
          config?: string | boolean;
          sec?: string;
          pubkey?: string;
          relays?: string;
          createdAt?: number;
          fix?: string[];
          add?: string[];
          try?: string[];
          cut?: string[];
          sub?: string[];
        },
      );
    })
    // init subcommand — interactive retrofit; NO `.option` (honors only global -c/--config).
    .reset()
    .command("init", "Retrofit a napp section onto this project's config")
    .action(async (options) => {
      await nappInitAction(options as unknown as { config?: string | boolean });
    })
    // validate subcommand (LAST — no trailing .reset()). Positional [dir] only, NO `.option`.
    .reset()
    .command("validate", "Check napp readiness: required fields, categories, and a NIP-07 heuristic")
    .arguments("[dir:string]")
    .action(async (options, dir) => {
      await nappValidateAction(dir, options as unknown as { config?: string | boolean });
    });

  nsyte.command("napp", napp);
}
