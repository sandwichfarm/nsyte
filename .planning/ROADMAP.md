# Roadmap: nsyte

## Milestones

- ✅ **v1.0 Test Coverage** - Phases 1-2 (shipped 2026-03-27)
- ✅ **v1.1 Address Open Issues** - Phases 3-6 (shipped 2026-04-04)
- ✅ **v1.2 Custom Event Timestamps** - Phases 7-9 (shipped 2026-04-14)
- ✅ **v1.3 Redesign Homepage** - Phases 10-11 (shipped 2026-05-03)
- ✅ **v1.4 Documentation Pass** - Phases 12-15 (shipped 2026-05-03)
- ✅ **v1.5 Docs: VitePress Migration** - Phases 16-19 (shipped 2026-05-04)
- 🚧 **v1.6 OS Package Manager/Distributors** - Phases 20-26 (in progress)

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

### 🚧 v1.6 OS Package Manager/Distributors (In Progress)

**Milestone Goal:** Ship locally-testable publish pipelines for OS package managers that accept open submissions, integrated into the release workflow as a triggered parallel matrix job.

#### Phase 20: Packaging Infrastructure and Templates
**Goal**: The `packages/` directory exists in the main repo with well-formed template files for all five target managers, providing the version-controlled source of truth that all CI automation will consume
**Depends on**: Phase 19
**Requirements**: INFRA-01, AUR-01, BREW-01, SCOOP-01, WINGET-01, NIX-01
**Success Criteria** (what must be TRUE):
  1. `packages/aur/PKGBUILD`, `packages/homebrew/Formula/nsyte.rb`, `packages/scoop/bucket/nsyte.json`, `packages/winget/` YAML manifests, and `flake.nix` at repo root all exist and are syntactically valid
  2. The PKGBUILD uses `-bin` naming convention with source entries for all release platforms and SHA256 placeholder markers — a maintainer can open it and immediately see where CI will inject checksums
  3. The Homebrew formula contains per-platform `url`/`sha256` blocks for macOS (arm64 + x86_64) and Linux (x86_64) with no `bottle` block
  4. The Scoop manifest has correct `version`, `url`, `hash`, `checkver`, and `autoupdate` fields with no `v` prefix in the `version` field
  5. The three winget YAML manifests (`version`, `installer`, `locale.en-US`) contain correct schema version, `InstallerType: portable`, and all required fields
**Plans**: 3 plans
  - [x] 20-01-PLAN.md — AUR PKGBUILD (-bin) and Homebrew formula templates
  - [x] 20-02-PLAN.md — Scoop manifest and three Winget YAML manifests
  - [x] 20-03-PLAN.md — Nix flake.nix at repo root for all four supported systems

#### Phase 21: CI Workflow Foundation
**Goal**: The `publish-packages.yml` GitHub Actions workflow exists with the correct release trigger, PAT fix, asset-readiness guard, and job isolation — so that every subsequent manager-specific job is built on a reliable, non-blocking foundation
**Depends on**: Phase 20
**Requirements**: INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. `.github/workflows/publish-packages.yml` exists with `on: release: types: [published]` trigger and a `workflow_dispatch` input that accepts a manager name for manual re-runs of individual jobs
  2. The release creation step in `release.yml` uses `RELEASE_TOKEN` (PAT) instead of `GITHUB_TOKEN` — confirmed by inspecting the workflow file; the `publish-packages.yml` workflow now fires when a release is published
  3. Each manager job includes an asset-readiness poll step (e.g., polling `gh release view $TAG --json assets`) that waits until all expected release artifacts appear before downloading them
  4. Each manager is a fully independent named job (not a matrix entry) — a deliberate failure injected into one job does not cancel or affect any other job's execution
**Plans**: 3 plans
  - [x] 21-01-PLAN.md — Swap GITHUB_TOKEN to RELEASE_TOKEN on release.yml's create-release step (one-line PAT fix; INFRA-03)
  - [x] 21-02-PLAN.md — Create publish-packages.yml scaffold: release+workflow_dispatch triggers, setup job (poll+sha256), five stub manager jobs (INFRA-02, INFRA-04, INFRA-05)
  - [x] 21-03-PLAN.md — Document RELEASE_TOKEN prerequisite in docs/RELEASING.md and gate phase on user-confirms-secret-exists checkpoint (INFRA-03)

#### Phase 22: AUR Pipeline
**Goal**: The AUR `nsyte-bin` package is live and automatically updated on every release via CI with correct per-arch checksums, regenerated `.SRCINFO`, and SSH push to the AUR git remote
**Depends on**: Phase 21
**Requirements**: AUR-02, AUR-03, AUR-04, AUR-05
**Success Criteria** (what must be TRUE):
  1. CI computes independent SHA256 checksums for each release architecture (x86_64, aarch64) by asset name — never by array position — and patches the PKGBUILD before committing
  2. CI runs `makepkg --printsrcinfo` after patching PKGBUILD and commits both `PKGBUILD` and `.SRCINFO` atomically to the AUR git remote in a single push
  3. The `publish-aur` CI job completes successfully on a test release, and the AUR package page reflects the new version within minutes of the push
  4. A maintainer can run `makepkg -si` inside a Docker Arch Linux container using the `packages/aur/PKGBUILD` template and install the binary successfully before any real release
