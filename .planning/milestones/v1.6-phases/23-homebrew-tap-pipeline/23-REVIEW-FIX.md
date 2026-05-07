---
phase: 23-homebrew-tap-pipeline
fixed_at: 2026-05-05T00:00:00Z
review_path: .planning/phases/23-homebrew-tap-pipeline/23-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-05-05
**Source review:** .planning/phases/23-homebrew-tap-pipeline/23-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (CR-01, WR-01, IN-02; IN-01 fixed alongside CR-01)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: Script injection — `${{ }}` expression directly in `run:` blocks (three stub jobs)

**Files modified:** `.github/workflows/publish-packages.yml`
**Commit:** c988855
**Applied fix:** Moved `${{ needs.setup.outputs.version }}` out of the `run:` shell body for `publish-scoop`, `publish-winget`, and `publish-nix` stub jobs. Added an `env: VERSION: ${{ needs.setup.outputs.version }}` block to each step and replaced the inline expression with `${VERSION}` in the shell script. Also added `timeout-minutes: 10` to each job (covers IN-01 at the same time).

### WR-01: `HOMEBREW_TAP_TOKEN` embedded in git clone URL — potential log exposure

**Files modified:** `.github/workflows/publish-packages.yml`
**Commit:** f692b6e
**Applied fix:** Split the clone step in `publish-homebrew` into two operations: (1) a plain public clone with no credentials (`git clone https://github.com/sandwichfarm/homebrew-nsyte.git /tmp/tap`), followed by (2) setting the authenticated remote for push only (`git -C /tmp/tap remote set-url origin "https://x-access-token:${HOMEBREW_TAP_TOKEN}@..."`). The token is now only present in git's remote config, not in the clone URL that appears in diagnostic output or the process table.

### IN-02: `sha256sum` in BREW-04 local verify recipe is macOS-incompatible

**Files modified:** `docs/RELEASING.md`
**Commit:** 7786c67
**Applied fix:** Added an inline comment above the `sha256sum` lines in the BREW-04 recipe noting that macOS users should use `shasum -a 256` instead, since `sha256sum` is a GNU coreutils tool not available on macOS by default.

---

_Fixed: 2026-05-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
