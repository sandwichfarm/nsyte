# Roadmap: nsyte

## Milestones

- 🚧 **v1.0 Test Coverage Low-Hanging Fruit** - Phases 1-2 (in progress)
- 📋 **v1.1 Address Open Issues** - Phases 3-6 (planned)

## Phases

<details>
<summary>🚧 v1.0 Test Coverage Low-Hanging Fruit (Phases 1-2)</summary>

### Phase 1: New Test Files
**Goal**: All four pure-function modules (time-formatter, propagation-stats, json-highlighter, utils) have comprehensive tests where none existed before
**Depends on**: Nothing (first phase)
**Requirements**: T1-01, T1-02, T1-03, T1-04
**Success Criteria** (what must be TRUE):
  1. `deno test` passes with new test files covering time-formatter, propagation-stats, json-highlighter, and utils.ts
  2. Each new test file covers all exported functions and exercises all branching paths
  3. Line coverage for Tier 1 modules rises from near-zero (0-18%) to above 80%
  4. No previously passing tests are broken
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Tests for time-formatter and json-highlighter (UI modules)
- [x] 01-02-PLAN.md — Tests for propagation-stats and utils (lib modules)

### Phase 2: Expanded Coverage
**Goal**: Four partially-covered modules (status, formatters, progress, display-mode) have their untested branches exercised
**Depends on**: Phase 1
**Requirements**: T2-01, T2-02, T2-03, T2-04
**Success Criteria** (what must be TRUE):
  1. `deno test` passes with expanded tests in existing test files for status, formatters, progress, and display-mode
  2. Each expanded test file covers the previously-untested functions and branches identified in requirements
  3. Line coverage for Tier 2 modules rises above current baselines (status 58.7%, formatters 70.8%, progress 55.4%, display-mode 77.9%)
  4. Overall project line coverage rises measurably above the 35.3% pre-milestone baseline
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md — Expand status.ts and display-mode.ts tests (interactive mode + env-var constructor)
- [x] 02-02-PLAN.md — Expand formatters.ts and progress.ts tests (uncovered functions + server-bar rendering)

</details>

### v1.1 Address Open Issues (In Progress)

**Milestone Goal:** Fix the manifest title/description bug and add dry-run, config schema hosting, and secrets scanning capabilities. Each issue ships on its own branch with its own PR.

- [ ] **Phase 3: Manifest Bug Fix** - Fix title/description not stored in site manifest (#101) — 1 plan
- [x] **Phase 4: Config Schema Hosting** - Serve config JSON Schema at nsyte.run and register with SchemaStore (#102)
- [ ] **Phase 5: Dry-Run Mode** - Add --dry-run flag to deploy and announce commands (#100)
- [ ] **Phase 6: Secrets Scanner** - Add nsyte scan command and deploy pre-check integration (#103)

## Phase Details

### Phase 3: Manifest Bug Fix
**Goal**: The site manifest event correctly includes title and description from config.json
**Depends on**: Phase 2
**Requirements**: BUG-01, WF-01
**Success Criteria** (what must be TRUE):
  1. Running `nsyte deploy` with a config that has `title` and `description` fields produces a manifest event containing those values
  2. A test with a config object containing `title: "My Site"` fails before the fix and passes after
  3. The `--no-config` branch behavior is unchanged (still omits title/description as intended)
  4. The fix is delivered on a dedicated branch and merged via PR closing issue #101
**Plans:** 1 plan

Plans:
- [x] 03-01-PLAN.md — TDD bug fix: spread existingProjectData in non-interactive resolveContext, deploy tip, command audit

### Phase 4: Config Schema Hosting
**Goal**: The nsyte config JSON Schema is publicly accessible at a canonical URL and enables IDE autocompletion
**Depends on**: Phase 3
**Requirements**: SCHEMA-01, SCHEMA-02, WF-01
**Success Criteria** (what must be TRUE):
  1. `curl -I https://nsyte.run/schemas/config.schema.json` returns HTTP 200 with `Content-Type: application/json`
  2. Adding `"$schema": "https://nsyte.run/schemas/config.schema.json"` to a `.nsite/config.json` file provides field-level autocompletion in VS Code
  3. The schema is submitted to SchemaStore.org (PR opened or merged)
  4. The fix is delivered on a dedicated branch and merged via PR closing issue #102
**Plans:** 1 plan

Plans:
- [x] 04-01-PLAN.md — Build pipeline schema copy, $schema field in init, and config tests

### Phase 5: Dry-Run Mode
**Goal**: Users can preview deploy and announce events before any files are uploaded or events published
**Depends on**: Phase 3
**Requirements**: DRY-01, DRY-02, DRY-03, DRY-04, WF-01
**Success Criteria** (what must be TRUE):
  1. `nsyte deploy --dry-run` prints the planned file list and unsigned manifest event JSON, then exits without uploading or publishing anything
  2. `nsyte announce --dry-run` prints the unsigned announcement event JSON, then exits without publishing anything
  3. Running either command with `--dry-run` produces no NIP-46 bunker prompts and makes no network connections
  4. Dry-run output displays a prominent `[DRY RUN] No changes will be made` banner and pretty-prints event JSON for inspection
  5. The fix is delivered on a dedicated branch and merged via PR closing issue #100
**Plans:** 3 plans

Plans:
- [x] 05-01-PLAN.md — Core dry-run library: event collector, file writer, types (wave 1)
- [x] 05-02-PLAN.md — Deploy + Announce command integration: --dry-run flag and early exit (wave 1)
- [x] 05-03-PLAN.md — Interactive TUI event inspector: tag grouping, expand/collapse, navigation (wave 2)

### Phase 6: Secrets Scanner
**Goal**: Users can scan for Nostr-specific secrets before deploying, and the deploy pipeline warns when secrets are detected
**Depends on**: Phase 3
**Requirements**: SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05, SCAN-06, WF-01
**Success Criteria** (what must be TRUE):
  1. `nsyte scan` detects nsec1, nbunksec1, and hex-64 key patterns in text files within the target directory
  2. `nsyte scan` skips binary files (wasm, png, woff, jpg, etc.) and does not produce false positives from them
  3. `nsyte deploy` warns before uploading when secrets are found, and the warning is visible in normal interactive use
  4. `nsyte deploy --skip-secrets-scan` bypasses the pre-check entirely, allowing deployment to proceed without interruption
  5. In non-interactive (CI) mode, deploy terminates with a nonzero exit code when secrets are found (unless `--skip-secrets-scan` is passed)
  6. The fix is delivered on a dedicated branch and merged via PR closing issue #103
**Plans:** 2 plans

Plans:
- [x] 06-01-PLAN.md — Scanner library module (types, patterns, binary filter, core scanning logic + tests)
- [x] 06-02-PLAN.md — Scan command, deploy integration, CLI registration, integration tests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. New Test Files | v1.0 | 2/2 | Complete | 2026-03-27 |
| 2. Expanded Coverage | v1.0 | 0/2 | Not started | - |
| 3. Manifest Bug Fix | v1.1 | 0/1 | Planned | - |
| 4. Config Schema Hosting | v1.1 | 1/1 | Complete | 2026-04-04 |
| 5. Dry-Run Mode | v1.1 | 0/3 | Planned | - |
| 6. Secrets Scanner | v1.1 | 0/2 | Planned | - |
