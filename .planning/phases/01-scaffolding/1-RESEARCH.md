# Phase 1: Scaffolding - Research

**Researched:** 2026-02-24
**Domain:** Agent Skills spec compliance — directory scaffolding and shared reference authoring
**Confidence:** HIGH

## Summary

Phase 1 creates the skeleton that all later phases fill in. The deliverable is a valid `.agents/skills/` directory tree with one skill subdirectory per planned capability area, each containing a spec-compliant SKILL.md frontmatter stub, plus a shared `references/nostr-concepts.md` that defines the Nostr/Blossom vocabulary every downstream skill will assume is already defined. No skill body content (instructions, steps, error guidance) is written in this phase — only the minimal valid frontmatter and the shared reference file.

The Agent Skills spec (agentskills.io, released 2025-12-18) is precise about what constitutes a valid skill: exactly two required frontmatter fields (`name` and `description`), a directory name that matches `name` exactly, and the SKILL.md file as the directory entrypoint. All three of this phase's requirements (SPEC-01, SPEC-02, SPEC-05) reduce to these structural rules. The `skills-ref` validator (Python, dev-time only) is the official tool for catching violations and must pass before the phase is considered complete.

The one architectural decision with downstream consequences is the placement of `references/nostr-concepts.md`. Based on the Anti-Pattern 3 documented in ARCHITECTURE.md (cross-skill path references break agent loading), the shared reference should be structured so each skill that needs it can reference it without traversing parent directories. The recommended approach is to place the canonical file inside the `nsyte-concepts/` skill directory (the background knowledge skill) and accept that each other skill will either carry its own copy or link to concept-level explanations within its own `references/` subdirectory in later phases. Phase 1 only needs to establish the canonical file location and content; the copy-vs-link question is deferred to the phases that write skill bodies.

**Primary recommendation:** Create all five skill directories simultaneously with spec-compliant frontmatter stubs, run `skills-ref validate` against each before committing, and write `references/nostr-concepts.md` with complete definitions for relays, pubkeys, Blossom servers, and NIP-46.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SPEC-01 | All skills have valid SKILL.md frontmatter with `name` and `description` fields | Spec mandates exactly these two required fields; frontmatter rules documented in STACK.md; `skills-ref validate` catches violations |
| SPEC-02 | Directory names match skill `name` fields exactly | Spec rule: `name` must be identical to parent directory name; mismatch causes silent discovery failure (no error thrown); validated by `skills-ref` |
| SPEC-05 | Skills placed in `.agents/skills/` directory for cross-agent discovery | `.agents/skills/` is the cross-agent universal path recognized by Claude Code, Gemini CLI, OpenCode, VS Code Copilot, and 20+ other agent tools |
</phase_requirements>

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Agent Skills spec (agentskills.io) | Current (2025-12-18 release) | The open standard that defines valid skill format | Only standard; required for cross-agent compatibility; Claude Code, Gemini CLI, OpenCode, Codex, and 20+ others recognize `.agents/skills/` |
| SKILL.md (YAML frontmatter + Markdown) | N/A — file format | Required entrypoint file for every skill directory | Mandated by spec; two required fields: `name` (max 64 chars, lowercase letters/numbers/hyphens only) and `description` (max 1024 chars) |
| `.agents/skills/` directory path | N/A — path convention | Cross-agent discovery path at repo root | Recognized by all major agent tools; preferred over `.claude/skills/` for cross-tool compatibility |
| CommonMark Markdown | N/A — format | Skill body and reference file content | Standard for all official Agent Skills examples |
| YAML | N/A — format | Frontmatter block (between `---` delimiters) | Mandated by spec; standard YAML 1.1+ |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `skills-ref` (Python CLI) | No versioned release; install from source | `skills-ref validate <path>` checks frontmatter, naming conventions, and structure | During development before committing any skill; catches silent failures before they reach real agents |
| Python 3.x | System / venv | Runtime for `skills-ref` | Only needed when running the validator |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `.agents/skills/` path | `.claude/skills/` | `.claude/skills/` locks skills to Claude Code only; `.agents/skills/` works across all agent tools |
| `skills-ref validate` | Manual checklist review | `skills-ref` catches name/directory mismatches automatically; manual review requires discipline to catch the same errors |
| Five skill directories (one per capability area) | One skill per command (15 dirs) | 15 directories × ~100 token descriptions = ~1500 tokens of fixed startup overhead; grouped by user journey (5 skills) is the established pattern |

