#!/usr/bin/env -S deno run --allow-read
// scripts/check-doc-drift.ts
//
// Drift gate for nsyte's source-vs-docs alignment. Performs three checks:
//   1. Command-page coverage: every src/commands/<name>.ts (except root.ts)
//      has a corresponding docs/usage/commands/<name>.md, accounting for
//      naming-mismatch (list↔ls) and alias-doc handling (upload→deploy).
//   2. Per-command flag alignment: flags declared via Cliffy `.option(...)`
//      in source must match flags appearing under `## Options`/`## Arguments`
//      sections of the doc page (excluding global options and Cliffy
//      auto-negation `--no-X` for boolean defaults).
//   3. Env-var drift: env vars mentioned in docs (NSYTE_*/NSITE_*) must
//      correspond to a `Deno.env.get("...")` call somewhere in src/.
//
// Exit codes:
//   0   No drift detected (clean baseline)
//   1   Drift detected (commands/docs/flags/env-vars misaligned)
//   2   Script error (parse failure, missing input, IO error)
//
// Output:
//   --format=text  (default) human-readable report
//   --format=json  machine-readable DriftReport JSON for CI annotation

import { walk } from "@std/fs";

// ---------- Constants ----------

const SKIP_DOC_KEYS = new Set(["_global-options", "commands", "index"]);
const SKIP_SOURCE_NAMES = new Set(["root"]);
const SOURCE_TO_DOC_KEY: Record<string, string> = { list: "ls" };
const IMPLICIT_FLAGS = new Set(["--help"]);
const TRACKED_ENV_PREFIXES = ["NSYTE_", "NSITE_"];

