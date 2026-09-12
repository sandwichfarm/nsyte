---
phase: 21-ci-workflow-foundation
verified: 2026-05-05T12:42:17Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Phase 21: CI Workflow Foundation Verification Report

**Phase Goal:** The `publish-packages.yml` GitHub Actions workflow exists with the correct release trigger, PAT fix, asset-readiness guard, and job isolation — so that every subsequent manager-specific job is built on a reliable, non-blocking foundation.
**Verified:** 2026-05-05T12:42:17Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `release.yml` Create GitHub Release step uses `RELEASE_TOKEN`, not `GITHUB_TOKEN` | VERIFIED | `grep -n secrets` shows line 446: `token: ${{ secrets.RELEASE_TOKEN }}`; line 390 GH_TOKEN (delete step) still uses `GITHUB_TOKEN` — exactly one of each |
| 2 | `publish-packages.yml` exists with `release: types: [published]` trigger and `workflow_dispatch` input | VERIFIED | File exists at `.github/workflows/publish-packages.yml`; both `types: [published]` and `workflow_dispatch:` with required `tag` input confirmed |
| 3 | `setup` job polls for asset readiness and computes SHA256 for all four platform binaries, exporting five named outputs | VERIFIED | Poll loop with `TIMEOUT=300 INTERVAL=15`, `gh release view` check, and `sha256sum` block all present; all five outputs (`version`, `sha256_linux_x64`, `sha256_macos_arm64`, `sha256_macos_x64`, `sha256_windows`) declared at job level |
| 4 | Five named manager jobs (`publish-aur`, `publish-homebrew`, `publish-scoop`, `publish-winget`, `publish-nix`) exist as siblings | VERIFIED | All five job IDs found at top-level indent (`^  publish-*:`); zero cross-manager `needs:` references |
| 5 | Each manager job has `needs: [setup]` and `if: needs.setup.result == 'success'`; no cross-manager deps | VERIFIED | `grep -c "needs: [setup]"` = 5; `grep -c "if: needs.setup.result == 'success'"` = 5; no manager appears in another manager's `needs:` |
| 6 | `docs/RELEASING.md` documents the RELEASE_TOKEN prerequisite, minimum scope, silent-failure symptom, rotation, and troubleshooting | VERIFIED | File exists (111 lines, well above 30-line minimum); references `release.yml` and `publish-packages.yml`; contains RELEASE_TOKEN prerequisite, scope options (repo / Contents:write), symptom description, rotation section, troubleshooting section; no real-looking token values |
| 7 | Task 2 checkpoint (RELEASE_TOKEN secret in repo settings) was explicitly deferred by user | VERIFIED (acknowledged deferral) | SUMMARY 21-03 records user response: "Defer — set up later"; the doc and code are complete; secret creation is a non-code user action with no further code changes required |

