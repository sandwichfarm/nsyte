# Stack Research

**Domain:** Agent Skills authoring for a Deno/TypeScript CLI tool (nsyte)
**Researched:** 2026-02-24
**Confidence:** HIGH — specification verified directly from agentskills.io official docs and Anthropic platform docs; no training data guesses for spec fields

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Agent Skills spec (agentskills.io) | Current (released 2025-12-18) | The open standard skills must follow | The only standard; supported by Claude Code, Gemini CLI, OpenAI Codex, Cursor, VS Code, GitHub Copilot, Roo Code, Amp, Goose, Mistral AI, and 20+ others. Not following it means skills only work in one tool. |
| SKILL.md (YAML frontmatter + Markdown) | N/A — file format | Required entrypoint for every skill | Mandated by spec. No alternative. Two required fields: `name` (max 64 chars, lowercase/hyphens only, must match directory name) and `description` (max 1024 chars). |
| Markdown (CommonMark) | N/A — format | Skill body content | No restrictions on body content format. Markdown is the convention used by all official examples. |
| YAML | N/A — format | Frontmatter for skill metadata | Mandated by spec. Fields: `name` (required), `description` (required), `license` (optional), `compatibility` (optional), `metadata` (optional map), `allowed-tools` (optional, space-delimited, experimental). |

### Directory Structure

| Location | Path | Purpose |
|----------|------|---------|
| Project skills (Claude Code) | `.claude/skills/<skill-name>/SKILL.md` | Skills available for this project; can be committed to version control |
| Personal skills (Claude Code) | `~/.claude/skills/<skill-name>/SKILL.md` | Skills available across all projects for the user |
| Generic alias (cross-tool) | `.agents/skills/<skill-name>/SKILL.md` | Cross-agent-tool alias; Gemini CLI and others use this path |
| Plugin distribution | `<plugin>/skills/<skill-name>/SKILL.md` | For distributing skills via Claude Code plugins |

**Recommendation for nsyte:** Store skills in `.claude/skills/` at the repo root. This ships with the repo, versioned alongside the CLI, and is the standard for project-level skills in Claude Code. The `.agents/skills/` alias is the cross-tool compatible path — consider symlinking or documenting both.

### Skill File Structure

Every skill directory follows this pattern:

```
skill-name/
├── SKILL.md          # Required: YAML frontmatter + markdown instructions
├── references/       # Optional: markdown docs loaded on demand
│   ├── REFERENCE.md  # Detailed technical reference
│   └── *.md          # Domain-specific docs (loaded separately)
├── scripts/          # Optional: executable code run via bash
│   └── *.py / *.sh   # Scripts executed without loading into context
└── assets/           # Optional: static resources (templates, images, data)
    └── *             # Files used in output, not loaded into context
```

### Supporting Libraries and Tools

| Library / Tool | Version | Purpose | When to Use | Confidence |
|----------------|---------|---------|-------------|------------|
| skills-ref (Python) | No versioned release; install from source via `pip install -e .` or `uv sync` | CLI validation tool — `skills-ref validate <path>` checks frontmatter, naming conventions, structure | During skill development to catch spec violations before shipping | MEDIUM — documented as "demonstration purposes only, not for production"; still the only official validator |
| Python 3.x | System / venv | Runtime for skills-ref | Only needed if running the validator locally as part of CI or dev workflow | HIGH |
| uv (Python package manager) | Current | Faster alternative to pip for installing skills-ref | Prefer over pip for speed; optional | MEDIUM |

**Note on skills-ref:** The reference library is explicitly marked "not for production" in its README. It is the only official validator. Use it for development-time validation only — do not depend on it at runtime. The validation rules are simple enough to enforce via linting or review if needed.

### Claude Code Frontmatter Extensions

Claude Code supports additional frontmatter fields beyond the base spec. These are Claude Code-specific and will be ignored by other agents (safe to include):

