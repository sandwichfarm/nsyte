# Requirements: nsyte

**Defined:** 2026-03-27
**Core Value:** Reliable deployment of static sites to the Nostr/Blossom ecosystem

## v1.0 Requirements

Requirements for test coverage milestone. Each maps to roadmap phases.

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

### Tier 3 - I/O Heavy Modules

- **T3-01**: config.ts has tests with filesystem mocking (23.4% line coverage)
- **T3-02**: nostr.ts has tests with pool/store stubs (7.7% line coverage)
- **T3-03**: deploy.ts has tests for orchestration logic (7.6% line coverage)
- **T3-04**: gateway.ts has tests for HTTP server paths (7.0% line coverage)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Source code refactoring | Tests only, no changing production code for testability |
| Command-level integration tests | Too complex for "low-hanging fruit" milestone |
| 100% coverage target | Diminishing returns; focus on highest-impact gaps |
| Modifying existing passing tests | Only add new tests or expand existing test files |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| T1-01 | Phase 1 | Complete |
| T1-02 | Phase 1 | Complete |
| T1-03 | Phase 1 | Complete |
| T1-04 | Phase 1 | Complete |
| T2-01 | Phase 2 | Complete |
| T2-02 | Phase 2 | Complete |
| T2-03 | Phase 2 | Complete |
| T2-04 | Phase 2 | Complete |

**Coverage:**
- v1.0 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
