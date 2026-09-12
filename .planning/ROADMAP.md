# Roadmap: nsyte

## Milestones

- ✅ **v1.0 Test Coverage** - Phases 1-2 (shipped 2026-03-27)
- ✅ **v1.1 Address Open Issues** - Phases 3-6 (shipped 2026-04-04)
- ✅ **v1.2 Custom Event Timestamps** - Phases 7-9 (shipped 2026-04-14)
- ✅ **v1.3 Redesign Homepage** - Phases 10-11 (shipped 2026-05-03)
- ✅ **v1.4 Documentation Pass** - Phases 12-15 (shipped 2026-05-03)
- ✅ **v1.5 Docs: VitePress Migration** - Phases 16-19 (shipped 2026-05-04)
- ✅ **v1.6 OS Package Manager/Distributors** - Phases 20-26 (shipped 2026-05-07)

## Phases

<details>
<summary>✅ v1.0 Test Coverage (Phases 1-2) - SHIPPED 2026-03-27</summary>

### Phase 1: Utility Module Tests
**Goal**: Pure-function and utility modules have test coverage
**Plans**: Complete

### Phase 2: Integration and Command Tests
**Goal**: Command-level coverage for core workflows
**Plans**: Complete

</details>

<details>
<summary>✅ v1.1 Address Open Issues (Phases 3-6) - SHIPPED 2026-04-04</summary>

### Phase 3: Manifest Title/Description Bug Fix
**Goal**: Site manifest events carry correct title and description metadata
**Plans**: Complete

### Phase 4: Dry-Run Mode
**Goal**: Users can preview deploy operations without side effects
**Plans**: Complete

### Phase 5: Config Schema Hosting
**Goal**: Config schema is publicly hosted and discoverable
**Plans**: Complete

### Phase 6: Secrets Scanner
**Goal**: Users are warned before deploying files that contain secrets
**Plans**: Complete

</details>

<details>
<summary>✅ v1.2 Custom Event Timestamps (Phases 7-9) - SHIPPED 2026-04-14</summary>

### Phase 7: CLI Argument and Timestamp Utilities
**Goal**: Users can pass `--created-at` to any command and get a validated Unix timestamp back (or a clear error)
**Plans**: Complete

### Phase 8: Timestamp Propagation
**Goal**: All nostr event creation functions accept and apply the optional custom timestamp; blossom auth events are never overridden
**Plans**: Complete

### Phase 9: Tests
**Goal**: Automated tests verify timestamp parsing, propagation to every event type, and auth event exclusion
**Plans**: Complete

</details>

<details>
<summary>✅ v1.3 Redesign Homepage (Phases 10-11) - SHIPPED 2026-05-03</summary>

### Phase 10: Theme, Density & Structural Cleanup
**Goal**: Deepen the dark palette, tighten the typography/spacing scale, and remove below-the-fold sections and their animations
**Plans**: Complete

### Phase 11: Hero, Navigation & Compact Install
**Goal**: Rebuild the above-the-fold viewport with new hero, top-link nav, and a smaller install component
**Plans**: Complete

Full archive: [`.planning/milestones/v1.3-ROADMAP.md`](milestones/v1.3-ROADMAP.md)

</details>

<details>
<summary>✅ v1.4 Documentation Pass (Phases 12-15) - SHIPPED 2026-05-03</summary>

### Phase 12: Audit & Inventory
**Goal**: Build the audit matrix that drives every rewrite, and scaffold the phantom-feature log
**Plans**: Complete

### Phase 13: Command Page Alignment
**Goal**: Bring every command page in docs/usage/commands/ into one-to-one alignment with src/commands/
**Plans**: Complete

### Phase 14: Guides & Cross-Reference Audit
**Goal**: Reconcile guides, top-level docs, README, and mkdocs nav with the audited command set
**Plans**: Complete

### Phase 15: Drift Gate
**Goal**: Ship a repeatable check that fails CI when source and docs diverge
**Plans**: Complete

Full archive: [`.planning/milestones/v1.4-ROADMAP.md`](milestones/v1.4-ROADMAP.md)

</details>

<details>
<summary>✅ v1.5 Docs: VitePress Migration (Phases 16-19) - SHIPPED 2026-05-04</summary>

**Milestone Goal:** Replace mkdocs with VitePress, carrying the v1.3 homepage redesign aesthetic into the docs so the marketing site and docs feel like one product.

