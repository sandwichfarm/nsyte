# Phase 24: Scoop Bucket Pipeline - Research

**Researched:** 2026-05-05
**Domain:** GitHub Actions CI, Scoop bucket manifest publishing
**Confidence:** HIGH

## Summary

Phase 24 replaces the stub `publish-scoop` job in `.github/workflows/publish-packages.yml` with a real clone-edit-push pipeline that mirrors the already-complete `publish-homebrew` job exactly. The template manifest at `packages/scoop/bucket/nsyte.json` has two placeholders: `PLACEHOLDER_VERSION` (appears twice — in `version` field and embedded in the `url` field) and `PLACEHOLDER_SHA256_WINDOWS` (in the `hash` field). The setup job already exports `sha256_windows` as a named output. The implementation is structurally identical to `publish-homebrew` with the following substitutions: repo URL, secret name, manifest path, and sed targets.

**Primary recommendation:** Copy `publish-homebrew` verbatim; swap in Scoop-specific values (repo, secret, path, sed patterns). Add a `SCOOP_BUCKET_TOKEN` prerequisite section to `docs/RELEASING.md` in the style of the `HOMEBREW_TAP_TOKEN` section.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hand-rolled clone-edit-push pattern (consistent with Phase 22 and 23)
- HTTPS push with `SCOOP_BUCKET_TOKEN` PAT
- Commit message: `nsyte {VERSION}`
- ubuntu-latest runner
- sed substitutions for two placeholders: `PLACEHOLDER_VERSION`, `PLACEHOLDER_SHA256_WINDOWS`
- `jq empty` post-substitution JSON validation (cheap check)
- Manifest at `bucket/nsyte.json` in scoop-nsyte repo

### Claude's Discretion
- `jq`-based JSON edits vs `sed` edits — for Scoop's small JSON (< 30 lines), `sed` is simpler and avoids `jq` install. Use `sed`.
- Whether to validate JSON via `jq empty` after substitution (cheap and worthwhile) — include it.

### Deferred Ideas (OUT OF SCOPE)
- Scoop manifest validation tools (community linters)
- SHA256 sidecar publishing in release.yml
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCOOP-02 | CI auto-updates the Scoop manifest with URL and SHA256 on release | sed substitutions verified against actual placeholder strings in nsyte.json |
| SCOOP-03 | SCOOP_BUCKET_TOKEN configured; publish-scoop CI job pushes on release | HTTPS PAT push pattern verified in publish-homebrew; secret name documented in RELEASING.md |
| SCOOP-04 | Maintainer can verify the manifest locally | Local verification recipe parallel to BREW-04 section in RELEASING.md |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest patching | CI runner (ubuntu-latest) | — | sed runs on the runner's filesystem against a cloned copy |
| JSON validation | CI runner (ubuntu-latest) | — | `jq empty` is a post-substitution guard, not a deploy step |
| Bucket repo write | GitHub (sandwichfarm/scoop-nsyte) | — | CI pushes via HTTPS PAT; bucket repo is the authoritative store |
| SHA256 source | setup job output | — | `sha256_windows` already computed and passed as `needs.setup.outputs.sha256_windows` |

## Verified Placeholder Strings

[VERIFIED: read packages/scoop/bucket/nsyte.json]

The manifest contains exactly two distinct placeholder tokens:

| Token | Occurrences | Fields |
|-------|-------------|--------|
| `PLACEHOLDER_VERSION` | 2 | `version` value (line 2); embedded in `url` value (line 6) |
| `PLACEHOLDER_SHA256_WINDOWS` | 1 | `hash` value (line 7) |

The `autoupdate` block (lines 13-18) uses Scoop's `$version` variable syntax — no placeholders there, no substitution needed.

## sed Commands

[VERIFIED: derived from actual placeholder strings in nsyte.json]

```bash
sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"                   /tmp/scoop/bucket/nsyte.json
sed -i "s|PLACEHOLDER_SHA256_WINDOWS|${SHA256_WINDOWS}|g"     /tmp/scoop/bucket/nsyte.json
```

