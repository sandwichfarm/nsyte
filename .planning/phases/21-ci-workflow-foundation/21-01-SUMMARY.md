---
phase: 21-ci-workflow-foundation
plan: "01"
subsystem: infra
tags: [github-actions, ci, release, pat, workflow-events]

# Dependency graph
requires: []
provides:
  - "release.yml Create GitHub Release step uses RELEASE_TOKEN (PAT) instead of GITHUB_TOKEN"
  - "Tag-pushed releases will now emit release:published events to downstream workflows"
affects:
  - "21-ci-workflow-foundation (plan 21-02 publish-packages.yml depends on release:published firing)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use RELEASE_TOKEN (user PAT) for release creation to enable downstream workflow triggers"
    - "GH_TOKEN (GITHUB_TOKEN) retained for read/delete operations that don't need PAT"

key-files:
  created: []
  modified:
    - ".github/workflows/release.yml"

key-decisions:
  - "Only the softprops/action-gh-release token input requires the PAT — GH_TOKEN on Remove existing release step stays as GITHUB_TOKEN"
  - "Single-line change: minimal blast radius, verifiable by grep counts"

patterns-established:
  - "Release creation with PAT: use secrets.RELEASE_TOKEN on softprops/action-gh-release to unblock release:published events"

requirements-completed:
  - INFRA-03

# Metrics
duration: 5min
completed: 2026-05-05
---

# Phase 21 Plan 01: CI Workflow Foundation Summary

**Swapped softprops/action-gh-release token from GITHUB_TOKEN to RELEASE_TOKEN so that release:published events fire to downstream workflows, unblocking the publish-packages.yml pipeline.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-05T12:27:00Z
- **Completed:** 2026-05-05T12:32:25Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments
- Changed the `token:` input of `softprops/action-gh-release@v2` in `release.yml` from `${{ secrets.GITHUB_TOKEN }}` to `${{ secrets.RELEASE_TOKEN }}`
- Left `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on the "Remove existing release if requested" step unchanged — that step uses `gh` CLI for read/delete and works correctly with the default token
- Verified exactly one `secrets.GITHUB_TOKEN` reference and exactly one `secrets.RELEASE_TOKEN` reference remain in the file after the change

## Task Commits

Each task was committed atomically:

1. **Task 1: Swap GITHUB_TOKEN to RELEASE_TOKEN on softprops/action-gh-release step** - `03d4353` (fix)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified
- `.github/workflows/release.yml` - Changed `token:` on the Create GitHub Release step from `GITHUB_TOKEN` to `RELEASE_TOKEN`

## Decisions Made
- None - followed plan as specified. The plan provided exact surgical guidance (line 446 only, not line 390).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**The `RELEASE_TOKEN` secret must exist in the GitHub repository for this change to take effect.**

Before the next release, the repository owner must:
1. Create a Personal Access Token (PAT) with `repo` scope (or fine-grained `contents: write` permission)
2. Add it as a repository secret named `RELEASE_TOKEN` in GitHub repository Settings > Secrets and variables > Actions

Until `RELEASE_TOKEN` is configured, the release workflow will fail at the "Create GitHub Release" step.

## Next Phase Readiness
- Plan 21-02 (`publish-packages.yml`) can now be created — it will use `on: release: published` as its trigger
- The `RELEASE_TOKEN` secret must be configured in GitHub for the trigger to work on real releases
- Functional verification (confirming `release:published` actually fires) is deferred until the first real release with this change live

## Self-Check: PASSED

- FOUND: `.github/workflows/release.yml` (modified, committed at `03d4353`)
- FOUND: `.planning/phases/21-ci-workflow-foundation/21-01-SUMMARY.md` (committed at `f03dd4d`)
- Commit `03d4353` verified in git log
- `secrets.GITHUB_TOKEN` count: 1 (only line 390, unchanged)
- `secrets.RELEASE_TOKEN` count: 1 (line 446, updated)
- Git diff shows exactly one line changed

---
*Phase: 21-ci-workflow-foundation*
*Completed: 2026-05-05*
