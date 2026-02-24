# Phase 2: Install and Deploy Skills - Research

**Researched:** 2026-02-24
**Domain:** nsyte skill body authoring — installation detection, multi-platform install, `nsyte init`, auth decision tree, deploy workflow, error recovery, pre-flight scripts
**Confidence:** HIGH

## Summary

Phase 2 fills in the skill bodies for `nsyte-setup` and `nsyte-deploy` — the two skills that form the prerequisite chain and primary value-delivery workflow for any agent encountering nsyte for the first time. Both skill directories exist from Phase 1 with correct frontmatter. The work in this phase is writing accurate, agent-actionable Markdown body content that references what the CLI actually does.

The research confirmed all authoritative CLI behavior directly from source code (`src/commands/deploy.ts`, `src/commands/init.ts`, `src/lib/auth/signer-factory.ts`, `src/lib/auth/secret-detector.ts`) and `README.md`. The auth decision tree in the actual code (`initSigner`) differs from the STATE.md blocker note: there is no distinct "env var" auth path at the `deploy` CLI level. Authentication is unified under a single `--sec` flag that auto-detects format (nsec, nbunksec, bunker:// URL, or 64-char hex). The priority order is: `--sec` flag value > stored bunker from config. For CI/CD, `--sec` is supplied with an nbunksec string as an environment-variable-backed flag, not a separate env var read directly by the CLI.

Phase 2 also requires writing two pre-flight Deno scripts in `scripts/`: one that checks whether Deno runtime is available and reports its version, and one that checks network access by pinging a known relay and Blossom server. No such scripts exist in the current `scripts/` directory (the existing debug-linux-keystore.ts is for a different diagnostic purpose).

**Primary recommendation:** Write `nsyte-setup/SKILL.md` and `nsyte-deploy/SKILL.md` bodies directly from confirmed CLI source behavior; write two `scripts/` Deno scripts for pre-flight checking; reference `nsyte-concepts/references/nostr-concepts.md` from the deploy skill. Do not invent auth modes not present in the CLI.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETUP-01 | Agent can detect if nsyte is installed and guide multi-platform installation via `nsyte-setup` skill | Detection: `nsyte --version`. Install: curl installer (`nsyte.run/get/install.sh`) or `deno install -A -f -g -n nsyte jsr:@nsyte/cli` or binary download. Full install logic confirmed from `scripts/install.sh`. |
| SETUP-02 | Agent can initialize a project with config and auth selection via `nsyte-setup` skill (init workflow) | `nsyte init` calls `setupProject()`, writes `.nsite/config.json`. Auth options: new private key, existing nsec/hex key, or NIP-46 bunker. Confirmed from `src/commands/init.ts`. |
| SETUP-03 | Pre-flight validation scripts in `scripts/` for prerequisite checking (Deno runtime, network access) | No pre-flight scripts exist yet. Pattern established by `scripts/debug-linux-keystore.ts` (Deno, `--allow-all` shebang). Two new scripts needed: check-deno.ts and check-network.ts. |
| DEPL-01 | Agent can deploy a static site to Nostr/Blossom via `nsyte-deploy` skill | `nsyte deploy <dir>` is the primary command. Auth via `--sec` flag (auto-detects nsec/nbunksec/bunker-url/hex) or stored bunker. Full workflow confirmed from `src/commands/deploy.ts`. |
| DEPL-02 | Shared Nostr domain vocabulary available in `references/nostr-concepts.md` | File exists at `.agents/skills/nsyte-concepts/references/nostr-concepts.md` (written in Phase 1). Deploy skill body must reference it. |
| DEPL-03 | Error recovery guidance included in deploy skill for common failures (relay unavailable, auth errors, Blossom rejection) | Error message strings and message types confirmed from `src/commands/deploy.ts` lines 1511-1521: `relay-rejection`, `connection-error`, Blossom server summary section. |
</phase_requirements>

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Agent Skills spec (SKILL.md format) | Current (2025-12-18) | Skill body: Markdown with headings, code blocks, decision trees | Already established in Phase 1; body is CommonMark Markdown after the frontmatter |
| nsyte CLI | Latest (installed via `nsyte.run/get/install.sh`) | The CLI that skills describe | Skills describe existing behavior; do not change CLI |
| Deno runtime | 2.x | Prerequisite for `deno install` path; runtime for pre-flight scripts | nsyte requires Deno 2.x (from AGENTS.md); pre-flight scripts are Deno TS files |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `skills-ref validate` | dev-time Python CLI | Validate SKILL.md bodies for spec compliance after writing | After writing each skill body; before committing |
| `scripts/install.sh` | nsyte repo | Reference implementation for install detection + multi-platform install logic | Use as authoritative source for install paths, OS detection, arch detection |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deno for pre-flight scripts | Bash scripts | Deno is already the project runtime; using Bash for network checks adds a shell dependency; Deno with `--allow-net` and `--allow-run` is consistent with existing project scripts pattern |
| Two separate pre-flight scripts | One combined script | SETUP-03 specifies "prerequisite checking (Deno runtime, network access)" — two concerns; separate scripts let agents run only the relevant check |

**Installation:**
No new packages needed. Pre-flight scripts use Deno standard library only.

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)