**Installation (dev-time validator only):**
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e path/to/agentskills/skills-ref

# OR with uv
uv sync  # from skills-ref directory

# Validate a skill
skills-ref validate .agents/skills/nsyte-deploy
```

No `npm install`, no `deno` changes. Skills are static files requiring no build step.

## Architecture Patterns

### Recommended Project Structure

This is the full target structure Phase 1 scaffolds (empty SKILL.md stubs + nostr-concepts reference):

```
.agents/
└── skills/
    ├── nsyte-setup/            # Installation + first-run detection
    │   └── SKILL.md            # Phase 1: frontmatter stub only
    ├── nsyte-deploy/           # Primary deploy workflow
    │   └── SKILL.md            # Phase 1: frontmatter stub only
    ├── nsyte-config/           # Config management
    │   └── SKILL.md            # Phase 1: frontmatter stub only
    ├── nsyte-auth/             # NIP-46 bunker auth setup
    │   └── SKILL.md            # Phase 1: frontmatter stub only
    ├── nsyte-ci/               # Non-interactive CI/CD
    │   └── SKILL.md            # Phase 1: frontmatter stub only
    └── nsyte-concepts/         # Background Nostr/Blossom knowledge
        ├── SKILL.md            # Phase 1: frontmatter stub (user-invocable: false)
        └── references/
            └── nostr-concepts.md   # Phase 1: FULL CONTENT — relays, pubkeys, Blossom, NIP-46
```

Note: The roadmap phase description says 5 skill directories; the ROADMAP.md and REQUIREMENTS.md show the v1 skills as: nsyte-setup (SETUP-01/02), nsyte-deploy (DEPL-01/02/03), nsyte-config (CONF-01), nsyte-auth (CONF-03), nsyte-ci (CONF-02), plus nsyte-concepts (background). That is 6 skill directories total. The REQUIREMENTS.md traceability table maps exactly to these 6.

### Pattern 1: Minimal Valid SKILL.md Frontmatter Stub

**What:** A SKILL.md that satisfies spec requirements with the minimum valid content — both required fields, correct name, correct format — but no body content beyond a placeholder indicating the skill body will be written in a later phase.

**When to use:** Phase 1 only. This pattern exists because the directory structure and naming must be locked in and validator-clean before any body content is written, to prevent rework caused by name/directory mismatches discovered after body content exists.

**Example (for `nsyte-deploy`):**
```yaml
---
name: nsyte-deploy
description: Deploys a static site to the Nostr network using nsyte. Use when the user wants to publish, upload, or deploy a website to Nostr, Blossom servers, or a decentralized hosting system using nsyte.
---

<!-- Skill body: to be written in Phase 2 -->
```

Key rules enforced by this pattern:
- `name` value is `nsyte-deploy` — identical to the directory name `nsyte-deploy/`
- `description` is in third person and includes both action vocabulary (deploy, publish, upload) and context vocabulary (Nostr, Blossom, decentralized)
- No XML tags in name or description fields
- `name` uses only lowercase letters and hyphens; starts with a letter; no consecutive hyphens

### Pattern 2: Claude Code Extension Fields in Phase 1 Stubs

**What:** Include Claude Code-specific frontmatter fields in the stub where the intended behavior is already decided, so they are not forgotten when the body is written.

**When to use:** For skills where invocation control is clear even without a body.

**Fields to set in Phase 1:**
```yaml
# nsyte-deploy — side effects, must be explicit user invocation
disable-model-invocation: true