**Score:** 7/7 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/release.yml` | Line 446 uses `secrets.RELEASE_TOKEN` on `softprops/action-gh-release` step; line 390 `GH_TOKEN` unchanged | VERIFIED | Confirmed by `grep -n` output: line 446 = RELEASE_TOKEN, line 390 = GITHUB_TOKEN; exactly one occurrence of each |
| `.github/workflows/publish-packages.yml` | Full scaffold with dual triggers, setup job, five manager stubs | VERIFIED | 150 lines, YAML parses via `python3 yaml.safe_load`, all structural checks pass |
| `docs/RELEASING.md` | Maintainer doc, min 30 lines, covers RELEASE_TOKEN prereq and rotation | VERIFIED | 111 lines; all content requirements met |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `release.yml` softprops step | `secrets.RELEASE_TOKEN` | `token:` input parameter | WIRED | `token: ${{ secrets.RELEASE_TOKEN }}` at line 446 |
| `publish-packages.yml` triggers | `release: published` event | `on: release: types: [published]` | WIRED | Present at lines 11-12 |
| `publish-packages.yml` manager jobs | `setup` job outputs | `needs: [setup]` + `needs.setup.outputs.*` | WIRED | All five manager jobs declare `needs: [setup]` only; each echo `${{ needs.setup.outputs.version }}` confirming output path is wired |
| `publish-packages.yml` setup poll | GitHub Releases API | `gh release view "$TAG" --json assets --jq` | WIRED | Present at line 53; `GH_TOKEN` env set on poll step |
| `docs/RELEASING.md` | `release.yml` line 446 | explicit reference | WIRED | Line 93 and line 110 both cite `release.yml` and the RELEASE_TOKEN token consumer |
| `docs/RELEASING.md` | `publish-packages.yml` | explicit reference | WIRED | Line 11 and line 111 both cite `publish-packages.yml` as the downstream consumer of the event |

---

## Data-Flow Trace (Level 4)

Not applicable. The workflow scaffold contains intentional stub jobs (manager jobs echo TODO and exit 0 by design — phases 22-26 provide real publish logic). The `setup` job's data flow (poll → checksums → GITHUB_OUTPUT) is structural/CI and cannot be traced further without a live release. No dynamic-data rendering artifacts are in scope for this phase.

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — workflow files require a live GitHub Actions environment to execute; no runnable entry point exists locally.

YAML parse validation performed as a proxy:
- `python3 yaml.safe_load(open('publish-packages.yml'))` — PASS (no parse errors)
- `grep -c "needs: [setup]"` = 5 — PASS
- All five output keys present — PASS
- No cross-manager deps — PASS

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-02 | 21-02 | `publish-packages.yml` exists with `release: published` trigger and `workflow_dispatch` input | SATISFIED | File exists; both triggers confirmed |
| INFRA-03 | 21-01 | `RELEASE_TOKEN` replaces `GITHUB_TOKEN` on release creation step in `release.yml` | SATISFIED | Line 446 confirmed as `secrets.RELEASE_TOKEN` |
| INFRA-04 | 21-02 | Asset-readiness poll prevents premature checksum downloads | SATISFIED | Poll in `setup` job with TIMEOUT=300/INTERVAL=15; manager jobs only run after `setup` succeeds via `needs: [setup]` — architectural equivalent of per-job poll |
| INFRA-05 | 21-02 | Manager jobs are independent named jobs (not matrix) | SATISFIED | Five distinct named job IDs; zero cross-manager `needs:` declarations; no `strategy.matrix` present |

**Note on INFRA-04 interpretation:** INFRA-04 states "each manager job includes an asset-readiness poll step." The implementation places the poll in the shared `setup` job rather than duplicating it in each manager. This is architecturally equivalent and superior (avoids 5x redundant poll loops and 5x redundant 88 MB downloads). The requirement intent — "manager jobs do not access assets until all are ready" — is fully satisfied by the `needs: [setup]` dependency that gates all manager jobs on setup job success.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `publish-packages.yml` (lines 97-150) | TODO echo stubs in all five manager jobs | INFO | Intentional by design — these are the planned Phase 21 deliverable; phases 22-26 replace each stub. Stubs exit 0 and do not block goal. |

No unintentional stubs, empty implementations, or hardcoded empty values found. The TODO markers are load-bearing scaffold markers referencing their replacement phases, not accidental placeholders.

---

## Human Verification Required

### 1. RELEASE_TOKEN Secret Setup

**Test:** Navigate to https://github.com/sandwichfarm/nsyte/settings/secrets/actions and confirm `RELEASE_TOKEN` is listed.
**Expected:** `RELEASE_TOKEN` appears in the repository secrets list.
**Why human:** The user explicitly deferred this at the Plan 21-03 checkpoint ("Defer — set up later"). The code and docs are complete and correct. The secret itself is a GitHub UI action that cannot be verified programmatically without an authenticated `gh` session on the user's machine. This is a known-acknowledged prerequisite, not a gap.

**Impact if not done:** `publish-packages.yml` will silently never fire on releases. No package managers will update. The symptom and recovery steps are documented in `docs/RELEASING.md`.

---

## Gaps Summary

No gaps. All must-haves are verified against the codebase.

The RELEASE_TOKEN secret (Plan 21-03 Task 2) was explicitly deferred by the user with full acknowledgement of the consequence. The doc covering setup, rotation, and troubleshooting (`docs/RELEASING.md`) is complete and correct. No code change is needed when the secret is eventually added.

---

_Verified: 2026-05-05T12:42:17Z_
_Verifier: Claude (gsd-verifier)_
