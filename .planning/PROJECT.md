# nsyte Agent Skills

## What This Is

Adding Agent Skills (agentskills.io) to nsyte so that AI agents can discover and effectively use nsyte for deploying and managing static sites on the Nostr network. Multiple skills will cover the full CLI lifecycle — from installation through deployment and site management — shipped alongside the CLI in the nsyte repo.

## Core Value

Agents can discover nsyte and use it end-to-end without prior knowledge — install it, initialize a project, deploy a site, and manage it — guided by well-structured skill instructions.

## Requirements

### Validated

- ✓ CLI with commands: init, deploy, list, browse, download, purge, config, bunker, ci, announce, validate, serve, run, debug, sites — existing
- ✓ Nostr-based decentralized site deployment via Blossom servers — existing
- ✓ Multiple auth methods (private key, NIP-46 bunker) — existing
- ✓ Multi-platform binaries (Linux, macOS, Windows) — existing
- ✓ CI/CD integration support — existing

### Active

- [ ] Agent Skills directory structure in the nsyte repo
- [ ] Individual skills for each nsyte command/capability area
- [ ] Installation guidance skill (detect if installed, guide install if needed)
- [ ] Skills follow the agentskills.io specification (SKILL.md with frontmatter, optional scripts/references/assets)
- [ ] Progressive disclosure — lightweight metadata for discovery, full instructions on activation

### Out of Scope

- Hosting skills on a separate registry or marketplace — skills ship in the repo
- MCP server integration — separate concern from Agent Skills
- Modifying nsyte's CLI interface — skills describe existing capabilities
- Agent-specific implementations — skills are agent-agnostic per the spec

## Context

- nsyte is a Deno/TypeScript CLI for deploying static sites to the Nostr network using Blossom file storage
- Agent Skills is an open format (agentskills.io) for giving AI agents new capabilities — supported by Claude Code, Cursor, Gemini CLI, VS Code, and many others
- A skill is a directory with a SKILL.md file (YAML frontmatter + markdown instructions), plus optional scripts/, references/, and assets/ directories
- Skills use progressive disclosure: metadata (~100 tokens) loaded at startup, full instructions (<5000 tokens recommended) loaded on activation, resources loaded on demand
- The nsyte CLI has 15 commands covering the full site lifecycle
- Nostr concepts (relays, events, pubkeys, NIP-46) need clear explanation in skill instructions since agents won't have domain knowledge

## Constraints

- **Spec compliance**: Skills must follow agentskills.io specification — SKILL.md with valid frontmatter, name matching directory, etc.
- **Token budget**: Each SKILL.md body should stay under 5000 tokens (~500 lines) per spec recommendation; use references/ for detailed docs
- **Portability**: Skills must work across any agent that supports the Agent Skills format, not just Claude Code
- **Existing CLI**: Skills describe existing nsyte behavior — no CLI modifications needed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Multiple skills over single skill | Agents load only what's relevant; better progressive disclosure | — Pending |
| Skills live in nsyte repo | Ship with CLI, versioned together, single source of truth | — Pending |
| Include installation guidance | Agents may encounter nsyte for the first time via skills | — Pending |
| Cover all commands | Full lifecycle support — no gaps for agents to fall into | — Pending |

---
*Last updated: 2026-02-24 after initialization*