# nsyte-concepts — background knowledge, agent-only, not a user command
user-invocable: false
```

Other fields (`argument-hint`, `allowed-tools`) should be deferred to when the body is written, as their values depend on the workflow details.

### Pattern 3: nostr-concepts.md as a Standalone Reference File

**What:** A single Markdown reference file defining every Nostr/Blossom concept an agent will need when executing nsyte commands. Written for agents that have zero prior Nostr knowledge.

**When to use:** Phase 1. This is the only piece of substantive content written in this phase; all skill bodies are deferred. Establishing it first prevents terminology drift between skills in later phases.

**Required definitions:**
- **Relay**: A WebSocket server (WSS URL format) that stores and forwards Nostr events. nsyte publishes site metadata events to relays. Example relay URL format: `wss://relay.example.com`
- **Pubkey**: A 64-character hex string identifying a Nostr user (derived from a secp256k1 private key). Also represented in npub bech32 format. nsyte uses the pubkey to identify site ownership.
- **nsec / private key**: The private key used to sign Nostr events. 64-character hex or nsec bech32. Must never be logged or committed to source control.
- **Blossom server**: An HTTP server (HTTPS URL) that stores arbitrary blobs (files) indexed by SHA-256 hash. nsyte uploads static site files to Blossom servers. Example URL format: `https://blossom.example.com`
- **NIP-46 / bunker**: A remote signing protocol. Instead of providing a private key directly, the agent connects to a remote signer (bunker) via a `bunker://` connection string or nostr+walletconnect URI. Used for headless/CI scenarios without exposing the key.
- **Event**: A signed JSON object that Nostr uses to represent all data (messages, site metadata, file references). nsyte publishes events of specific kinds to announce sites.

### Anti-Patterns to Avoid

- **Name/directory mismatch:** The single most common silent failure. The `name` YAML field must be byte-for-byte identical to the directory name. Setting `name: nsyte_deploy` in `nsyte-deploy/SKILL.md` silently breaks discovery. Create the directory first, then copy its name verbatim into the `name` field.
- **Uppercase or underscore in `name`:** Spec violation. Only lowercase letters (`a-z`), digits (`0-9`), and hyphens (`-`) are valid. `nsyte-deploy` is valid; `nsyte_deploy` and `nsyte-Deploy` are not.
- **Reserved words in `name`:** Claude Code rejects skills with "anthropic" or "claude" in the name. The `nsyte-` prefix avoids this class of violation.
- **XML tags in frontmatter fields:** Any `<tag>` content in `name` or `description` is a spec violation and may cause Claude's XML parser to misinterpret the system prompt injection.
- **Cross-skill relative paths in reference links:** Writing `../nsyte-concepts/references/nostr-concepts.md` in a skill body violates the spec's "keep references one level deep from SKILL.md" rule. In Phase 1, this is a future-phase concern — just ensure the canonical nostr-concepts.md is placed where it can be referenced without traversing parent directories.
- **Writing "When to Use This Skill" as a SKILL.md body section:** This content only has value if it appears in the `description` frontmatter field. The body is only loaded after the skill has already been triggered; an agent will never read a body-section heading to decide activation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spec validation | Custom regex or grep for frontmatter field checks | `skills-ref validate` | Skills-ref understands the full spec rules including name format, required fields, directory matching, and structure; regex will miss edge cases |
| SKILL.md template generator | A script to scaffold SKILL.md files | `mkdir` + `touch` + text editor | The "template" is 5 lines of YAML frontmatter; scaffolding scripts add complexity for zero benefit |
| Cross-skill loading chain | A "concepts" SKILL.md that other skill bodies `include` or `source` | Self-contained skills with local `references/` copies | The spec does not support cross-skill includes; agents will only read files referenced at one level deep from the active SKILL.md |

**Key insight:** Phase 1 is a file-authoring task. The "stack" is a text editor, `mkdir`, and the `skills-ref` validator. Over-engineering this phase with tooling creates maintenance burden with no payoff.

## Common Pitfalls

### Pitfall 1: Silent Discovery Failure from Name Mismatch

