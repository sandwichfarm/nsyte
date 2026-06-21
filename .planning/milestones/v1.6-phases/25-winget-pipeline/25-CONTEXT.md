# Phase 25: Winget Pipeline - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (CI infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

nsyte is available in the Windows Package Manager index after a one-time manual PR bootstrap, and subsequent version bumps are automated via CI.

**Scope:**
- Replace the stub `publish-winget` job in `.github/workflows/publish-packages.yml` with real publish logic
- Real logic: use `microsoft/winget-create` (`wingetcreate`) CLI to push manifest updates to the official `microsoft/winget-pkgs` repo as a PR
- Bootstrap: ONE-TIME manual PR to `microsoft/winget-pkgs` to add `sandwichfarm.nsyte` initially. CI handles subsequent updates only.

**Pre-decided constraints (per STATE.md / project decisions):**
- **Verify ManifestVersion before writing manifests.** Phase 20 used `1.12.0`; Phase 20 REVIEW WR-02 flagged this as unverified. This phase MUST verify against the live `microsoft/winget-pkgs/doc/manifest/schema/` before submitting. If 1.12.0 is wrong, update both the templates (in `packages/winget/`) AND any inline references in this phase's job.
- `microsoft/winget-pkgs` requires forking + PR (cannot push directly); `wingetcreate` handles the fork + commit + PR creation
- Push via `WINGET_FORK_TOKEN` PAT secret (write access to the user's fork of `microsoft/winget-pkgs`)
- Three YAML manifests: version, installer, locale
- Single SHA256 consumed: `sha256_windows`

**Bootstrap details:**
- The very first submission to `microsoft/winget-pkgs` is a manual PR (preferred per Microsoft) — provides an opportunity for human review of metadata
- After the package is in the index, `wingetcreate update` automates subsequent version bumps
- Phase 25 codebase ships the CI for the automated path; the manual one-time PR is documented in `docs/RELEASING.md`

</domain>

<decisions>
## Locked decisions
- Use `microsoft/winget-create` CLI (`wingetcreate`) — official Microsoft tool, handles fork+PR automation
- Job runs on `windows-latest` (wingetcreate is .NET; runs natively on Windows runners)
- WINGET_FORK_TOKEN PAT must have access to the user's fork of `microsoft/winget-pkgs`
- Use `wingetcreate update sandwichfarm.nsyte --version $VERSION --urls "...nsyte-windows-$VERSION.exe" --token $TOKEN --submit` style invocation

### Claude's Discretion
- Exact `wingetcreate` flags
- ManifestVersion verification approach (curl the schema repo, parse latest version) — this is critical given WR-02
- Conditional skip if `wingetcreate` reports the package isn't in the index yet (graceful degradation: warn and exit 0 vs fail)

</decisions>

<code_context>
- `packages/winget/sandwichfarm.nsyte.{version,installer,locale.en-US}.yaml` — Phase 20 templates (ManifestVersion 1.12.0, unverified per WR-02)
- `.github/workflows/publish-packages.yml` `publish-winget` stub — Phase 21 scaffold

</code_context>

<specifics>
- The job runs `wingetcreate update` against the live `microsoft/winget-pkgs` index, not against the local templates. The Phase 20 templates are reference material for the bootstrap PR.
- Verification step: before running `wingetcreate update`, fetch `https://raw.githubusercontent.com/microsoft/winget-pkgs/master/doc/manifest/schema/installer.1.x.x.json` to confirm current ManifestVersion. If different from 1.12.0, log a warning (this is what WR-02 will be resolved by). For the automated path, this is informational since `wingetcreate` handles ManifestVersion itself.

</specifics>

<deferred>
- Bootstrap PR automation — explicitly NOT in scope; manual PR is the right path for first submission
- Direct manifest commits without `wingetcreate` — defer; not the standard pattern

</deferred>
