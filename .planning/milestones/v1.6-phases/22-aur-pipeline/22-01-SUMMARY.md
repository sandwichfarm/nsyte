---
phase: 22-aur-pipeline
plan: "01"
subsystem: ci
tags: [ci, github-actions, aur, arch-linux, ssh]
dependency_graph:
  requires: [21-02]
  provides: [aur-publish-job]
  affects: [.github/workflows/publish-packages.yml]
tech_stack:
  added: [webfactory/ssh-agent@v0.10.0, archlinux:base-devel]
  patterns: [env-block-secrets, non-root-makepkg, atomic-git-push]
key_files:
  modified:
    - .github/workflows/publish-packages.yml
decisions:
  - Use archlinux:base-devel (not :latest) — makepkg lives in base-devel
  - Runtime ssh-keyscan for AUR host key (MITM tradeoff accepted per RESEARCH.md)
  - env: blocks for VERSION and SHA256_X86_64 — prevents quoting hazards and secret leakage
  - Single-quoted bash heredoc in docker step — prevents host shell interpolation
metrics:
  duration: 55s
  completed: "2026-05-05T14:59:28Z"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 22 Plan 01: Replace publish-aur Stub with Real AUR Publish Pipeline

## One-liner

SSH-keyed AUR publish pipeline: clones `nsyte-bin.git`, sed-patches PKGBUILD placeholders, regenerates `.SRCINFO` via non-root `makepkg` in `archlinux:base-devel`, and pushes both files atomically to `origin master`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace publish-aur stub with real AUR publish pipeline | 4ae51a7 | .github/workflows/publish-packages.yml |

## What Was Built

Replaced the Phase 21 stub `publish-aur` job (lines 91-101 of `.github/workflows/publish-packages.yml`) with a 7-step real implementation. The new job spans lines 91-158 in the updated file.

**Replaced range:** Lines 91-101 (stub, 11 lines) → Lines 91-158 (real implementation, 68 lines including the trailing newline).

**Seven steps in order:**
1. `actions/checkout@v4` — fetches nsyte repo so `packages/aur/PKGBUILD` is on the runner filesystem
2. `webfactory/ssh-agent@v0.10.0` — loads `secrets.AUR_SSH_PRIVATE_KEY` into ssh-agent without writing to disk
3. `ssh-keyscan aur.archlinux.org >> ~/.ssh/known_hosts` — pins host key at runtime (MITM tradeoff accepted per RESEARCH.md)
4. `git clone ssh://aur@aur.archlinux.org/nsyte-bin.git` — handles first-time empty-repo bootstrap path
5. Patch PKGBUILD: `cp` template then two `sed -i` calls substituting `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_X86_64` by exact string match; sanity check fails fast if any `PLACEHOLDER_` survives
6. `docker run archlinux:base-devel` — creates non-root `builder` user, chowns `/pkg`, runs `makepkg --printsrcinfo > .SRCINFO` after `cd /pkg` so redirect lands in the bind-mounted volume; sanity check confirms `.SRCINFO` is non-empty
7. `git add PKGBUILD .SRCINFO && git commit && git push origin master` — single atomic commit; pushes to `master` (AUR's default branch, not `main`)

## yamllint Status

`yamllint` exits 1 but emits only `line-length` style violations — no parse errors, no indentation errors. All line-length issues are either pre-existing (lines 4, 5, 46, 53, 65-88) or acceptable for the docker bash script content. Python `yaml.safe_load()` confirms the file is structurally valid. This matches the plan's explicit acceptance: "Pre-existing line-length warnings on the docker bash script are acceptable. Parse errors and indentation errors are not."

## Sibling Jobs Status

All four sibling stub jobs are present and unmodified:
- `publish-homebrew` (phase 23 stub) — unchanged
- `publish-scoop` (phase 24 stub) — unchanged
- `publish-winget` (phase 25 stub) — unchanged
- `publish-nix` (phase 26 stub) — unchanged

`grep -c '^  publish-' .github/workflows/publish-packages.yml` returns `5` as required.

## docker Step vs RESEARCH.md Pattern 4

The docker step matches RESEARCH.md Pattern 4 exactly:
- `pacman -Sy --noconfirm 2>/dev/null || true` — included (pacman database refresh; silenced; non-fatal per pattern)
- `useradd -m builder` — non-root user creation
- `chown -R builder /pkg` — volume ownership transfer
- `cd /pkg && sudo -u builder makepkg --printsrcinfo > .SRCINFO` — redirect lands in volume
- `set -euo pipefail` — inside the single-quoted bash body
- No deviation from Pattern 4.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes beyond what the plan's `<threat_model>` documents. All T-22-01 through T-22-08 mitigations are implemented as specified.

## Known Stubs

None — the publish-aur job is fully implemented. The job will remain red in CI until `AUR_SSH_PRIVATE_KEY` is added to repository secrets (documented bootstrap step in Plan 22-02).

## Self-Check: PASSED

- `.github/workflows/publish-packages.yml` exists: FOUND
- Commit `4ae51a7` exists: confirmed
- All acceptance criteria grep checks: all pass
- YAML parses successfully (Python yaml.safe_load)