**What goes wrong:** A skill directory is created and a SKILL.md is written, but the agent never activates it. No error appears — the skill simply does not exist from the agent's perspective.

**Why it happens:** The spec requires `name` in frontmatter to match the directory name exactly. Any discrepancy (case difference, extra character, hyphen vs. underscore) causes the validator to reject or ignore the skill. The failure mode is silent — no warning is shown to the user.

**How to avoid:** Create the directory first. Copy the directory name character-for-character into the `name:` YAML field. Run `skills-ref validate` before any other work. Never type the name twice independently — copy-paste or verify with `cat`.

**Warning signs:** `skills-ref validate` reports a name mismatch error. Or: running `skills-ref to-prompt .agents/skills/` shows fewer skills than directories. Or: a skill that should activate doesn't appear in Claude Code's `/` command list.

### Pitfall 2: Description Written in First Person

**What goes wrong:** The skill description is written as "I can help you deploy your static site" or "This skill handles deployment." The skill may not activate correctly because the description is injected directly into the system prompt, and first-person voice from a skill fragment causes parsing issues.

**Why it happens:** Natural language tendency; instinct to write instructions as if talking to the user.

**How to avoid:** Always start the description with a third-person verb: "Deploys...", "Installs...", "Manages...". Include both a capability statement and an explicit "Use when..." trigger clause. Verify the description passes `skills-ref validate` (which checks format, not voice — voice is enforced by best practice, not spec validation).

**Warning signs:** Skill exists and validates but wrong skills activate for user queries, or the intended skill does not activate without the user explicitly naming it.

### Pitfall 3: nostr-concepts.md Written Too Abstractly

**What goes wrong:** The reference file explains Nostr using Nostr jargon ("events are immutable data structures signed with secp256k1 keys"). An agent reading this cannot translate it into actionable guidance for a user who asks "why is my deploy failing?"

**Why it happens:** Developer-mode writing; assuming reader (the agent) has context it may not have.

**How to avoid:** Write every definition as agent instructions, not encyclopedia entries. "A relay is a WebSocket server at a WSS URL. nsyte needs at least one relay to publish your site's metadata. If you don't have one, use `wss://relay.damus.io` as a fallback." Include what the agent should do, not just what the thing is.

**Warning signs:** Later phase skills require adding inline explanations of concepts that should already be in nostr-concepts.md. Or: agents executing deploy skills ask the user to explain what a relay is.

### Pitfall 4: Validator Not Installed Before Committing

**What goes wrong:** SKILL.md files are committed and pushed without running `skills-ref validate`. A naming error only discovered in Phase 2 or 3 requires renaming directories and updating multiple references.

**Why it happens:** `skills-ref` requires a separate Python install step that is easy to skip.

**How to avoid:** Install the validator in a Python venv before creating any skill files. Run it after creating each skill directory, not only at the end. The install is a one-time operation.

**Warning signs:** `skills-ref` has never been run against the created skill directories.

## Code Examples

Verified patterns from official spec and Anthropic docs:

### Valid SKILL.md Frontmatter Stub (nsyte-deploy)

```yaml
---
name: nsyte-deploy
description: Deploys a static site to the Nostr network using nsyte. Use when the user wants to publish, upload, or deploy a website to Nostr, Blossom servers, or a decentralized hosting system using nsyte.
disable-model-invocation: true
---

<!-- Skill body: to be written in Phase 2 -->
```

Source: agentskills.io/specification (required fields), platform.claude.com/docs best-practices (description writing), code.claude.com/docs/en/skills (disable-model-invocation field)

### Valid SKILL.md Frontmatter Stub (nsyte-concepts — background skill)

```yaml
---
name: nsyte-concepts
description: Background knowledge about Nostr protocol concepts, Blossom blob storage, and NIP-46 bunker authentication used by nsyte. Loaded automatically when Nostr or Blossom context is needed.
user-invocable: false
---

<!-- Skill body: to be written in Phase 2. References nostr-concepts.md for domain vocabulary. -->
```

Source: code.claude.com/docs/en/skills (user-invocable field)