**Plans**: 2 plans
  - [x] 22-01-PLAN.md — Replace publish-aur stub with real AUR publish pipeline (AUR-02, AUR-03, AUR-04, AUR-05)
  - [x] 22-02-PLAN.md — Document AUR_SSH_PRIVATE_KEY secret + AUR account bootstrap + local-verify recipe in docs/RELEASING.md (AUR-04, AUR-05)

#### Phase 23: Homebrew Tap Pipeline
**Goal**: The `sandwichfarm/homebrew-nsyte` tap is live and the formula is automatically updated on every release with correct per-platform URLs and SHA256 hashes
**Depends on**: Phase 21
**Requirements**: BREW-02, BREW-03, BREW-04
**Success Criteria** (what must be TRUE):
  1. The `sandwichfarm/homebrew-nsyte` tap repo exists with `Formula/nsyte.rb` and users can install nsyte via `brew install sandwichfarm/nsyte/nsyte`
  2. The `publish-homebrew` CI job updates the tap formula's URL and SHA256 for all platforms (macOS arm64, macOS x86_64, Linux x86_64) on release and pushes the update to the tap repo without error
  3. A maintainer can verify the formula locally with `brew install --formula ./Formula/nsyte.rb` (or equivalent local path install) and have the binary execute successfully before any real release push
**Plans**: TBD

#### Phase 24: Scoop Bucket Pipeline
**Goal**: The `sandwichfarm/scoop-nsyte` bucket is live and the manifest is automatically updated on every release with the correct URL and hash, with autoupdate configured as a fallback
**Depends on**: Phase 21
**Requirements**: SCOOP-02, SCOOP-03, SCOOP-04
**Success Criteria** (what must be TRUE):
  1. The `sandwichfarm/scoop-nsyte` bucket repo exists with `bucket/nsyte.json` and users can install nsyte via `scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte` followed by `scoop install nsyte`
  2. The `publish-scoop` CI job updates the manifest's `url` and `hash` on release and pushes to the bucket repo without error — the manifest `version` field has no `v` prefix
  3. A maintainer can verify the manifest locally with `scoop install <path>/nsyte.json` (or equivalent local manifest install) before any real release push
**Plans**: TBD

#### Phase 25: Winget Pipeline
**Goal**: nsyte is available in the Windows Package Manager index after a one-time manual PR bootstrap, and subsequent version bumps are automated via CI
**Depends on**: Phase 21
**Requirements**: WINGET-02, WINGET-03, WINGET-04, WINGET-05
**Success Criteria** (what must be TRUE):
  1. The three winget YAML manifests pass `winget validate` with zero errors before the initial PR submission
  2. The initial manual PR to `microsoft/winget-pkgs` is submitted, reviewed, and merged — users can install nsyte via `winget install nsyte`
  3. The `publish-winget` CI job uses `wingetcreate update` with the `WINGET_TOKEN` secret to automatically open a version-update PR to `microsoft/winget-pkgs` on each subsequent release
  4. The repo README or CONTRIBUTING file contains a note documenting the expected 1-3 day review lag for winget PRs so maintainers do not mistake a pending review for a CI failure
**Plans**: TBD

#### Phase 26: Nix Flake
**Goal**: A `flake.nix` at repo root exposes nsyte for all supported platforms, the Linux ELF linkage question is resolved, and per-platform hashes are updated automatically on every release via CI
**Depends on**: Phase 21
**Requirements**: NIX-02, NIX-03, NIX-04, NIX-05
**Success Criteria** (what must be TRUE):
  1. `nix run .#nsyte -- --version` succeeds on Linux (NixOS container) and macOS without any "ELF interpreter not found" or dynamic-linking error — the derivation uses `autoPatchelfHook` if the binary is dynamically linked, or documents the static-link verification result
  2. Per-platform SRI hashes in `flake.nix` (or companion `sources.json`) are updated automatically by a CI job on release using `nix hash to-sri` — no manual hash edits required
  3. The `publish-nix` CI job commits updated hashes directly to the main repo on release (no external repo push) and the commit appears in the release commit history
  4. A user can install nsyte via `nix run github:sandwichfarm/nsyte` on a supported platform and get the correct binary for their architecture
**Plans**: TBD

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
| 22. AUR Pipeline | v1.6 | 2/2 | Complete   | 2026-05-05 |
| 23. Homebrew Tap Pipeline | v1.6 | 0/? | Not started | - |
| 24. Scoop Bucket Pipeline | v1.6 | 0/? | Not started | - |
| 25. Winget Pipeline | v1.6 | 0/? | Not started | - |
| 26. Nix Flake | v1.6 | 0/? | Not started | - |