// Regexes
const OPTION_RE = /\.option\(\s*"([^"]+)"/g;
const GLOBAL_OPTION_RE = /\.globalOption\(\s*"([^"]+)"/g;
const ALIAS_RE = /\.alias\(\s*"([^"]+)"\s*\)/g;
const LONG_FLAG_RE = /(--[a-z][a-z0-9-]*)/;
const FLAG_TOKEN_RE = /(--[a-z][a-z0-9-]*)/g;
const CODE_SPAN_RE = /`([^`\n]+)`/g;
const SECTION_RE = /^##\s+(.+?)\s*$/;
const ENV_GET_RE = /Deno\.env\.get\(\s*"([^"]+)"/g;
const ENV_TOKEN_RE = /\b(NSYTE_[A-Z0-9_]+|NSITE_[A-Z0-9_]+)\b/g;

// ---------- Types ----------

interface SourceCommand {
  source_path: string;
  aliases: string[];
  flags: string[]; // raw .option() spec strings
}
interface SourceFlags {
  global_flags: string[];
  global_flag_specs: string[];
  commands: Record<string, SourceCommand>;
}
interface DocPage {
  doc_path: string;
  flags: string[]; // long-form, sorted, deduped (across all sections)
  section_flags: string[]; // long-form, sorted, deduped (Options/Arguments only)
}
interface DocFlags {
  docs: Record<string, DocPage>;
}
interface FlagDriftRow {
  command: string;
  doc_key: string;
  source_flags: string[];
  doc_flags: string[];
  missing: string[];
  phantom: string[];
  aligned: boolean;
}
interface DriftReport {
  generated: string;
  exit_code: 0 | 1 | 2;
  totals: { aligned: number; drift: number; total: number };
  command_coverage: {
    missing_docs: Array<{ command: string; source_path: string }>;
    phantom_docs: Array<{ doc_key: string; doc_path: string }>;
  };
  flag_drift: FlagDriftRow[];
  env_var_drift: {
    source_consumed: string[];
    doc_mentioned: string[];
    phantom: string[];
  };
}

// ---------- Helpers ----------

function extractLongFlag(spec: string): string | null {
  const m = spec.match(LONG_FLAG_RE);
  return m ? m[1] : null;
}

function setDiff<T>(a: Set<T>, b: Set<T>): T[] {
  const out: T[] = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return (out as unknown as string[]).sort() as unknown as T[];
}

function relPath(p: string): string {
  // Best-effort: print paths relative to cwd
  const cwd = Deno.cwd();
  return p.startsWith(cwd + "/") ? p.slice(cwd.length + 1) : p;
}

// ---------- Source extraction ----------

async function extractSourceFlags(sourceDir: string): Promise<SourceFlags> {
  const commands: Record<string, SourceCommand> = {};
  const globalSpecs: string[] = [];
  const globalFlags: string[] = [];

  for await (const entry of Deno.readDir(sourceDir)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    const name = entry.name.replace(/\.ts$/, "");
    const path = `${sourceDir}/${entry.name}`;
    const text = await Deno.readTextFile(path);

    // root.ts: extract globals only, do not register as a command
    if (name === "root") {
      let m: RegExpExecArray | null;
      const re = new RegExp(GLOBAL_OPTION_RE.source, "g");
      while ((m = re.exec(text)) !== null) {
        globalSpecs.push(m[1]);
        const lf = extractLongFlag(m[1]);
        if (lf) globalFlags.push(lf);
      }
      continue;
    }

    // Aliases
    const aliases: string[] = [];
    const aliasRe = new RegExp(ALIAS_RE.source, "g");
    let am: RegExpExecArray | null;
    while ((am = aliasRe.exec(text)) !== null) aliases.push(am[1]);

    // .option(...) specs
    const flags: string[] = [];
    const optRe = new RegExp(OPTION_RE.source, "g");
    let om: RegExpExecArray | null;
    while ((om = optRe.exec(text)) !== null) flags.push(om[1]);

    commands[name] = {
      source_path: relPath(path),
      aliases,
      flags,
    };
  }

  return {
    global_flags: [...new Set(globalFlags)].sort(),
    global_flag_specs: globalSpecs,
    commands,
  };
}

// ---------- Doc extraction ----------

function extractSectionFlags(text: string): Set<string> {
  const flags = new Set<string>();
  const lines = text.split("\n");
  let inAllowed = false;
  for (const line of lines) {
    const sm = line.match(SECTION_RE);
    if (sm) {
      const heading = sm[1].trim().toLowerCase();
      // Allow: heading equals "options" or "arguments", OR ends with " options" / " arguments"
      // (e.g., "Connect Options" on bunker.md)
      inAllowed = heading === "options" ||
        heading === "arguments" ||
        heading.endsWith(" options") ||
        heading.endsWith(" arguments");
      continue;
    }
    if (!inAllowed) continue;
    let span: RegExpExecArray | null;
    const spanRe = new RegExp(CODE_SPAN_RE.source, "g");
    while ((span = spanRe.exec(line)) !== null) {
      const inner = span[1];
      const flagRe = new RegExp(FLAG_TOKEN_RE.source, "g");
      let f: RegExpExecArray | null;
      while ((f = flagRe.exec(inner)) !== null) flags.add(f[1]);
    }
  }
  return flags;
}

function extractAllFlags(text: string): Set<string> {
  // High-recall: every `--flag` token inside any inline code span
  const flags = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CODE_SPAN_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    const flagRe = new RegExp(FLAG_TOKEN_RE.source, "g");
    let f: RegExpExecArray | null;
    while ((f = flagRe.exec(inner)) !== null) flags.add(f[1]);
  }
  return flags;
}

async function extractDocFlags(docsDir: string): Promise<DocFlags> {
  const docs: Record<string, DocPage> = {};
  for await (const entry of Deno.readDir(docsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) continue;
    const docKey = entry.name.replace(/\.md$/, "");
    const path = `${docsDir}/${entry.name}`;
    const text = await Deno.readTextFile(path);
    const all = [...extractAllFlags(text)].sort();
    const sectioned = [...extractSectionFlags(text)].sort();
    docs[docKey] = {
      doc_path: relPath(path),
      flags: all,
      section_flags: sectioned,
    };
  }
  return { docs };
}

// ---------- Checks ----------

function checkCoverage(source: SourceFlags, docs: DocFlags) {
  const missing: Array<{ command: string; source_path: string }> = [];
  const phantom: Array<{ doc_key: string; doc_path: string }> = [];

  // 1. Every source command needs a doc page
  for (const [name, spec] of Object.entries(source.commands)) {
    if (SKIP_SOURCE_NAMES.has(name)) continue;
    const docKey = SOURCE_TO_DOC_KEY[name] || name;
    if (!docs.docs[docKey]) {
      missing.push({ command: name, source_path: spec.source_path });
    }
  }

  // 2. Every doc page must resolve to a real command (or alias)
  // Build set of valid doc keys = source command names mapped through SOURCE_TO_DOC_KEY,
  // PLUS every alias declared anywhere in source.
  const validDocKeys = new Set<string>();
  for (const name of Object.keys(source.commands)) {
    if (SKIP_SOURCE_NAMES.has(name)) continue;
    validDocKeys.add(SOURCE_TO_DOC_KEY[name] || name);
  }
  for (const spec of Object.values(source.commands)) {
    for (const a of spec.aliases) validDocKeys.add(a);
  }

  for (const [docKey, page] of Object.entries(docs.docs)) {
    if (SKIP_DOC_KEYS.has(docKey)) continue;
    if (!validDocKeys.has(docKey)) {
      phantom.push({ doc_key: docKey, doc_path: page.doc_path });
    }
  }

  return { missing_docs: missing, phantom_docs: phantom };
}

function checkFlags(source: SourceFlags, docs: DocFlags): FlagDriftRow[] {
  const rows: FlagDriftRow[] = [];
  const globals = new Set(source.global_flags);
  const names = Object.keys(source.commands).sort();

  for (const cmd of names) {
    if (SKIP_SOURCE_NAMES.has(cmd)) continue;
    const docKey = SOURCE_TO_DOC_KEY[cmd] || cmd;
    const page = docs.docs[docKey];

    // Source long-form flags, minus globals
    const srcFlags = new Set<string>();
    for (const spec of source.commands[cmd].flags) {
      const lf = extractLongFlag(spec);
      if (lf && !globals.has(lf)) srcFlags.add(lf);
    }

    // Doc flags from Options/Arguments sections only, minus globals + implicits
    const rawDoc = page ? new Set(page.section_flags) : new Set<string>();
    const docFlags = new Set<string>();
    for (const f of rawDoc) {
      if (!globals.has(f) && !IMPLICIT_FLAGS.has(f)) docFlags.add(f);
    }

    // Cliffy auto-negation: --no-X is real if source declares --X
    const autoNeg = new Set<string>();
    for (const f of docFlags) {
      if (f.startsWith("--no-")) {
        const positive = "--" + f.substring(5);
        if (srcFlags.has(positive)) autoNeg.add(f);
      }
    }

    const missing = setDiff(srcFlags, docFlags) as string[];
    const phantom = (setDiff(docFlags, srcFlags) as string[]).filter(
      (f) => !autoNeg.has(f),
    );

    rows.push({
      command: cmd,
      doc_key: docKey,
      source_flags: [...srcFlags].sort(),
      doc_flags: [...docFlags].sort(),
      missing,
      phantom,
      aligned: missing.length === 0 && phantom.length === 0,
    });
  }
  return rows;
}

async function checkEnvVars(srcTree: string, docsRoot: string) {
  const consumed = new Set<string>();
  for await (const entry of walk(srcTree, { exts: [".ts"], includeDirs: false })) {
    const text = await Deno.readTextFile(entry.path);
    let m: RegExpExecArray | null;
    const re = new RegExp(ENV_GET_RE.source, "g");
    while ((m = re.exec(text)) !== null) consumed.add(m[1]);
  }

  const mentioned = new Set<string>();
  for await (
    const entry of walk(docsRoot, { exts: [".md"], includeDirs: false })
  ) {
    const text = await Deno.readTextFile(entry.path);
    let m: RegExpExecArray | null;
    const re = new RegExp(ENV_TOKEN_RE.source, "g");
    while ((m = re.exec(text)) !== null) {
      const v = m[1];
      if (TRACKED_ENV_PREFIXES.some((p) => v.startsWith(p))) mentioned.add(v);
    }
  }

  // Phantoms = mentioned in docs, not consumed by source (within tracked namespaces)
  const trackedConsumed = new Set<string>();
  for (const v of consumed) {
    if (TRACKED_ENV_PREFIXES.some((p) => v.startsWith(p))) trackedConsumed.add(v);
  }
  const phantom = setDiff(mentioned, trackedConsumed) as string[];

  return {
    source_consumed: [...consumed].sort(),
    doc_mentioned: [...mentioned].sort(),
    phantom,
  };
}

// ---------- CLI ----------

function printHelp() {
  const help = `Usage: deno task check-doc-drift [options]

