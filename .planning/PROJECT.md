# nsyte

## What This Is

nsyte is a Deno-based CLI tool for deploying static websites to Nostr and Blossom servers. It handles file hashing, event signing (NIP-46), relay publishing, and site manifest management for decentralized web hosting.

## Core Value

Reliable deployment of static sites to the Nostr/Blossom ecosystem with clear feedback and correct event handling.

## Current Milestone: v1.1 Address Open Issues

**Goal:** Fix the manifest title/description bug and add dry-run, config schema hosting, and secrets scanning capabilities.

**Target features:**
- --dry-run flag for deploy and announce commands (pretty-print events before publishing)
- Fix title/description not being stored in site manifest (#101 bug)
- Publish config JSON Schema at nsyte.run/schemas/config.schema.json
- Secrets scanner command and deploy-step integration

## Requirements

### Validated

- Existing test suite: 139 tests passing, 81.7% branch coverage
- Test infrastructure: Deno test runner with `@std/testing/bdd` and `@std/testing/mock`
- CI workflow: Tests & Coverage badge generation (PR #96)
- Fix title/description not stored in site manifest (#101) — Validated in Phase 3: Manifest Bug Fix

### Active

- [ ] --dry-run flag for deploy and announce commands (#100)
- [x] Config JSON Schema available at nsyte.run/schemas/config.schema.json (#102) — Validated in Phase 4: Config Schema Hosting
- [x] Secrets scanner command and deploy-step integration (#103) — Validated in Phase 6: Secrets Scanner

### Out of Scope

- I/O-heavy modules (nostr.ts, gateway.ts, deploy.ts) -- require complex mocking, defer to future milestone
- Command files (announce, browse, config, etc.) -- integration-level testing, not unit-level
- Changing source code to improve testability -- tests only, no refactoring

## Context

- Runtime: Deno 2.x with TypeScript
- Test framework: `@std/testing/bdd` (describe/it), `@std/testing/mock` (stub/spy)
- Known pattern: `Deno.build` is frozen -- use `(Deno as any).build = {...}` for OS mocking
- Known pattern: ES module namespace exports are non-configurable -- stub underlying Deno APIs
- Known pattern: `@cliffy/ansi/colors` wraps text in ANSI codes -- use `includes()` not exact equality
- Coverage baseline: 81.7% branch, 35.3% line (139 tests, 9 ignored)

## Constraints

- **Test framework**: Deno's built-in test runner with `@std/testing` -- no external test frameworks
- **No source changes**: Tests must work against current source code as-is
- **CI compatibility**: Tests must pass on headless Ubuntu (GitHub Actions)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tier 1 first, then Tier 2 | Pure functions are fastest to test with highest coverage impact | -- Pending |
| Skip Tier 3 for this milestone | I/O mocking complexity doesn't fit "low-hanging fruit" goal | -- Pending |

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

---
*Last updated: 2026-04-04 after Phase 6 completion (secrets scanner)*
