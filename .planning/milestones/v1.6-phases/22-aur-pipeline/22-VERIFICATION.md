---
phase: 22-aur-pipeline
verified: 2026-05-05T17:30:00Z
status: human_needed
score: 3/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Trigger publish-packages.yml via workflow_dispatch against a real release tag after AUR_SSH_PRIVATE_KEY secret is added to repository settings"
    expected: "The publish-aur job completes all 7 steps and the AUR nsyte-bin package page reflects the new version within minutes of the push"
    why_human: "Requires AUR_SSH_PRIVATE_KEY repository secret to exist (cannot verify CI secret presence from local machine), AUR account SSH key registration, and an actual AUR push to confirm the package page updates. The CI plumbing is fully implemented and verified structurally — functional success depends on out-of-band maintainer bootstrap steps."
---

# Phase 22: AUR Pipeline Verification Report

**Phase Goal:** The AUR `nsyte-bin` package is live and automatically updated on every release via CI with correct per-arch checksums, regenerated `.SRCINFO`, and SSH push to the AUR git remote
**Verified:** 2026-05-05T17:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | CI computes per-arch SHA256 checksums by asset name, never by array position, and patches PKGBUILD before committing | ✓ VERIFIED | `sha256_linux_x64` computed by name in setup job (line 85); passed to publish-aur job via `needs.setup.outputs.sha256_linux_x64` env block; substituted by named `sed -i "s/PLACEHOLDER_SHA256_X86_64/${SHA256_X86_64}/g"` (lines 121, 125). No array indexing anywhere in the pipeline. |
| 2  | CI runs `makepkg --printsrcinfo` after patching PKGBUILD and commits both `PKGBUILD` and `.SRCINFO` atomically in a single push | ✓ VERIFIED | `makepkg --printsrcinfo > .SRCINFO` runs inside `archlinux:base-devel` container as non-root `builder` user (lines 133-150); `git add PKGBUILD .SRCINFO` stages both files in one operation (line 158); one `git commit` followed by `git push origin master` (lines 159-160) — single atomic push to AUR master branch. |
| 3  | The `publish-aur` CI job completes successfully on a test release, and the AUR package page reflects the new version | ? UNCERTAIN | The CI job is fully implemented and structurally correct. However, functional success requires: (1) `AUR_SSH_PRIVATE_KEY` secret added to repository settings, (2) AUR account SSH key registration (manual human step), (3) nsyte-bin package name bootstrap via empty-repo clone. Cannot verify GitHub secrets from the local filesystem. This is the documented bootstrap path in docs/RELEASING.md. |
| 4  | A maintainer can run `makepkg -si` inside a Docker Arch Linux container using `packages/aur/PKGBUILD` and install the binary successfully | ✓ VERIFIED | `docs/RELEASING.md` contains the complete local verification recipe (lines 164-203): uses `archlinux:base-devel`, creates non-root `builder` user via `useradd -m builder`, runs `sudo -u builder makepkg -si --noconfirm`, and confirms success with `nsyte --version`. The recipe uses the same named placeholder substitution logic as the CI job. PKGBUILD template at `packages/aur/PKGBUILD` contains `PLACEHOLDER_VERSION` (line 4) and `PLACEHOLDER_SHA256_X86_64` (line 17) as target strings. |

