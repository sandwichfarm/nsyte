# nsyte

## What This Is

A CLI tool for publishing static sites to nostr relays and blossom servers. Users can deploy, manage, and serve websites using the nostr protocol, with support for multiple named sites, snapshots, NIP-89 app handlers, and bunker-based signing. The marketing site at `nsyte.run` introduces the project with a compact above-the-fold landing that links to the full documentation site.

## Core Value

Reliable site deployment to the nostr + blossom ecosystem with a simple CLI workflow.

## Current Milestone: v1.6 OS Package Manager/Distributors

**Goal:** Ship locally-testable publish pipelines for OS package managers that accept open submissions, integrated into the release workflow as triggered independent manager jobs.

**Target features:**
- Package manager targeting — identify which managers allow open submissions (no popularity gatekeeping); AUR is the confirmed starting point
- Cohesive file structure convention under `packages/<manager>/...`
- Per-manager build + upload procedure (locally executable for testing)
- GitHub Actions release integration — independent manager jobs triggered by a successful release
- Manual re-run / per-manager maintenance workflow for when individual targets fail

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- Site deployment to blossom servers and nostr relays (deploy, undeploy) — v1.0
- Named site management (sites command) — v1.0
- File operations (put, get, delete, list, download) — v1.0
- Manifest snapshots for versioning — v1.0
- Configuration management with bunker-based signing — v1.0
- NIP-89 app handler announcements — v1.0
- CI/CD integration mode — v1.0
- Debug and validation tooling — v1.0
- Manifest title/description event metadata fix — v1.1
- Dry-run mode for deploy — v1.1
- Config schema hosting — v1.1
- Secrets scanning pre-deploy check — v1.1
- Custom `--created-at` global CLI option for overriding event timestamps — v1.2
- Above-the-fold homepage layout (heading, links, compact install box) — v1.3
- Darker dark-theme palette (`#06070d` base) preserving the green accent — v1.3
- Tighter typography, spacing, and component density on the homepage — v1.3
- Persistent links from homepage to the existing docs site — v1.3
- Documentation aligned 1:1 with the actual CLI surface (commands, flags, behavior) — v1.4
- Drift gate (`scripts/check-doc-drift.ts` + GitHub Actions workflow) catches future drift in CI — v1.4

### Active

<!-- Current scope. Building toward these. -->

v1.6 — OS Package Manager/Distributors. See "Current Milestone" above. Requirements live in `.planning/REQUIREMENTS.md`.

(Backlog still standing from v1.4 phantom log: env-var override support, `nsyte config show`/`set` subcommands, `validate` redundant `-f` flag fix, `deploy` duplicate `-c` short-flag fix. Deferred until after v1.6.)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Light theme — dark-only by design (cypherpunk aesthetic)
- Mobile-first homepage redesign — desktop above-the-fold fit is the priority; mobile gets graceful degradation only
- Asciinema/demo content on the homepage — demo lives in docs
- Marketing content on homepage (features, CI/CD, "what's nsite") — migrated to docs to enforce no-scroll constraint
- CLI source changes during the v1.4 docs pass — if a doc audit reveals a real source bug or missing feature, it's flagged for a future milestone, not fixed in this one
- CLI source changes during v1.5 — same rule: docs migration only; phantom-log backlog stays deferred

## Context

- **Runtime:** Deno (TypeScript)
- **Nostr libraries:** applesauce-core, applesauce-signers, applesauce-relay
- **CLI framework:** Cliffy (Command, Prompt, Ansi)
- **Event signing:** ISigner interface from applesauce-signers (supports bunker, nsec)
- **Event timestamps:** `--created-at` global option overrides timestamp on most event kinds; delete (kind 5) and blossom auth (kind 24242) events always use current time
- **Commands:** init, deploy, list, status, snapshot, sites, browse, download, get, ci, put, run, serve, delete, undeploy, validate, debug, announce, config, bunker, scan
- **Marketing site:** Single-page HTML at `website/src/index.html` (~653 lines after v1.3 redesign, down from ~1890). Cypherpunk theme, `--cyber-bg #06070d`, `--cyber-accent #34d399`. Single `<section class="hero">` with flex-centered content (wordmark + tagline + compact install component + top-link nav). UI-audit score 24/24 at v1.3 close.
- **Docs site:** historically a mkdocs build at `docs/`; **migrating to VitePress in v1.5** with palette/typography matched to the homepage. Homepage links to preserve: `/docs/installation/`, `/docs/`.

## Constraints

- **Deno:** Must compile to single binary for Linux, macOS, Windows
- **Nostr protocol:** Events must conform to NIP specifications
- **Blossom protocol:** Auth events (kind 24242) have expiration requirements
- **Brand color:** Existing green accent (`--cyber-accent #34d399`) is fixed — only darks deepen
- **Marketing site:** Single-file inline CSS+HTML+JS (`website/src/index.html`); no build step

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use applesauce libraries | Modern nostr library ecosystem with good Deno support | -- Pending |
| Cliffy for CLI | Mature Deno CLI framework | -- Pending |
| `--created-at` excluded from delete & blossom auth events | Deletion timestamp must reflect actual time; blossom expiration math depends on current time | ✓ Good (v1.2) |
| Homepage flex-centered + `min-height: 100vh` (v1.3 cycle-2) | First attempt dropped 100vh and left content top-anchored — user feedback restored centering as the more pleasant layout | ✓ Good (v1.3) |
| Nav placed AT END of `.hero-content` (v1.3 cycle-2) | User checkpoint feedback: links sit better below the wordmark/tagline/install | ✓ Good (v1.3) |
| Underlined text tabs over button-pill style (v1.3) | Denser, fits the "tighter" mandate; cleaner with the compact install card | ✓ Good (v1.3) |
| Phase 10 audit findings folded into Phase 11 rebuild | The flagged surfaces (install/code/copy components) were already being rebuilt; one-pass fix preferred over separate cleanup phase | ✓ Good (v1.3) — clean 24/24 audit |
| `history.pushState` on in-page anchor click (v1.3) | Plan must_haves required `window.location.hash === '#install'`; default `e.preventDefault()` + `scrollIntoView` doesn't update the URL | ✓ Good (v1.3) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

## Key Decisions

(continuing from above table)

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Phantom log as living artifact | Records every removed doc claim with verbatim quotes — future feature backlog source | ✓ Good (v1.4) — 34 entries surface concrete source-side work |
| `upload.md` kept as alias stub (not deleted) | UX: a user searching "upload" should find a doc that points them to deploy | ✓ Good (v1.4) |
| `ls.md` filename retained, content re-anchored on `list` | Avoid breaking external links to `/docs/usage/commands/ls/` | ✓ Good (v1.4) |
| `_global-options.md` canonical reference | Don't duplicate `--config`/`--created-at` across 22 pages | ✓ Good (v1.4) |
| Drift gate: 3 checks (coverage, flag, env-var) | Maps directly to the top-3 phantom patterns from the audit | ✓ Good (v1.4) |
| Phase 14 audit folded color findings from Phase 11 audit (UI carry-over) — n/a in v1.4 (docs-only) | — | — |

---
*Last updated: 2026-05-07 — v1.6 package pipeline implementation reconciled; runtime UAT pending*
