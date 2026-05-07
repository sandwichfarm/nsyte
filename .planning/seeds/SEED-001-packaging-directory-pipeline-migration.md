---
id: SEED-001
status: implemented
planted: 2026-05-07
planted_during: main packaging reconciliation
trigger_when: when packaging work resumes, before changing .packaging release/package-manager logic, or when reconciling main with feat/package-management-pipeline
scope: Medium
implemented: 2026-05-07
implemented_by: v1.6 Phase 20 packaging reconciliation
---

# SEED-001: Migrate .packaging using package-management-pipeline patterns

## Why This Matters

The current `.packaging/` directory already covers more package-manager surfaces
than the package-management pipeline branch: AUR, Homebrew, Scoop, Chocolatey,
Debian, Flatpak, and Snap. Some of those templates are older source-build or
hardcoded-version forms.

The `feat/package-management-pipeline` branch introduced the more complete
release-pipeline shape for overlapping managers: placeholder-driven manifests,
prebuilt GitHub release asset URLs, named checksum substitution, fail-fast
placeholder checks, idempotent publish jobs, and runbook-backed verification.

This seed preserves the intended reconciliation rule: inspect `.packaging/`
first, migrate it toward the branch's package-management pipeline patterns, and
when platforms collide, prefer the more complete implementation. When both
implementations are complete, prefer the implementation introduced by
`feat/package-management-pipeline`.

## When to Surface

**Trigger:** when packaging work resumes, before changing `.packaging`
release/package-manager logic, or when reconciling main with
`feat/package-management-pipeline`.

This seed should be presented during `$gsd-new-milestone` when the milestone
scope matches any of these conditions:
- Packaging directory cleanup, migration, or release automation work
- AUR, Homebrew, Scoop, Winget, Nix, Chocolatey, Debian, Flatpak, or Snap package
  template changes
- Any merge/reconciliation work involving `feat/package-management-pipeline`
- Release workflow changes that affect package publication or checksum handling

## Scope Estimate

**Medium** — likely a focused phase or two. The work is mostly template and CI
reconciliation, but it crosses multiple package-manager formats and release
workflow assumptions. It should be planned with validation per manager rather
than treated as a single mechanical file move.

## Breadcrumbs

Related code and decisions found in the current codebase:

- `.packaging/aur/PKGBUILD` — current AUR package template; source-build,
  `pkgname=nsyte`, single `PLACEHOLDER_SHA256`, and hardcoded version.
- `.packaging/homebrew/nsyte.rb` — current Homebrew formula; source-build via
  Deno and older asset naming.
- `.packaging/scoop/nsyte.json` — current Scoop manifest; has architecture
  nesting and older `nsyte-windows.exe` URL shape.
- `.packaging/chocolatey/nsyte.nuspec` and `.packaging/chocolatey/tools/` —
  current Chocolatey coverage with no direct branch equivalent.
- `.packaging/debian/` — current Debian package builder and maintainer scripts
  with no direct branch equivalent.
- `.packaging/flatpak/org.github.sandwichfarm.nsyte.yaml` — current Flatpak
  manifest with no direct branch equivalent.
- `.packaging/snap/snapcraft.yaml` — current Snap manifest with no direct branch
  equivalent.
- `feat/package-management-pipeline:packages/aur/PKGBUILD` — branch AUR
  template uses `nsyte-bin`, prebuilt release assets, `provides/conflicts`, and
  named `PLACEHOLDER_SHA256_X86_64`.
- `feat/package-management-pipeline:packages/homebrew/Formula/nsyte.rb` —
  branch Homebrew formula uses prebuilt macOS arm64, macOS x64, and Linux x64
  release assets with named checksum placeholders.
- `feat/package-management-pipeline:packages/scoop/bucket/nsyte.json` — branch
  Scoop manifest uses a flat schema, `#/nsyte.exe` rename, `checkver`, and
  `autoupdate.hash.mode = download`.
- `feat/package-management-pipeline:packages/winget/` — branch-only Winget
  manifests for the portable Windows package.
- `feat/package-management-pipeline:flake.nix` — branch Nix package definition
  with per-system release URLs and SRI placeholders.
- `feat/package-management-pipeline:.github/workflows/publish-packages.yml` —
  branch release publication workflow with setup checksum outputs, AUR,
  Homebrew, Scoop, and Winget publish jobs, plus a Nix stub.
- `.planning/phases/20-packaging-infrastructure-and-templates/20-CONTEXT.md` —
  original template requirements and release asset naming decisions.
- `.planning/phases/20-packaging-infrastructure-and-templates/20-VERIFICATION.md`
  — verified package-template expectations before the `.packaging/` directory
  consolidation.
- `.planning/phases/22-aur-pipeline/22-VERIFICATION.md`,
  `.planning/phases/23-homebrew-tap-pipeline/23-VERIFICATION.md`, and
  `.planning/phases/24-scoop-bucket-pipeline/24-VERIFICATION.md` — verified
  pipeline behavior, human UAT boundaries, and credential/runtime prerequisites.

## Notes

The user's precedence rule is part of the seed, not an implementation detail to
rediscover later:

1. Inspect the logic currently in `./.packaging`.
2. Migrate it using patterns consistent with `feat/package-management-pipeline`.
3. On platform/package-manager collisions, prefer the more complete
   implementation.
4. If both sides are complete, prefer the branch implementation.

Do not discard `.packaging` managers that have no branch equivalent unless a
future plan explicitly removes that platform from scope.

## Implementation Closure

Closed during v1.6 milestone artifact audit. Phase 20 migrated package-manager
sources into `packages/`, used the pipeline branch's placeholder/checksum
patterns for overlapping managers, and preserved Chocolatey, Debian, Flatpak,
and Snap templates that had no live-publication scope in v1.6.

Evidence:

- `packages/aur/PKGBUILD`
- `packages/homebrew/Formula/nsyte.rb`
- `packages/scoop/bucket/nsyte.json`
- `packages/winget/*.yaml`
- `flake.nix`
- `packages/chocolatey/`, `packages/debian/`, `packages/flatpak/`, `packages/snap/`
- `.planning/phases/20-packaging-infrastructure-and-templates/*-SUMMARY.md`
