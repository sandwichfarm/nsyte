---
phase: 09-tests
plan: 01
subsystem: testing
tags: [deno, nostr, unit-tests, timestamp, SimpleSigner, applesauce]

# Dependency graph
requires:
  - phase: 08-timestamp-propagation
    provides: createdAt optional parameter added to all event creation functions in nostr.ts and manifest.ts
  - phase: 07-timestamp-cli
    provides: parseTimestamp function and 20 existing unit + CLI tests in timestamp_test.ts
provides:
  - Unit tests verifying custom timestamp propagation to all 8 event creation functions
  - Unit tests verifying delete events (kind 5) use current time (not overridable)
  - Unit tests verifying blossom.ts and upload.ts auth event code has no createdAt parameter
affects: [milestone-v1.2-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SimpleSigner with random key via crypto.getRandomValues + encodeHex for test signers
    - sanitizeOps/sanitizeResources false required for tests calling signer.signEvent
    - Deno.readTextFileSync with import.meta.url for source-code assertions on private functions
    - createManifest helper function for building test NostrEvent fixtures

key-files:
  created:
    - tests/unit/timestamp_propagation_test.ts
    - tests/unit/timestamp_exclusion_test.ts
  modified: []

key-decisions:
  - "Source-code assertion pattern (Deno.readTextFileSync) used for private auth functions in blossom.ts and upload.ts that cannot be called directly"
  - "Function arity check (createDeleteEvent.length === 2) confirms no createdAt parameter added to delete events"
  - "sanitizeOps/sanitizeResources false required for signer.signEvent tests due to async crypto ops"

patterns-established:
  - "Test signer pattern: SimpleSigner with random 32-byte hex key, initialized in beforeAll"
  - "Source-code assertion: Deno.readTextFileSync via import.meta.url path for private function verification"

requirements-completed: [TEST-01, TEST-02, TEST-03]

# Metrics
duration: 2min
completed: 2026-04-14
---

# Phase 9 Plan 1: Tests Summary

**Propagation and exclusion tests for all 8 nostr event creation functions using SimpleSigner and source-code assertions for private auth functions**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-14T14:08:09Z
- **Completed:** 2026-04-14T14:09:56Z
- **Tasks:** 2
- **Files modified:** 2 (created)

## Accomplishments

- 11 propagation tests confirming all 8 event kinds (15128, 35128, 5128, 0, 10002, 10063, 31990, 31989) receive custom createdAt when provided
- 2 default-behavior tests confirming current time is used when createdAt is omitted (within 5s tolerance)
- 6 exclusion tests confirming kind 5 delete events always use current time, and blossom.ts + upload.ts have no createdAt parameter
- Full test suite passes at 200 tests, 0 failures (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Timestamp propagation tests** - `84ffe2f` (test)
2. **Task 2: Timestamp exclusion tests** - `6a46943` (test)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `tests/unit/timestamp_propagation_test.ts` - 11 propagation tests + 2 default-behavior tests for all event creation functions
- `tests/unit/timestamp_exclusion_test.ts` - 6 exclusion tests for createDeleteEvent, blossom.ts, and upload.ts

## Decisions Made

- Source-code assertion pattern chosen for private auth functions in blossom.ts and upload.ts (cannot be called directly since they are not exported). Reads file via `Deno.readTextFileSync` and asserts absence of `createdAt` and presence of `Math.floor(Date.now() / 1000)`.
- Function arity check (`createDeleteEvent.length === 2`) chosen as the most direct way to confirm no third parameter was added to the delete function signature.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TEST-01, TEST-02, TEST-03 requirements all satisfied
- v1.2 milestone test coverage complete
- All 200 tests pass with 0 failures

---
*Phase: 09-tests*
*Completed: 2026-04-14*
