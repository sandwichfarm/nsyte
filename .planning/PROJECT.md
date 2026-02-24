# nsyte Agent Skills

## What This Is

Agent Skills (agentskills.io) for nsyte, enabling AI agents to discover and use nsyte for deploying and managing static sites on the Nostr network. Six skills cover the core CLI lifecycle — installation, deployment, configuration, authentication, and CI/CD — shipped alongside the CLI in the nsyte repo.

## Core Value

Agents can discover nsyte and use it end-to-end without prior knowledge — install it, initialize a project, deploy a site, and manage it — guided by well-structured skill instructions.

## Requirements

### Validated

- ✓ CLI with commands: init, deploy, list, browse, download, purge, config, bunker, ci, announce, validate, serve, run, debug, sites — existing
- ✓ Nostr-based decentralized site deployment via Blossom servers — existing
- ✓ Multiple auth methods (private key, NIP-46 bunker) — existing
- ✓ Multi-platform binaries (Linux, macOS, Windows) — existing
- ✓ CI/CD integration support — existing
- ✓ Agent Skills directory structure in `.agents/skills/` — v1.0
- ✓ Six skills covering install, deploy, config, auth, CI, and domain concepts — v1.0
- ✓ Installation guidance skill detecting and guiding multi-platform install — v1.0
- ✓ All skills follow agentskills.io spec (SKILL.md frontmatter, scripts, references) — v1.0
- ✓ Progressive disclosure — lightweight descriptions for discovery, full instructions on activation — v1.0
- ✓ Pre-flight validation scripts for Deno runtime and network access — v1.0
- ✓ Token budget compliance (all SKILL.md bodies under 500 lines) — v1.0
- ✓ Third-person descriptions with Nostr context vocabulary for agent discovery — v1.0

### Active

(None — next milestone requirements defined via `/gsd:new-milestone`)

### Out of Scope

- Hosting skills on a separate registry or marketplace — skills ship in the repo
- MCP server integration — separate concern from Agent Skills
- Modifying nsyte's CLI interface — skills describe existing capabilities
- Agent-specific implementations — skills are agent-agnostic per the spec
- Single monolithic skill — violates progressive disclosure, exceeds token budget

## Context

- nsyte is a Deno/TypeScript CLI for deploying static sites to the Nostr network using Blossom file storage
- Agent Skills is an open format (agentskills.io) for giving AI agents new capabilities — supported by Claude Code, Cursor, Gemini CLI, VS Code, and many others
- Shipped v1.0 with 904 lines of deliverable content across 6 skills, 1 reference doc, and 2 pre-flight scripts
- All 6 skills pass `skills-ref validate` with zero errors and zero warnings
- Tech stack: Markdown (SKILL.md), TypeScript/Deno (pre-flight scripts)

## Constraints

- **Spec compliance**: Skills must follow agentskills.io specification — SKILL.md with valid frontmatter, name matching directory, etc.
- **Token budget**: Each SKILL.md body should stay under 5000 tokens (~500 lines) per spec recommendation; use references/ for detailed docs
- **Portability**: Skills must work across any agent that supports the Agent Skills format, not just Claude Code
- **Existing CLI**: Skills describe existing nsyte behavior — no CLI modifications needed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Multiple skills over single skill | Agents load only what's relevant; better progressive disclosure | ✓ Good — 6 focused skills, largest 194 lines |
| Skills live in nsyte repo | Ship with CLI, versioned together, single source of truth | ✓ Good — `.agents/skills/` alongside CLI source |
| Include installation guidance | Agents may encounter nsyte for the first time via skills | ✓ Good — nsyte-setup covers detect + install + init |
| nsyte-deploy gets disable-model-invocation | Prevent autonomous deployment without user approval | ✓ Good — safety gate for destructive operations |
| nsyte-concepts gets user-invocable: false | Background domain knowledge, not user-facing workflow | ✓ Good — loaded on-demand by other skills |
| Binary install path as recommended | No Deno runtime dependency required for end users | ✓ Good — simplest install path documented first |
| Pre-flight scripts report-only (exit 0/1) | Never install or modify system without user consent | ✓ Good — agents check prerequisites, guide user |
| Separate auth and CI skills | Interactive bunker management vs headless deploy are distinct workflows | ✓ Good — no cross-contamination of instruction paths |
| --sec is the only auth flag (not --nbunksec) | nbunksec1 is a credential format passed to --sec | ✓ Good — corrected vs README.md's incorrect examples |

---
*Last updated: 2026-02-24 after v1.0 milestone*