Drift gate for nsyte's source-vs-docs alignment.

Options:
  --format <text|json>     Output format (default: text)
  --source-dir <path>      Override src/commands/ (default: src/commands)
  --docs-dir <path>        Override docs/usage/commands/ (default: docs/usage/commands)
  --src-tree <path>        Override src/ for env-var scanning (default: src)
  --docs-tree <path>       Override docs/ for env-var doc scanning (default: docs)
  --help                   Show this message and exit codes

Exit codes:
  0   No drift detected (clean baseline)
  1   Drift detected (commands/docs/flags/env-vars misaligned)
  2   Script error (parse failure, missing input, IO error)
`;
  console.log(help);
}

interface CliArgs {
  format: "text" | "json";
  sourceDir: string;
  docsDir: string;
  srcTree: string;
  docsTree: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    format: "text",
    sourceDir: "src/commands",
    docsDir: "docs/usage/commands",
    srcTree: "src",
    docsTree: "docs",
    help: false,
  };
  // Normalize `--key=value` into `--key value` so both CLI styles work
  const tokens: string[] = [];
  for (const a of argv) {
    if (a.startsWith("--") && a.includes("=")) {
      const eq = a.indexOf("=");
      tokens.push(a.slice(0, eq), a.slice(eq + 1));
    } else {
      tokens.push(a);
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    const eat = () => {
      const v = tokens[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--help":
      case "-h":
        out.help = true;
        break;
      case "--format":
        out.format = eat() as "text" | "json";
        if (out.format !== "text" && out.format !== "json") {
          throw new Error(`Invalid --format: ${out.format} (expected text|json)`);
        }
        break;
      case "--source-dir":
        out.sourceDir = eat();
        break;
      case "--docs-dir":
        out.docsDir = eat();
        break;
      case "--src-tree":
        out.srcTree = eat();
        break;
      case "--docs-tree":
        out.docsTree = eat();
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

// ---------- Reporting ----------

function printTextReport(report: DriftReport) {
  const cc = report.command_coverage;
  const ccDrift = cc.missing_docs.length + cc.phantom_docs.length > 0;
  const flagDrift = report.flag_drift.filter((r) => !r.aligned);
  const envPhantom = report.env_var_drift.phantom;

  console.log("=== nsyte doc-drift report ===");
  console.log(`Generated: ${report.generated}`);
  console.log("");

  // Section 1: Command coverage
  console.log("## Command-page coverage");
  if (!ccDrift) {
    console.log("  OK — every command has a doc page; every doc page resolves.");
  } else {
    if (cc.missing_docs.length > 0) {
      console.log(`  Missing docs (${cc.missing_docs.length}):`);
      for (const m of cc.missing_docs) {
        console.log(`    - ${m.command}  (source: ${m.source_path})`);
      }
    }
    if (cc.phantom_docs.length > 0) {
      console.log(`  Phantom docs (${cc.phantom_docs.length}):`);
      for (const p of cc.phantom_docs) {
        console.log(`    - ${p.doc_key}  (path: ${p.doc_path})`);
      }
    }
  }
  console.log("");

  // Section 2: Flag drift
  console.log(
    `## Per-command flag alignment (${report.totals.aligned}/${report.totals.total} aligned)`,
  );
  if (flagDrift.length === 0) {
    console.log("  OK — every command's documented flags match its source flags.");
  } else {
    for (const row of flagDrift) {
      const parts: string[] = [];
      if (row.missing.length > 0) {
        parts.push(`missing ${row.missing.length}: ${row.missing.join(", ")}`);
      }
      if (row.phantom.length > 0) {
        parts.push(`phantom ${row.phantom.length}: ${row.phantom.join(", ")}`);
      }
      console.log(`  ${row.command.padEnd(12)} DRIFT  ${parts.join("  ")}`);
    }
  }
  console.log("");

  // Section 3: Env-var drift
  console.log("## Env-var drift");
  if (envPhantom.length === 0) {
    console.log(
      `  OK — all NSYTE_*/NSITE_* env vars in docs are consumed by source ` +
        `(${report.env_var_drift.doc_mentioned.length} mentioned, ` +
        `${report.env_var_drift.source_consumed.length} consumed).`,
    );
  } else {
    console.log(`  Phantom env vars (${envPhantom.length}):`);
    for (const v of envPhantom) console.log(`    - ${v}`);
  }
  console.log("");

  if (report.exit_code === 0) {
    console.log("No drift detected — source and docs aligned.");
  } else {
    console.log("Drift detected — see above.");
  }
}