| Field | Purpose | Notes |
|-------|---------|-------|
| `disable-model-invocation: true` | Prevents Claude from auto-triggering the skill; user must invoke via `/skill-name` | Use for skills with side effects or that require deliberate user intent |
| `user-invocable: false` | Hides from `/` menu; Claude-only invocation | Use for background knowledge skills |
| `argument-hint` | Autocomplete hint for expected arguments, e.g., `[command]` | UX improvement for user-invoked skills |
| `allowed-tools` | Tools Claude may use without approval when skill is active | Matches Claude Code permission syntax |
| `context: fork` | Runs skill in an isolated subagent | For complex isolated workflows |
| `model` | Override model for this skill | Rarely needed |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Uppercase letters in `name` field | Spec violation — name must be lowercase letters, numbers, and hyphens only. Validators will reject it. | `nsyte-deploy` not `nsyte-Deploy` |
| Consecutive hyphens (`--`) in `name` | Spec violation | Use single hyphens |
| `name` starting or ending with a hyphen | Spec violation | Start with a letter or number |
| Reserved words "anthropic" or "claude" in name | Claude Code rejects these | Use `nsyte-` prefix for all skill names |
| XML tags in `name` or `description` fields | Spec violation; Claude's XML parsing can misinterpret them | Use plain text in frontmatter fields |
| Skill body over 500 lines | Degrades performance — Claude loads entire SKILL.md when triggered, competing with conversation context | Move detailed docs to `references/` files; keep SKILL.md as an overview |
| Deeply nested file references | Claude may only partially read nested files (using `head -100`), getting incomplete information | Keep all references one level deep from SKILL.md |
| `README.md` inside a skill directory | Adds clutter; the skill should only contain agent-facing content | Everything agent-relevant goes in SKILL.md or referenced files |
| Separate skills registry/hosting | Over-engineering for this use case — skills ship in the repo | Skills live in `.claude/skills/` committed to the nsyte repo |
| MCP server instead of Agent Skills | Different concern: MCP exposes tools/APIs; Skills give agents procedural knowledge | Use Skills for instructions + workflows; use MCP if exposing a programmatic API |
| Single monolithic skill for all nsyte commands | Agents load one skill at a time; a single skill covering all 15 commands bloats context on every use | Multiple focused skills by capability area |
| "When to Use This Skill" section in the SKILL.md body | The body is only loaded AFTER triggering — Claude never reads this for discovery | Put all "when to use" triggers in the `description` frontmatter field |
| Time-sensitive information in skill body | Will become stale without notice | Reference versioned docs in `references/` with "current method" / "old patterns" structure |
| Windows-style paths (`\`) in file references | Break on Unix systems | Always use forward slashes |
| First-person voice in description | "I can help you with..." causes discovery problems — description is injected into system prompt | Write in third person: "Deploys static sites to Nostr..." |

---

## Skill Naming Conventions

The spec mandates `name` must match the parent directory name exactly.

**Recommended pattern for nsyte skills:** `nsyte-<capability>` in gerund or noun phrase form.

Examples:
- `nsyte-deploy` — deploying a static site
- `nsyte-install` — installing nsyte CLI
- `nsyte-init` — initializing a new project
- `nsyte-auth` — configuring authentication (private key, bunker)
- `nsyte-manage` — listing, downloading, purging sites

This prefix prevents naming collisions if the user has other skills installed and makes discovery obvious.

---

## Token Budget Guidelines

Progressive disclosure keeps context efficient:

| Level | When Loaded | Budget | Content |
|-------|-------------|--------|---------|
| Metadata | Always (startup) | ~100 tokens per skill | `name` + `description` frontmatter only |
| Instructions | When skill triggers | Under 5000 tokens recommended; keep SKILL.md under 500 lines | Full SKILL.md body |
| Resources | On demand | Effectively unlimited (not in context until read) | Files in `references/`, `scripts/`, `assets/` |

**Implication for nsyte:** Each skill's description should be tight (~50-100 tokens) but complete enough to trigger on the right user intent. The body can be comprehensive but should stay under 500 lines. Nostr/Blossom concept explanations and command reference docs should go in `references/` files.

---

## Description Writing Rules (HIGH confidence, from official docs)

The `description` field is the primary discovery mechanism. Claude uses it to decide whether to activate a skill. Rules:

1. Write in third person (injected into system prompt)
2. Include BOTH what the skill does AND when to use it (trigger keywords)
3. Include specific domain terms users would say ("deploy", "Nostr", "blossom", "nsyte", "static site")
4. Max 1024 characters — use them if needed for complete coverage
5. No XML tags

**Good example for nsyte-deploy:**
```yaml
description: Deploys a static site to the Nostr network using nsyte. Use when the user wants to publish, upload, or deploy a website to Nostr, Blossom servers, or a decentralized hosting system using nsyte.
```

**Bad example:**
```yaml
description: Helps with nsyte.
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Multiple focused skills (one per capability area) | Single monolithic skill | Only if the tool has 2-3 commands and all are always relevant together |
| Skills in `.claude/skills/` (committed to repo) | Skills in `~/.claude/skills/` (personal) | Personal path only if skills are user-specific (e.g., custom auth configs); for a CLI tool distributed to others, repo-committed project skills are correct |
| Plain Markdown in skill body | Structured templates, checklists | Use checklists in SKILL.md body for multi-step workflows where tracking progress matters (e.g., deploy workflow with validation steps) |
| skills-ref for development validation | Custom CI validation | Custom CI if you want to block PRs on spec violations without requiring Python |
| One skill per major workflow | One skill per individual command | A skill per command (15 skills) may be too granular — group related commands (init+deploy, config+auth, list+download+purge) |

---

## Version Compatibility

| Item | Version / Constraint | Notes |
|------|---------------------|-------|
| Agent Skills spec | Released 2025-12-18; current as of 2026-02 | Stable open standard; no versioning in frontmatter needed |
| skills-ref validator | No released version; install from source | Apache 2.0; use for dev-time validation only |
| Claude Code skills support | Current (`.claude/skills/`) | `.claude/commands/` still works but `.claude/skills/` is the canonical path; both coexist |
| Cross-agent compatibility | `.agents/skills/` alias | Gemini CLI and some others prefer `.agents/skills/`; Claude Code uses `.claude/skills/`; consider documenting both or symlinking |
| YAML frontmatter | Standard YAML | No special parser needed; any YAML 1.1+ compliant parser handles it |
| Deno / nsyte tech stack | No changes needed | Skills are pure markdown/YAML files; no Deno code required for skills themselves |

---

## Installation / Setup

Skills require no installation for end users — they are just directories with markdown files.

For skill authors validating their work:

```bash
# Install skills-ref validator (Python, dev-time only)
python -m venv .venv
source .venv/bin/activate
pip install -e path/to/agentskills/skills-ref

# OR with uv (faster)
uv sync  # from skills-ref directory

# Validate a skill
skills-ref validate .claude/skills/nsyte-deploy

# Generate XML prompt for testing
skills-ref to-prompt .claude/skills/nsyte-deploy

# Create skill directory structure manually
mkdir -p .claude/skills/nsyte-deploy/{references,scripts,assets}
touch .claude/skills/nsyte-deploy/SKILL.md
```

No `npm install`, no `deno` changes, no build step. Skills are static files.

---

## Sources

- [agentskills.io specification](https://agentskills.io/specification) — PRIMARY: all frontmatter fields, naming rules, directory structure, validation — HIGH confidence (official spec)
- [agentskills.io what-are-skills](https://agentskills.io/what-are-skills) — Progressive disclosure model, three-level loading — HIGH confidence (official docs)
- [agentskills.io integrate-skills](https://agentskills.io/integrate-skills) — How agents discover skills, XML prompt format, skills-ref library — HIGH confidence (official docs)
- [platform.claude.com/docs — Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — Directory locations for Claude Code, API usage, cross-surface limitations — HIGH confidence (Anthropic official docs)
- [platform.claude.com/docs — Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — Conciseness rules, description writing, progressive disclosure patterns, anti-patterns — HIGH confidence (Anthropic official docs)
- [code.claude.com/docs — Extend Claude with skills](https://code.claude.com/docs/en/skills) — Claude Code-specific frontmatter fields, `.claude/skills/` path, slash command integration — HIGH confidence (Claude Code official docs)
- [github.com/agentskills/agentskills skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) — Validator tool, Python API — MEDIUM confidence (demonstration library, not production-ready by own admission)
- [github.com/anthropics/skills](https://github.com/anthropics/skills) — Example skill structure (pdf, mcp-builder, skill-creator) — HIGH confidence (Anthropic official examples)
- Agent Skills open-sourced and released as standard: 2025-12-18 — MEDIUM confidence (WebSearch, multiple sources agree)

---

*Stack research for: Agent Skills authoring for nsyte CLI*
*Researched: 2026-02-24*