```
.agents/
└── skills/
    ├── nsyte-setup/
    │   └── SKILL.md          # WRITE: installation detection, install commands, nsyte init workflow
    ├── nsyte-deploy/
    │   └── SKILL.md          # WRITE: deploy workflow, auth decision tree, output interpretation, error recovery
    └── nsyte-concepts/
        ├── SKILL.md          # Already written (Phase 1)
        └── references/
            └── nostr-concepts.md  # Already written (Phase 1) — referenced from deploy skill
scripts/
    ├── check-deno.ts         # NEW: check Deno runtime availability and version
    └── check-network.ts      # NEW: check relay/Blossom network access
```

### Pattern 1: Installation Detection Decision Tree

**What:** The agent follows a fixed detection → install → verify sequence before any other skill.
**When to use:** When user asks to install nsyte or when agent suspects nsyte is unavailable.

```
1. Run: nsyte --version
   - If exits 0 and prints version → installed, proceed to nsyte init
   - If command not found → not installed → go to platform-specific install

2. Platform-specific install:
   Linux/macOS:
     curl -fsSL https://nsyte.run/get/install.sh | bash
   Alternative (requires Deno):
     deno install -A -f -g -n nsyte jsr:@nsyte/cli
   Windows:
     Download binary from: https://github.com/sandwichfarm/nsyte/releases

3. Verify: nsyte --version
   - If fails → PATH not updated; advise user to restart shell or add install dir to PATH
   - Linux/macOS install dir: /usr/local/bin
   - Windows install dir: $HOME/bin (must add to PATH manually)
```

Source: `scripts/install.sh` (authoritative — this is the install script at `nsyte.run/get/install.sh`)

### Pattern 2: Auth Decision Tree for Deploy

**What:** The actual auth priority order implemented in `src/commands/deploy.ts` → `initSigner()`.
**When to use:** Any time an agent needs to document or guide authentication for nsyte commands.

```
Priority 1: --sec flag (CLI-provided or passed from environment variable)
  Accepts any of:
  - nsec1...       (bech32 private key)
  - nbunksec1...   (bech32 bunker credential for CI/CD)
  - bunker://...   (bunker URL)
  - <64-char hex>  (raw hex private key)

  Auto-detected by nsyte; no format flag needed.

Priority 2: Stored bunker from .nsite/config.json
  - config.bunkerPubkey must be set AND nsyte must have stored an nbunksec
    for that pubkey in the OS keychain / encrypted fallback
  - If stored nbunksec is missing → in interactive mode, prompts to reconnect;
    in non-interactive mode, errors with actionable message

If neither is available → nsyte errors:
  "No valid signing method could be initialized. Please provide --sec with
   nsec, nbunksec, bunker URL, or hex key, or configure a bunker in
   .nsite/config.json."
```

Source: `src/commands/deploy.ts` lines 512-613 (`initSigner` function)

