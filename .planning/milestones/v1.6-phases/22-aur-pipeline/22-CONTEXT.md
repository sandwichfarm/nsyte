# Phase 22: AUR Pipeline - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (CI infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The AUR `nsyte-bin` package is live and automatically updated on every release via CI with correct per-arch checksums, regenerated `.SRCINFO`, and SSH push to the AUR git remote.

**Scope:**
- Replace the stub `publish-aur` job in `.github/workflows/publish-packages.yml` (created in Phase 21) with real publish logic
- Real logic: clone AUR git remote, run `sed`-substitute on `packages/aur/PKGBUILD` (template from Phase 20), regenerate `.SRCINFO`, commit, push via SSH

**Pre-decided constraints:**
- AUR template lives at `packages/aur/PKGBUILD` (Phase 20 — currently x86_64-only after CR-01 fix; aarch64 deferred)
- AUR remote uses SSH: `ssh://aur@aur.archlinux.org/nsyte-bin.git`
- `RELEASE_TOKEN` (Phase 21) handles the trigger; this phase needs `AUR_SSH_PRIVATE_KEY` for pushing to AUR
- Asset checksums are computed centrally in publish-packages.yml's setup job — this job consumes `${{ needs.setup.outputs.sha256_linux_x64 }}` and `${{ needs.setup.outputs.version }}`

**Asset naming (from release.yml):**
- Linux x86_64: `nsyte-linux-{VERSION}` — versioned URL pattern: `https://github.com/sandwichfarm/nsyte/releases/download/v{VERSION}/nsyte-linux-{VERSION}`

**Bootstrap (one-time, before CI can run):**
- AUR account + SSH key already created OR will be created by user
- `nsyte-bin` package registered on AUR (one-time push from local) OR ships from this CI run
- This phase MUST handle the "first-time" case (CI's first push creates the package)

</domain>

<decisions>
## Implementation Decisions

### Locked decisions
- Use `aurpublish`-style mechanism: clone via `git clone ssh://aur@aur.archlinux.org/nsyte-bin.git`, edit, commit, push
- `.SRCINFO` regenerated via `makepkg --printsrcinfo > .SRCINFO` (requires arch container)
- Run job inside Arch Linux container (`docker run archlinux:latest`) — only environment with `makepkg` and pacman tooling pre-available
- SSH key delivered via secret `AUR_SSH_PRIVATE_KEY`; known_hosts pinned to `aur.archlinux.org`
- Use `actions/checkout@v4` to fetch nsyte repo for templates; separate clone for AUR remote

### Claude's Discretion
- Exact container image tag (`archlinux:latest` vs pinned digest)
- Whether to use `aurpublish` action (3rd party) or hand-rolled script — likely hand-rolled for clarity and to avoid third-party dependency risk
- Commit message format on AUR push (e.g., `chore: update to v{VERSION}` vs `Update to {VERSION}`)
- Job timeout (likely 10 min — clone + sed + push is fast)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/aur/PKGBUILD` — template with `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_X86_64` strings; phase 20 simplified to x86_64-only
- `.github/workflows/publish-packages.yml` — phase 21 scaffold with `publish-aur` stub job; setup job exports `version` and `sha256_linux_x64`
- `docs/RELEASING.md` — phase 21 doc; this phase should add a section about `AUR_SSH_PRIVATE_KEY` secret

### Integration Points
- `.github/workflows/publish-packages.yml` `publish-aur` job — only file modified by this phase
- The job replaces the existing stub with real logic; everything else in publish-packages.yml stays untouched

</code_context>

<specifics>
## Specific Ideas

- Step order: setup ssh-agent → clone aur remote → copy template → sed substitute → makepkg --printsrcinfo → git add+commit+push
- Use `webfactory/ssh-agent` action for SSH key handling (well-maintained, security-reviewed)
- Pin `aur.archlinux.org` host key in known_hosts (fetched via `ssh-keyscan` once and pinned in workflow, OR run `ssh-keyscan` at runtime — runtime is acceptable for AUR)
- Add `AUR_SSH_PRIVATE_KEY` to docs/RELEASING.md secret list

</specifics>

<deferred>
## Deferred Ideas

- aarch64-linux support (deferred; not yet built by release.yml)
- AUR `nsyte` (source package, builds from .ts) — only `nsyte-bin` (prebuilt) ships in this milestone
- AUR commit signing (gpg key) — not standard for AUR `-bin` packages; defer

</deferred>
