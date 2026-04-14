---
phase: 08-timestamp-propagation
plan: 02
subsystem: command-wiring
tags: [timestamp, backward-compat, command-handlers, cli-threading]
dependency_graph:
  requires: [08-01]
  provides: [createdAt-command-wiring]
  affects: [src/commands/deploy.ts, src/commands/put.ts, src/commands/snapshot.ts, src/commands/announce.ts, src/lib/metadata/publisher.ts]
tech_stack:
  added: []
  patterns: [optional-parameter-threading, nullish-coalescing-fallback, cliffy-global-option-inheritance]
key_files:
  created: []
  modified:
    - src/lib/metadata/publisher.ts
    - src/commands/deploy.ts
    - src/commands/announce.ts
    - src/commands/put.ts
    - src/commands/snapshot.ts
decisions:
  - "Added createdAt?: number to DeployCommandOptions, PutCommandOptions, and SnapshotCommandOptions interfaces -- TypeScript requires explicit declaration even though Cliffy provides global options at runtime"
  - "PublishOptions.createdAt threads through publishMetadata to all four sub-publisher functions"
  - "publishAppHandler options object extended with createdAt?: number (not a new parameter) -- maintains the existing options object pattern"
  - "publishProfile, publishRelayList, publishServerList receive createdAt as a positional optional parameter -- consistent with their existing signature style"
metrics:
  duration: "4m"
  completed_date: "2026-04-14"
  tasks: 2
  files_modified: 5
---

# Phase 8 Plan 2: Wire createdAt Through Command Handlers Summary

**One-liner:** Threaded `options.createdAt` from all four command action handlers through to the event creation functions that accept it, completing the CLI-to-event timestamp propagation chain.

## What Was Built

Wired the `--created-at` global CLI option value (`options.createdAt: number | undefined`) from each command's action handler to the event creation functions modified in Plan 01. When `--created-at` is omitted, all functions fall back to their original timestamp sources (no regression).

## Changes

### src/lib/metadata/publisher.ts

| Change | Details |
|--------|---------|
| `PublishOptions.createdAt?: number` added | Allows deploy/announce to pass timestamp to publishMetadata |
| `publishAppHandler` options object extended | `{ handlerKinds?: string; createdAt?: number }` — forwards to `createAppHandlerEvent()` |
| `publishProfile` new parameter | `createdAt?: number` — forwards to `createProfileEvent()` |
| `publishRelayList` new parameter | `createdAt?: number` — forwards to `createRelayListEvent()` |
| `publishServerList` new parameter | `createdAt?: number` — forwards to `createServerListEvent()` |
| `publishMetadata` threads to all sub-calls | `options.createdAt` forwarded to appHandler, profile, relayList, serverList |

### src/commands/deploy.ts

| Change | Details |
|--------|---------|
| `DeployCommandOptions.createdAt?: number` added | TypeScript interface declaration for Cliffy global option |
| `createSiteManifestEvent(...)` call | Added `options.createdAt` as 6th argument |
| `publishMetadata(...)` options object | Added `createdAt: options.createdAt` field |

### src/commands/announce.ts

| Change | Details |
|--------|---------|
| `publishAppHandler(...)` call | Added `{ createdAt: options.createdAt }` as 5th argument (options object) |

### src/commands/put.ts

| Change | Details |
|--------|---------|
| `PutCommandOptions.createdAt?: number` added | TypeScript interface declaration for Cliffy global option |
| `buildUpdatedManifestTemplate` signature | Added `createdAt?: number` as 4th parameter |
| `created_at` expression | Changed to `createdAt ?? Math.floor(Date.now() / 1000)` |
| Call site in action handler | Passes `options.createdAt` as 4th argument |

### src/commands/snapshot.ts

| Change | Details |
|--------|---------|
| `SnapshotCommandOptions.createdAt?: number` added | TypeScript interface declaration for Cliffy global option |
| `createSnapshotTemplate(...)` call | Added `options.createdAt` as 2nd argument |

## Verification Results

- `deno check src/lib/metadata/publisher.ts src/commands/deploy.ts src/commands/announce.ts src/commands/put.ts src/commands/snapshot.ts` -- all pass, no type errors
- `deno task test` -- 198 passed, 0 failed (backward compatibility confirmed)
- `git diff HEAD~2 src/lib/blossom.ts src/lib/upload.ts src/commands/delete.ts src/commands/undeploy.ts` -- empty (exclusion files untouched)
- `grep -rn "createdAt" ...` -- shows createdAt threaded through all 5 files with 34 matches covering all call sites

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `fcb5636` | feat(08-02): wire createdAt through publisher, deploy, and announce commands |
| Task 2 | `ce84bed` | feat(08-02): wire createdAt through put and snapshot commands |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing TypeScript declarations] Added createdAt?: number to command options interfaces**
- **Found during:** Task 1 (deploy.ts type check failed), Task 2 (proactive fix)
- **Issue:** `DeployCommandOptions`, `PutCommandOptions`, and `SnapshotCommandOptions` interfaces did not declare `createdAt` — TypeScript TS2339 errors on `options.createdAt`
- **Fix:** Added `createdAt?: number` to all three interfaces. The plan noted this might be needed and suggested it as the fix.
- **Files modified:** `src/commands/deploy.ts`, `src/commands/put.ts`, `src/commands/snapshot.ts`
- **Commits:** Included in respective task commits

## Known Stubs

None - all wiring connects live `options.createdAt` values from the Cliffy global option to event creation functions. No placeholder or hardcoded values.

## Self-Check: PASSED
