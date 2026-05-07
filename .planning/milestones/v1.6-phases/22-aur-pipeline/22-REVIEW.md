---
phase: 22-aur-pipeline
reviewed: 2026-05-05T12:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - .github/workflows/publish-packages.yml
  - docs/RELEASING.md
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 22: Code Review Report (Re-review after fix pass)

**Reviewed:** 2026-05-05
**Depth:** standard
**Files Reviewed:** 2
**Status:** clean

## Summary

Re-review targeting the five issues raised in the initial review pass. All five are confirmed fixed in the current file. The workflow is structurally sound and no new issues were introduced by the fix pass. One pre-existing informational note is carried forward.

### Fix-pass verification results

| Issue | Description | Status |
|-------|-------------|--------|
| CR-01 | Script injection via direct `${{ github.event.inputs.* }}` in `run:` | **FIXED** — all user-controlled and release-derived values now go through `env:` blocks; no raw `${{ }}` expressions appear inside `run:` in the functional steps |
| WR-01 | `git commit` non-idempotent on re-run | **FIXED** — `if git -C /tmp/aur-nsyte-bin diff --cached --quiet` guard added at line 165 |
| WR-02 | `setup` job missing `timeout-minutes` | **FIXED** — `timeout-minutes: 15` present at line 24 |
| WR-03 | `pacman -Sy` partial-upgrade risk in Arch container | **FIXED** — no `pacman` invocation in the container step; `makepkg --printsrcinfo` runs with no package sync |
| WR-04 | Personal email address as git committer identity | **FIXED** — line 163 now uses `nsyte-bot@users.noreply.github.com` |

---

## Info

### IN-01: No workflow-level `permissions:` block — GITHUB_TOKEN has broader permissions than required

**File:** `.github/workflows/publish-packages.yml:8`

**Issue:** The workflow declares no `permissions:` block. By default, the `GITHUB_TOKEN` granted to the workflow has the repository's default permission level (often `read/write` on contents). Only `contents: read` is needed for asset polling via `GH_TOKEN`. A restrictive top-level `permissions:` block follows the principle of least privilege and limits blast radius if a job is compromised.

**Fix:**

```yaml
permissions:
  contents: read
```

Place this at the workflow level (before `jobs:`). Jobs that need nothing more inherit this floor.

---

### IN-02 (carry-forward): Stub job `run:` blocks contain inline `${{ needs.setup.outputs.version }}`

**File:** `.github/workflows/publish-packages.yml:181, 193, 205, 217`

**Issue:** The four placeholder jobs (`publish-homebrew`, `publish-scoop`, `publish-winget`, `publish-nix`) each use `${{ needs.setup.outputs.version }}` directly inside a `run: echo` command. As placeholder stubs these are harmless — the value is only echoed and not executed. However, when these stubs are replaced with real implementations in later phases, the pattern of embedding `${{ }}` directly in `run:` blocks should not be carried forward. The version value flows through `GITHUB_OUTPUT` from a shell-computed step, so a crafted tag that embeds newlines could inject additional key=value lines into outputs if not stripped upstream.

**Fix:** When replacing each stub, move `version` into an `env:` block:

```yaml
env:
  VERSION: ${{ needs.setup.outputs.version }}
run: |
  echo "Version: ${VERSION}"
  # ... real implementation uses $VERSION
```

This is consistent with the pattern already established in the functional `publish-aur` job (lines 159–160).

---

_Reviewed: 2026-05-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