**Score:** 3/4 truths verified (SC-3 uncertain — requires human)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | aarch64 Linux SHA256 checksum in PKGBUILD | Future (not scheduled) | `22-CONTEXT.md` explicitly defers aarch64: "aarch64-linux support (deferred; not yet built by release.yml)". `22-RESEARCH.md` Deferred Ideas section confirms same. PKGBUILD line 8 comment documents the deferral inline. The SC-1 mention of "aarch64" in the roadmap reflects the full eventual vision; the CONTEXT.md pre-decided constraint limits Phase 22 scope to x86_64 only. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/publish-packages.yml` | Real publish-aur job replacing Phase 21 stub | ✓ VERIFIED | File exists. Lines 91-160 contain the 7-step real implementation (commit 4ae51a7). No TODO stub text present. YAML structurally valid (Python yaml.safe_load confirms). yamllint exits 1 but only emits line-length style violations — no parse or indentation errors, consistent with plan's explicit acceptance criteria. |
| `.github/workflows/publish-packages.yml` | AUR remote clone via SSH | ✓ VERIFIED | `git clone ssh://aur@aur.archlinux.org/nsyte-bin.git /tmp/aur-nsyte-bin` present at line 114. |
| `.github/workflows/publish-packages.yml` | PKGBUILD substitution using named placeholders | ✓ VERIFIED | `sed -i "s/PLACEHOLDER_VERSION/${VERSION}/g"` and `sed -i "s/PLACEHOLDER_SHA256_X86_64/${SHA256_X86_64}/g"` at lines 124-125. Post-substitution sanity check at lines 127-131 fails fast if any `PLACEHOLDER_` survives. |
| `.github/workflows/publish-packages.yml` | SHA256 substitution by name (not array index) | ✓ VERIFIED | `SHA256_X86_64: ${{ needs.setup.outputs.sha256_linux_x64 }}` env block at line 121. Named sed substitution confirmed. |
| `.github/workflows/publish-packages.yml` | .SRCINFO regeneration in arch container | ✓ VERIFIED | `makepkg --printsrcinfo > .SRCINFO` at line 144 inside `archlinux:base-devel` container. `.SRCINFO` sanity check (`test -s`) at line 147. |
| `.github/workflows/publish-packages.yml` | Arch Linux container for makepkg | ✓ VERIFIED | `archlinux:base-devel` at line 137. `archlinux:latest` is NOT present anywhere in the file. |
| `.github/workflows/publish-packages.yml` | Atomic commit of both files | ✓ VERIFIED | `git -C /tmp/aur-nsyte-bin add PKGBUILD .SRCINFO` at line 158. Single commit at line 159. Single push at line 160. |
| `docs/RELEASING.md` | AUR_SSH_PRIVATE_KEY prerequisite section | ✓ VERIFIED | `## AUR_SSH_PRIVATE_KEY prerequisite` heading at line 108. Why-required paragraph, symptom-of-forgetting paragraph, and publish-aur job reference all present. |
| `docs/RELEASING.md` | AUR bootstrap (one-time) instructions | ✓ VERIFIED | `## Generating and registering the AUR SSH key` heading at line 118. Five-step numbered bootstrap including ssh-keygen, public key registration, empty-repo clone to register nsyte-bin, and GitHub secret addition. |
| `docs/RELEASING.md` | Local AUR verification recipe (AUR-05) | ✓ VERIFIED | `## Verifying the AUR PKGBUILD locally (AUR-05)` heading at line 164. Docker recipe using `archlinux:base-devel`, `makepkg -si`, and `nsyte --version` as positive proof. `packages/aur/PKGBUILD` referenced in Related files at line 211. |
| `packages/aur/PKGBUILD` | Template with correct placeholder strings | ✓ VERIFIED | `pkgver=PLACEHOLDER_VERSION` at line 4; `sha256sums_x86_64=('PLACEHOLDER_SHA256_X86_64')` at line 17. Strings match exactly what the CI sed commands target. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| publish-aur job | setup job outputs | `needs.setup.outputs.version` and `needs.setup.outputs.sha256_linux_x64` | ✓ WIRED | Both outputs consumed via `env:` blocks at lines 119-121 and 153-154. No hardcoded version or checksum values. |
| publish-aur job | AUR_SSH_PRIVATE_KEY repository secret | `webfactory/ssh-agent@v0.10.0` with `ssh-private-key: ${{ secrets.AUR_SSH_PRIVATE_KEY }}` | ✓ WIRED | Action present at line 102-104. Secret referenced by name, not echoed or written to disk. |
| publish-aur job | packages/aur/PKGBUILD template | `cp packages/aur/PKGBUILD /tmp/aur-nsyte-bin/PKGBUILD` | ✓ WIRED | Copy step at line 123. The CI job consumes the same PKGBUILD template that maintainers use for local verification. |
| publish-aur job | AUR git remote | `git -C /tmp/aur-nsyte-bin push origin master` | ✓ WIRED (structurally) | Push command at line 160 targets `origin master` (AUR's branch). Functional success requires the secret and AUR account bootstrap (human step). |
| docs/RELEASING.md AUR section | publish-aur job | explicit job name reference | ✓ WIRED | "the `publish-aur` job" referenced in RELEASING.md lines 110, 114, 158, 210. |
| docs/RELEASING.md AUR section | packages/aur/PKGBUILD template | Related files list | ✓ WIRED | `packages/aur/PKGBUILD` in Related files at line 211. |

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers CI workflow YAML and documentation, not a data-rendering component. The data flow (setup outputs → publish-aur env blocks → sed substitution → AUR push) is verified through key link analysis above.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| YAML structurally valid | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish-packages.yml'))"` | Parsed successfully; jobs: setup, publish-aur, publish-homebrew, publish-scoop, publish-winget, publish-nix | ✓ PASS |
| No TODO stub in publish-aur | `! grep -q "TODO — phase 22 will replace this stub"` | Not found | ✓ PASS |
| Sibling jobs count | `grep -c '^  publish-' .github/workflows/publish-packages.yml` | 5 | ✓ PASS |
| CI push to AUR | Requires running workflow with AUR_SSH_PRIVATE_KEY secret | Cannot test locally | ? SKIP (needs human) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUR-02 | 22-01 | CI computes per-arch SHA256 checksums from published release assets and patches PKGBUILD before pushing (no hardcoded hashes) | ✓ SATISFIED | `sha256_linux_x64` computed by sha256sum in setup job; substituted by named `sed` into PKGBUILD in publish-aur job. No hardcoded values. |
| AUR-03 | 22-01 | CI regenerates `.SRCINFO` via `makepkg --printsrcinfo` after patching PKGBUILD and commits both files atomically | ✓ SATISFIED | `makepkg --printsrcinfo > .SRCINFO` in archlinux:base-devel container; `git add PKGBUILD .SRCINFO` + single commit + single push. Atomic. |
| AUR-04 | 22-01, 22-02 | `AUR_SSH_PRIVATE_KEY` secret is configured and the `publish-aur` CI job pushes successfully on release | ? NEEDS HUMAN | CI job is wired to `secrets.AUR_SSH_PRIVATE_KEY` via webfactory/ssh-agent. Documentation in RELEASING.md covers secret setup and AUR bootstrap. Functional push requires the secret and AUR account to exist — cannot verify remotely. |
| AUR-05 | 22-01, 22-02 | Maintainer can verify the AUR package locally with `makepkg -si` in a Docker Arch container before a real release | ✓ SATISFIED | Complete local verification recipe in `docs/RELEASING.md` lines 164-203 using `archlinux:base-devel`, non-root builder, `makepkg -si --noconfirm`, and `nsyte --version` as positive check. |

**Orphaned requirements check:** AUR-02, AUR-03, AUR-04, AUR-05 all appear in REQUIREMENTS.md mapped to Phase 22. All four are claimed in plans 22-01 and 22-02. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.github/workflows/publish-packages.yml` | 168, 180, 192, 204 | TODO echo stubs in publish-homebrew, publish-scoop, publish-winget, publish-nix jobs | ℹ️ Info | These are intentional stubs for future phases (23-26). The publish-aur job is not a stub. No impact on Phase 22 goal. |

No blockers or warnings found in Phase 22 files. The TODO stubs in sibling jobs are expected and documented.

### Human Verification Required

#### 1. Functional AUR Push Test

**Test:** After adding `AUR_SSH_PRIVATE_KEY` to repository secrets and completing the one-time AUR bootstrap (as documented in `docs/RELEASING.md` "Generating and registering the AUR SSH key"):
1. Trigger `publish-packages.yml` via `workflow_dispatch` using an existing release tag (e.g., `v1.6.0`)
2. Monitor the `publish-aur` job in GitHub Actions

**Expected:** All 7 steps complete without error. The AUR `nsyte-bin` package page at `https://aur.archlinux.org/packages/nsyte-bin` shows the new version within minutes.

**Why human:** Cannot verify: (a) that `AUR_SSH_PRIVATE_KEY` secret exists in GitHub repository settings, (b) that the SSH public key is registered in the AUR account, (c) that the `nsyte-bin` package name was bootstrapped via empty-repo clone, or (d) that the AUR remote accepts the push and the package page updates. All of these are external system states that require a live CI run with real credentials.

### Gaps Summary

No structural gaps found. The publish-aur job is a complete real implementation (not a stub) with all 7 steps present and correctly wired. The documentation in RELEASING.md covers all required maintainer bootstrap steps. The only open item is functional verification of the live AUR push, which requires out-of-band human bootstrap steps (AUR account registration, SSH key registration, GitHub secret configuration) that are fully documented but cannot be completed or verified programmatically.

The aarch64 gap in SC-1 is a pre-decided scope deferral documented in CONTEXT.md and RESEARCH.md (aarch64 Linux build not yet present in release.yml), not a Phase 22 failure.

---

_Verified: 2026-05-05T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
