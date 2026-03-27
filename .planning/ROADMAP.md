# Roadmap: nsyte

## Overview

Two phases deliver the v1.0 test coverage milestone. Phase 1 creates test files from scratch for four pure-function modules with near-zero coverage. Phase 2 expands existing test files to cover untested branches in four partially-covered modules. Both phases target pure logic with no I/O mocking, making them independently executable and verifiable by running `deno test`.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: New Test Files** - Create comprehensive tests for four untested pure-function modules (completed 2026-03-27)
- [ ] **Phase 2: Expanded Coverage** - Add tests for untested branches in four partially-covered modules

## Phase Details

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
- [ ] 02-01-PLAN.md — Expand status.ts and display-mode.ts tests (interactive mode + env-var constructor)
- [ ] 02-02-PLAN.md — Expand formatters.ts and progress.ts tests (uncovered functions + server-bar rendering)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. New Test Files | 2/2 | Complete   | 2026-03-27 |
| 2. Expanded Coverage | 0/2 | Not started | - |
