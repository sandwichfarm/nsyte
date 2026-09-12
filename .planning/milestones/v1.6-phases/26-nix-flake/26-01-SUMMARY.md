---
phase: 26-nix-flake
plan: "01"
subsystem: ci
tags: [nix, flake, ci, github-actions, package-manager]
requires:
  - phase: 21-ci-workflow-foundation
    provides: publish-packages.yml setup job with release asset checksums
  - phase: 20-packaging-infrastructure-and-templates
    provides: flake.nix template with placeholder version and SRI hashes
provides:
  - Real publish-nix job that patches flake.nix per release
  - Nix SRI hash conversion from setup job SHA256 outputs
  - ELF linkage logging for Linux release artifacts
  - Nix local verification runbook
affects: [.github/workflows/publish-packages.yml, docs/RELEASING.md, flake.nix]
tech-stack:
  added: [cachix/install-nix-action@v25]
  patterns: [
    nix-sri-conversion,
    default-branch-self-update,
    flake-lock-validation,
  ]
key-files:
  created:
    - flake.nix
  modified:
    - .github/workflows/publish-packages.yml
    - docs/RELEASING.md
key-decisions:
  - "Use RELEASE_TOKEN for checkout/push because the flake update commits back to nsyte itself."
  - "Keep autoPatchelfHook on Linux until a real release artifact proves static linkage."
  - "Generate flake.lock in CI with nix flake lock; local machine has no nix binary."
requirements-completed: [NIX-02, NIX-03, NIX-04, NIX-05]
completed: 2026-05-07
---

# Phase 26 Plan 01: Nix Flake Summary

The `publish-nix` stub now updates `flake.nix` from release assets, converts
checksums to SRI format, validates the flake in CI, records Linux ELF linkage,
and pushes the changed flake files back to the default branch.

## Accomplishments

- Added repo-root `flake.nix` from the package-management pipeline branch.
- Replaced the Nix stub with install-Nix, SRI conversion, flake patch, ELF log,
  flake validation, and commit/push steps.
- Added Nix release and local verification documentation to `docs/RELEASING.md`.
- Preserved aarch64 Linux as deferred because `release.yml` does not publish
  that binary.
- Added `workflow_dispatch.manager` so package maintainers can re-run only the
  failed manager job.

## Verification

- Static package workflow/template validation: PASS
- `deno fmt --check docs/RELEASING.md packages/README.md packages/scoop/bucket/nsyte.json`:
  PASS
- `deno task check-doc-drift`: PASS
- `deno task test`: PASS, 218 passed, 0 failed, 9 ignored

## Known Limits

- Local `nix flake check` was not run because `nix` is not installed on this
  machine.
- Live CI publication still requires `RELEASE_TOKEN` to be configured and a real
  release with all expected assets.
