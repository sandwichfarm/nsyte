---
phase: 24-scoop-bucket-pipeline
plan: 01
subsystem: infra
tags: [scoop, windows, ci, github-actions, package-manager, pat, secrets]

# Dependency graph
requires:
  - phase: 20-scoop-manifest
    provides: packages/scoop/bucket/nsyte.json template with PLACEHOLDER_VERSION and PLACEHOLDER_SHA256_WINDOWS
  - phase: 21-publish-workflow-scaffold
    provides: publish-packages.yml scaffold with publish-scoop stub job
  - phase: 22-aur-pipeline
    provides: clone-edit-push pattern established by publish-aur
  - phase: 23-homebrew-pipeline
    provides: clone-edit-push pattern for GitHub PAT repos established by publish-homebrew
provides:
  - Real publish-scoop CI job that clones sandwichfarm/scoop-nsyte, patches nsyte.json, and pushes per-release
  - SCOOP_BUCKET_TOKEN PAT prerequisite, creation, and registration documentation
  - One-time Scoop bucket bootstrap instructions in RELEASING.md
  - SCOOP-04 local verification recipe in RELEASING.md
affects:
  - phase 25 (winget) — same clone-edit-push pattern for a GitHub repo
  - docs/RELEASING.md future maintainers

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "clone-edit-push with env: secret injection (SCOOP_BUCKET_TOKEN) — no ${{ }} in run: blocks"
    - "PLACEHOLDER_ sed substitution with /g global flag (version appears in both version and url fields)"
    - "grep PLACEHOLDER_ fail-fast + jq empty JSON validation after substitution"
    - "git diff --cached --quiet idempotency guard skips push if manifest unchanged"

key-files:
  created: []
  modified:
    - .github/workflows/publish-packages.yml
    - docs/RELEASING.md

key-decisions:
  - "Used |g flag in sed for PLACEHOLDER_VERSION because it appears twice in nsyte.json (version field and url field)"
  - "All secrets passed via env: blocks only — no ${{ secrets.* }} expressions inside run: shells"
  - "jq empty validation added as cheap fail-fast before git commit (prevents malformed JSON reaching bucket)"
  - "Bucket path: bucket/nsyte.json (matches local template layout, consistent with Scoop conventions)"
  - "Commit message format: 'nsyte VERSION' matching publish-homebrew convention"

patterns-established:
  - "GitHub PAT publish pattern: clone plain HTTPS, set-url with token, env: injection, patch, validate, commit-if-changed, push"

requirements-completed: [SCOOP-02, SCOOP-03, SCOOP-04]

# Metrics
duration: 2min
completed: 2026-05-05
---

# Phase 24 Plan 01: Scoop Bucket Pipeline Summary

**Real publish-scoop CI job replacing stub: clones sandwichfarm/scoop-nsyte via PAT, patches nsyte.json with sed /g (version in both version and url fields), validates with jq, commits idempotently, and pushes; RELEASING.md documents full PAT setup, bootstrap, and local verification.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-05T16:29:29Z
- **Completed:** 2026-05-05T16:31:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the publish-scoop TODO stub with a four-step real pipeline: checkout, clone-bucket-repo, patch-manifest, commit-and-push
- Applied the /g flag to the PLACEHOLDER_VERSION sed substitution — nsyte.json has PLACEHOLDER_VERSION in both the `version` field and the `url` field; missing the flag would leave the url field unpatched
- Added jq empty JSON validation and grep PLACEHOLDER_ fail-fast sanity check, matching the threat mitigations in T-24-01 and T-24-05
- Documented SCOOP_BUCKET_TOKEN PAT creation, secret registration, one-time bucket bootstrap (with no-prefix note), and SCOOP-04 local verification recipe in RELEASING.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace publish-scoop stub in publish-packages.yml** - `f4bed4d` (feat)
2. **Task 2: Append Scoop sections to docs/RELEASING.md** - `70b5556` (docs)

**Plan metadata:** `(pending final commit)` (docs: complete plan)

## Files Created/Modified
- `.github/workflows/publish-packages.yml` — publish-scoop job replaced with real clone-patch-push pipeline
- `docs/RELEASING.md` — five new sections added before Related files: SCOOP_BUCKET_TOKEN prerequisite, Creating the PAT, Adding to secrets, Bootstrap, and SCOOP-04 local verification; nsyte.json added to Related files bullet list

## Decisions Made
- `/g` flag used for PLACEHOLDER_VERSION sed substitution — PLACEHOLDER_VERSION appears in both the `version` field (line 2) and the `url` field (line 6) of nsyte.json; a non-global substitution would silently leave the url field pointing at a PLACEHOLDER URL
- All secrets passed through `env:` blocks; no `${{ secrets.* }}` expressions interpolated inside `run:` shells (matches GitHub security best practice, mirrors publish-homebrew pattern)
- `jq empty` validation added after sed substitution — cheap correctness gate that exits non-zero on malformed JSON before any git operations (T-24-05 mitigation)
- `git diff --cached --quiet` idempotency guard skips push if manifest already up to date — prevents spurious commits on re-runs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Threat Surface Scan

No new security surface introduced. The SCOOP_BUCKET_TOKEN PAT is scoped to `sandwichfarm/scoop-nsyte` only (Contents: Read and write), as documented. All threats in the plan's threat register (T-24-01 through T-24-05) have mitigations implemented or accepted.

## Known Stubs

None — publish-scoop stub fully replaced with real implementation.

## User Setup Required

**One-time manual setup required before first release:**

1. Create `sandwichfarm/scoop-nsyte` public GitHub repo with a README.md (so `main` branch exists)
2. Create a fine-grained PAT scoped to `sandwichfarm/scoop-nsyte` with Contents: Read and write
3. Add `SCOOP_BUCKET_TOKEN` secret to `sandwichfarm/nsyte` repository secrets

Full step-by-step instructions are in `docs/RELEASING.md` under "Bootstrapping the Scoop bucket (one-time)".

## Next Phase Readiness

- Phase 25 (winget): The same clone-edit-push pattern used here applies to winget's PR-based submission flow; the main difference is winget uses `gh pr create` rather than a direct push
- Phase 26 (nix): Different pattern (flake update) but RELEASING.md documentation pattern established here is reusable

## Self-Check: PASSED

- FOUND: `.github/workflows/publish-packages.yml`
- FOUND: `docs/RELEASING.md`
- FOUND: `.planning/phases/24-scoop-bucket-pipeline/24-01-SUMMARY.md`
- FOUND: commit `f4bed4d` (Task 1 — feat)
- FOUND: commit `70b5556` (Task 2 — docs)
- FOUND: commit `8cc5e75` (plan metadata)

---
*Phase: 24-scoop-bucket-pipeline*
*Completed: 2026-05-05*
