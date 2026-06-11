# Package Templates

This directory is the source of truth for OS package-manager templates and release publish
automation.

## Active release pipelines

- `aur/nsyte/` - AUR `nsyte` source-build template, published by
  `.github/workflows/publish-packages.yml` after AUR SSH is configured
- `aur/nsyte-bin/` - AUR `nsyte-bin` release-binary template, published by
  `.github/workflows/publish-packages.yml` after AUR SSH is configured
- `aur/nsite-git/` - AUR `nsite-git` VCS template. Its package page is created by the first
  authenticated AUR push.
- `homebrew/` - Homebrew tap formula template, published to `sandwichfarm/homebrew-nsyte`
- `scoop/` - Scoop bucket manifest template, published to `sandwichfarm/scoop-nsyte`
- `winget/` - Winget bootstrap manifests, used with `wingetcreate` after the first manual PR
- `../flake.nix` - Nix flake template at repo root, updated by the Nix publish job

## Preserved templates

These managers were migrated from the older `.packaging/` tree and intentionally kept even though
they do not currently have release jobs:

- `chocolatey/`
- `debian/`
- `flatpak/`
- `snap/`

They use the same placeholder convention as the active managers where practical:
`PLACEHOLDER_VERSION` plus a manager-specific checksum placeholder. Add CI only after a future plan
explicitly brings that manager back into active scope.
