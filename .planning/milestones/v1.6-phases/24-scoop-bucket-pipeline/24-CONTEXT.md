# Phase 24: Scoop Bucket Pipeline - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (CI infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The `sandwichfarm/scoop-nsyte` bucket is live and the manifest is automatically updated on every release with the correct URL and hash, with autoupdate configured as a fallback.

**Scope:**
- Replace the stub `publish-scoop` job in `.github/workflows/publish-packages.yml` with real publish logic
- Real logic: clone `sandwichfarm/scoop-nsyte` bucket repo, sed-substitute `packages/scoop/bucket/nsyte.json` template (Phase 20), commit, push via PAT
- One-time bootstrap: create `sandwichfarm/scoop-nsyte` GitHub repo

**Pre-decided constraints:**
- Scoop template at `packages/scoop/bucket/nsyte.json` — flat JSON schema, has `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_WINDOWS`
- Bucket repo: `github.com/sandwichfarm/scoop-nsyte` (Scoop bucket repo naming convention does NOT require a prefix; the bucket name is what users add: `scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte`)
- Push via `SCOOP_BUCKET_TOKEN` PAT secret
- One SHA256 consumed: `sha256_windows` (from setup job outputs)
- Bucket layout: manifests at root or `bucket/` subdir? Scoop convention: top-level OR `bucket/` — both work. Reuse Phase 20 layout (`bucket/nsyte.json`).

**Asset naming consumed:**
- `version`, `sha256_windows`

**Autoupdate fallback:**
- Phase 20 manifest already has `checkver.github` and `autoupdate.url`/`autoupdate.hash.mode: download` — Scoop's autoupdate runs even if CI is delayed (community contribution model)
- The CI's job is to push the authoritative manifest first; autoupdate is the fallback

</domain>

<decisions>
## Locked decisions
- Hand-rolled clone-edit-push pattern (consistent with Phase 22 and 23)
- HTTPS push with `SCOOP_BUCKET_TOKEN` PAT
- Commit message: `nsyte {VERSION}`
- ubuntu-latest runner

### Claude's Discretion
- `jq`-based JSON edits vs `sed` edits — for Scoop's small JSON (< 30 lines), `sed` is simpler and avoids `jq` install. Use `sed`.
- Whether to validate JSON via `jq empty` after substitution (cheap and worthwhile)

</decisions>

<code_context>
- `packages/scoop/bucket/nsyte.json` — Phase 20 template (flat schema, autoupdate configured)
- `.github/workflows/publish-packages.yml` `publish-scoop` stub — Phase 21 scaffold

</code_context>

<specifics>
- Manifest path inside bucket repo: `bucket/nsyte.json` (matches local layout) OR `nsyte.json` at root. Scoop accepts both. Pick `bucket/nsyte.json` for consistency with template structure.

</specifics>

<deferred>
- Scoop manifest validation tools (community linters) — defer
- SHA256 sidecar publishing in release.yml (would let Scoop autoupdate skip download per WR-05 from Phase 20 review) — defer to future enhancement

</deferred>
