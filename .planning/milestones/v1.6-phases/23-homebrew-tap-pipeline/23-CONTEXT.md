# Phase 23: Homebrew Tap Pipeline - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (CI infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The `sandwichfarm/homebrew-nsyte` tap is live and the formula is automatically updated on every release with correct per-platform URLs and SHA256 hashes.

**Scope:**
- Replace the stub `publish-homebrew` job in `.github/workflows/publish-packages.yml` with real publish logic
- Real logic: clone `sandwichfarm/homebrew-nsyte` tap repo, sed-substitute `packages/homebrew/Formula/nsyte.rb` template (Phase 20), commit, push via PAT
- One-time bootstrap: create `sandwichfarm/homebrew-nsyte` GitHub repo (homebrew tap convention)

**Pre-decided constraints:**
- Homebrew template lives at `packages/homebrew/Formula/nsyte.rb` (Phase 20 — has `on_macos`/`on_linux on_intel` blocks; Linux aarch64 errors with odie per CR-02 fix)
- Tap repo: `github.com/sandwichfarm/homebrew-nsyte` (homebrew tap naming convention: `homebrew-<name>`)
- Push via `HOMEBREW_TAP_TOKEN` PAT secret (need write access to the tap repo)
- Three SHA256s consumed: `sha256_macos_arm64`, `sha256_macos_x64`, `sha256_linux_x64` (from setup job outputs)

**Asset naming consumed (from release.yml + Phase 21 setup outputs):**
- `version`, `sha256_macos_arm64`, `sha256_macos_x64`, `sha256_linux_x64`

**Bootstrap (one-time, before CI works):**
- User creates `sandwichfarm/homebrew-nsyte` repo on GitHub (manual)
- User adds an initial `README.md` (so the repo isn't empty — Homebrew taps don't strictly require this but git push needs a target)
- Future enhancement: bootstrap script that initializes the tap repo with README + first formula. Out of scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Locked decisions
- Hand-rolled clone-edit-push pattern (not third-party action — minimizes supply-chain risk)
- Use `actions/checkout@v4` for both nsyte repo (templates) and tap repo (separate clone targeting `sandwichfarm/homebrew-nsyte`)
- Push via `HOMEBREW_TAP_TOKEN` PAT secret on the tap clone (HTTPS push: `https://x-access-token:${TOKEN}@github.com/sandwichfarm/homebrew-nsyte.git`)
- Commit message format: `nsyte {VERSION}` (homebrew convention — short, just the version)
- Job runs on `ubuntu-latest` — no special container needed (Ruby formula is plain text, no formula syntax check needed in CI; brew audit deferred)

### Claude's Discretion
- Whether to run `brew audit Formula/nsyte.rb` in CI (would require installing brew on Ubuntu — slow, optional). Likely defer to manual periodic audits.
- Exact branch on tap repo (`main` or `master`?). Default to `main`.
- Idempotency: skip push if formula is unchanged (e.g., re-run on same release). Detect via `git diff --quiet`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/homebrew/Formula/nsyte.rb` — Phase 20 template; has `PLACEHOLDER_VERSION`, `PLACEHOLDER_SHA256_MACOS_ARM64`, `PLACEHOLDER_SHA256_MACOS_X64`, `PLACEHOLDER_SHA256_LINUX_X86_64`
- `.github/workflows/publish-packages.yml` `publish-homebrew` stub — Phase 21 scaffold; setup job exports the three needed SHA256s
- `docs/RELEASING.md` — extend with HOMEBREW_TAP_TOKEN secret entry

### Integration Points
- `.github/workflows/publish-packages.yml` `publish-homebrew` job — only file modified by this phase

</code_context>

<specifics>
## Specific Ideas

- The first push from CI must succeed even if the tap repo is mostly empty. `git push` to `main` of the tap repo. If the tap repo doesn't exist yet, the push fails with a clear error and the user creates the repo via GitHub UI (1-click).
- Sed substitution: 4 placeholders to replace (`PLACEHOLDER_VERSION` once + 3 SHA256 placeholders). Use `sed -i 's|PLACEHOLDER_VERSION|${VERSION}|g'` etc.
- The formula's path inside the tap repo: `Formula/nsyte.rb` (Homebrew convention).

</specifics>

<deferred>
## Deferred Ideas

- `brew audit` validation in CI — optional, nice-to-have, defer
- Tap repo bootstrap script — manual one-time setup acceptable for v1.6
- Bottle generation — explicitly NOT done (this is a prebuilt-binary formula; bottle :unneeded was added in Phase 20 fix)

</deferred>
