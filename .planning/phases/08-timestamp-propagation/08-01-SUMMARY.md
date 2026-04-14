---
phase: 08-timestamp-propagation
plan: 01
subsystem: nostr-event-creation
tags: [timestamp, backward-compat, event-creation, manifest]
dependency_graph:
  requires: [07-02]
  provides: [createdAt-parameter-contract]
  affects: [src/lib/nostr.ts, src/lib/manifest.ts]
tech_stack:
  added: []
  patterns: [nullish-coalescing-fallback, optional-parameter-threading]
key_files:
  created: []
  modified:
    - src/lib/nostr.ts
    - src/lib/manifest.ts
decisions:
  - "Used individual optional `createdAt?: number` parameter (not options object) per plan spec -- simplest backward-compatible approach"
  - "Nullish coalescing `??` ensures original runtime value is used when parameter omitted -- no behavior change for existing callers"
  - "createDeleteEvent left unchanged as specified -- delete events always use current time"
  - "blossom.ts, upload.ts, delete.ts, undeploy.ts left unchanged -- kind 24242 auth events must always use current time"
metrics:
  duration: "2m 10s"
  completed_date: "2026-04-14"
  tasks: 2
  files_modified: 2
---

# Phase 8 Plan 1: Add createdAt Parameter to Event Creation Functions Summary

**One-liner:** Added optional `createdAt?: number` parameter to 8 event creation functions using nullish coalescing fallback to original timestamp sources.

## What Was Built

Added backward-compatible optional `createdAt?: number` parameter to 6 functions in `src/lib/nostr.ts` and 2 functions in `src/lib/manifest.ts`. When the parameter is provided, the event template uses it directly as `created_at`; when omitted, the original `unixNow()` or `Math.floor(Date.now() / 1000)` is used unchanged.

## Changes

### src/lib/nostr.ts (6 functions)

| Function | Parameter Added | created_at expression |
|---|---|---|
| `createSiteManifestEvent` | `createdAt?: number` | `createdAt ?? unixNow()` |
| `createAppHandlerEvent` | `createdAt?: number` | `createdAt ?? unixNow()` |
| `createProfileEvent` | `createdAt?: number` | `createdAt ?? unixNow()` |
| `createRelayListEvent` | `createdAt?: number` | `createdAt ?? unixNow()` |
| `createServerListEvent` | `createdAt?: number` | `createdAt ?? unixNow()` |
| `createAppRecommendationEvent` | `createdAt?: number` | `createdAt ?? unixNow()` |

**Unchanged (as required):** `createDeleteEvent` (kind 5 — always current time)

### src/lib/manifest.ts (2 functions)

| Function | Parameter Added | created_at expression |
|---|---|---|
| `createSnapshotTemplate` | `createdAt?: number` as 2nd param | `createdAt ?? Math.floor(Date.now() / 1000)` |
| `createSiteManifestTemplate` | `createdAt?: number` as last param | `createdAt ?? Math.floor(Date.now() / 1000)` |

**Unchanged (as required):** `blossom.ts`, `upload.ts`, `delete.ts`, `undeploy.ts` (kind 24242 auth events)

## Verification Results

- `deno check src/lib/nostr.ts` -- passed, no type errors
- `deno check src/lib/manifest.ts` -- passed, no type errors
- `deno task test` -- 198 passed, 0 failed (backward compatibility confirmed)
- `grep -c "createdAt?: number" src/lib/nostr.ts` -- 6 (correct)
- `grep -c "createdAt?: number" src/lib/manifest.ts` -- 2 (correct)
- Exclusion files diff -- empty (blossom.ts, upload.ts, delete.ts, undeploy.ts untouched)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `22f9f1f` | feat(08-01): add optional createdAt parameter to event creation functions in nostr.ts |
| Task 2 | `a7fa968` | feat(08-01): add optional createdAt parameter to template functions in manifest.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - no stub values introduced. The `??` fallback expressions use live runtime values when `createdAt` is not provided.

## Self-Check: PASSED
