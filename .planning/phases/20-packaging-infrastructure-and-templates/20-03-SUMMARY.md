---
phase: 20-packaging-infrastructure-and-templates
plan: "03"
subsystem: packaging
tags:
  - nix
  - flake
  - packaging
  - infrastructure
dependency_graph:
  requires: []
  provides:
    - flake.nix multi-system Nix derivation with placeholder SRI hashes
  affects:
    - Phase 26 CI (sed-substitutes placeholder hashes on release)
tech_stack:
  added:
    - Nix flake with fetchurl, autoPatchelfHook, stdenvNoCC.mkDerivation
  patterns:
    - forAllSystems via nixpkgs.lib.genAttrs
    - Per-system sources attribute set for URL + SRI hash
    - Linux-conditional autoPatchelfHook via pkgs.lib.optionals isLinux
key_files:
  created:
    - flake.nix
  modified: []
decisions:
  - Used stdenvNoCC (not stdenv) because no C/C++ compilation is needed
  - autoPatchelfHook gated on pkgs.stdenvNoCC.isLinux (not pkgs.stdenv.isLinux) to match the mkDerivation stdenv variant
  - dontUnpack=true and dontBuild=true because release assets are bare executables, not archives
  - Single PLACEHOLDER_VERSION binding interpolated into all four URLs (one sed target for Phase 26)
  - Each system gets a distinct sha256-PLACEHOLDER_HASH_<SYSTEM>= so Phase 26 CI can unambiguously sed-replace each
metrics:
  duration: "59s"
  completed: "2026-05-05T11:53:08Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 20 Plan 03: Nix Flake at Repository Root Summary

Multi-system Nix flake with fetchurl, autoPatchelfHook on Linux only, and five sed-ready placeholder strings for Phase 26 CI hash patching.

## What Was Built

`flake.nix` was created at the repository root (not under `packages/`). This is a Nix flake that:

- Exposes `packages.nsyte` for all four supported systems: `x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, `aarch64-darwin`
- Fetches the appropriate prebuilt GitHub release binary per system via `pkgs.fetchurl`
- Applies `autoPatchelfHook` + `pkgs.glibc` on Linux only (to fix the ELF interpreter path that `deno compile` hard-codes to `/lib64/ld-linux-x86-64.so.2`, which does not exist on NixOS)
- Darwin derivations do NOT include `autoPatchelfHook` (Mach-O binaries do not need ELF patching)
- Sets `dontUnpack = true` and `dontBuild = true` (release assets are bare executables, not archives)
- `installPhase` uses `install -m755 -D $src $out/bin/nsyte`
- Each system also exposes `default = self.packages.${system}.nsyte` so `nix run .` resolves without an explicit attribute path

## Placeholder Strings

Five placeholder strings are present in `flake.nix` for Phase 26 CI to sed-substitute on release:

| Placeholder | Location | Phase 26 Action |
|---|---|---|
| `PLACEHOLDER_VERSION` | `let version = "PLACEHOLDER_VERSION"` | Replace with bare semver (e.g. `1.4.0`) |
| `sha256-PLACEHOLDER_HASH_X86_64_LINUX=` | `"x86_64-linux"` sources entry | Replace with real SRI hash from release binary |
| `sha256-PLACEHOLDER_HASH_AARCH64_LINUX=` | `"aarch64-linux"` sources entry | Replace with real SRI hash from release binary |
| `sha256-PLACEHOLDER_HASH_X86_64_DARWIN=` | `"x86_64-darwin"` sources entry | Replace with real SRI hash from release binary |
| `sha256-PLACEHOLDER_HASH_AARCH64_DARWIN=` | `"aarch64-darwin"` sources entry | Replace with real SRI hash from release binary |

The `sha256-` prefix and `=` suffix are retained in the placeholder strings so the structural shape is identifiable by sed patterns like `s|sha256-PLACEHOLDER_HASH_X86_64_LINUX=|sha256-<actual>=|`.

## aarch64-linux Forward-Looking Note

The `aarch64-linux` entry is present in the flake with a placeholder hash, but carries the comment:

```
# NOTE: aarch64-linux binary requires release.yml aarch64 build step (not yet present).
```

Phase 22 or Phase 26 must add an aarch64-linux build step to `.github/workflows/release.yml` for the `nsyte-linux-aarch64-${version}` binary to actually be produced on release. Until then, the aarch64-linux derivation will fail at build time when Phase 26 attempts to fetch the binary (404 from GitHub releases).

## Validation Environment Note

`nix` is NOT installed in this development environment (verified via `command -v nix`). Structural validation was performed via Python (curly-brace balance check, keyword presence checks, system key presence, SRI placeholder presence). All checks passed.

Phase 26 will perform the first real `nix flake check` in a NixOS container. The ELF-patching behavior (autoPatchelfHook) is assumed correct based on RESEARCH.md documentation — actual `deno compile` Linux binary ELF type was not verified at this stage (per parallel_execution note: this is a Phase 26 concern).

## Deviations from Plan

None — plan executed exactly as written. File content matches the exact Nix expression specified in the plan's `<action>` block and the full pattern in `20-PATTERNS.md` lines 317-393.

## Self-Check: PASSED

| Item | Status |
|---|---|
| `flake.nix` exists at repo root | FOUND |
| `20-03-SUMMARY.md` exists | FOUND |
| feat(20-03) commit `2323daa` | FOUND |
| No UI stubs | CONFIRMED |
| No new threat surface | CONFIRMED |
