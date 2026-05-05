---
phase: 21-ci-workflow-foundation
plan: "03"
status: complete
subsystem: docs
tags:
  - docs
  - releasing
  - operational
  - release-token
dependency_graph:
  requires:
    - 21-01 (release.yml RELEASE_TOKEN integration)
    - 21-02 (publish-packages.yml workflow)
  provides:
    - docs/RELEASING.md — maintainer-facing PAT prerequisite doc
  affects:
    - Phase 21 functional completeness (publish-packages.yml is a no-op until RELEASE_TOKEN is set)
tech_stack:
  added: []
  patterns:
    - Operational doc alongside existing docs/JSR_SETUP.md (same audience, same shape)
key_files:
  created:
    - docs/RELEASING.md
  modified: []
decisions:
  - Ship scaffold without RELEASE_TOKEN in place — user acknowledged deferred setup
  - docs/RELEASING.md documents PAT creation, secret setup, rotation, and troubleshooting so the next maintainer has everything needed without rediscovery
  - Fine-grained PAT is recommended over classic because it limits blast radius
metrics:
  duration: "deferred-checkpoint"
  completed: "2026-05-05"
  tasks_completed: 1
  tasks_total: 2
  tasks_deferred: 1
  files_created: 1
  files_modified: 0
---

# Phase 21 Plan 03: RELEASE_TOKEN Prerequisite Docs Summary

Maintainer-facing operational doc for the RELEASE_TOKEN PAT prerequisite; task 2 (secret confirmation checkpoint) deferred with user acknowledgement — phase scaffold ships without the secret in place.

## What Was Built

`docs/RELEASING.md` was created (commit b543d35). It covers:

- Why a Personal Access Token is required: GitHub suppresses `release: published` events fired by `GITHUB_TOKEN`-initiated releases, so `publish-packages.yml` never starts without a user-classed PAT in place on line 446 of `release.yml`.
- The silent-failure symptom: a release appears in GitHub UI normally but `publish-packages.yml` never shows in the Actions tab.
- Step-by-step PAT creation for both classic (`repo` scope) and fine-grained (`Contents: Read and write`, repo-scoped to `sandwichfarm/nsyte`) options.
- Exact secret setup steps (name: `RELEASE_TOKEN`, case-sensitive).
- Verification via `gh secret list -R sandwichfarm/nsyte`.
- Rotation guidance (calendar reminder, update-in-place workflow).
- Troubleshooting table for both main failure modes.

## Deferred Task

**Task 2: User confirms RELEASE_TOKEN secret exists in repository settings**

- **Disposition:** Deferred with user acknowledgement. The user responded "Defer — set up later" at the checkpoint.
- **This is not a gap:** The doc is in place. The user knows the secret must be added. The phase scaffold (release.yml + publish-packages.yml from plans 21-01 and 21-02) is correct and complete.
- **Impact:** `publish-packages.yml` will be a no-op on any release until `RELEASE_TOKEN` is added to `sandwichfarm/nsyte` repository secrets. No other functionality is affected.
- **Resolution:** Maintainer adds `RELEASE_TOKEN` following `docs/RELEASING.md` at any time before the next intended release. No code changes are needed when the secret is added.

## Deviations from Plan

### Deferred Checkpoint

**Task 2 checkpoint — user elected "Defer — set up later"**

- **Found during:** Task 2 (checkpoint:human-action gate)
- **User decision:** Phase 21 ships the scaffold; RELEASE_TOKEN secret will be configured separately before a real release is triggered.
- **Impact:** publish-packages.yml will silently not fire until the secret is in place. This is documented in docs/RELEASING.md under the Troubleshooting section.
- **No code changes required.** The secret is stored in GitHub repository settings, not in the repository itself.

## Self-Check: PASSED

| Item | Status |
|---|---|
| `docs/RELEASING.md` exists | FOUND (commit b543d35) |
| RELEASING.md >= 30 lines | CONFIRMED (112 lines) |
| References `release.yml` | CONFIRMED |
| References `publish-packages.yml` | CONFIRMED |
| No real-looking token values | CONFIRMED |
| No UI stubs | N/A (docs only) |
| No new threat surface | CONFIRMED (doc contains no credentials, no new code paths) |
