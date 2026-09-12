---
phase: 21-ci-workflow-foundation
plan: "02"
subsystem: infra
tags: [ci, github-actions, workflow-foundation, release-automation, sha256, asset-polling]

# Dependency graph
requires: []
provides:
  - publish-packages.yml workflow scaffold with release trigger and workflow_dispatch
  - setup job with asset-readiness poll and SHA256 checksum computation
  - five independent named manager job stubs (aur, homebrew, scoop, winget, nix)
  - output contract: version, sha256_linux_x64, sha256_macos_arm64, sha256_macos_x64, sha256_windows
affects:
  - 22-aur-publish
  - 23-homebrew-publish
  - 24-scoop-publish
  - 25-winget-publish
  - 26-nix-flake-update
  - 21-03-release-token-setup

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Setup-fan-out job topology: single setup job computes shared values, five sibling manager jobs consume via needs.setup.outputs"
    - "Asset-readiness poll: gh release view --json assets --jq loop with TIMEOUT=300 INTERVAL=15 and graceful exit 1 on timeout"
    - "Centralized SHA256 computation: one download per platform in setup job, hex outputs consumed by all managers"
    - "Manager job isolation: needs:[setup] only on each manager, no cross-manager deps"
    - "Shell injection defense: tag input assigned to bash var first, never inline-interpolated into gh/curl commands"

key-files:
  created:
    - .github/workflows/publish-packages.yml
  modified: []

key-decisions:
  - "Compute SHA256 in setup job (centralized) not per-manager — avoids 5x redundant 88 MB downloads per release"
  - "Export hex SHA256 values only — Phase 26 (Nix) handles hex-to-SRI conversion itself, keeping setup job simple"
  - "Named sibling jobs not matrix — named jobs give better Actions UI labels and stronger isolation than fail-fast:false on matrix"
  - "TIMEOUT=300 INTERVAL=15 for asset poll — 15s interval avoids excessive API calls; 5 min covers realistic upload times"
  - "yamllint line-length errors accepted — consistent with existing release.yml which has same errors; logic/parse errors would be blocked"

patterns-established:
  - "Workflow output contract: version (no v prefix), sha256_linux_x64, sha256_macos_arm64, sha256_macos_x64, sha256_windows — load-bearing names for phases 22-26"
  - "Tag coalescing: github.event.release.tag_name || github.event.inputs.tag handles both release: and workflow_dispatch: triggers"
  - "VERSION strip: TAG#v removes leading v before writing to GITHUB_OUTPUT"

requirements-completed: [INFRA-02, INFRA-04, INFRA-05]

# Metrics
duration: 1min
completed: 2026-05-05
---

# Phase 21 Plan 02: CI Workflow Foundation Summary

**GitHub Actions publish-packages.yml scaffold with asset-readiness poll, centralized SHA256 computation, and five independent named manager job stubs establishing the output contract for phases 22-26**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-05-05T12:31:55Z
- **Completed:** 2026-05-05T12:33:08Z
- **Tasks:** 1/1
- **Files modified:** 1

## Accomplishments

- Created `.github/workflows/publish-packages.yml` with dual triggers: `release: types: [published]` and `workflow_dispatch` with required `tag` input
- Setup job polls GitHub Releases API via `gh release view` until all four platform binaries are present (TIMEOUT=300, INTERVAL=15), then computes SHA256 checksums and exports them as job outputs
- Five sibling manager jobs (publish-aur, publish-homebrew, publish-scoop, publish-winget, publish-nix) all declare `needs: [setup]` only with `if: needs.setup.result == 'success'` — zero cross-manager dependencies
- Top-of-file comment block documents the `RELEASE_TOKEN` PAT requirement for workflow triggering

## Task Commits

1. **Task 1: Create publish-packages.yml scaffold with triggers, setup job, and five manager job stubs** - `3d3b197` (feat)

**Plan metadata:** (committed together with SUMMARY below)

## Files Created/Modified

- `.github/workflows/publish-packages.yml` — Full workflow scaffold: dual triggers, setup job with poll+checksums, five manager job stubs

## Decisions Made

- Used centralized SHA256 computation in setup job rather than per-manager downloads — 4 downloads total vs 20 if each manager downloaded independently
- Exported hex SHA256 only (not SRI format) — Phase 26 (Nix) will do the hex-to-SRI conversion; this keeps setup job universal for AUR, Homebrew, Scoop, Winget which all need hex
- Chose named sibling jobs over `strategy.matrix` — named jobs appear with semantic labels in Actions UI and provide stronger isolation guarantees
- yamllint line-length errors were accepted as per plan instructions — all existing workflows have the same errors; YAML is fully valid (confirmed via Python yaml.safe_load)

## Deviations from Plan

None - plan executed exactly as written. yamllint reported line-length errors on bash script lines, which the plan explicitly states are acceptable for this type of file. YAML parses successfully.

## Issues Encountered

None - workflow file created, all 15 structural verification checks passed on first attempt.

## Known Stubs

The five manager jobs are intentional stubs by design:
- `publish-aur` — Phase 22 will replace the TODO echo step
- `publish-homebrew` — Phase 23 will replace the TODO echo step
- `publish-scoop` — Phase 24 will replace the TODO echo step
- `publish-winget` — Phase 25 will replace the TODO echo step
- `publish-nix` — Phase 26 will replace the TODO echo step

These stubs exit 0 and are the planned deliverable of this phase. They are not blocking stubs — this plan's goal is the scaffold and output contract, not the publish logic.

## Threat Surface Scan

No new threat surface introduced beyond what the plan's threat model covers:
- T-21-04 (shell injection via workflow_dispatch tag input): mitigated — tag assigned to bash variable, never inline-interpolated
- T-21-08 (GH_TOKEN exposure): mitigated — gh invoked without verbose mode, GitHub Actions auto-masks secrets
- All other threats accepted per threat register

## User Setup Required

**`RELEASE_TOKEN` PAT must be created by the user** before `publish-packages.yml` can fire on releases:
1. Create a GitHub Personal Access Token with `repo` scope (or `contents: write` with fine-grained permissions)
2. Add it as a repository secret named `RELEASE_TOKEN`
3. Update `release.yml` line ~440: change `token: ${{ secrets.GITHUB_TOKEN }}` to `token: ${{ secrets.RELEASE_TOKEN }}` in the `softprops/action-gh-release` step

This is addressed by Plan 21-03.

## Next Phase Readiness

- Output contract is locked: `version`, `sha256_linux_x64`, `sha256_macos_arm64`, `sha256_macos_x64`, `sha256_windows` — phases 22-26 can reference these verbatim
- Manager job structure is established — phases 22-26 replace the stub step in each named job
- Functional end-to-end testing deferred to phase verification (`/gsd-verify-work`) after RELEASE_TOKEN is in place (Plan 21-03)

## Self-Check

- [x] `.github/workflows/publish-packages.yml` exists: confirmed
- [x] Commit `3d3b197` exists: confirmed
- [x] All 15 structural verification checks passed
- [x] YAML parses successfully (python3 yaml.safe_load)
- [x] yamllint errors are line-length only (consistent with existing repo workflows)

## Self-Check: PASSED

---
*Phase: 21-ci-workflow-foundation*
*Completed: 2026-05-05*
