# Requirements: nsyte v1.6 — OS Package Manager/Distributors

**Defined:** 2026-05-05
**Core Value:** Reliable site deployment to the nostr + blossom ecosystem with a simple CLI workflow.
**Milestone goal:** Ship locally-testable publish pipelines for OS package managers that accept open submissions, integrated into the release workflow as a triggered parallel matrix job.

## v1.6 Requirements

Requirements for this milestone. Each maps to a roadmap phase.

### Infrastructure

CI foundation: package template directory and the workflow skeleton that all manager-specific jobs depend on.

- [ ] **INFRA-01**: `packages/<manager>/` directory structure exists in the main repo with template files for each targeted manager (aur, homebrew, scoop, winget, nix).
- [ ] **INFRA-02**: `.github/workflows/publish-packages.yml` exists with `on: release: types: [published]` trigger and a `workflow_dispatch` input for manual per-manager re-runs.
- [ ] **INFRA-03**: PAT (`RELEASE_TOKEN`) replaces `GITHUB_TOKEN` in the release creation step of `release.yml` so that `publish-packages.yml` actually fires on release.
- [ ] **INFRA-04**: Each manager job includes an asset-readiness poll step that waits until all expected release artifacts are available before downloading them (prevents wrong checksums from premature access).
- [ ] **INFRA-05**: Manager jobs are independent named jobs (not a shared matrix) so one job failure never cancels others.

### AUR

Linux/Arch Linux — open submission, live instantly on push.

- [ ] **AUR-01**: `packages/aur/PKGBUILD` template exists with `-bin` naming convention, source entries for all release platforms, and per-platform SHA256 checksum placeholders.
- [x] **AUR-02**: CI computes per-arch SHA256 checksums from published release assets and patches PKGBUILD before pushing (no hardcoded hashes).
- [x] **AUR-03**: CI regenerates `.SRCINFO` via `makepkg --printsrcinfo` after patching PKGBUILD and commits both files atomically to the AUR git remote.
- [x] **AUR-04**: `AUR_SSH_PRIVATE_KEY` secret is configured and the `publish-aur` CI job pushes successfully on release.
- [x] **AUR-05**: Maintainer can verify the AUR package locally with `makepkg -si` in a Docker Arch container before a real release.

### Homebrew

macOS and Linux — personal tap repo, open submission, live instantly on push.

- [ ] **BREW-01**: `sandwichfarm/homebrew-nsyte` tap repo is created and contains `Formula/nsyte.rb` with per-platform `url`/`sha256` blocks for macOS (arm64 + x86_64) and Linux (x86_64).
- [x] **BREW-02**: CI updates the tap formula's URL and SHA256 for all platforms on release using `mislav/bump-homebrew-formula-action` or equivalent.
- [x] **BREW-03**: `HOMEBREW_TAP_TOKEN` PAT secret is configured and the `publish-homebrew` job pushes the formula update successfully on release.
- [x] **BREW-04**: Maintainer can verify the formula locally with `brew install --formula ./Formula/nsyte.rb` before pushing.

### Scoop

Windows — personal bucket repo, open submission, autoupdate built in.

- [ ] **SCOOP-01**: `sandwichfarm/scoop-nsyte` bucket repo is created and contains `bucket/nsyte.json` manifest with correct `version`, `url`, `hash`, `checkver`, and `autoupdate` fields (no `v` prefix in `version` field).
- [ ] **SCOOP-02**: CI updates the Scoop manifest's `url` and `hash` on release and pushes to the bucket repo.
- [ ] **SCOOP-03**: `SCOOP_BUCKET_TOKEN` PAT secret is configured and the `publish-scoop` job pushes successfully on release.
- [ ] **SCOOP-04**: Maintainer can verify the manifest locally with `scoop install <path>/nsyte.json` before a real release.

### Winget

Windows 11 default package manager — first submission is a manual PR (1-3 day review); subsequent bumps are automated.

- [ ] **WINGET-01**: Three YAML manifest files (`nsyte.version.yaml`, `nsyte.installer.yaml`, `nsyte.locale.en-US.yaml`) exist in `packages/winget/` with correct schema version, `InstallerType: portable`, and all required fields.
- [ ] **WINGET-02**: Manifests are validated locally with `winget validate` with zero errors before the initial PR submission.
- [ ] **WINGET-03**: Initial manual PR to `microsoft/winget-pkgs` is submitted and approved (one-time bootstrap).
- [ ] **WINGET-04**: CI automatically opens a version-update PR to `microsoft/winget-pkgs` on release using `wingetcreate update` with `WINGET_TOKEN` secret.
- [ ] **WINGET-05**: A note in the repo (README or CONTRIBUTING) documents the expected 1-3 day review lag for winget PRs so it is not mistaken for a CI failure.