### Shell Commands to Create Structure

```bash
# Create all skill directories
mkdir -p .agents/skills/nsyte-setup
mkdir -p .agents/skills/nsyte-deploy
mkdir -p .agents/skills/nsyte-config
mkdir -p .agents/skills/nsyte-auth
mkdir -p .agents/skills/nsyte-ci
mkdir -p .agents/skills/nsyte-concepts/references

# Create SKILL.md stubs (one touch per directory)
touch .agents/skills/nsyte-setup/SKILL.md
touch .agents/skills/nsyte-deploy/SKILL.md
touch .agents/skills/nsyte-config/SKILL.md
touch .agents/skills/nsyte-auth/SKILL.md
touch .agents/skills/nsyte-ci/SKILL.md
touch .agents/skills/nsyte-concepts/SKILL.md

# Validate each skill after writing frontmatter
skills-ref validate .agents/skills/nsyte-setup
skills-ref validate .agents/skills/nsyte-deploy
skills-ref validate .agents/skills/nsyte-config
skills-ref validate .agents/skills/nsyte-auth
skills-ref validate .agents/skills/nsyte-ci
skills-ref validate .agents/skills/nsyte-concepts
```

### nostr-concepts.md Agent-Readable Section Format

```markdown
## Relay

A Nostr relay is a WebSocket server identified by a WSS URL (e.g., `wss://relay.damus.io`).
nsyte publishes site metadata as Nostr events to one or more relays.

**For agents:** When a user mentions "relay", they mean a WSS URL. If the user has not configured
relays, suggest `wss://relay.damus.io` and `wss://nos.lol` as common public relays.
nsyte stores relay configuration in `.nsite/config.json`.

## Pubkey

A Nostr public key is a 64-character lowercase hex string (e.g., `3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d`).
It can also appear in npub bech32 format (e.g., `npub1...`).
nsyte uses the pubkey to identify site ownership on the network.

## Blossom Server

A Blossom server is an HTTP/HTTPS file storage server (e.g., `https://blossom.primal.net`).
nsyte uploads static site files as blobs to Blossom servers, indexed by SHA-256 hash.

**For agents:** When a user mentions "Blossom server", they mean an HTTPS URL.
nsyte stores Blossom server configuration in `.nsite/config.json`.

## NIP-46 / Bunker Auth

NIP-46 is a Nostr signing protocol that allows a remote signer (bunker) to sign events
on behalf of an agent, without the private key being present on the local machine.
A bunker connection is identified by a `bunker://` URI.
nsyte supports bunker auth via `nsyte bunker add <connection-string>`.

