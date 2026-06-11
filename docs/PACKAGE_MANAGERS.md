# Package Manager Publishing

Last verified: 2026-06-11.

This document tracks the package-manager surfaces that are wired from
`.github/workflows/publish-packages.yml`, plus the registries that still require a human account
handoff.

## Current State

| Surface                           | Status                                            | Evidence                                                                                                                            |
| --------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| AUR `nsyte`                       | Prepared and existing upstream                    | Public AUR repo exists; local `packages/aur/nsyte/PKGBUILD` generated `.SRCINFO` for `0.27.1` and passed `namcap`.                  |
| AUR `nsyte-bin`                   | Prepared and existing upstream                    | Public AUR repo exists; local `packages/aur/nsyte-bin/PKGBUILD` generated `.SRCINFO` for `0.27.1` and passed `namcap`.              |
| AUR `nsite-git`                   | Prepared, blocked on first authenticated AUR push | Public AUR package page returns 404; local `packages/aur/nsite-git/PKGBUILD` generated `.SRCINFO` for `0.27.1` and passed `namcap`. |
| Homebrew                          | Live tap created and seeded                       | `https://github.com/sandwichfarm/homebrew-nsyte` exists, has `Formula/nsyte.rb` for `0.27.1`, and has a write deploy key.           |
| Scoop                             | Live bucket created and seeded                    | `https://github.com/sandwichfarm/scoop-nsyte` exists, has `bucket/nsyte.json` for `0.27.1`, and has a write deploy key.             |
| Nix                               | Usable flake plus release update job              | `flake.nix` is pinned to `0.27.1` with real SRI hashes; `publish-nix` updates it on future releases.                                |
| WinGet                            | Bootstrap PR opened; update job prepared          | `microsoft/winget-pkgs#386658` adds `sandwichfarm.nsyte` `0.27.1`; future releases need `WINGET_FORK_TOKEN` after that PR merges.   |
| Chocolatey, Snap, Flatpak, Debian | Local packaging templates refreshed               | `.packaging/*` is updated for `0.27.1`; registry publishing requires external accounts/tokens and package-specific review.          |

## Required GitHub Secrets

Configured:

- `HOMEBREW_TAP_SSH_KEY` - private deploy key for `sandwichfarm/homebrew-nsyte`
- `SCOOP_BUCKET_SSH_KEY` - private deploy key for `sandwichfarm/scoop-nsyte`

Still required:

- `AUR_SSH_PRIVATE_KEY` - an unencrypted CI key whose public key is registered on the AUR account
- `WINGET_FORK_TOKEN` - classic GitHub PAT with `public_repo` for `wingetcreate --submit`
- `RELEASE_TOKEN` - GitHub PAT used by `release.yml` to create releases that emit a downstream
  `release: published` event

Without `RELEASE_TOKEN`, run `publish-packages.yml` manually with `workflow_dispatch`, the release
tag, and `manager=all` or a single manager name. The package jobs themselves do not need
`RELEASE_TOKEN`.

WinGet bootstrap PR: https://github.com/microsoft/winget-pkgs/pull/386658

## Manual Workflow Dispatch

`publish-packages.yml` supports targeted manual runs:

```bash
gh workflow run publish-packages.yml -R sandwichfarm/nsyte \
  -f tag=v0.27.1 \
  -f manager=homebrew
```

Valid manager values are `all`, `aur`, `homebrew`, `scoop`, `winget`, and `nix`.

## AUR Bootstrap

The local `~/.ssh/aur` key exists but is passphrase-protected and was not usable non-interactively:

```bash
ssh -i ~/.ssh/aur -o IdentitiesOnly=yes -o BatchMode=yes aur@aur.archlinux.org help
# aur@aur.archlinux.org: Permission denied (publickey).
```

Use one of these paths:

1. Create a dedicated unencrypted CI key, register its public key in the AUR account, and store the
   private key as `AUR_SSH_PRIVATE_KEY`.
2. Unlock the existing key in an agent for local pushes, then create and push `nsite-git` manually.

Prepare all three AUR package workdirs locally:

```bash
scripts/prepare-aur-packages.sh 0.27.1
```

After AUR SSH works, clone, commit, and push all three AUR repos with:

```bash
scripts/prepare-aur-packages.sh 0.27.1 --clone --push
```

After that first push, `publish-packages.yml` will update `nsyte`, `nsyte-bin`, and `nsite-git` on
each release.

## End-user Install Commands

Homebrew:

```bash
brew tap sandwichfarm/nsyte https://github.com/sandwichfarm/homebrew-nsyte
brew install nsyte
```

Scoop:

```powershell
scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte
scoop install nsyte
```

AUR:

```bash
yay -S nsyte
yay -S nsyte-bin
```

`nsite-git` becomes available after the first authenticated AUR push described above.

## Extended Package Manager Handoffs

These managers are prepared locally but are not wired to the automated release workflow because each
requires external account ownership, manual moderation, or a packaging model that is a weaker fit
than the primary surfaces above.

### Chocolatey

Prepared files:

- `.packaging/chocolatey/nsyte.nuspec`
- `.packaging/chocolatey/tools/chocolateyinstall.ps1`
- `.packaging/chocolatey/tools/chocolateyuninstall.ps1`

Current template version: `0.27.1`.

Manual publish path:

```powershell
choco pack .packaging\chocolatey\nsyte.nuspec
choco push nsyte.0.27.1.nupkg --source https://push.chocolatey.org/ --api-key $env:CHOCOLATEY_API_KEY
```

Blocked on: a Chocolatey maintainer account/API key and community moderation.

### Debian

Prepared files:

- `.packaging/debian/DEBIAN/control`
- `.packaging/debian/DEBIAN/postinst`
- `.packaging/debian/DEBIAN/prerm`
- `.packaging/debian/build-deb.sh`

Current template version: `0.27.1`.

Manual local package build:

```bash
VERSION=0.27.1 .packaging/debian/build-deb.sh
sudo dpkg -i .packaging/debian/nsyte_0.27.1_amd64.deb
nsyte --version
```

Blocked on: choosing a Debian repository/PPA or signing/publishing process. The template is suitable
for local `.deb` builds, not an official Debian archive submission.

### Snap

Prepared file: `.packaging/snap/snapcraft.yaml`.

Current template version: `0.27.1`.

Manual publish path:

```bash
cd .packaging/snap
snapcraft pack
snapcraft upload --release=stable nsyte_0.27.1_amd64.snap
```

Blocked on: Snapcraft account ownership and likely confinement review. `nsyte` needs filesystem and
network access; classic confinement may require Canonical approval.

### Flatpak

Prepared files:

- `.packaging/flatpak/org.github.sandwichfarm.nsyte.yaml`
- `.packaging/flatpak/README.md`

Current template version: `0.27.1`.

Manual local build:

```bash
cd .packaging/flatpak
flatpak-builder build-dir org.github.sandwichfarm.nsyte.yaml --force-clean
```

Blocked on: Flathub repository creation/review and sandbox fit. A filesystem-heavy CLI is not an
ideal Flatpak target, so this remains a prepared handoff rather than primary automation.