#### Phase 16: Scaffold & Content Migration
**Goal**: A working VitePress site runs locally with all existing docs pages preserved at their original URLs and the doc-drift gate still passing
**Depends on**: Phase 15
**Requirements**: MIGRATE-01, MIGRATE-02, MIGRATE-03, MIGRATE-05
**Success Criteria** (what must be TRUE):
  1. `deno task docs:dev` (or `scripts/serve-site.sh`) starts a VitePress dev server from a clean checkout in under 5 seconds, with no mkdocs process involved
  2. All 22+ docs pages (including `/docs/`, `/docs/installation/`, `/docs/usage/commands/<cmd>/`, `/docs/guides/`, `/docs/configuration/`) resolve in the VitePress build with no 404s
  3. Every page that existed under mkdocs has a 1:1 counterpart in VitePress with content preserved — no deletions and no rewrites beyond those required by the engine swap
  4. `deno task check-doc-drift` passes with zero new drift entries against the migrated content
  5. `scripts/build-site.sh` and `scripts/serve-site.sh` invoke the VitePress build/serve commands (not mkdocs)
**Plans**: Complete
**UI hint**: yes

#### Phase 17: Theme & Landing
**Goal**: The docs site wears the v1.3 homepage aesthetic — same palette, typography, and density — and the `/docs/` index is a custom landing that echoes the homepage hero
**Depends on**: Phase 16
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04, LAND-01, LAND-02, LAND-03
**Success Criteria** (what must be TRUE):
  1. Every page in the docs site renders with `--cyber-bg #06070d` background and `--cyber-accent #34d399` accent across header, sidebar, footer, and content — no stock VitePress blue/violet visible
  2. Body text reads at 15px base / 1.5 line-height with the homepage monospace family for code; a side-by-side visual comparison shows no obvious mismatch between homepage and docs typography
  3. The header and sidebar show underlined active states with no pill buttons — the same shape language as the homepage nav
  4. Navigating to `/docs/` renders a custom landing page with the nsyte wordmark, tagline, and sectioned cards linking to Installation, Usage, Guides, and Configuration — the default VitePress home layout is not used
  5. A user navigating from `nsyte.run` to `/docs/` perceives visual continuity (same palette, same ambient motif treatment, same accent green) — not a context switch to a different design system
**Plans**: Complete
**UI hint**: yes

#### Phase 18: Content Surfaces & Search
**Goal**: Code blocks, admonitions, and tab groups match the homepage install-tabs aesthetic, and VitePress local search is wired and fully indexed
**Depends on**: Phase 17
**Requirements**: CONTENT-01, CONTENT-02, CONTENT-03, SEARCH-01, SEARCH-02, SEARCH-03
**Success Criteria** (what must be TRUE):
  1. Code blocks render with a terminal-feel surface, monospace font, and a copy-to-clipboard button that shows success feedback for no more than 1.5 seconds — visually consistent with the homepage install component
  2. Admonitions (`info`, `warning`, `danger`, `tip`) render with accent-bordered surfaces using the v1.3 palette — no default VitePress yellow or blue visible
  3. Multi-tab blocks (OS install tabs, language tabs) use the underlined-tab style from the homepage — no pill buttons
  4. Pressing Ctrl+K / Cmd+K opens the search palette; pressing Esc closes it; results are navigable by keyboard without a mouse
  5. Searching for any migrated page's title or primary content keywords returns that page in the results
**Plans**: Complete
**UI hint**: yes

#### Phase 19: Deploy Cutover
**Goal**: A single PR atomically removes mkdocs and its Python toolchain from the repo and CI, wires in the VitePress build, and produces a green `Deploy Site` run on main that serves the live site
**Depends on**: Phase 18
**Requirements**: MIGRATE-04, DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04
**Success Criteria** (what must be TRUE):
  1. The cutover PR removes `mkdocs.yml`, `requirements-docs.txt`, the `Pygments<2.20` pin, and the Python venv install step — no mkdocs artifacts remain in the repo or CI after merge
  2. `deploy-site.yml` runs a Node-based VitePress build (not Python+mkdocs) and still deploys the unified site to Bunny CDN, purges cache, and publishes to nsite — no steps skipped, no new workflow files
  3. The VitePress CI build completes in no more than 15 seconds on `ubuntu-latest` with no new flakiness
  4. The first post-merge run of `Deploy Site` on `main` is green and `nsyte.run` plus `/docs/` are visibly served from the VitePress build — confirmed by URL spot-check
