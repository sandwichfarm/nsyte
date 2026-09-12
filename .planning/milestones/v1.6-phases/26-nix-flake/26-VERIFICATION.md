---
phase: 26-nix-flake
verified: 2026-05-07T15:05:00Z
status: human_needed
score: 9/9 static checks verified
---

# Phase 26: Nix Flake Verification

## Verified Static Truths

| # | Truth                                                                                                          | Status   |
| - | -------------------------------------------------------------------------------------------------------------- | -------- |
| 1 | `flake.nix` exists at repo root                                                                                | VERIFIED |
| 2 | Active systems are x86_64-linux, x86_64-darwin, and aarch64-darwin                                             | VERIFIED |
| 3 | aarch64 Linux remains deferred in comments                                                                     | VERIFIED |
| 4 | Linux derivation keeps `autoPatchelfHook`                                                                      | VERIFIED |
| 5 | `publish-nix` installs Nix with `cachix/install-nix-action@v25`                                                | VERIFIED |
| 6 | `publish-nix` converts hex SHA256 values to SRI hashes                                                         | VERIFIED |
| 7 | `publish-nix` runs `nix flake lock` and `nix flake check --no-build`                                           | VERIFIED |
| 8 | `publish-nix` commits and pushes flake changes to the default branch with `RELEASE_TOKEN` checkout credentials | VERIFIED |
| 9 | Nix local verification and ELF inspection docs exist                                                           | VERIFIED |

## Remaining Runtime Boundary

Local Nix validation was not run in this environment because `nix` is not
installed. The first complete runtime proof is a live `publish-nix` CI run on a
real release.
