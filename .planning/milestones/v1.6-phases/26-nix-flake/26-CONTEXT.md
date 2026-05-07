# Phase 26: Nix Flake - Context

**Gathered:** 2026-05-05
**Status:** Implemented; runtime UAT pending
**Mode:** Auto-generated (CI infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

A `flake.nix` at repo root exposes nsyte for all supported platforms, the Linux ELF linkage question is resolved, and per-platform hashes are updated automatically on every release via CI.

**Scope:**
- The `flake.nix` itself was created in Phase 20 (with placeholder hashes, x86_64-linux + macOS arm64/x64; aarch64-linux removed per CR-01 fix)
- This phase: replace the stub `publish-nix` job in `.github/workflows/publish-packages.yml` to update `flake.nix` + `flake.lock` per release
- Verify ELF linkage of the actual release artifact (per STATE.md blocker): if `deno compile` produces a dynamically-linked ELF, `autoPatchelfHook` must remain (already in flake.nix from Phase 20). If statically linked, autoPatchelfHook is a no-op (still safe).
- Run `nix flake check` in CI on a Nix-enabled runner to validate the flake parses and builds (resolves WR-01 from Phase 20 review)

**Pre-decided constraints:**
- `flake.nix` location: repo root (Nix convention; not in `packages/`)
- 4 systems supported: x86_64-linux, x86_64-darwin, aarch64-darwin (aarch64-linux deferred per CR-01)
- 4 SRI-format SHA256 placeholders to update: `sha256-PLACEHOLDER_HASH_X86_64_LINUX=`, `sha256-PLACEHOLDER_HASH_X86_64_DARWIN=`, `sha256-PLACEHOLDER_HASH_AARCH64_DARWIN=`, etc.
- The nsyte repo IS the flake source (unlike AUR/Homebrew/Scoop/Winget which have separate distribution repos). So the flake.nix update is a commit-and-push back to nsyte main branch (or via PR for review)

**Hashes:** Setup job (Phase 21) exports SHA256 in lowercase hex; Nix wants SRI format `sha256-base64hash=`. Need conversion: `nix hash convert --hash-algo sha256 --to sri <hex>` OR `nix hash to-sri --type sha256 <hex>`. Requires Nix CLI on the runner.

</domain>

<decisions>
## Locked decisions
- Use `cachix/install-nix-action@v25` to install Nix on ubuntu-latest runner (well-maintained, fast)
- Run `nix flake check --no-build --override-input nixpkgs nixpkgs/master` to validate flake structure post-edit
- Update flake.nix in-place via sed after computing SRI hashes
- Commit and push back to the nsyte main branch (NOT a separate distribution repo) — needs `RELEASE_TOKEN` or new `NSYTE_PUSH_TOKEN`. Use `RELEASE_TOKEN` (already in scope from Phase 21).

### Claude's Discretion
- Whether to push directly to main or open a PR (likely direct push since this is automation, not a review-needing change)
- Whether to also commit `flake.lock` (yes — Nix best practice, makes flake reproducible). Run `nix flake update` once initially, then `nix flake lock --override-input ...` for subsequent updates? Or leave `flake.lock` static unless there's a reason to refresh? **Initial decision:** generate `flake.lock` once, commit it; don't refresh on every release (only when nixpkgs changes are needed).
- ELF verification approach: download `nsyte-linux-{VERSION}` in CI, run `file`, log the result for human review. Don't gate on it.

</decisions>

<code_context>
- `flake.nix` — Phase 20 file at repo root (3-system flake with placeholder hashes)
- `.github/workflows/publish-packages.yml` `publish-nix` stub — Phase 21 scaffold

</code_context>

<specifics>
- Hash conversion: `nix hash to-sri --type sha256 <hex>` — wraps lowercase hex into SRI format
- ELF check: `file nsyte-linux-{VERSION}` — output should contain "ELF" and either "statically linked" or "dynamically linked" or "interpreter /lib64/ld-linux-x86-64.so.2". Log to step output, do not block.

</specifics>

<deferred>
- aarch64-linux Nix derivation — deferred (no aarch64 build in release.yml yet, same as CR-01)
- Cache nsyte builds in nixpkgs-style binary cache — out of scope
- Submit nsyte to nixpkgs proper — out of scope (flake.nix is a self-hosted alternative for now)

</deferred>
