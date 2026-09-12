---
phase: 22-aur-pipeline
fixed_at: 2026-05-05T00:00:00Z
review_path: .planning/phases/22-aur-pipeline/22-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-05-05
**Source review:** .planning/phases/22-aur-pipeline/22-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01, WR-02, WR-03, WR-04)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Script injection via direct `${{ }}` interpolation

**Files modified:** `.github/workflows/publish-packages.yml`
**Commit:** 95b4e9d
**Applied fix:** Moved all user-controlled values (`github.event.release.tag_name || github.event.inputs.tag`, `steps.extract.outputs.tag`, `steps.extract.outputs.version`, `github.repository`) out of `run:` shell bodies and into `env:` blocks. Shell scripts now reference environment variables only, eliminating the script-injection vector in the `extract`, `poll`, and `checksums` steps.

### WR-01: Non-idempotent git commit

**Files modified:** `.github/workflows/publish-packages.yml`
**Commit:** 4e57e00
**Applied fix:** Added `git diff --cached --quiet` guard before `git commit`. If no changes are staged, the step prints a skip message and exits 0 instead of failing with "nothing to commit".

### WR-02: Missing timeout-minutes on setup job

**Files modified:** `.github/workflows/publish-packages.yml`
**Commit:** b28319e
**Applied fix:** Added `timeout-minutes: 15` to the `setup` job definition.

### WR-03: pacman -Sy partial-upgrade risk

**Files modified:** `.github/workflows/publish-packages.yml`
**Commit:** 3635ee6
**Applied fix:** Removed the `pacman -Sy --noconfirm 2>/dev/null || true` line from the Arch container bash script. `makepkg --printsrcinfo` has no external dependencies and requires no package sync.

### WR-04: Hardcoded personal email in git committer identity

**Files modified:** `.github/workflows/publish-packages.yml`
**Commit:** aec281a
**Applied fix:** Replaced `sandwich.farm@protonmail.com` with `nsyte-bot@users.noreply.github.com` in the AUR git committer config.

---

_Fixed: 2026-05-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
