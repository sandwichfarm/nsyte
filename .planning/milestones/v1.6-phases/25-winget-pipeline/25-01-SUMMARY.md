---
phase: 25-winget-pipeline
plan: "01"
subsystem: ci
tags: [winget, windows, ci, github-actions, package-manager, pat]
requires:
  - phase: 21-ci-workflow-foundation
    provides: publish-packages.yml setup job and manager stubs
  - phase: 20-packaging-infrastructure-and-templates
    provides: packages/winget bootstrap manifests
provides:
  - Real publish-winget job using wingetcreate update
  - WINGET_FORK_TOKEN setup and bootstrap documentation
  - Local winget manifest verification recipe
affects: [
  26-nix-flake,
  docs/RELEASING.md,
  .github/workflows/publish-packages.yml,
]
tech-stack:
  added: [microsoft wingetcreate self-contained executable]
  patterns: [
    env-block-secret-injection,
    pre-bootstrap-warning-exit-zero,
    windows-latest-publisher,
  ]
key-files:
  created:
    - packages/winget/sandwichfarm.nsyte.version.yaml
    - packages/winget/sandwichfarm.nsyte.installer.yaml
    - packages/winget/sandwichfarm.nsyte.locale.en-US.yaml
  modified:
    - .github/workflows/publish-packages.yml
    - docs/RELEASING.md
key-decisions:
  - "Use WINGET_CREATE_GITHUB_TOKEN env var; never pass the PAT as a CLI flag."
  - "Before the first manual winget-pkgs bootstrap PR merges, wingetcreate non-zero exit is a warning and exits 0."
  - "Use |x64 URL architecture override because the Windows asset filename does not include a winget-detectable architecture token."
requirements-completed: [WINGET-02, WINGET-03, WINGET-04, WINGET-05]
completed: 2026-05-07
---

# Phase 25 Plan 01: Winget Pipeline Summary

The Winget stub was replaced with a real `windows-latest` job that downloads
`wingetcreate`, submits version-bump PRs after the one-time bootstrap, and
documents the classic PAT, bootstrap PR, review lag, and local verification
path.

## Accomplishments

- Added the branch-complete `publish-winget` implementation to
  `publish-packages.yml`.
- Added Winget bootstrap manifests under `packages/winget/`.
- Added `WINGET_FORK_TOKEN`, bootstrap, and local verification sections to
  `docs/RELEASING.md`.
- Preserved the expected human boundary: first package submission still requires
  a manual PR to `microsoft/winget-pkgs`.

## Verification

- Static package workflow/template validation: PASS
- `deno task test:fast`: PASS
- `deno task check-doc-drift`: PASS
- `deno task test`: PASS, 218 passed, 0 failed, 9 ignored

## Human UAT Required

- Submit and merge the first `sandwichfarm.nsyte` PR in `microsoft/winget-pkgs`.
- After bootstrap, run a real release or workflow dispatch and confirm
  `publish-winget` opens a version-bump PR.