**Critical correction for STATE.md blocker:** The stated auth priority "env var > nsec > bunker" is not a separate CLI layer — there is no dedicated environment variable that nsyte reads for auth. The `--sec` flag is the single auth entry point. For CI/CD, the pattern is:
```bash
nsyte deploy ./dist --sec "${NBUNK_SECRET}"
```
where `NBUNK_SECRET` is an env var whose value is passed as the `--sec` flag value. This is documented in README.md and the GitHub Actions example.

### Pattern 3: nsyte-concepts Reference in Deploy Skill

**What:** The deploy skill body must reference the shared Nostr vocabulary for relay and Blossom server concepts.
**When to use:** Any place in the deploy skill body where a relay or Blossom server concept is first mentioned.

The deploy skill should link or note: "For definitions of relays, Blossom servers, pubkeys, and NIP-46 bunker auth, see the `nsyte-concepts` skill or `references/nostr-concepts.md`."

Do not inline full concept definitions into the deploy skill body — the concepts file exists for this purpose.

### Pattern 4: Pre-flight Script Pattern (Deno)

**What:** A Deno TypeScript script that checks system prerequisites and exits 0 (pass) or 1 (fail).
**When to use:** For each new pre-flight check in `scripts/`.

```typescript
#!/usr/bin/env -S deno run --allow-run --allow-net

// scripts/check-deno.ts — Verify Deno runtime is installed and meets minimum version

async function checkDeno(): Promise<void> {
  try {
    const result = await new Deno.Command("deno", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    }).output();

    if (result.code !== 0) {
      console.error("✗ Deno not found or failed to execute");
      Deno.exit(1);
    }

    const output = new TextDecoder().decode(result.stdout);
    const match = output.match(/deno (\d+\.\d+\.\d+)/);
    if (match) {
      const version = match[1];
      const major = parseInt(version.split(".")[0]);
      if (major < 2) {
        console.error(`✗ Deno ${version} found but nsyte requires Deno 2.x`);
        Deno.exit(1);
      }
      console.log(`✓ Deno ${version} (meets nsyte requirement: 2.x)`);
    } else {
      console.log("✓ Deno found (could not parse version)");
    }
  } catch {
    console.error("✗ Deno not found. Install from: https://deno.land/");
    Deno.exit(1);
  }
}

await checkDeno();
```

Source pattern: `scripts/debug-linux-keystore.ts` (existing Deno script in this project — same shebang pattern, same `Deno.Command` API usage)

### Anti-Patterns to Avoid

- **Inventing an "env var" auth mode:** nsyte does not read a `NSYTE_NSEC` or `NSYTE_KEY` environment variable directly. The CI/CD pattern is `--sec "${ENV_VAR}"`. Do not document env vars that the CLI does not read.
- **Conflating `nsyte init` with `nsyte deploy`:** `nsyte init` creates `.nsite/config.json` and sets up auth interactively. `nsyte deploy` reads that config at deploy time. The setup skill should cover `nsyte init`; the deploy skill starts after init is complete.
- **Documenting `--nbunksec` as a flag:** This flag does not exist in the current CLI. The unified auth flag is `--sec`. (README.md CI example uses `--nbunksec` in one place but the actual CLI registers `--sec`. Use `--sec`.)
- **Writing skill body as a reference manual:** Skill bodies should be procedural (step 1, step 2...) and decision-tree-driven, not exhaustive flag documentation. Agents can run `nsyte --help` for flag lists.
- **Exceeding 500-line token budget:** SPEC-03 (Phase 4 requirement) enforces the line limit. Keep both skill bodies focused; use the concepts reference for Nostr vocabulary rather than inlining it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Platform OS/arch detection in scripts | Custom uname parsing | Reference `scripts/install.sh` pattern | Already implemented and tested; `detect_os()` and `detect_arch()` in install.sh are authoritative |
| Network connectivity check | Custom TCP socket code | `fetch()` with timeout in Deno | Deno's `fetch` with `AbortSignal.timeout()` is the idiomatic approach for HTTP health checks |
| Auth format detection | Custom regex | Delegate to `--sec` flag | nsyte's `detectSecretFormat()` handles all format detection internally; agents should just pass the value to `--sec` |
| Nostr concept explanations | Inline in skill bodies | Reference `nsyte-concepts/references/nostr-concepts.md` | File already exists with complete agent-readable definitions |

