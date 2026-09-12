# Milestones

## v1.6 OS Package Manager/Distributors (Shipped: 2026-05-07)

**Phases completed:** 7 phases, 12 plans, 8 tasks

**Key accomplishments:**

- Migrated package-manager sources into `packages/`, using placeholder-driven release asset templates for AUR, Homebrew, Scoop, Winget, and Nix while preserving Chocolatey, Debian, Flatpak, and Snap templates for future live-publication work.
- Swapped release creation to `RELEASE_TOKEN` so GitHub `release: published` events can trigger downstream package publication workflows.
- Shipped `publish-packages.yml` with asset readiness polling, centralized checksum computation, independent manager jobs, and manual per-manager `workflow_dispatch` reruns.
- Implemented AUR, Homebrew, Scoop, Winget, and Nix publication/update jobs with fail-fast placeholder checks, idempotency guards, and runbook-backed verification.
- Documented setup and troubleshooting for release tokens, AUR SSH, Homebrew tap PAT, Scoop bucket PAT, Winget bootstrap/update flow, and Nix flake hash updates in `docs/RELEASING.md`.

**Known deferred items at close:** 6 external runtime UAT gates accepted as deferred (see `STATE.md` Deferred Items).

---

## Completed

### v1.4: Documentation Pass

**Shipped:** 2026-05-03
**Phases:** 12-15 (12 plans, 26 tasks)
**Goal:** Eliminate documentation drift methodically. Re-align all docs with the actual CLI surface (commands, flags, arguments, behavior). Remove "optimistic" claims for features that no longer exist or never did. Build a drift gate so this never silently regresses.

**Key accomplishments:**

- Rebuilt nsyte 0.26.0, captured `--help` for all 21 top-level commands + 7 bunker subcommands (29 files), and produced AUDIT-MATRIX.md joining 21 source commands × 17 doc pages × 28 help captures with severity-ordered drift classification
- Created 5 missing command pages (get, put, scan, snapshot, status), rewrote upload.md as alias stub for deploy, re-anchored ls.md on canonical `list`, created _global-options.md as canonical globals reference
- Aligned 7 command pages (announce, bunker, debug, download, init, serve, validate) flag-by-flag with source `.option(...)` declarations; updated commands.md index; ZERO drift across all 21 commands
- Reconciled 8 guide pages: replaced phantom `appHandler.enabled` with `publishAppHandler`, removed phantom env vars (`NSYTE_BUNKER_KEY`, `NSYTE_LOG_LEVEL`), fixed Linux/Windows storage-path drift, deleted 227-line commented Package Managers block, updated stale `@0.10.1` pin
- Updated 5 cross-reference pages (docs/index, README, mkdocs.yml, docs/usage/index, docs/usage/configuration); mkdocs strict build clean
- Shipped `scripts/check-doc-drift.ts` (3 checks: coverage, flag alignment, env-var) and `.github/workflows/doc-drift.yml` CI gate
- `v1.4-PHANTOM-LOG.md` accumulates 34 entries documenting every removed/rewritten claim with verbatim quotes — backlog for future feature work

### v1.3: Redesign Homepage

**Shipped:** 2026-05-03
**Phases:** 10-11 (6 plans, 18 tasks)
**Goal:** Compress the marketing page into a tight, above-the-fold landing with darker chrome and the existing green accent, while keeping deeper docs reachable via links.

**Key accomplishments:**

- Locked near-black palette (`--cyber-bg #06070d`) and tightened density scale (15px body / 1.5 line-height / 2rem section padding / ~15% reduced heading clamps) on `website/src/index.html`
- Removed four below-the-fold sections (features, what's-nsite, CI/CD, demo walkthrough), animated grid, animated gradient, and asciinema demo player — file shrank from 1,775 → 653 lines (-63%)
- Built top-link nav (Docs · GitHub · Install · Releases) and rebuilt hero around wordmark + tagline + particles only
- Compact install component with underlined tabs (script default), single canonical command per tab, copy-to-clipboard + 1.5s feedback, "More install options →" link to docs
- Folded all Phase 10 UI-audit color findings into Phase 11 rebuild (no purple/blue gradients on UI surfaces; legacy neon green replaced; Phase 11 audit scored 24/24)
- User-approved cycle-2 layout: content flex-centered both axes (`min-height: 100vh` restored), nav moved to last child of `.hero-content`, `history.pushState` keeps URL hash in sync on `#install` clicks
- A11y: `:focus-visible` rings, `prefers-reduced-motion` block, full ARIA tablist semantics

### v1.2: Custom Event Timestamps

**Shipped:** 2026-04-14
**Phases:** 7-9
**Goal:** Add CLI argument to override `created_at` timestamp on nostr events, with tests across all code paths.

### v1.1: Address Open Issues

**Shipped:** 2026-04-04
**Phases:** 3-6
**Goal:** Fix manifest title/description bug, add dry-run mode, config schema hosting, and secrets scanner (#100-#103).

### v1.0: Test Coverage Low-Hanging Fruit

**Shipped:** 2026-03-27
**Phases:** 1-2
**Goal:** Increase line coverage from 35.3% by testing pure-function and utility modules.
