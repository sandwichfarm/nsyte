# Roadmap: nsyte

## Milestones

- ✅ **v1.0 Test Coverage** - Phases 1-2 (shipped 2026-03-27)
- ✅ **v1.1 Address Open Issues** - Phases 3-6 (shipped 2026-04-04)
- 🚧 **v1.2 Custom Event Timestamps** - Phases 7-9 (in progress)

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

### 🚧 v1.2 Custom Event Timestamps (In Progress)

**Milestone Goal:** Users can pass `--created-at` to override `created_at` on all nostr events (except blossom auth events), with full test coverage.

## Phase Details

### Phase 7: CLI Argument and Timestamp Utilities
**Goal**: Users can pass `--created-at` to any command and get a validated Unix timestamp back (or a clear error)
**Depends on**: Phase 6
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04
**Success Criteria** (what must be TRUE):
  1. Running any nsyte command with `--created-at 1700000000` is accepted without error
  2. Running any nsyte command with `--created-at 2024-01-15T12:00:00Z` is accepted without error
  3. Running any nsyte command with `--created-at garbage` prints a clear error and exits non-zero
  4. The parsed timestamp value is available to all subcommands via Cliffy global options
**Plans**: 2 plans
Plans:
- [x] 07-01-PLAN.md -- Timestamp parsing module and unit tests (TDD)
- [x] 07-02-PLAN.md -- Wire --created-at global option to root command

### Phase 8: Timestamp Propagation
**Goal**: All nostr event creation functions accept and apply the optional custom timestamp; blossom auth events are never overridden
**Depends on**: Phase 7
**Requirements**: PROP-01, PROP-02, PROP-03, PROP-04, PROP-05, PROP-06, PROP-07, PROP-08, PROP-09
**Success Criteria** (what must be TRUE):
  1. Running `nsyte deploy --created-at 1700000000` results in manifest, snapshot, profile, relay list, server list events all having `created_at = 1700000000`
  2. Running `nsyte announce --created-at 1700000000` results in app handler and app recommendation events having `created_at = 1700000000`
  3. Delete events (kind 5) always use current time regardless of `--created-at`
  4. Blossom auth events (kind 24242) always use current time regardless of `--created-at`
  5. Omitting `--created-at` produces identical behavior to the current default (no regression)
**UI hint**: no
**Plans**: TBD

### Phase 9: Tests
**Goal**: Automated tests verify timestamp parsing, propagation to every event type, and auth event exclusion
**Depends on**: Phase 8
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Test suite passes for Unix epoch parsing and ISO 8601 parsing with known expected values
  2. Tests confirm each event kind (15128, 35128, 5128, 0, 10002, 10063, 31990, 31989) receives the custom timestamp when provided
  3. Tests explicitly confirm kind 5 (delete) and kind 24242 (auth) events ignore the override and always use current time
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
| 7. CLI Argument and Timestamp Utilities | v1.2 | 2/2 | Complete   | 2026-04-14 |
| 8. Timestamp Propagation | v1.2 | 0/? | Not started | - |
| 9. Tests | v1.2 | 0/? | Not started | - |