**For agents:** Bunker auth is the preferred method for CI/CD and non-interactive deployments.
It avoids storing a private key in environment variables or files.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.claude/commands/` slash command scripts | `.claude/skills/` (Claude Code) / `.agents/skills/` (cross-agent) | 2025-12-18 (Agent Skills spec released) | Skills are now a cross-agent open standard, not Claude-only; use `.agents/skills/` for maximum compatibility |
| Single monolithic SKILL.md with all commands | Multiple focused skills by user journey, with `references/` for depth | Established with spec release | Progressive disclosure; agents only load what they need |
| Skills for individual commands | Skills grouped by user journey (install, deploy, config, manage) | Best practice as of 2025-12-18 | Fewer startup-time descriptions; cleaner activation matching |

**Deprecated/outdated:**
- `.claude/commands/*.md` slash command files: Still functional in Claude Code but not the canonical approach; `.agents/skills/` is preferred for any new skills package
- Storing skills in `~/.claude/skills/` for project-specific skills: Use repo-committed `.agents/skills/` so skills ship with the CLI and are versioned together

## Open Questions

1. **Skill count for Phase 1: 5 or 6 directories?**
   - What we know: The ROADMAP.md phase description says "one subdirectory per planned skill." REQUIREMENTS.md v1 requirements enumerate: nsyte-install/setup (SETUP-01/02), nsyte-deploy (DEPL-01), nsyte-config (CONF-01), nsyte-auth (CONF-03), nsyte-ci (CONF-02). That is 5 user-facing skills. The research ARCHITECTURE.md adds `nsyte-concepts` as a background skill (6th). The SUCCESS CRITERIA item 1 says "one subdirectory per planned skill."
   - What's unclear: Whether `nsyte-concepts` (background knowledge, `user-invocable: false`) counts as a "planned skill" for the scaffold count.
   - Recommendation: Create all 6 directories in Phase 1. The `nsyte-concepts` background skill is essential for the `references/nostr-concepts.md` file that success criteria item 4 requires. Creating it now with `user-invocable: false` is correct and adds no risk.

2. **`references/nostr-concepts.md` location: inside nsyte-concepts/ or at the top level?**
   - What we know: Success criteria item 4 says "`references/nostr-concepts.md` exists." The Anti-Pattern 3 in ARCHITECTURE.md says cross-skill relative paths (e.g., `../nsyte-concepts/references/nostr-concepts.md`) break the spec's "one level deep" rule.
   - What's unclear: Whether the success criteria means `.agents/skills/references/nostr-concepts.md` (top-level references) or `.agents/skills/nsyte-concepts/references/nostr-concepts.md` (inside the concepts skill).
   - Recommendation: Place it at `.agents/skills/nsyte-concepts/references/nostr-concepts.md`. This is inside a skill directory, consistent with the spec's structure. Later phase skills can include their own copies (acceptable duplication) or reference from within their own `references/` directories. The canonical file belongs in the concepts skill.

## Sources

### Primary (HIGH confidence)

- [agentskills.io/specification](https://agentskills.io/specification) — Required frontmatter fields, `name` format rules, directory matching requirement, SKILL.md structure
- [agentskills.io/what-are-skills](https://agentskills.io/what-are-skills) — Three-tier progressive disclosure model, file loading behavior
- [agentskills.io/integrate-skills](https://agentskills.io/integrate-skills) — `skills-ref validate` command usage, XML prompt format for testing
- [platform.claude.com/docs — Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — Third-person description requirement, description trigger vocabulary rules, anti-patterns
- [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) — Claude Code-specific fields: `disable-model-invocation`, `user-invocable`, `argument-hint`, `.claude/skills/` vs `.agents/skills/` path
- [github.com/anthropics/skills](https://github.com/anthropics/skills) — Official Anthropic example skills for structural reference
- Project ARCHITECTURE.md (`/home/sandwich/Develop/nsyte/.planning/research/ARCHITECTURE.md`) — Anti-Pattern 3 (cross-skill paths), component responsibilities, build order
- Project STACK.md (`/home/sandwich/Develop/nsyte/.planning/research/STACK.md`) — Full frontmatter field reference, `name` format rules, `skills-ref` install instructions, what-not-to-use table
- Project SUMMARY.md (`/home/sandwich/Develop/nsyte/.planning/research/SUMMARY.md`) — Pitfall catalog, phase ordering rationale, recommended skill groupings

### Secondary (MEDIUM confidence)

- [github.com/agentskills/agentskills skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) — Validator install instructions and usage; rated MEDIUM because library self-declares "not for production"
- [geminicli.com/docs/cli/skills/](https://geminicli.com/docs/cli/skills/) — Cross-agent `.agents/skills/` path compatibility confirmation for Gemini CLI
- [opencode.ai/docs/skills/](https://opencode.ai/docs/skills/) — Cross-agent `.agents/skills/` path confirmation for OpenCode

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All spec details sourced from official agentskills.io docs and Anthropic platform docs; no training data guesses for spec fields
- Architecture: HIGH — Directory structure and naming rules are exact spec requirements, not patterns; cross-agent path confirmed by multiple agent tool docs
- Pitfalls: HIGH — All four documented pitfalls derived from spec constraints (name format, required fields, voice requirement) or the verified ARCHITECTURE.md anti-patterns

**Research date:** 2026-02-24
**Valid until:** 2026-08-24 (stable spec; Agent Skills standard is not in active churn as of research date)
