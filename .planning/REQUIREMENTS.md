# Requirements: nsyte

**Defined:** 2026-04-04
**Core Value:** Reliable deployment of static sites to the Nostr/Blossom ecosystem with clear feedback and correct event handling.

## v1.1 Requirements

Requirements for milestone v1.1: Address Open Issues. Each maps to roadmap phases.

### Bug Fix

- [ ] **BUG-01**: Title and description from config.json are stored in the site manifest event (#101)

### Dry-Run

- [x] **DRY-01**: User can run `nsyte deploy --dry-run` to see the planned file list and manifest event without uploading or publishing
- [x] **DRY-02**: User can run `nsyte announce --dry-run` to see the announcement event without publishing
- [x] **DRY-03**: Dry-run mode skips bunker/signer connection entirely (no NIP-46 round-trip)
- [x] **DRY-04**: Dry-run output pretty-prints event JSON for inspection

### Config Schema

- [ ] **SCHEMA-01**: Config JSON Schema is served at nsyte.run/schemas/config.schema.json
- [ ] **SCHEMA-02**: `nsyte init` adds `$schema` field to new config files for IDE autocompletion

### Secrets Scanner

- [x] **SCAN-01**: Scanner library detects Nostr-specific secrets (nsec1, nbunksec1, hex-64 keys) in file contents
- [x] **SCAN-02**: Scanner filters binary files before scanning to avoid false positives
- [x] **SCAN-03**: User can run `nsyte scan` to scan current directory for secrets
- [x] **SCAN-04**: Deploy command runs secrets scan before uploading, warns by default
- [x] **SCAN-05**: User can pass `--skip-secrets-scan` to bypass the deploy pre-check
- [x] **SCAN-06**: Non-interactive mode terminates on secrets discovery (unless `--skip-secrets-scan`)

### Workflow

- [x] **WF-01**: Each issue (#100, #101, #102, #103) is delivered on a separate branch with its own PR

## v1.0 Requirements (Completed)

### Tier 1 - New Tests (Pure Functions)

- [x] **T1-01**: time-formatter has comprehensive tests covering all duration formatting branches
- [x] **T1-02**: propagation-stats has tests covering signal strength calculation and stats aggregation
- [x] **T1-03**: json-highlighter has tests covering JSON syntax highlighting and edge cases
- [x] **T1-04**: utils.ts exported functions have tests covering all utility helpers

### Tier 2 - Expanded Tests (Partial Coverage)

- [x] **T2-01**: status.ts has tests covering untested branches (58.7% -> higher)
- [x] **T2-02**: formatters.ts has tests covering 3 uncovered functions (70.8% -> higher)
- [x] **T2-03**: progress.ts has tests covering edge cases in progress rendering (55.4% -> higher)
- [x] **T2-04**: display-mode.ts has tests covering remaining branches (77.9% -> higher)

## Future Requirements

### Secrets Scanner Enhancements

- **SCAN-F01**: Allowlist mechanism for known false positives
- **SCAN-F02**: Custom pattern definitions via config

### Config Schema Enhancements

- **SCHEMA-F01**: Register schema with SchemaStore.org for automatic IDE recognition

### Tier 3 - I/O Heavy Modules

- **T3-01**: config.ts has tests with filesystem mocking (23.4% line coverage)
- **T3-02**: nostr.ts has tests with pool/store stubs (7.7% line coverage)
- **T3-03**: deploy.ts has tests for orchestration logic (7.6% line coverage)
- **T3-04**: gateway.ts has tests for HTTP server paths (7.0% line coverage)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Generic secret patterns (AWS keys, etc.) | Nostr-focused tool; keep patterns high-signal |
| Auto-redaction of secrets | Dangerous — could corrupt source files |
| 500+ gitleaks-style rules | Overkill for this domain; high false-positive rate |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | Phase 3 | Pending |
| SCHEMA-01 | Phase 4 | Pending |
| SCHEMA-02 | Phase 4 | Pending |
| DRY-01 | Phase 5 | Complete |
| DRY-02 | Phase 5 | Complete |
| DRY-03 | Phase 5 | Complete |
| DRY-04 | Phase 5 | Complete |
| SCAN-01 | Phase 6 | Complete |
| SCAN-02 | Phase 6 | Complete |
| SCAN-03 | Phase 6 | Complete |
| SCAN-04 | Phase 6 | Complete |
| SCAN-05 | Phase 6 | Complete |
| SCAN-06 | Phase 6 | Complete |
| WF-01 | Phases 3-6 | Complete |

**Coverage:**
- v1.1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after roadmap creation*
