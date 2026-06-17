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
  collectNappListing,
  type NappAssetResolver,
  type NappListingPrefill,
  type ProjectConfig,
  readProjectFile,
  writeProjectFile,
} from "../lib/config.ts";
import { getErrorMessage } from "../lib/error-utils.ts";
import { createLogger } from "../lib/logger.ts";
import {
  classifyAssetInput,
  deriveAssetMime,
  isRootSite,
  parseCategoriesInput,
  parseCountriesInput,
  rootSiteMigrationNotice,
  uploadNappAsset,
} from "../lib/napp/assets.ts";
import { isNapp, validateNappConfig } from "../lib/napp/detect.ts";
import { nappIdentifier, resolveIndexerRelays } from "../lib/napp/identifier.ts";
import { createReleaseNoteEvent, type ReleaseChanges } from "../lib/napp/release.ts";
import { getManifestIdentifier } from "../lib/manifest.ts";
import { fetchSiteManifestEvent, publishEventsToRelaysDetailed } from "../lib/nostr.ts";
import { createSigner } from "../lib/auth/signer-factory.ts";
import { resolvePubkey, resolveRelays, type ResolverOptions } from "../lib/resolver-utils.ts";
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
export function resolveNappIdentifier(
  config: ProjectConfig,
  pubkey: string,
): string {
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
async function nappIdAction(
  options: {
    config?: string | boolean;
    sec?: string;
    pubkey?: string;
  },
): Promise<void> {
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
export function buildReleaseChangesFromFlags(
  flags: ReleaseFlags,
): ReleaseChanges {
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
  const resolvedRelays = resolveRelays(
    options as ResolverOptions,
    projectConfig,
  );

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
  const manifest = await fetchSiteManifestEvent(
    resolvedRelays,
    pubkey,
    identifier,
  );
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
        const entry = await Input.prompt({
          message: "Changelog entry (blank to finish):",
        });
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
  const publishRelays = Array.from(
    new Set([...resolvedRelays, ...indexerRelays]),
  );
  console.log(colors.gray(`Indexer relays: ${indexerRelays.join(", ")}`));
  const result = await publishEventsToRelaysDetailed(publishRelays, [
    releaseEvent,
  ]);

  const eventResult = result.eventResults[0];
  const relayResults = eventResult?.relayResults ?? [];
  for (const r of relayResults) {
    if (r.ok) {
      console.log(colors.green(`  ✓ ${r.relay}`));
    } else {
      console.log(
        colors.red(`  ✗ ${r.relay}${r.message ? ` (${r.message})` : ""}`),
      );
    }
  }

  if (result.allEventsPublished) {
    console.log(
      colors.green(`Release note published (kind 39108): ${releaseEvent.id}`),
    );
  } else {
    console.error(colors.red("Failed to publish release note to all relays."));
    Deno.exit(1);
  }
}

// ---------------------------------------------------------------------------
// `napp init` — retrofit a napp section onto an existing project config
// ---------------------------------------------------------------------------

/** Raw `napp init` flags as they arrive from Cliffy (repeatables are `collect:true`). */
export interface NappInitFlags {
  name?: string;
  icon?: string;
  iconMime?: string;
  category?: string[];
  countries?: string;
  summary?: string;
  description?: string;
  keyart?: string;
  screenshot?: string[];
  self?: string;
  tag?: string[];
  indexerRelay?: string[];
  id?: string;
  yes?: boolean;
}

/** The result of parsing `napp init` flags into a listing prefill + control bits. */
export interface NappInitPlan {
  prefill: NappListingPrefill;
  id?: string;
  yes: boolean;
  missingRequired: string[];
}

/**
 * PURE: parse `napp init` flags into a {@link NappListingPrefill} + control bits. Asset
 * fields stay as raw input strings (the resolver turns them into NappAssets later).
 * `missingRequired` is the subset of `name`/`icon`/`category` that flags did not supply.
 * No prompting, no IO.
 */
export function planNappInitFromFlags(flags: NappInitFlags): NappInitPlan {
  const categories = flags.category && flags.category.length > 0
    ? parseCategoriesInput(flags.category)
    : undefined;
  const countries = flags.countries !== undefined
    ? parseCountriesInput(flags.countries)
    : undefined;

  const prefill: NappListingPrefill = {};
  if (flags.name !== undefined) prefill.name = flags.name;
  if (flags.icon !== undefined) prefill.icon = flags.icon;
  if (flags.iconMime !== undefined) prefill.iconMime = flags.iconMime;
  if (categories !== undefined) prefill.categories = categories;
  if (countries !== undefined) prefill.countries = countries;
  if (flags.summary !== undefined) prefill.summary = flags.summary;
  if (flags.description !== undefined) prefill.description = flags.description;
  if (flags.self !== undefined) prefill.self = flags.self;
  if (flags.keyart !== undefined) prefill.keyart = flags.keyart;
  if (flags.screenshot !== undefined) prefill.screenshots = flags.screenshot;
  if (flags.tag !== undefined) prefill.tags = flags.tag;
  if (flags.indexerRelay !== undefined) prefill.indexerRelays = flags.indexerRelay;

  const missingRequired: string[] = [];
  if (!flags.name || !flags.name.trim()) missingRequired.push("name");
  if (!flags.icon || !flags.icon.trim()) missingRequired.push("icon");
  if (!categories || categories.length === 0) missingRequired.push("category");

  return { prefill, id: flags.id, yes: flags.yes === true, missingRequired };
}

/** Inputs to the pure root-site id decision. */
export interface RootSiteIdInput {
  isRoot: boolean;
  idFlag?: string;
  interactive: boolean;
  confirmed?: boolean;
  confirmedValue?: string;
}

/** Output of the pure root-site id decision. */
export interface RootSiteIdDecision {
  setId?: string;
  printNotice: boolean;
}

/**
 * PURE: decide whether to set an id on a root site, never auto-migrating. An id is set
 * ONLY when `--id` is passed OR (interactive) the user explicitly confirmed and supplied
 * a value. With neither, the napp section is still written without an id. Non-root sites
 * get no notice and no id change.
 */
export function decideRootSiteId(input: RootSiteIdInput): RootSiteIdDecision {
  if (!input.isRoot) return { printNotice: false };
  if (input.idFlag && input.idFlag.trim()) {
    return { setId: input.idFlag.trim(), printNotice: true };
  }
  if (
    input.interactive && input.confirmed &&
    input.confirmedValue && input.confirmedValue.trim()
  ) {
    return { setId: input.confirmedValue.trim(), printNotice: true };
  }
  return { printNotice: true };
}

/**
 * `napp init` action: read the existing project config, refuse to overwrite an existing
 * napp, parse flags, apply root-site guidance, collect listing answers (prompting only for
 * what flags didn't supply, or erroring non-interactively when required fields are missing),
 * validate, and write `{ ...projectConfig, napp }` back — the spread preserves all
 * unrelated keys (T-24-01).
 */
async function nappInitAction(
  options: NappInitFlags & { config?: string | boolean; sec?: string },
): Promise<void> {
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

  const plan = planNappInitFromFlags(options);
  const interactive = getDisplayManager().isInteractive() && !plan.yes;

  // Root-site guidance: warn + opt-in id (never auto-migrate). With --id, set it directly.
  // Interactive without --id: print the notice and offer to set an id. Non-interactive
  // without --id: print the notice and leave id unset.
  if (isRootSite(projectConfig)) {
    const flagDecision = decideRootSiteId({
      isRoot: true,
      idFlag: plan.id,
      interactive,
    });
    if (flagDecision.printNotice) {
      console.log(colors.yellow(rootSiteMigrationNotice()));
    }
    if (flagDecision.setId !== undefined) {
      projectConfig.id = flagDecision.setId;
    } else if (interactive) {
      const setIdNow = await Select.prompt<string>({
        message: "Set a site identifier now? (required for `nsyte napp id`)",
        options: [
          { name: "No — leave as a root site for now", value: "no" },
          { name: "Yes — set a named site identifier", value: "yes" },
        ],
        default: "no",
      });
      let confirmedValue: string | undefined;
      if (setIdNow === "yes") {
        confirmedValue = (await Input.prompt({
          message: "Enter site identifier (lowercase, max 13 chars):",
          validate: (v: string) => v.trim().length > 0 || "Identifier is required",
        })).trim();
      }
      const decision = decideRootSiteId({
        isRoot: true,
        interactive: true,
        confirmed: setIdNow === "yes",
        confirmedValue,
      });
      if (decision.setId !== undefined) {
        projectConfig.id = decision.setId;
      } else {
        console.log(
          colors.yellow(
            "Leaving this as a root site — `nsyte napp id` will not work until you set an id.",
          ),
        );
      }
    } else {
      console.log(
        colors.yellow(
          "Leaving this as a root site — `nsyte napp id` will not work until you set an id.",
        ),
      );
    }
  }

  // Non-interactive with missing required fields: error clearly and exit non-zero (never hang).
  if (!interactive && plan.missingRequired.length > 0) {
    console.error(
      colors.red(
        `Missing required napp fields: ${
          plan.missingRequired.join(", ")
        }. Provide --name, --icon, and at least one --category (or run interactively).`,
      ),
    );
    Deno.exit(1);
  }

  // Asset resolver: hash/URL pass through; a local path is uploaded via a lazily-created
  // signer + the configured servers/relays. Hash/URL inputs never construct a signer.
  let cachedSigner: import("applesauce-signers").ISigner | undefined;
  const resolveAsset: NappAssetResolver = async (value: string) => {
    if (classifyAssetInput(value) !== "path") {
      return { hash: value, mime: deriveAssetMime(value) };
    }
    if (!projectConfig.servers || projectConfig.servers.length === 0) {
      throw new Error(
        `Cannot upload "${value}": configure blossom servers (or paste a sha256 hash / URL).`,
      );
    }
    if (!cachedSigner) {
      const signerResult = await createSigner({
        sec: options.sec,
        bunkerPubkey: projectConfig.bunkerPubkey,
      });
      if ("error" in signerResult) {
        throw new Error(
          `Cannot upload "${value}": ${signerResult.error} (pass --sec, or paste a sha256 hash / URL).`,
        );
      }
      cachedSigner = signerResult.signer;
    }
    return await uploadNappAsset(value, {
      servers: projectConfig.servers,
      relays: projectConfig.relays,
      signer: cachedSigner,
    });
  };

  const napp = await collectNappListing({
    prefill: plan.prefill,
    interactive,
    resolveAsset,
  });

  const errors = validateNappConfig(napp);
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(colors.red(`  ${e.path}: ${e.message}`));
    }
    console.error(
      colors.red(
        "napp section is invalid; not written. Fix the inputs and re-run.",
      ),
    );
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
const NIP07_TOKENS = [
  "window.nostr",
  "nostr-login",
  "nip07",
  "getpublickey",
] as const;

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
  // interactive=false: validate must never prompt for key setup — if no pubkey can be
  // resolved non-interactively, silently skip the identifier line.
  try {
    const pubkey = await resolvePubkey(
      options as ResolverOptions,
      projectConfig,
      false,
    );
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
    // --pubkey` are NOT globals, so each subcommand that needs them declares its own.
    // `id` is read-only (no signing): `--pubkey` lets a user print the identifier without
    // a configured signer; `--sec` derives the pubkey from a key without storing it.
    // (Relay hints come from config.relays inside resolveNappIdentifier.)
    .command("id", "Print the shareable + app identifier for this napp")
    .option(
      "--sec <secret:string>",
      "Private key (nsec/hex), nbunksec, or bunker:// URL to derive the pubkey from",
    )
    .option(
      "--pubkey <pubkey:string>",
      "Public key (hex/npub) to encode into the identifier",
    )
    .action(async (options) => {
      await nappIdAction(
        options as unknown as {
          config?: string | boolean;
          sec?: string;
          pubkey?: string;
        },
      );
    })
    // Future phases append `init`/`validate` here as
    //   .reset().command("...", "...").action(...)
    // chains BEFORE the final subcommand (the last one omits `.reset()`).
    // release subcommand (LAST — no trailing .reset()).
    .reset()
    .command(
      "release",
      "Publish a kind-39108 changelog for the current app version",
    )
    .option(
      "--sec <secret:string>",
      "Private key (nsec/hex), nbunksec, or bunker:// URL to sign with",
    )
    .option(
      "--relays <relays:string>",
      "Comma-separated relay URLs (overrides config)",
    )
    .option(
      "--pubkey <pubkey:string>",
      "Public key (hex/npub) to resolve the manifest for",
    )
    .option("--fix <text:string>", "Bug-fix changelog entry (repeatable)", {
      collect: true,
    })
    .option(
      "--add <text:string>",
      "Added-feature changelog entry (repeatable)",
      { collect: true },
    )
    .option(
      "--try <text:string>",
      "Experimental changelog entry (repeatable)",
      { collect: true },
    )
    .option(
      "--cut <text:string>",
      "Removed-feature changelog entry (repeatable)",
      { collect: true },
    )
    .option(
      "--sub <text:string>",
      "Generic changed/substitute changelog entry (repeatable)",
      {
        collect: true,
      },
    )
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
    // init subcommand — scriptable retrofit. Flags fully specify the listing (skip
    // prompts) or partially specify it (prompt for the rest, or error non-interactively).
    .reset()
    .command("init", "Retrofit a napp section onto this project's config")
    .option("--name <name:string>", "App display name")
    .option(
      "--icon <icon:string>",
      "App icon: sha256 hash, URL, or local file path (local files are uploaded)",
    )
    .option(
      "--icon-mime <mime:string>",
      "Icon MIME type (used for hash/URL icon inputs; default image/png)",
    )
    .option(
      "--category <label:string>",
      "Category label napp.<cat>:<sub> (repeatable, max 3)",
      { collect: true },
    )
    .option(
      "--countries <csv:string>",
      "Comma-separated ISO 3166-1 alpha-2 codes, or * for worldwide",
    )
    .option("--summary <text:string>", "Short summary")
    .option("--description <text:string>", "Long description")
    .option(
      "--keyart <keyart:string>",
      "Key art: sha256 hash, URL, or local file path",
    )
    .option(
      "--screenshot <shot:string>",
      "Screenshot: sha256 hash, URL, or local file path (repeatable)",
      { collect: true },
    )
    .option("--self <pubkey:string>", "Author pubkey (64-hex)")
    .option("--tag <tag:string>", "Free-form tag (repeatable)", {
      collect: true,
    })
    .option(
      "--indexer-relay <relay:string>",
      "Indexer relay URL the listing is also published to (repeatable)",
      { collect: true },
    )
    .option(
      "--id <id:string>",
      "Set a named-site identifier (opt-in root-site migration; never automatic)",
    )
    .option(
      "--sec <secret:string>",
      "Private key (nsec/hex), nbunksec, or bunker:// URL to sign asset uploads with",
    )
    .option(
      "--yes",
      "Non-interactive: never prompt; error if required fields are missing",
    )
    .action(async (options) => {
      await nappInitAction(
        options as unknown as NappInitFlags & {
          config?: string | boolean;
          sec?: string;
        },
      );
    })
    // validate subcommand (LAST — no trailing .reset()). Positional [dir] only, NO `.option`.
    .reset()
    .command(
      "validate",
      "Check napp readiness: required fields, categories, and a NIP-07 heuristic",
    )
    .arguments("[dir:string]")
    .action(async (options, dir) => {
      await nappValidateAction(
        dir,
        options as unknown as { config?: string | boolean },
      );
    });

  nsyte.command("napp", napp);
}
