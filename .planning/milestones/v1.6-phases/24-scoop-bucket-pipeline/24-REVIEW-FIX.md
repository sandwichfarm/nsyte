---
phase: 24-scoop-bucket-pipeline
fixed_at: 2026-05-05T00:00:00Z
review_path: .planning/phases/24-scoop-bucket-pipeline/24-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-05-05
**Source review:** .planning/phases/24-scoop-bucket-pipeline/24-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: No rotation runbook for SCOOP_BUCKET_TOKEN in RELEASING.md

**Files modified:** `docs/RELEASING.md`
**Commit:** 8a856b8
**Applied fix:** Added a "Rotating the SCOOP_BUCKET_TOKEN" section between the "Adding SCOOP_BUCKET_TOKEN to repository secrets" section and the "Bootstrapping the Scoop bucket" section. The runbook covers: generating a replacement PAT, updating the secret, re-running the workflow via Actions, and the exact error symptom to look for in the job log.

### WR-02: Token embedded in git remote URL visible to subsequent steps

**Files modified:** `.github/workflows/publish-packages.yml`
**Commit:** c8fd195
**Applied fix:** Replaced `git remote set-url origin "https://x-access-token:${TOKEN}@..."` with a git credential helper (`git config credential.helper '!f() { echo "username=x-access-token"; echo "password=${TOKEN}"; }; f'`) in both the `publish-scoop` and `publish-homebrew` jobs. The remote URL now stays clean; credentials are injected at push time without being written to `.git/config`.

---

_Fixed: 2026-05-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