**Key insight:** Both skill bodies describe existing CLI behavior — they are documentation tasks, not engineering tasks. The research value is confirming what the CLI actually does so the skill descriptions are accurate, not designing new behavior.

## Common Pitfalls

### Pitfall 1: Auth Decision Tree Mismatch with Actual CLI

**What goes wrong:** The skill instructs agents to set a `NSYTE_NSEC` environment variable (per the STATE.md blocker note), but nsyte does not read any such variable. The agent follows the skill, the env var is ignored, and auth fails with no clear error.

**Why it happens:** The STATE.md blocker says "auth priority order (env var > nsec > bunker) should be confirmed." This research confirmed: there is no standalone env var auth path. The documented CI pattern in README.md shows `--sec ${NBUNK_SECRET}` (flag-passed env var), not a directly-read env var.

**How to avoid:** Document auth as: Priority 1 = `--sec <value>` where value may come from any source including env vars via shell substitution. Priority 2 = stored bunker in config. Do not reference env var names that nsyte itself reads.

**Warning signs:** Agent sets an environment variable but nsyte still prompts for auth or errors.

### Pitfall 2: `nsyte init` Described as Optional Pre-Deploy Step

**What goes wrong:** The deploy skill says "run `nsyte init` if you haven't already." In reality, `nsyte deploy` in interactive mode will automatically call `setupProject()` if no config exists. In non-interactive mode it requires config to exist. The setup-vs-deploy relationship is not optional — it depends on mode.

**Why it happens:** README shows `nsyte init` before `nsyte deploy` in Quick Start, implying it's always required. The code is more nuanced.

**How to avoid:** The deploy skill should state: "If `.nsite/config.json` does not exist and you are running interactively, `nsyte deploy` will run setup automatically. For non-interactive/CI mode, `nsyte init` must be run first, or supply all config via CLI flags."

**Warning signs:** Agent runs `nsyte deploy` in CI and it hangs on interactive prompts.

### Pitfall 3: Skill Bodies Exceed Token Budget

**What goes wrong:** A thorough skill body is written covering all flags and edge cases. By Phase 4 validation, the skill exceeds 500 lines and fails SPEC-03.

**Why it happens:** Writing comprehensive documentation is natural; the 500-line limit (SPEC-03) is enforced in Phase 4.

**How to avoid:** Keep procedural steps lean. For flag documentation beyond the common use case, direct agents to `nsyte deploy --help`. Move Nostr vocabulary to the concepts reference file, not the skill body. Target ~150-200 lines for each skill body.

**Warning signs:** Skill body draft exceeds 200 lines after initial write — trim before committing.

### Pitfall 4: Pre-flight Scripts Require Sudo

**What goes wrong:** A pre-flight script for checking network or Deno version fails in CI environments because it tries to install missing tools or requires elevated privileges.

**Why it happens:** Checking prerequisites and fixing prerequisites are different operations. Pre-flight scripts should only report, not remediate.

**How to avoid:** Pre-flight scripts exit 0 (pass) or 1 (fail) with a clear message. They never install, modify, or elevate. Remediation guidance belongs in the skill body, not the script.

**Warning signs:** Script runs `sudo apt-get` or modifies `$PATH` or calls `deno install`.

### Pitfall 5: Deploy Output Interpretation Not Covered

**What goes wrong:** The deploy skill does not explain what a successful vs. partial vs. failed deploy looks like. Agents cannot tell if a deploy succeeded.

**Why it happens:** Output format is not documented anywhere outside the source code.

**How to avoid:** Document the three output states from `src/commands/deploy.ts` lines 1496-1507:
- **Full success:** `{N} files uploaded successfully ({size})` with green progress bar complete
- **Partial success:** `{uploaded}/{total} files uploaded successfully ({size})` — check Blossom Server Summary for per-server failures
- **Total failure:** `"Failed to upload any files"` — check Relay Issues and Errors sections
- After any deploy, gateway URL is printed: `https://{npub}.nsite.lol/`

**Warning signs:** Agent reports deploy complete when only some files uploaded; agent does not know where to view the deployed site.