**Plans**: Complete

Full archive: [`.planning/milestones/v1.5-ROADMAP.md`](milestones/v1.5-ROADMAP.md)

</details>

<details>
<summary>✅ v1.6 OS Package Manager/Distributors (Phases 20-26) - SHIPPED 2026-05-07</summary>

**Milestone Goal:** Ship locally-testable publish pipelines for OS package managers that accept open submissions, integrated into the release workflow as triggered independent manager jobs.

### Phase Summary

- [x] **Phase 20: Packaging Infrastructure and Templates** - Package source templates restored under `packages/` with preserved auxiliary managers.
- [x] **Phase 21: CI Workflow Foundation** - Release-triggered publish workflow, PAT release token path, asset readiness, and manager isolation are wired.
- [x] **Phase 22: AUR Pipeline** - AUR publish job and runbook are implemented; live AUR push UAT is deferred to external runtime setup.
- [x] **Phase 23: Homebrew Tap Pipeline** - Homebrew publish job and runbook are implemented; tap repo/token/macOS install UAT is deferred to external runtime setup.
- [x] **Phase 24: Scoop Bucket Pipeline** - Scoop publish job and runbook are implemented; bucket repo/token/Windows install UAT is deferred to external runtime setup.
- [x] **Phase 25: Winget Pipeline** - Winget update job and bootstrap docs are implemented; winget index/bootstrap UAT is deferred to external runtime setup.
- [x] **Phase 26: Nix Flake** - Nix flake update job is implemented; live `publish-nix` CI and local Nix smoke UAT are deferred to external runtime setup.

Full archive: [`.planning/milestones/v1.6-ROADMAP.md`](milestones/v1.6-ROADMAP.md)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Utility Module Tests | v1.0 | -- | Complete | 2026-03-27 |
| 2. Integration and Command Tests | v1.0 | -- | Complete | 2026-03-27 |
| 3. Manifest Title/Description Bug Fix | v1.1 | -- | Complete | 2026-04-04 |
| 4. Dry-Run Mode | v1.1 | -- | Complete | 2026-04-04 |
| 5. Config Schema Hosting | v1.1 | -- | Complete | 2026-04-04 |
| 6. Secrets Scanner | v1.1 | -- | Complete | 2026-04-04 |
| 7. CLI Argument and Timestamp Utilities | v1.2 | 2/2 | Complete | 2026-04-14 |
| 8. Timestamp Propagation | v1.2 | 2/2 | Complete | 2026-04-14 |
| 9. Tests | v1.2 | 1/1 | Complete | 2026-04-14 |
| 10. Theme, Density & Structural Cleanup | v1.3 | 3/3 | Complete | 2026-05-03 |
| 11. Hero, Navigation & Compact Install | v1.3 | 3/3 | Complete | 2026-05-03 |
| 12. Audit & Inventory | v1.4 | 3/3 | Complete | 2026-05-03 |
| 13. Command Page Alignment | v1.4 | 4/4 | Complete | 2026-05-03 |
| 14. Guides & Cross-Reference Audit | v1.4 | 2/3 | Complete | 2026-05-03 |
| 15. Drift Gate | v1.4 | 2/2 | Complete | 2026-05-03 |
| 16. Scaffold & Content Migration | v1.5 | 1/1 | Complete | 2026-05-04 |
| 17. Theme & Landing | v1.5 | 1/1 | Complete | 2026-05-04 |
| 18. Content Surfaces & Search | v1.5 | 1/1 | Complete | 2026-05-04 |
| 19. Deploy Cutover | v1.5 | 1/1 | Complete | 2026-05-04 |
| 20. Packaging Infrastructure and Templates | v1.6 | 3/3 | Complete   | 2026-05-05 |
| 21. CI Workflow Foundation | v1.6 | 3/3 | Complete   | 2026-05-05 |
| 22. AUR Pipeline | v1.6 | 2/2 | Complete    | 2026-05-05 |
| 23. Homebrew Tap Pipeline | v1.6 | 1/1 | Complete   | 2026-05-05 |
| 24. Scoop Bucket Pipeline | v1.6 | 1/1 | Complete   | 2026-05-05 |
| 25. Winget Pipeline | v1.6 | 1/1 | Complete; external UAT deferred | 2026-05-07 |
| 26. Nix Flake | v1.6 | 1/1 | Complete; external UAT deferred | 2026-05-07 |