### Nix

NixOS and nix users — `flake.nix` at repo root, no external registry.

- [ ] **NIX-01**: `flake.nix` at repo root exposes `packages.nsyte` outputs for all supported platforms (linux-x86_64, linux-aarch64, darwin-x86_64, darwin-aarch64).
- [ ] **NIX-02**: Per-platform SRI hashes in `flake.nix` (or a companion `sources.json`) are updated automatically on release via CI.
- [ ] **NIX-03**: Linux derivation correctly handles the `deno compile` binary — uses `autoPatchelfHook` if the binary is dynamically linked, or is explicitly verified as statically linked.
- [ ] **NIX-04**: `nix run .#nsyte -- --version` succeeds on both Linux (NixOS container) and macOS as a local smoke test before CI wiring.
- [ ] **NIX-05**: CI job updates hashes and commits to the main repo on release (no external repo push needed — `flake.nix` lives in the main repo).

## Future Requirements

Deferred to a later milestone.

### Extended Package Managers

- **PKG-FUT-01**: Official nixpkgs PR — high effort, multi-week review; defer until adoption warrants it.
- **PKG-FUT-02**: Chocolatey community repo — Winget covers the same Windows audience; add only on explicit user request.
- **PKG-FUT-03**: Snap — classic confinement requires Canonical approval with unpredictable timeline.
- **PKG-FUT-04**: Flatpak/Flathub — sandbox model mismatched with filesystem-heavy CLI tool.
- **PKG-FUT-05**: homebrew-core submission — requires 225+ stars for self-submission; defer until project grows.

### CLI Source Backlog (from v1.4 phantom log)

- **CLI-FUT-01**: Env-var override support
- **CLI-FUT-02**: `nsyte config show` / `nsyte config set` subcommands
- **CLI-FUT-03**: `validate` redundant `-f` flag fix
- **CLI-FUT-04**: `deploy` duplicate `-c` short-flag fix

## Out of Scope

| Feature | Reason |
|---------|--------|
| Chocolatey | Human moderation on every version, no SLA; Winget covers same Windows audience faster |
| Snap | Requires manual `classic` confinement approval from Canonical; timeline unpredictable |
| Flatpak/Flathub | Sandbox model mismatched with a CLI tool needing filesystem + network access |
| Official nixpkgs PR | Multi-week review, requires significant adoption first; Nix flake covers users without upstream gatekeeping |
| homebrew-core submission | Requires 225+ stars; niche nostr tool does not qualify near-term |
| CLI source changes | Phantom-log backlog stays deferred; this milestone is packaging only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 20 | Pending |
| INFRA-02 | Phase 21 | Pending |
| INFRA-03 | Phase 21 | Pending |
| INFRA-04 | Phase 21 | Pending |
| INFRA-05 | Phase 21 | Pending |
| AUR-01 | Phase 20 | Pending |
| AUR-02 | Phase 22 | Complete |
| AUR-03 | Phase 22 | Complete |
| AUR-04 | Phase 22 | Complete |
| AUR-05 | Phase 22 | Complete |
| BREW-01 | Phase 20 | Pending |
| BREW-02 | Phase 23 | Complete |
| BREW-03 | Phase 23 | Complete |
| BREW-04 | Phase 23 | Complete |
| SCOOP-01 | Phase 20 | Pending |
| SCOOP-02 | Phase 24 | Pending |
| SCOOP-03 | Phase 24 | Pending |
| SCOOP-04 | Phase 24 | Pending |
| WINGET-01 | Phase 20 | Pending |
| WINGET-02 | Phase 25 | Pending |
| WINGET-03 | Phase 25 | Pending |
| WINGET-04 | Phase 25 | Pending |
| WINGET-05 | Phase 25 | Pending |
| NIX-01 | Phase 20 | Pending |
| NIX-02 | Phase 26 | Pending |
| NIX-03 | Phase 26 | Pending |
| NIX-04 | Phase 26 | Pending |
| NIX-05 | Phase 26 | Pending |

**Coverage:**
- v1.6 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-05*
*Last updated: 2026-05-05 — initial definition*