## Code Examples

Verified from source code:

### Install Detection and Platform Install Commands

```bash
# Detect installation
nsyte --version
# Success output: "nsyte 0.x.y" or similar
# Failure: "command not found" or similar

# Linux/macOS: Recommended (pre-built binary, no Deno needed)
curl -fsSL https://nsyte.run/get/install.sh | bash

# Linux/macOS: Alternative (requires Deno 2.x)
deno install -A -f -g -n nsyte jsr:@nsyte/cli

# Windows: Download binary from GitHub Releases
# https://github.com/sandwichfarm/nsyte/releases
# Install dir: $HOME/bin — add to PATH manually

# Install to (Linux/macOS): /usr/local/bin/nsyte
# Verify: nsyte --version
```

Source: `scripts/install.sh`, `README.md`

### nsyte init Workflow

```bash
nsyte init
# Interactive prompts:
# 1. Auth method: new key / existing nsec or hex key / NIP-46 bunker
# 2. Relay configuration
# 3. Blossom server configuration
# Writes: .nsite/config.json
# Success output: "Project initialized successfully with: ..."
```

Source: `src/commands/init.ts`

### Deploy — Standard Usage

```bash
# Basic deploy (interactive, reads .nsite/config.json)
nsyte deploy ./dist

# Deploy with explicit auth (CI/CD — nbunksec from env var)
nsyte deploy ./dist --sec "${NBUNK_SECRET}"

# Deploy with explicit auth (nsec — avoid; prefer bunker for CI)
nsyte deploy ./dist --sec "nsec1..."

# Deploy non-interactive (requires .nsite/config.json to exist)
nsyte deploy ./dist --non-interactive --sec "${NBUNK_SECRET}"

# Force re-upload all files
nsyte deploy ./dist --force

# Deploy with SPA fallback for client-side routing
nsyte deploy ./dist --fallback=/index.html
```

Source: `src/commands/deploy.ts` lines 109-184

### Auth Format Auto-Detection

```
nsyte --sec accepts all of these (auto-detected):
  nsec1...           → Nostr private key (bech32)
  nbunksec1...       → Bunker credential (bech32) — use for CI/CD
  bunker://...       → Bunker URL
  <64 hex chars>     → Raw private key (hex)
```

Source: `src/lib/auth/secret-detector.ts`

### Deploy Error Output Patterns

```
# Relay issues section (printed when relay-rejection or connection-error):
"Relay Issues"
[per-relay rejection messages]

# Blossom server summary (always printed):
"Blossom Server Summary"
[per-server success/total counts]

# Recovery actions:
# Relay unavailable → check relay URLs in .nsite/config.json; try --use-fallback-relays
# Blossom rejection → check server list in .nsite/config.json; try another server
# Auth error → verify --sec value; re-run nsyte bunker connect if using stored bunker
```

Source: `src/commands/deploy.ts` lines 1511-1585

### Pre-flight Script Pattern

```typescript
#!/usr/bin/env -S deno run --allow-run --allow-net
// scripts/check-deno.ts

const result = await new Deno.Command("deno", {
  args: ["--version"],
  stdout: "piped",
  stderr: "piped",
}).output();

if (result.code !== 0) {
  console.error("✗ Deno not found. Install from: https://deno.land/");
  Deno.exit(1);
}

const output = new TextDecoder().decode(result.stdout);
console.log(`✓ ${output.split("\n")[0]}`);
```

Source: Pattern from `scripts/debug-linux-keystore.ts`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `nsyte login` command | `nsyte init` for project setup | Current CLI | Phase 1 research referenced `nsyte login` in nostr-concepts.md — this is incorrect; correct command is `nsyte init` |
| `--nbunksec` flag | `--sec` flag (unified, auto-detects format) | Current CLI | README.md CI example shows `--nbunksec` but CLI only registers `--sec`; always use `--sec` |
| Multiple auth flags (--nsec, --bunker-url) | Single `--sec` flag | Current CLI | Simplified; secret format auto-detected by `detectSecretFormat()` |