Use `|` as the sed delimiter (consistent with `publish-homebrew` in the existing workflow) to avoid issues if the URL contains `/`.

The `PLACEHOLDER_VERSION` substitution uses `/g` — it replaces both the `version` field value and the occurrence embedded in the `url` field in a single pass.

## Placeholder Sanity Check (post-sed)

```bash
if grep -q "PLACEHOLDER_" /tmp/scoop/bucket/nsyte.json; then
  echo "::error::Manifest still contains PLACEHOLDER_ markers after substitution."
  grep "PLACEHOLDER_" /tmp/scoop/bucket/nsyte.json
  exit 1
fi
```

This is the same pattern used in `publish-aur` and `publish-homebrew`. [VERIFIED: publish-packages.yml lines 134-138, 203-207]

## JSON Validation Command

```bash
jq empty /tmp/scoop/bucket/nsyte.json
```

`jq empty` parses the file and exits non-zero on malformed JSON with no output on success. `jq` is pre-installed on `ubuntu-latest` GitHub-hosted runners. [ASSUMED: jq availability on ubuntu-latest — standard assumption for GitHub-hosted runners; jq has been on ubuntu-latest since 2018]

## Setup Job Output Key

[VERIFIED: publish-packages.yml lines 29-30, 95]

The setup job exposes `sha256_windows` as a named output:

```yaml
outputs:
  sha256_windows: ${{ steps.checksums.outputs.sha256_windows }}
```

Consumed in the publish-scoop job as:

```yaml
SHA256_WINDOWS: ${{ needs.setup.outputs.sha256_windows }}
```

## Complete publish-scoop Job (ready for planner)

[VERIFIED: derived from publish-homebrew job at lines 172-221 with Scoop-specific substitutions]

```yaml
publish-scoop:
  name: Publish to Scoop
  needs: [setup]
  if: needs.setup.result == 'success'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - name: Checkout nsyte repo (for manifest template)
      uses: actions/checkout@v4

    - name: Clone Scoop bucket repo
      env:
        SCOOP_BUCKET_TOKEN: ${{ secrets.SCOOP_BUCKET_TOKEN }}
      run: |
        git clone "https://github.com/sandwichfarm/scoop-nsyte.git" /tmp/scoop
        git -C /tmp/scoop remote set-url origin "https://x-access-token:${SCOOP_BUCKET_TOKEN}@github.com/sandwichfarm/scoop-nsyte.git"

    - name: Patch manifest from template
      env:
        VERSION: ${{ needs.setup.outputs.version }}
        SHA256_WINDOWS: ${{ needs.setup.outputs.sha256_windows }}
      run: |
        mkdir -p /tmp/scoop/bucket
        cp packages/scoop/bucket/nsyte.json /tmp/scoop/bucket/nsyte.json
        sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"              /tmp/scoop/bucket/nsyte.json
        sed -i "s|PLACEHOLDER_SHA256_WINDOWS|${SHA256_WINDOWS}|g" /tmp/scoop/bucket/nsyte.json
        # Sanity: fail fast if any placeholder survived substitution
        if grep -q "PLACEHOLDER_" /tmp/scoop/bucket/nsyte.json; then
          echo "::error::Manifest still contains PLACEHOLDER_ markers after substitution."
          grep "PLACEHOLDER_" /tmp/scoop/bucket/nsyte.json
          exit 1
        fi
        # JSON validation
        jq empty /tmp/scoop/bucket/nsyte.json

    - name: Commit and push to bucket repo
      env:
        VERSION: ${{ needs.setup.outputs.version }}
      run: |
        git -C /tmp/scoop config user.name "nsyte-bot"
        git -C /tmp/scoop config user.email "nsyte-bot@users.noreply.github.com"
        git -C /tmp/scoop add bucket/nsyte.json
        if git -C /tmp/scoop diff --cached --quiet; then
          echo "No changes to bucket/nsyte.json — bucket already up to date for v${VERSION}. Skipping push."
          exit 0
        fi
        git -C /tmp/scoop commit -m "nsyte ${VERSION}"
        git -C /tmp/scoop push origin main
```

