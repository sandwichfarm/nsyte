---
phase: 23-homebrew-tap-pipeline
plan: "23-01"
subsystem: ci-publish
tags: [homebrew, ci, github-actions, secrets, documentation]
dependency_graph:
  requires: [22-01]
  provides: [BREW-02, BREW-03, BREW-04]
  affects: [publish-packages.yml, docs/RELEASING.md]
tech_stack:
  added: []
  patterns:
    - "HTTPS PAT clone for cross-repo CI push (HOMEBREW_TAP_TOKEN via env:)"
    - "sed | delimiter substitution to avoid SHA256 hex collisions"
    - "post-sed PLACEHOLDER_ guard for fail-fast safety"
    - "git diff --cached --quiet for idempotent re-runs"
key_files:
  modified:
    - .github/workflows/publish-packages.yml
    - docs/RELEASING.md
decisions:
  - "Token injected only via env: block — ${{ secrets.X }} never inside run: (T-23-01)"
  - "sed delimiter is | not / to avoid any accidental collision with URL characters"
  - "Commit message is 'nsyte ${VERSION}' (no v prefix, no chore: prefix — Homebrew convention)"
  - "Push target is origin main — tap repo uses main as default branch"
metrics:
  duration: "93s"
  completed: "2026-05-05T16:17:40Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 23 Plan 01: Replace publish-homebrew stub with real Homebrew tap publish pipeline

**One-liner:** Real Homebrew tap CI pipeline via HTTPS PAT clone, 4-placeholder sed patch with fail-fast guard, and idempotent push to sandwichfarm/homebrew-nsyte.

## What was done

### Task 1: Replace publish-homebrew stub in .github/workflows/publish-packages.yml

Replaced the 3-line TODO stub (lines 172-183) with a full 4-step job:

1. **Checkout nsyte repo** — `actions/checkout@v4` to get the formula template from `packages/homebrew/Formula/nsyte.rb`.
2. **Clone Homebrew tap repo** — HTTPS PAT clone via `HOMEBREW_TAP_TOKEN` (injected only through `env:` block, never as `${{ secrets.X }}` inside `run:`).
3. **Patch formula from template** — copies template to `/tmp/tap/Formula/nsyte.rb`, runs 4 sed substitutions with `|` delimiter (VERSION, SHA256_MACOS_ARM64, SHA256_MACOS_X64, SHA256_LINUX_X86_64 → LINUX_X64). Post-sed guard using `grep -q "PLACEHOLDER_"` fails the job immediately if any marker survives.
4. **Commit and push to tap repo** — configures git identity (`nsyte-bot`), stages the formula, checks `git diff --cached --quiet` for idempotency (exits 0 without pushing if formula is unchanged), commits as `nsyte ${VERSION}`, pushes to `origin main`.

Added `timeout-minutes: 10` to match the `publish-aur` job structure.

### Task 2: Append sections to docs/RELEASING.md

Appended five new sections before the existing `## Related files` section:

- **HOMEBREW_TAP_TOKEN prerequisite** — why required, symptom of forgetting the secret (authentication failure at clone/push, sibling jobs unaffected by design per INFRA-05)
- **Creating the HOMEBREW_TAP_TOKEN PAT** — fine-grained token with Contents: Read+write on `sandwichfarm/homebrew-nsyte` only (least-privilege, T-23-04)
- **Adding HOMEBREW_TAP_TOKEN to repository secrets** — step-by-step with `gh secret list` verification
- **Bootstrapping the Homebrew tap (one-time)** — create public `homebrew-nsyte` repo, note on `mkdir -p` handling of empty repos, `workflow_dispatch` recovery path
- **Verifying the Homebrew formula locally (BREW-04)** — full sed substitution recipe matching CI logic exactly, `brew install --formula` path, plus end-user tap verification path

Updated `## Related files` to add bullet for `packages/homebrew/Formula/nsyte.rb`.

## Files changed

| File | Before | After | Delta |
|------|--------|-------|-------|
| `.github/workflows/publish-packages.yml` | 214 lines | 256 lines | +42 lines (-4 stub, +46 real job) |
| `docs/RELEASING.md` | 211 lines | 333 lines | +122 lines (5 sections + Related files bullet) |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | `aba8818` | `feat(23-01): replace publish-homebrew stub with real Homebrew tap publish pipeline` |
| Task 2 | `35008b7` | `docs(23-01): append HOMEBREW_TAP_TOKEN + bootstrap + local-verify sections to RELEASING.md` |

## Deviations from Plan

None — plan executed exactly as written.

The PLAN provided the exact job YAML to insert; the exact documentation text to append; and the exact insertion point (before `## Related files`). All three were applied verbatim. No architectural deviations, no Rule 1/2/3 auto-fixes required.

## Known Stubs

None. The previous `publish-homebrew` stub is fully replaced. No new stubs introduced.

## Threat Surface

All threats in the plan's `<threat_model>` are addressed:

| Threat | Mitigation Applied |
|--------|-------------------|
| T-23-01: HOMEBREW_TAP_TOKEN in run: block | Token only in `env:` block; `${{ secrets.X }}` never inside `run:` |
| T-23-02: Token in git clone URL | Accepted — ubuntu-latest runners are ephemeral |
| T-23-03: Placeholder not substituted | Post-sed `grep -q "PLACEHOLDER_"` guard with `exit 1` |
| T-23-04: PAT scoped too broadly | Docs explicitly state single-repo scope on `homebrew-nsyte` only |
| T-23-05: Duplicate push on re-run | `git diff --cached --quiet` idempotency guard |

## Self-Check: PASSED

- `.github/workflows/publish-packages.yml` — FOUND
- `docs/RELEASING.md` — FOUND
- `.planning/phases/23-homebrew-tap-pipeline/23-01-SUMMARY.md` — FOUND
- Commit `aba8818` — FOUND
- Commit `35008b7` — FOUND