**Deprecated/outdated:**
- `nsyte login` command: Not in current CLI command list (`src/commands/` does not contain a `login.ts`). The nostr-concepts.md reference to `nsyte login` written in Phase 1 should be corrected to `nsyte init`.
- `--nbunksec` flag: Does not exist in current CLI. The `README.md` CI/CD example uses this flag but the CLI code registers only `--sec`. Use `--sec`.

## Open Questions

1. **nostr-concepts.md `nsyte login` reference correction**
   - What we know: `nostr-concepts.md` (written in Phase 1) says "the user must run `nsyte login`" and "direct them to `nsyte login` (interactive)." The `login` command does not exist in the current CLI. The correct command is `nsyte init`.
   - What's unclear: Whether this is intentional (planned future command) or an error in Phase 1 content.
   - Recommendation: Treat it as an error. When writing the deploy skill body, reference `nsyte init` (not `nsyte login`). Flag this for correction in the deploy skill and consider updating nostr-concepts.md as a plan task.

2. **`nsyte-concepts` SKILL.md body content**
   - What we know: The SKILL.md stub says "Skill body: to be written in Phase 2." The Phase 2 ROADMAP goal and success criteria do not explicitly list nsyte-concepts SKILL.md body as a deliverable.
   - What's unclear: Whether the nsyte-concepts SKILL.md body needs content in Phase 2 or is deferred.
   - Recommendation: The Phase 2 success criteria only require `references/nostr-concepts.md` to be referenced from the deploy skill. The nsyte-concepts SKILL.md body can remain a stub if the deploy skill correctly references the file. Consider adding minimal body in Phase 2 (one paragraph pointing to `references/nostr-concepts.md`) so the skill is useful when auto-loaded.

3. **`scripts/check-network.ts` — which relay and server to ping**
   - What we know: The script should check network access. The deploy skill and init workflow default to user-configured relays/servers. There are no hardcoded defaults in the deploy path (relays must be in config or CLI flags).
   - What's unclear: Which relay and Blossom server to use for the pre-flight check (a real check requires a known endpoint).
   - Recommendation: Use `wss://relay.damus.io` (suggested in nostr-concepts.md) and `https://blossom.primal.net` (suggested in nostr-concepts.md) as pre-flight check targets. These are public, well-known, and match what the concepts reference already recommends.

## Sources

### Primary (HIGH confidence)

- `src/commands/deploy.ts` — Full deploy command implementation, initSigner() priority order, error message strings, output format (lines 109-1587)
- `src/commands/init.ts` — nsyte init workflow, success output format
- `src/lib/auth/signer-factory.ts` — Auth priority: `--sec` (Priority 1) → stored bunker (Priority 2)
- `src/lib/auth/secret-detector.ts` — Format detection: nsec / nbunksec / bunker-url / hex
- `scripts/install.sh` — Platform-specific install paths, OS/arch detection, binary names
- `README.md` — Quick start commands, install methods, CI/CD example, troubleshooting
- `.agents/skills/nsyte-concepts/references/nostr-concepts.md` — Phase 1 written content, confirmed location
- `.planning/phases/01-scaffolding/1-RESEARCH.md` — Phase 1 research findings on spec compliance

### Secondary (MEDIUM confidence)

- `README.md` CI/CD example (`--nbunksec` flag) — MEDIUM because this contradicts the CLI source; source code (`--sec`) takes precedence

### Tertiary (LOW confidence)

- STATE.md blocker note ("env var > nsec > bunker") — LOW because it's a question, not a confirmed fact; research shows the actual order differs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All skill format facts sourced from Phase 1 research (agentskills.io spec); pre-flight pattern sourced from existing project scripts
- Auth decision tree: HIGH — Sourced directly from `src/lib/auth/signer-factory.ts` and `src/commands/deploy.ts` `initSigner()` function
- Install commands: HIGH — Sourced directly from `scripts/install.sh` and `README.md`
- Error output format: HIGH — Sourced directly from `src/commands/deploy.ts` output logic
- Pitfalls: HIGH — Each pitfall derived from confirmed source discrepancies (README vs CLI, STATE.md vs source)

**Research date:** 2026-02-24
**Valid until:** 2026-05-24 (nsyte is alpha; CLI flags and auth patterns may change)