## RELEASING.md Section Structure for SCOOP_BUCKET_TOKEN

[VERIFIED: RELEASING.md HOMEBREW_TAP_TOKEN section at lines 207-335 — mirror this structure exactly]

The new section should be inserted after the `## Verifying the Homebrew formula locally (BREW-04)` section (after line 325) and before `## Related files`.

Section headings and structure to mirror:

1. `## SCOOP_BUCKET_TOKEN prerequisite` — why required, failure symptom
2. `## Creating the SCOOP_BUCKET_TOKEN PAT (fine-grained, preferred)` — GitHub PAT setup steps, repository access scoped to `sandwichfarm/scoop-nsyte`, Contents: Read and write
3. `## Adding SCOOP_BUCKET_TOKEN to repository secrets` — GitHub UI steps + `gh secret list` verification
4. `## Bootstrapping the Scoop bucket (one-time)` — create `sandwichfarm/scoop-nsyte` as a public repo, note that Scoop bucket repos do NOT require a `scoop-` prefix (unlike Homebrew's `homebrew-` requirement), note `scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte` as the end-user add command
5. `## Verifying the Scoop manifest locally (SCOOP-04)` — local verification recipe (see below)

## Local Verification Recipe (SCOOP-04)

```bash
# Pick a real published version that has a Windows .exe on the GitHub release page
VERSION="1.5.0"  # replace with a real published version

# Compute SHA256 of the published Windows binary
SHA256_WINDOWS=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-windows-${VERSION}.exe" | sha256sum | awk '{print $1}')

# Patch a working copy (same logic as CI)
mkdir -p /tmp/scoop-test/bucket
cp packages/scoop/bucket/nsyte.json /tmp/scoop-test/bucket/nsyte.json
sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"              /tmp/scoop-test/bucket/nsyte.json
sed -i "s|PLACEHOLDER_SHA256_WINDOWS|${SHA256_WINDOWS}|g" /tmp/scoop-test/bucket/nsyte.json

# Sanity check: no PLACEHOLDER markers should remain
grep "PLACEHOLDER_" /tmp/scoop-test/bucket/nsyte.json && { echo "substitution failed"; exit 1; }

# JSON validation
jq empty /tmp/scoop-test/bucket/nsyte.json && echo "JSON is valid"

# End-user functional check (after a real CI push to the bucket):
# scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte
# scoop install nsyte
# nsyte --version
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA256 computation | custom script | setup job output `sha256_windows` | Already computed and exported |
| JSON editing | jq pipeline | sed + `jq empty` guard | Manifest is small; sed is simpler; jq validates the result |
| HTTPS auth | git credential helper | PAT in remote URL | Same pattern as publish-homebrew; already proven |

## Common Pitfalls

### Pitfall 1: PLACEHOLDER_VERSION appears twice
**What goes wrong:** A substitution command that uses a non-global flag (no `g`) replaces only the first occurrence, leaving `url` containing `PLACEHOLDER_VERSION`.
**Why it happens:** The `url` field embeds the version token inline: `vPLACEHOLDER_VERSION/nsyte-windows-PLACEHOLDER_VERSION.exe`.
**How to avoid:** Use `s|PLACEHOLDER_VERSION|${VERSION}|g` (global flag). The placeholder sanity check will catch any miss.
**Warning signs:** `grep "PLACEHOLDER_" /tmp/scoop/bucket/nsyte.json` exits non-zero after substitution.

### Pitfall 2: scoop-nsyte repo does not exist at clone time
**What goes wrong:** `git clone` fails with `repository not found`; entire job fails.
**Why it happens:** One-time bootstrap (create the GitHub repo) must precede the first CI run.
**How to avoid:** Bootstrap step in RELEASING.md; planner should include a one-time task to create the repo.
**Warning signs:** Job fails at "Clone Scoop bucket repo" step with HTTP 404.

### Pitfall 3: Wrong branch name on push
**What goes wrong:** `git push origin main` fails if the bucket repo was initialized with `master` as default branch.
**Why it happens:** GitHub now defaults to `main` but older or manually created repos may use `master`.
**How to avoid:** When creating the bucket repo, ensure default branch is `main` (GitHub's current default). Document this in the bootstrap instructions.
**Warning signs:** `push origin main` errors with `src refspec main does not match any`.

### Pitfall 4: `bucket/` subdir not created in empty repo clone
**What goes wrong:** `cp packages/scoop/bucket/nsyte.json /tmp/scoop/bucket/nsyte.json` fails if `bucket/` does not exist in the cloned repo.
**Why it happens:** A freshly initialized repo with only a README has no `bucket/` directory.
**How to avoid:** `mkdir -p /tmp/scoop/bucket` before the `cp` step (already included in the job template above, mirroring `mkdir -p /tmp/tap/Formula` in publish-homebrew).
**Warning signs:** `cp: cannot create regular file '/tmp/scoop/bucket/nsyte.json': No such file or directory`.

## Structural Diff: publish-homebrew vs publish-scoop

| Element | publish-homebrew | publish-scoop |
|---------|-----------------|---------------|
| Clone URL | `sandwichfarm/homebrew-nsyte.git` | `sandwichfarm/scoop-nsyte.git` |
| Clone dir | `/tmp/tap` | `/tmp/scoop` |
| Secret name | `HOMEBREW_TAP_TOKEN` | `SCOOP_BUCKET_TOKEN` |
| Template source | `packages/homebrew/Formula/nsyte.rb` | `packages/scoop/bucket/nsyte.json` |
| Dest path in cloned repo | `Formula/nsyte.rb` | `bucket/nsyte.json` |
| mkdir guard | `mkdir -p /tmp/tap/Formula` | `mkdir -p /tmp/scoop/bucket` |
| `git add` target | `Formula/nsyte.rb` | `bucket/nsyte.json` |
| Placeholders | 4 (VERSION + 3 SHA256s) | 2 (VERSION + SHA256_WINDOWS) |
| SHA256 env vars | 3 (arm64, x64, linux) | 1 (windows) |
| Post-sed validation | grep PLACEHOLDER check | grep PLACEHOLDER check + `jq empty` |

## Environment Availability

Step 2.6: SKIPPED for CI job itself — ubuntu-latest runner provides all tools. For local verification recipe, `jq` and `curl` are standard on Linux maintainer machines.

## Validation Architecture

Step skipped — this phase modifies a GitHub Actions workflow file; functional validation is the CI run itself (no unit test framework applies). SCOOP-04 covers manual local verification.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `jq` is pre-installed on ubuntu-latest GitHub-hosted runners | jq validation command | CI step fails; fix: add `sudo apt-get install -y jq` before the jq call |
| A2 | `sandwichfarm/scoop-nsyte` repo does not yet exist (one-time bootstrap required) | Common Pitfalls | If repo already exists, skip bootstrap; harmless |
| A3 | Default branch in the new bucket repo will be `main` | Pitfall 3 | If `master`, change push target to `master` |

## Sources

### Primary (HIGH confidence)
- `packages/scoop/bucket/nsyte.json` — exact placeholder strings verified by direct read
- `.github/workflows/publish-packages.yml` — setup outputs, publish-homebrew structure, stub location verified by direct read
- `docs/RELEASING.md` — HOMEBREW_TAP_TOKEN section structure verified by direct read

### Secondary (MEDIUM confidence)
- Context7/GitHub Actions docs: `jq` availability on ubuntu-latest [ASSUMED from widespread CI practice]

## Metadata

**Confidence breakdown:**
- Placeholder strings: HIGH — read directly from source file
- sed commands: HIGH — derived from verified placeholder strings
- Job structure: HIGH — copied from verified publish-homebrew job with mechanical substitutions
- RELEASING.md structure: HIGH — mirroring verified existing section
- jq availability on runner: ASSUMED (LOW) — standard but not verified this session

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (workflow file structure stable; placeholder strings stable)