// ---------- Main ----------

async function main(argv: string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    printHelp();
    return 2;
  }
  if (args.help) {
    printHelp();
    return 0;
  }

  const source = await extractSourceFlags(args.sourceDir);
  const docs = await extractDocFlags(args.docsDir);
  const coverage = checkCoverage(source, docs);
  const flagRows = checkFlags(source, docs);
  const env = await checkEnvVars(args.srcTree, args.docsTree);

  const aligned = flagRows.filter((r) => r.aligned).length;
  const drift = flagRows.length - aligned;
  const anyCoverageDrift = coverage.missing_docs.length + coverage.phantom_docs.length > 0;
  const anyEnvDrift = env.phantom.length > 0;

  const exit_code: 0 | 1 = anyCoverageDrift || drift > 0 || anyEnvDrift ? 1 : 0;

  const report: DriftReport = {
    generated: new Date().toISOString(),
    exit_code,
    totals: { aligned, drift, total: flagRows.length },
    command_coverage: coverage,
    flag_drift: flagRows,
    env_var_drift: env,
  };

  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }
  return exit_code;
}

try {
  const code = await main(Deno.args);
  Deno.exit(code);
} catch (err) {
  console.error(`Script error: ${(err as Error).message}`);
  if ((err as Error).stack) console.error((err as Error).stack);
  Deno.exit(2);
}
