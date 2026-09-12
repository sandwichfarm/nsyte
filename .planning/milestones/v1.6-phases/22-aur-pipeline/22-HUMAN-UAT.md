---
status: partial
phase: 22-aur-pipeline
source: [22-VERIFICATION.md]
started: 2026-05-05T17:30:00Z
updated: 2026-05-05T17:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Functional AUR Push Test

After adding `AUR_SSH_PRIVATE_KEY` to repository secrets and completing the one-time AUR bootstrap (as documented in `docs/RELEASING.md` "Generating and registering the AUR SSH key"):
1. Trigger `publish-packages.yml` via `workflow_dispatch` using an existing release tag (e.g., `v1.6.0`)
2. Monitor the `publish-aur` job in GitHub Actions

expected: All 7 steps complete without error. The AUR `nsyte-bin` package page at https://aur.archlinux.org/packages/nsyte-bin shows the new version within minutes.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
