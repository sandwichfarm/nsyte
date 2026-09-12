---
phase: 20-packaging-infrastructure-and-templates
fixed_at: 2026-05-05T12:30:00Z
review_path: .planning/phases/20-packaging-infrastructure-and-templates/20-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 4
skipped: 3
status: partial
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-05-05T12:30:00Z
**Source review:** `.planning/phases/20-packaging-infrastructure-and-templates/20-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 4
- Skipped (deferred): 3

## Fixed Issues

### CR-01: aarch64 Linux binary declared available but never built

**Files modified:** `packages/aur/PKGBUILD`, `flake.nix`
**Commits:** d8b2d56 (PKGBUILD), 465ac41 (flake.nix)
**Applied fix:**
- PKGBUILD: Changed `arch=('x86_64' 'aarch64')` to `arch=('x86_64')`. Removed `source_aarch64`, `sha256sums_aarch64`, and the `aarch64)` branch of the `case` statement in `package()`. Simplified `package()` to a direct `install -Dm755` call. Added comment noting when to re-add aarch64.
- flake.nix: Removed the `"aarch64-linux"` entry from the `sources` attrset. `supportedSystems` derives from `builtins.attrNames sources` so it now automatically covers only `x86_64-linux`, `x86_64-darwin`, `aarch64-darwin`. Added an inline comment noting when to restore the entry.

### WR-03: PKGBUILD arch array includes aarch64 before the binary is released

**Files modified:** `packages/aur/PKGBUILD`
**Commit:** d8b2d56 (resolved together with CR-01 in the same commit)
**Applied fix:** See CR-01. The arch array was reduced to `('x86_64')` in the same commit that removed the aarch64 sources.

### CR-02: Homebrew formula installs x86_64 Linux binary on Linux aarch64 hosts

**Files modified:** `packages/homebrew/Formula/nsyte.rb`
**Commit:** 7306ce8
**Applied fix:** Wrapped the `on_linux` URL block inside `on_intel`. Updated the `install` method to branch on `Hardware::CPU.intel?` and call `odie` with a clear message for unsupported architectures (Linux aarch64 and any future unsupported Linux arch), rather than silently installing a mismatched x86_64 ELF binary.

### WR-04: Homebrew formula missing `bottle :unneeded` directive

**Files modified:** `packages/homebrew/Formula/nsyte.rb`
**Commit:** 53e9a68
**Applied fix:** Added `bottle :unneeded` on the line after `version "PLACEHOLDER_VERSION"`, before the `on_macos` block. This tells Homebrew not to attempt bottle generation on a prebuilt-binary formula.

## Skipped Issues

### WR-01: flake.nix committed without flake.lock — nixpkgs-unstable is unpinned

**File:** `flake.nix:4`
**Reason:** deferred — requires `nix` toolchain not available locally. `nix flake update` must be run in an environment with Nix installed to generate `flake.lock`. Deferred to Phase 26 (NixOS container phase).

### WR-02: Winget ManifestVersion "1.12.0" is unverified and likely incorrect

**File:** `packages/winget/sandwichfarm.nsyte.version.yaml:5`, `packages/winget/sandwichfarm.nsyte.installer.yaml:9`, `packages/winget/sandwichfarm.nsyte.locale.en-US.yaml:17`
**Reason:** deferred — requires schema network check against `microsoft/winget-pkgs`. STATE.md already lists this as a verification blocker for Phase 25. Deferred to Phase 25.

### WR-05: Scoop autoupdate hash uses mode:download — requires full binary download per update check

**File:** `packages/scoop/bucket/nsyte.json:14-17`
**Reason:** deferred — design tradeoff, not a correctness bug. Current behaviour is functional. Moving to a sidecar `.sha256` file requires a coordinated change to `release.yml` (Phase 24 CI). The 20-02-SUMMARY already acknowledges this as a future improvement. Accepted as-is; deferred to Phase 24.

---

_Fixed: 2026-05-05T12:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
