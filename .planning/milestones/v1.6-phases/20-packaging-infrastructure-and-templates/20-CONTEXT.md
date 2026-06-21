# Phase 20: Packaging Infrastructure and Templates - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The `packages/` directory exists in the main repo with well-formed template files for all five target managers (AUR, Homebrew, Scoop, Winget, Nix), providing the version-controlled source of truth that all CI automation will consume.

**Asset naming confirmed from release.yml:**
- Linux x86_64: `nsyte-linux-{VERSION}` (versioned), `nsyte-linux` (unversioned)
- macOS arm64: `nsyte-macos-arm64-{VERSION}`
- macOS x64 (Intel): `nsyte-macos-x64-{VERSION}`
- Windows: `nsyte-windows-{VERSION}.exe`
- Repo: `github.com/sandwichfarm/nsyte`

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and confirmed asset naming from release.yml to guide decisions.

### Key constraints from requirements
- PKGBUILD: `-bin` naming convention (`nsyte-bin`), source entries for x86_64 and aarch64, SHA256 placeholder markers CI can inject
- Homebrew formula: per-platform `url`/`sha256` blocks for macOS arm64, macOS x86_64, Linux x86_64 — no `bottle` block
- Scoop manifest: `version` field has no `v` prefix; requires `checkver` and `autoupdate` fields
- Winget: three YAML files (`nsyte.version.yaml`, `nsyte.installer.yaml`, `nsyte.locale.en-US.yaml`), `InstallerType: portable`
- Nix: `flake.nix` at repo root, outputs for linux-x86_64, linux-aarch64, darwin-x86_64, darwin-aarch64

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `release.yml` fully read — asset names confirmed (see domain section above)
- Release uses `GITHUB_TOKEN` (not PAT) — INFRA-03 PAT swap is Phase 21's job, not Phase 20

### Established Patterns
- Repo is `github.com/sandwichfarm/nsyte`
- Deno compile produces separate per-platform binaries (no cross-platform single binary)
- Version is normalized semver without `v` prefix in filenames (e.g., `1.6.0` not `v1.6.0`)

### Integration Points
- `packages/` directory at repo root (new, does not yet exist)
- `flake.nix` at repo root (new, does not yet exist)
- Phase 21+ will consume these templates as CI automation sources

</code_context>

<specifics>
## Specific Ideas

- Use `PLACEHOLDER_SHA256` or `SHA256PLACEHOLDER` as the checksum placeholder string so CI scripts can `sed` replace it unambiguously
- PKGBUILD source array should list all platforms the AUR package supports (x86_64, aarch64)
- Homebrew formula class name: `Nsyte`
- Scoop `checkver` should point to GitHub releases API; `autoupdate.url` should use `$version` template variable

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped. Infrastructure phase is spec-complete from ROADMAP success criteria.

</deferred>
