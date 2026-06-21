# Phase 21: CI Workflow Foundation - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The `publish-packages.yml` GitHub Actions workflow exists with the correct release trigger, PAT fix, asset-readiness guard, and job isolation — so that every subsequent manager-specific job is built on a reliable, non-blocking foundation.

This phase ships ONLY the workflow scaffold + shared setup steps (release event handling, PAT replacement, asset-readiness poll, manager job stubs). Per-manager publish logic ships in Phases 22–26.

**Pre-decided constraints from STATE.md / project decisions:**
- **PAT swap (highest priority):** Use `RELEASE_TOKEN` (a PAT-class secret) instead of `GITHUB_TOKEN` to create the release that triggers this workflow. Releases created by `GITHUB_TOKEN` silently never trigger downstream `release: published` workflows.
- **Asset-readiness poll required:** `release: published` fires before binary uploads complete. The workflow MUST poll the release's asset list until all expected platform binaries (linux-x86_64, macos-arm64, macos-x64, windows) are present, with a reasonable timeout.
- **Job isolation:** Each manager (AUR, Homebrew, Scoop, Winget, Nix) is a separate named job — no `matrix:` and no `fail-fast: true`. One manager failing must not cancel the others.

**Asset naming confirmed from release.yml** (carried forward from Phase 20 CONTEXT):
- Linux x86_64: `nsyte-linux-{VERSION}` (versioned), `nsyte-linux` (unversioned)
- macOS arm64: `nsyte-macos-arm64-{VERSION}`
- macOS x64: `nsyte-macos-x64-{VERSION}`
- Windows: `nsyte-windows-{VERSION}.exe`

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Implementation details (poll interval, timeout duration, exact secret-naming scheme for AUR_SSH_KEY/HOMEBREW_TAP_TOKEN/etc.) are at Claude's discretion. Use GitHub Actions conventions and STATE.md decisions as guidance.

### Locked decisions (do not revisit)
- `RELEASE_TOKEN` PAT for release creation (must be set up by user; workflow assumes it exists)
- `release: published` is the trigger event
- Asset-readiness poll happens once at the start of the workflow (in a setup job), then exports asset URLs/SHAs to manager jobs via outputs
- Each manager job has `needs: [setup]` and `if: needs.setup.result == 'success'` — manager jobs DO NOT depend on each other
- Failure isolation: each manager job runs `continue-on-error: false` for its own steps, but a failed manager job MUST NOT cancel sibling manager jobs (no `fail-fast`)

### Open implementation questions (Claude's call)
- Poll interval: ~10s, timeout ~5 min (typical release upload completes <2 min)
- Asset-readiness check: enumerate expected asset names; query GitHub API `GET /repos/{owner}/{repo}/releases/{release_id}/assets`; assert all expected names present
- Setup job exports: version (without `v` prefix), per-platform asset URLs, per-platform SHA256s (computed in setup or deferred to manager jobs)
- Per-manager secret naming: `AUR_SSH_KEY`, `HOMEBREW_TAP_TOKEN`, `SCOOP_BUCKET_TOKEN`, `WINGET_FORK_TOKEN` — consistent `<MANAGER>_<KIND>` prefix

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/workflows/release.yml` fully read in Phase 20 — confirms artifact names and GitHub release timing
- `packages/` directory committed in Phase 20 — templates with canonical placeholder strings (`PLACEHOLDER_VERSION`, `PLACEHOLDER_SHA256_*`) ready for `sed` substitution
- `packages/aur/PKGBUILD`, `packages/homebrew/Formula/nsyte.rb`, `packages/scoop/bucket/nsyte.json`, `packages/winget/sandwichfarm.nsyte.{version,installer,locale.en-US}.yaml`, `flake.nix` — all exist and Phase 22–26 jobs will read these as source-of-truth templates

### Patterns
- Existing release.yml uses `actions/upload-artifact@v4` and `softprops/action-gh-release@v1`
- No existing publish-packages.yml — this is a new file at `.github/workflows/publish-packages.yml`
- gh CLI is available in GitHub Actions runners by default — prefer `gh release view` over raw API for asset queries

### Integration Points
- New file: `.github/workflows/publish-packages.yml` (only file this phase modifies)
- Triggered by release events created via `RELEASE_TOKEN` (changes to release.yml deferred — out of scope for this phase, may be addressed in 22 or follow-up)

</code_context>

<specifics>
## Specific Ideas

- The "PAT fix" must be both documented AND reflected in the workflow: the publish-packages.yml itself triggers on `release: published`, so the actual PAT swap happens upstream (in release.yml or in a docs/runbook). For Phase 21, document the requirement clearly (in workflow comments or a sibling README) and ensure the workflow is structured to receive `release.tag_name` and `release.id` cleanly.
- The setup job's poll loop must be bounded — fail fast (within 5–10 minutes) if assets never arrive, rather than hanging the workflow.

</specifics>

<deferred>
## Deferred Ideas

- Per-manager publish logic — deferred to Phases 22–26
- Modifying release.yml to use `RELEASE_TOKEN` — out of phase scope (the workflow assumes the PAT swap has been made; if release.yml still uses default GITHUB_TOKEN, the trigger never fires and downstream phases will be a no-op until that's fixed). Worth a one-line note in the workflow header.
- Bottle/sidecar SHA256 publishing — deferred (would let Scoop autoupdate skip download). Captured in Phase 20 REVIEW.md as WR-05.

</deferred>
