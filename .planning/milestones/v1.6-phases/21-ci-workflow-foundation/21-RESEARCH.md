# Phase 21: CI Workflow Foundation - Research

**Researched:** 2026-05-05
**Domain:** GitHub Actions workflow design — release trigger, job outputs, asset-readiness polling, failure isolation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `RELEASE_TOKEN` PAT for release creation (must be set up by user; workflow assumes it exists)
- `release: published` is the trigger event
- Asset-readiness poll happens once at the start of the workflow (in a setup job), then exports asset URLs/SHAs to manager jobs via outputs
- Each manager job has `needs: [setup]` and `if: needs.setup.result == 'success'` — manager jobs DO NOT depend on each other
- Failure isolation: each manager job runs `continue-on-error: false` for its own steps, but a failed manager job MUST NOT cancel sibling manager jobs (no `fail-fast`)

### Claude's Discretion
- Poll interval: ~10s, timeout ~5 min (typical release upload completes <2 min)
- Asset-readiness check: enumerate expected asset names; query GitHub API; assert all expected names present
- Setup job exports: version (without `v` prefix), per-platform asset URLs, per-platform SHA256s
- Per-manager secret naming: `AUR_SSH_KEY`, `HOMEBREW_TAP_TOKEN`, `SCOOP_BUCKET_TOKEN`, `WINGET_FORK_TOKEN` — consistent `<MANAGER>_<KIND>` prefix

### Deferred Ideas (OUT OF SCOPE)
- Per-manager publish logic — deferred to Phases 22–26
- Modifying release.yml to use `RELEASE_TOKEN` — out of phase scope
- Bottle/sidecar SHA256 publishing (WR-05 from Phase 20 REVIEW.md)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-02 | `.github/workflows/publish-packages.yml` exists with `on: release: types: [published]` trigger and a `workflow_dispatch` input for manual per-manager re-runs | Trigger syntax verified; workflow_dispatch with inputs confirmed |
| INFRA-03 | PAT (`RELEASE_TOKEN`) replaces `GITHUB_TOKEN` in the release creation step of `release.yml` so that `publish-packages.yml` actually fires on release | PAT requirement verified; exact field to change in release.yml identified |
| INFRA-04 | Each manager job includes an asset-readiness poll step that waits until all expected release artifacts are available before downloading them | gh CLI poll pattern documented; timeout/backoff strategy researched |
| INFRA-05 | Manager jobs are independent named jobs (not a shared matrix) so one job failure never cancels others | GitHub Actions job isolation via separate `needs: [setup]` + no cross-job dependency confirmed |
</phase_requirements>

---

## Summary

Phase 21 creates `.github/workflows/publish-packages.yml` — the scaffold that all manager-specific publish jobs (Phases 22–26) will live in. The workflow triggers on `release: published`, runs a `setup` job that polls for asset readiness and computes per-platform SHA256 checksums, then fans out to five independent named manager jobs that each consume the setup outputs.

The central challenge is three-fold: (1) releases created by `GITHUB_TOKEN` silently do not trigger `release: published` in downstream workflows — the fix requires changing `release.yml` to use `RELEASE_TOKEN`; (2) the `release: published` event fires before all binary uploads complete — the setup job must poll until all expected assets are present; (3) manager job failures must not cascade to sibling jobs — achieved by making all manager jobs depend only on the `setup` job with `if: needs.setup.result == 'success'`, never on each other.

SHA256 checksums for all platforms should be computed centrally in the setup job. This is more efficient (one download per platform vs. five repeated downloads), and it means each manager job receives a pre-verified hash it can inject directly into templates. The outputs map holds version, per-platform download URLs, and per-platform hex SHA256 values. The output name contract established here is the API that Phases 22–26 consume.

**Primary recommendation:** Compute all SHA256s in the setup job and export as job outputs. Use `gh release view --json assets --jq` for polling. Use named independent jobs (not matrix). Document the `RELEASE_TOKEN` requirement in a comment block at the top of the file.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Release trigger | GitHub Actions event system | `release.yml` (upstream, uses RELEASE_TOKEN) | `release: published` event is emitted only when PAT is used; GITHUB_TOKEN silently suppresses it |
| Asset-readiness guard | `setup` job in `publish-packages.yml` | GitHub Releases API (via `gh` CLI) | Centralized — all managers consume the result, no duplicated polling |
| SHA256 computation | `setup` job in `publish-packages.yml` | `sha256sum` CLI (Ubuntu runner) | Compute once, share via job outputs — avoids 5x redundant downloads |
| Job outputs contract | `setup` job `outputs:` map | `needs.setup.outputs.*` in each manager job | Typed string outputs, max 1 MB per job — well within limits |
| Manager job isolation | Named jobs with `needs: [setup]` only | `if: needs.setup.result == 'success'` | No cross-manager dependencies means one cannot cancel another |
| PAT documentation | Top-of-file comment in `publish-packages.yml` | `docs/RELEASING.md` (optional) | Inline is always co-located with the code that requires it |

---

## Standard Stack

### Core

| Tool / Feature | Version/Syntax | Purpose | Why Standard |
|----------------|----------------|---------|--------------|
| `on: release: types: [published]` | GitHub Actions syntax | Trigger on non-draft, non-pre-release publishing | `published` fires for both tag-push releases and workflow_dispatch releases once they are visible; does not fire for drafts |
| `on: workflow_dispatch: inputs:` | GitHub Actions syntax | Manual re-run with tag/manager selection | UI-driven emergency re-run without code changes |
| `jobs.<id>.outputs:` map | GitHub Actions syntax | Export version, URLs, SHA256s from setup job | Standard job-to-job data passing; string only, max 1 MB |
| `echo "key=value" >> $GITHUB_OUTPUT` | GitHub Actions runner | Write step output that job-level `outputs:` references | Official current API (replaces deprecated `set-output` command) |
| `needs.<job>.outputs.<key>` | GitHub Actions context | Downstream job reads setup job outputs | Standard context path |
| `if: needs.setup.result == 'success'` | GitHub Actions expression | Guard manager jobs against setup failure | `needs.<id>.result` returns `success`, `failure`, `cancelled`, or `skipped` |
| `gh release view <tag> --json assets --jq` | GitHub CLI (pre-installed on all runners) | Poll asset list until all expected names appear | gh CLI is bundled on GitHub-hosted runners; no install step needed |
| `sha256sum` | Ubuntu runner built-in | Compute hex SHA256 of downloaded binary | Standard Linux tool; produces 64-char lowercase hex — correct format for AUR, Homebrew, Scoop, Winget |
| `RELEASE_TOKEN` (PAT) | Repository secret | Create release that triggers downstream workflows | `GITHUB_TOKEN`-created events do NOT trigger `release: published` in other workflows — PAT is required |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` | Authenticate `gh` CLI for asset polling | Read-only; no release-creation. GITHUB_TOKEN works fine here. |
| `curl -fsSL -o <file> <url>` | Download release asset binary for sha256sum | Simple, no extra auth needed for public repos |
| `jq` | Parse gh JSON output in poll loop | Pre-installed on Ubuntu runners alongside gh CLI |

### No External Actions Required

This phase uses only GitHub's built-in runner tooling (`gh`, `sha256sum`, `curl`, bash). No third-party actions are needed for the foundation workflow.

---

## Architecture Patterns

### System Architecture Diagram

```
[GitHub: tag pushed]
        |
        v
[release.yml] -- uses RELEASE_TOKEN -->  [GitHub Release Created]
                                                |
                                                | (assets uploaded by release.yml)
                                                v
                                    [release: published event]
                                                |
                                                v
                             ┌──────────────────────────────┐
                             │  publish-packages.yml         │
                             │                               │
                             │  ┌─────────────────────────┐ │
                             │  │  setup job               │ │
                             │  │  1. Extract version      │ │
                             │  │  2. Poll assets (gh CLI) │ │
                             │  │  3. Download + sha256sum │ │
                             │  │  4. Export outputs map   │ │
                             │  └───────────┬─────────────┘ │
                             │              │                │
                             │   ┌──────────┴───────────┐   │
                             │   │ (fan-out, parallel)   │   │
                             │   v     v    v    v    v  │   │
                             │  aur  brew scoop winget nix   │
                             │  (stubs in Phase 21)      │   │
                             └──────────────────────────────┘
```

### Recommended Project Structure

```
.github/
├── workflows/
│   ├── release.yml          # existing — needs RELEASE_TOKEN swap (INFRA-03, one-line change)
│   └── publish-packages.yml # NEW — this phase creates this file
```

No new directories. No composite actions. Single workflow file only.

---

### Pattern 1: Setup Job with Outputs Map

**What:** A single `setup` job polls for asset readiness, downloads binaries, computes SHA256s, and exports everything as named job outputs. Manager jobs consume via `needs.setup.outputs.*`.

**When to use:** Any workflow where multiple parallel jobs need a shared computed value (version, checksum) that varies per run.

**Why outputs map over upload-artifact:** Job outputs are synchronous strings — no download step required in manager jobs. `actions/upload-artifact` is designed for files, not scalars. For 5 string values × 4 platforms = 20 values, outputs map is the right tool. [VERIFIED: docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/passing-information-between-jobs]

```yaml
# Source: GitHub Docs — Passing information between jobs
jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      version:             ${{ steps.extract.outputs.version }}
      url_linux_x64:       ${{ steps.assets.outputs.url_linux_x64 }}
      sha256_linux_x64:    ${{ steps.checksums.outputs.sha256_linux_x64 }}
      sha256_macos_arm64:  ${{ steps.checksums.outputs.sha256_macos_arm64 }}
      sha256_macos_x64:    ${{ steps.checksums.outputs.sha256_macos_x64 }}
      sha256_windows:      ${{ steps.checksums.outputs.sha256_windows }}
    steps:
      - id: extract
        run: |
          TAG="${{ github.event.release.tag_name || github.event.inputs.tag }}"
          VERSION="${TAG#v}"
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"

      - id: poll
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TAG="${{ github.event.release.tag_name || github.event.inputs.tag }}"
          EXPECTED="nsyte-linux-${VERSION} nsyte-macos-arm64-${VERSION} nsyte-macos-x64-${VERSION} nsyte-windows-${VERSION}.exe"
          TIMEOUT=300  # 5 minutes
          INTERVAL=15
          ELAPSED=0
          while [ $ELAPSED -lt $TIMEOUT ]; do
            NAMES=$(gh release view "$TAG" --json assets --jq '.assets[].name' 2>/dev/null || echo "")
            ALL_PRESENT=true
            for expected_name in $EXPECTED; do
              if ! echo "$NAMES" | grep -qF "$expected_name"; then
                ALL_PRESENT=false
                break
              fi
            done
            if [ "$ALL_PRESENT" = "true" ]; then
              echo "All expected assets present."
              break
            fi
            echo "Assets not yet complete (${ELAPSED}s elapsed). Waiting ${INTERVAL}s..."
            sleep $INTERVAL
            ELAPSED=$((ELAPSED + INTERVAL))
          done
          if [ "$ALL_PRESENT" != "true" ]; then
            echo "::error::Release assets not available after ${TIMEOUT}s. Aborting."
            exit 1
          fi

      - id: checksums
        run: |
          VERSION="${{ steps.extract.outputs.version }}"
          BASE="https://github.com/${{ github.repository }}/releases/download/v${VERSION}"
          curl -fsSL -o nsyte-linux    "${BASE}/nsyte-linux-${VERSION}"
          curl -fsSL -o nsyte-macos-arm64 "${BASE}/nsyte-macos-arm64-${VERSION}"
          curl -fsSL -o nsyte-macos-x64   "${BASE}/nsyte-macos-x64-${VERSION}"
          curl -fsSL -o nsyte-windows.exe "${BASE}/nsyte-windows-${VERSION}.exe"
          echo "sha256_linux_x64=$(sha256sum nsyte-linux | awk '{print $1}')"          >> "$GITHUB_OUTPUT"
          echo "sha256_macos_arm64=$(sha256sum nsyte-macos-arm64 | awk '{print $1}')"  >> "$GITHUB_OUTPUT"
          echo "sha256_macos_x64=$(sha256sum nsyte-macos-x64 | awk '{print $1}')"      >> "$GITHUB_OUTPUT"
          echo "sha256_windows=$(sha256sum nsyte-windows.exe | awk '{print $1}')"      >> "$GITHUB_OUTPUT"
```

---

### Pattern 2: Independent Manager Job with Guarded Execution

**What:** Each manager job declares `needs: [setup]` and a job-level `if:` that checks `needs.setup.result == 'success'`. Jobs do NOT declare dependencies on each other.

**Why this ensures isolation:**
- GitHub's default job-skip behavior: if a job in `needs` fails or is skipped, all jobs that need it are skipped **unless** a conditional expression causes the job to continue.
- Since `aur`, `homebrew`, `scoop`, `winget`, `nix` each depend ONLY on `setup` (not on each other), a failure in `aur` has zero effect on `homebrew` — they are siblings with a common parent.
- `continue-on-error: false` (the default) is the correct setting at the manager job level — you want the job to be marked as failed so the user knows publishing failed for that manager, but not at the cost of cancelling siblings.

[VERIFIED: docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/using-jobs-in-a-workflow]

```yaml
# Source: GitHub Docs — Using jobs in a workflow
  publish-aur:
    name: Publish to AUR
    needs: [setup]
    if: needs.setup.result == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Stub — AUR publish logic in Phase 22
        run: echo "AUR job placeholder. Version=${{ needs.setup.outputs.version }}"

  publish-homebrew:
    name: Publish to Homebrew
    needs: [setup]
    if: needs.setup.result == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Stub — Homebrew publish logic in Phase 23
        run: echo "Homebrew placeholder. SHA256_MACOS_ARM64=${{ needs.setup.outputs.sha256_macos_arm64 }}"
```

**Key fact:** Because manager jobs do NOT depend on each other, GitHub's scheduler runs them in parallel after `setup` completes. A failure in `publish-aur` does NOT affect `publish-homebrew`, `publish-scoop`, `publish-winget`, or `publish-nix`. [VERIFIED: GitHub Actions docs]

---

### Pattern 3: workflow_dispatch for Emergency Re-runs

**What:** Add `workflow_dispatch` as a second trigger with a `tag` input so a specific release can be re-published to one or all managers without creating a new release.

**When to use:** When a manager job fails on the first publish run, or when a new manager is added and needs to be backfilled for an existing release.

```yaml
# Source: GitHub Docs — Triggering a workflow manually
on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      tag:
        description: "Release tag to publish (e.g. v1.6.0)"
        required: true
        type: string
```

**How version extraction works for both triggers:**
```bash
# In setup job — handles both release event and workflow_dispatch
TAG="${{ github.event.release.tag_name || github.event.inputs.tag }}"
VERSION="${TAG#v}"   # strips leading v
```

**Important:** `github.event.release.tag_name` is available on `release:` trigger. `github.event.inputs.tag` is available on `workflow_dispatch`. The `||` coalesces to whichever is non-empty. [VERIFIED: community discussions confirming github.event.release.tag_name availability]

---

### Pattern 4: PAT Swap in release.yml (INFRA-03)

**What:** Change the `token:` field in the `Create GitHub Release` step from `${{ secrets.GITHUB_TOKEN }}` to `${{ secrets.RELEASE_TOKEN }}`.

**Why required:** GitHub intentionally suppresses events triggered by `GITHUB_TOKEN`-initiated actions to prevent infinite loops. The `release: published` event fired when `GITHUB_TOKEN` creates a release is silently invisible to other workflows — including `publish-packages.yml`. A PAT (classified as a user token, not the special bot token) does NOT have this suppression applied. [VERIFIED: github.blog/engineering/engineering-principles/scripting-with-github-cli and codegenes.net/blog/triggering-a-new-workflow-from-another-workflow/]

**Exact change in release.yml** (line ~440):
```yaml
# BEFORE (broken — publish-packages.yml never fires):
        token: ${{ secrets.GITHUB_TOKEN }}

# AFTER (correct — publish-packages.yml fires on release):
        token: ${{ secrets.RELEASE_TOKEN }}
```

This is a one-line change in `release.yml`. The `softprops/action-gh-release` action uses the `token:` input field (not the `GH_TOKEN` env var).

**Where to document:** Top-of-file comment block in `publish-packages.yml`:
```yaml
# IMPORTANT: This workflow triggers on "release: published".
# GitHub suppresses this event when releases are created with GITHUB_TOKEN.
# release.yml MUST use secrets.RELEASE_TOKEN (a PAT) in its "Create GitHub Release" step
# for this workflow to fire. If publish-packages.yml never runs after a release, check
# that release.yml is not using GITHUB_TOKEN for the softprops/action-gh-release step.
```

---

### Pattern 5: Asset-Readiness Poll Mechanics

**What:** A bash loop that uses `gh release view <tag> --json assets --jq '.assets[].name'` to get the list of uploaded asset names. Loops until all expected names are present OR a timeout is reached.

**Why polling is required:** The `release: published` event is emitted when a release transitions from draft to published. In `release.yml`, the `softprops/action-gh-release` action uploads assets AND publishes atomically — however, GitHub's CDN and asset processing may have a brief delay, and the workflow starts immediately on the published event. Additionally, for the `workflow_dispatch` path, the asset upload may be complete but the workflow needs to verify before downloading. Polling is the correct pattern. [ASSUMED — GitHub doesn't document exact timing; polling is the community-standard defense]

**Expected assets for nsyte** (from confirmed release.yml asset list):
- `nsyte-linux-{VERSION}` (standard Linux x86_64)
- `nsyte-macos-arm64-{VERSION}` (standard macOS Apple Silicon)
- `nsyte-macos-x64-{VERSION}` (standard macOS Intel)
- `nsyte-windows-{VERSION}.exe` (standard Windows x64)

Note: Compressed variants (`-compressed-`) are also uploaded by release.yml. The poll should check for the standard (uncompressed) binaries only, as these are what package managers reference.

**Recommended parameters:**
- Interval: 15 seconds (not 10 — avoids excessive API calls while release.yml is still running)
- Timeout: 300 seconds (5 minutes) — upload of four ~88 MB binaries on GitHub infrastructure typically completes in under 3 minutes
- Failure mode: `exit 1` to fail the setup job, which causes all manager jobs to be skipped (correct behavior — don't publish with wrong assets)

**gh CLI availability:** `gh` is pre-installed on all GitHub-hosted Ubuntu runners. `GH_TOKEN` environment variable authenticates it — `${{ secrets.GITHUB_TOKEN }}` is sufficient for read-only release queries. [VERIFIED: GitHub documentation — gh CLI pre-installed on runners]

---

### Pattern 6: SHA256 Centralized Computation

**Decision: Compute in setup job.** Rationale: Five manager jobs would each independently download four 88 MB binaries = 20 downloads. Centralized: 4 downloads total. Bandwidth is free in GitHub Actions, but compute time is not free when running five parallel 88 MB downloads.

**Hash format requirements per manager:**

| Manager | Phase | Required Format | Tool |
|---------|-------|-----------------|------|
| AUR (PKGBUILD) | 22 | 64-char lowercase hex | `sha256sum` |
| Homebrew | 23 | 64-char lowercase hex | `sha256sum` |
| Scoop | 24 | 64-char lowercase hex | `sha256sum` |
| Winget | 25 | 64-char lowercase hex | `sha256sum` |
| Nix (flake.nix) | 26 | SRI format: `sha256-<base64>=` | `nix hash file` or conversion from hex |

**All four hex-format managers** consume identical output from `sha256sum file | awk '{print $1}'`.

**Nix SRI format** is different — Phase 26 will need to convert hex → SRI. Two options:
1. Setup job exports both hex and SRI (adds complexity to setup, pre-computes for Phase 26).
2. Phase 26 job converts hex → SRI itself using `nix hash convert --hash-algo sha256 --to sri <hex>`.

**Recommendation:** Export hex SHA256 values from setup job. Phase 26 handles the SRI conversion in its own job (one command, no extra dependencies). This keeps the setup job simple and the conversion logic co-located with the Nix job that needs it.

---

### Output Contract (the API Phases 22–26 consume)

This table defines the exact output names the setup job MUST export. Phases 22–26 reference these by name.

| Output Key | Value Type | Example | Consumer |
|------------|-----------|---------|----------|
| `version` | semver string, no `v` prefix | `1.6.0` | All managers |
| `sha256_linux_x64` | 64-char lowercase hex | `abc123...def` | AUR (Phase 22), Homebrew (Phase 23), Nix (Phase 26) |
| `sha256_macos_arm64` | 64-char lowercase hex | `abc123...def` | Homebrew (Phase 23), Nix (Phase 26) |
| `sha256_macos_x64` | 64-char lowercase hex | `abc123...def` | Homebrew (Phase 23), Nix (Phase 26) |
| `sha256_windows` | 64-char lowercase hex | `abc123...def` | Scoop (Phase 24), Winget (Phase 25) |

**Notes:**
- No `url_*` outputs are needed in Phase 21 stubs. Downstream phases construct URLs from `version` using the known pattern `https://github.com/${{ github.repository }}/releases/download/v${VERSION}/nsyte-<platform>-${VERSION}`.
- If future phases need raw URLs (e.g., to pass to an action that takes a URL), they can be added to the outputs map without breaking existing consumers.

---

### Anti-Patterns to Avoid

- **Matrix for manager jobs:** `strategy.matrix` with `fail-fast: true` (default) would cancel all managers when one fails. Even with `fail-fast: false`, matrix jobs run on identical runner images — the semantic meaning (each job is a different manager) is clearer as named jobs. Named jobs also appear with their natural names in the Actions UI.
- **Manager jobs depending on each other:** `needs: [setup, publish-aur]` on the Homebrew job means AUR failure kills Homebrew. Never chain manager jobs.
- **Using `if: always()` on manager jobs:** This makes jobs run even when setup failed, which means they'd run with empty/null outputs and fail mysteriously. `if: needs.setup.result == 'success'` is the correct guard.
- **Polling the GitHub API without `GH_TOKEN`:** Unauthenticated API calls are rate-limited to 60/hour. Always set `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` when using `gh` in a workflow.
- **Using `GITHUB_TOKEN` for release creation in `release.yml`:** Downstream `release: published` workflow never fires. Must use PAT (`RELEASE_TOKEN`).
- **Computing SHA256 in each manager job independently:** 5x redundant 88 MB downloads per release. Centralize in setup job.
- **Hardcoding the `v` prefix in tag extraction:** `TAG="${{ github.event.release.tag_name }}"` returns `v1.6.0`. Strip it: `VERSION="${TAG#v}"`. All template placeholders expect bare semver.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Asset name verification | Custom JSON parser | `gh release view --json assets --jq '.assets[].name'` | gh CLI with jq is pre-installed on all runners |
| SHA256 computation | Custom hash loop | `sha256sum file \| awk '{print $1}'` | POSIX standard, correct output format |
| Binary download | `wget` or custom script | `curl -fsSL -o outfile url` | Standard, `-f` fails on HTTP error, `-L` follows redirects |
| Job output writing | Custom file manipulation | `echo "key=value" >> "$GITHUB_OUTPUT"` | Official GitHub runner API |
| Poll timeout | Time-based math | Simple `$ELAPSED -lt $TIMEOUT` bash counter | No extra tools needed |

---

## Common Pitfalls

### Pitfall 1: GITHUB_TOKEN Release Never Triggers publish-packages.yml
**What goes wrong:** `publish-packages.yml` with `on: release: types: [published]` never runs after a release.
**Why it happens:** GitHub suppresses events generated by `GITHUB_TOKEN` to prevent workflow loops. This applies to `release: published` events too.
**How to avoid:** In `release.yml`, change `token: ${{ secrets.GITHUB_TOKEN }}` to `token: ${{ secrets.RELEASE_TOKEN }}` in the `softprops/action-gh-release` step. Document the requirement in a comment block at the top of `publish-packages.yml`.
**Warning signs:** Workflow never appears in the Actions tab after a release is published.

### Pitfall 2: Asset Poll Starts Before Assets Exist
**What goes wrong:** The poll loop runs `gh release view` on the tag but gets a "release not found" error because the tag itself hasn't been indexed yet, or the release was just created.
**Why it happens:** There's a brief propagation delay between release creation and the API reflecting it.
**How to avoid:** In the poll loop, use `2>/dev/null || echo ""` to suppress errors and treat an empty/missing response as "not yet ready" rather than a hard failure. Only `exit 1` on timeout.

### Pitfall 3: Version with `v` Prefix Passed to Manager Jobs
**What goes wrong:** `version` output is `v1.6.0` instead of `1.6.0`. All template `sed` substitutions in Phases 22–26 produce broken manifests.
**Why it happens:** `github.event.release.tag_name` returns the full tag including `v` prefix.
**How to avoid:** In the setup job, strip the prefix: `VERSION="${TAG#v}"` before writing to `$GITHUB_OUTPUT`.
**Warning signs:** AUR PKGBUILD has `pkgver=v1.6.0`, Scoop manifest has `"version": "v1.6.0"`.

### Pitfall 4: Manager Job Runs With Empty Setup Outputs
**What goes wrong:** If setup fails and a manager job has `if: always()` or no condition, it runs with empty `needs.setup.outputs.*` values and produces broken/empty manifests.
**Why it happens:** Forgetting the `if:` guard on manager jobs.
**How to avoid:** Every manager job MUST have `if: needs.setup.result == 'success'`. This causes the job to be skipped (not failed) when setup fails — which is the correct outcome.

### Pitfall 5: Nix SRI Hash vs Hex SHA256
**What goes wrong:** Phase 26 receives hex SHA256 from setup job outputs but Nix `fetchurl` requires SRI format (`sha256-<base64>=`). Nix build fails with hash format error.
**Why it happens:** `sha256sum` produces hex; Nix uses SRI.
**How to avoid:** Phase 26 job converts: `nix hash convert --hash-algo sha256 --to sri <hex_value>` (or equivalent). Document this expectation in the setup job outputs table. Do NOT change setup job to output SRI — hex is correct for all other managers (AUR, Homebrew, Scoop, Winget).

### Pitfall 6: workflow_dispatch Without `github.event.release.tag_name`
**What goes wrong:** On `workflow_dispatch`, `github.event.release.tag_name` is undefined/empty. Steps that reference it without a fallback produce empty version.
**Why it happens:** `github.event.release` only exists on `release:` events.
**How to avoid:** Use `${{ github.event.release.tag_name || github.event.inputs.tag }}` everywhere the tag is needed. The `||` in GitHub Actions expressions coalesces to the second value when the first is empty or null.

### Pitfall 7: Draft Release Triggers workflow_dispatch But Not release:published
**What goes wrong:** A draft release created via `workflow_dispatch` on `release.yml` (which has a `draft: true` option) does NOT trigger `release: published` — it only fires when a draft is converted to published.
**Why it happens:** GitHub explicitly states "workflows are not triggered for draft releases."
**How to avoid:** Users must convert the draft to a published release in the GitHub UI for `publish-packages.yml` to fire. Document this in the workflow comment header.

---

## Code Examples

### Complete poll loop (production-ready)

```bash
# Source: Pattern derived from gh CLI docs + standard bash timeout idiom
# Set GH_TOKEN env before calling
TAG="v1.6.0"
VERSION="${TAG#v}"
EXPECTED_ASSETS="nsyte-linux-${VERSION} nsyte-macos-arm64-${VERSION} nsyte-macos-x64-${VERSION} nsyte-windows-${VERSION}.exe"
TIMEOUT=300
INTERVAL=15
ELAPSED=0
ALL_PRESENT=false

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  NAMES=$(gh release view "$TAG" --json assets --jq '.assets[].name' 2>/dev/null || echo "")
  ALL_PRESENT=true
  for expected in $EXPECTED_ASSETS; do
    if ! echo "$NAMES" | grep -qF "$expected"; then
      ALL_PRESENT=false
      break
    fi
  done
  if [ "$ALL_PRESENT" = "true" ]; then
    echo "All assets present after ${ELAPSED}s."
    break
  fi
  echo "Assets not yet complete (${ELAPSED}s / ${TIMEOUT}s). Waiting ${INTERVAL}s..."
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ "$ALL_PRESENT" != "true" ]; then
  echo "::error::Assets not available after ${TIMEOUT}s. Manual release.yml re-run may be needed."
  exit 1
fi
```

### Writing multiple outputs from a single step

```bash
# Source: GitHub Docs — Passing information between jobs
# In a step with id: checksums
VERSION="1.6.0"
BASE="https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}"
curl -fsSL -o nsyte-linux    "${BASE}/nsyte-linux-${VERSION}"
curl -fsSL -o nsyte-arm64    "${BASE}/nsyte-macos-arm64-${VERSION}"
curl -fsSL -o nsyte-x64      "${BASE}/nsyte-macos-x64-${VERSION}"
curl -fsSL -o nsyte-win.exe  "${BASE}/nsyte-windows-${VERSION}.exe"
{
  echo "sha256_linux_x64=$(sha256sum nsyte-linux | awk '{print $1}')"
  echo "sha256_macos_arm64=$(sha256sum nsyte-arm64 | awk '{print $1}')"
  echo "sha256_macos_x64=$(sha256sum nsyte-x64 | awk '{print $1}')"
  echo "sha256_windows=$(sha256sum nsyte-win.exe | awk '{print $1}')"
} >> "$GITHUB_OUTPUT"
```

### Consuming outputs in a downstream manager job

```yaml
# Source: GitHub Docs — Passing information between jobs
  publish-aur:
    needs: [setup]
    if: needs.setup.result == 'success'
    runs-on: ubuntu-latest
    env:
      VERSION:          ${{ needs.setup.outputs.version }}
      SHA256_LINUX_X64: ${{ needs.setup.outputs.sha256_linux_x64 }}
    steps:
      - run: |
          echo "Publishing AUR nsyte-bin version ${VERSION}"
          echo "Linux x64 SHA256: ${SHA256_LINUX_X64}"
          # Phase 22 will replace this stub with actual push logic
```

### INFRA-03: Exact one-line change in release.yml

```yaml
# In .github/workflows/release.yml — "Create GitHub Release" step (around line 440)
# Find:
          token: ${{ secrets.GITHUB_TOKEN }}
# Replace with:
          token: ${{ secrets.RELEASE_TOKEN }}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `set-output` command: `echo "::set-output name=key::value"` | `echo "key=value" >> "$GITHUB_OUTPUT"` | 2022 (deprecated, now errors) | Old syntax breaks; must use GITHUB_OUTPUT file |
| `matrix:` for parallel per-target jobs | Named independent jobs for per-manager workflows | N/A — pattern choice | Named jobs: better UI labels, no fail-fast surprise, semantic clarity |
| `strategy.fail-fast: false` on matrix | `needs: [setup]` only on each manager (no cross-deps) | N/A — architectural choice | Cross-dep-free is stronger isolation guarantee than fail-fast:false on matrix |

**Deprecated/outdated:**
- `echo "::set-output name=key::value"` — deprecated May 2022, produces error in current runners. Use `echo "key=value" >> "$GITHUB_OUTPUT"` exclusively.
- `actions/create-release` (official) — archived, no longer maintained. `softprops/action-gh-release` is the current standard and is already used in release.yml.

---

## Runtime State Inventory

Step 2.5: SKIPPED — this is a greenfield file-creation phase (new workflow file, one-line change to existing workflow). Not a rename/refactor/migration.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | Asset-readiness poll, release queries | ✓ (pre-installed on GitHub-hosted runners) | bundled | `curl` to GitHub REST API (more verbose) |
| `sha256sum` | SHA256 computation | ✓ (Ubuntu runner built-in) | coreutils | — |
| `curl` | Binary download for checksums | ✓ (Ubuntu runner built-in) | system | — |
| `jq` | JSON parsing in gh jq expressions | ✓ (pre-installed on GitHub-hosted runners) | bundled | — |
| `bash` | Shell for poll loop | ✓ (ubuntu-latest default shell) | system | — |
| `RELEASE_TOKEN` secret | PAT that makes release event fire | MUST be created by user before workflow runs | — | No fallback — workflow silently never fires without it |

**Missing dependencies with no fallback:**
- `RELEASE_TOKEN` repository secret — user must create a PAT with `repo` scope and add it as a repository secret. The plan MUST include a task verifying (or instructing the user to add) this secret. Without it, the entire workflow is unreachable.

---

## Validation Architecture

> workflow.nyquist_validation key is absent from config.json — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno test (deno.json task: `deno task test`) |
| Config file | `deno.test.json` |
| Quick run command | `deno task test:unit` |
| Full suite command | `deno task test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-02 | `publish-packages.yml` exists with correct trigger and workflow_dispatch input | smoke | `test -f .github/workflows/publish-packages.yml && grep -q 'release:' .github/workflows/publish-packages.yml` | ❌ Wave 0 (shell check) |
| INFRA-03 | `release.yml` uses `RELEASE_TOKEN` not `GITHUB_TOKEN` for release creation | smoke | `grep -q 'RELEASE_TOKEN' .github/workflows/release.yml` | ❌ Wave 0 (shell check) |
| INFRA-04 | `publish-packages.yml` contains asset-readiness poll step | smoke | `grep -q 'gh release view' .github/workflows/publish-packages.yml` | ❌ Wave 0 (shell check) |
| INFRA-05 | Five manager job definitions exist, each with `needs: [setup]` only (no cross-deps) | smoke | `grep -c 'needs: \[setup\]' .github/workflows/publish-packages.yml` returns 5 | ❌ Wave 0 (shell check) |

**Note:** These are structural lint checks on the YAML/workflow file. Functional testing (does the workflow actually fire?) requires a real GitHub Actions run with a real release — not automatable locally.

### Sampling Rate
- **Per task commit:** `grep`/`test` checks on the specific lines changed
- **Per wave merge:** All four smoke checks as a group
- **Phase gate:** All smoke checks green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] No new Deno test files needed — validation is shell `grep`/`test` checks on YAML files
- [ ] All checks use only `grep`, `test`, `bash` — universally available, no install needed

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (partial) | Secrets stored as GitHub repository secrets, not hardcoded |
| V5 Input Validation | yes (partial) | `workflow_dispatch` tag input used in shell commands — must be quoted to prevent injection |
| V6 Cryptography | no | — |

### Known Threat Patterns for GitHub Actions + Release Workflows

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret exposure in logs | Information Disclosure | Never `echo` secret values; use `>> $GITHUB_OUTPUT` not env var echo |
| Shell injection via workflow_dispatch input | Tampering | Quote `${{ github.event.inputs.tag }}` in shell — assign to bash variable first, not inline in commands |
| Overprivileged PAT | Elevation of Privilege | `RELEASE_TOKEN` needs only `repo` scope (contents: write). Do not use a token with broader org permissions. |
| Expired/revoked PAT silently failing | Denial of Service | Document that `RELEASE_TOKEN` expiry causes silent workflow non-triggering; set calendar reminder to rotate |

**Shell injection note:** `${{ github.event.inputs.tag }}` is expanded by the GitHub Actions expression parser before the shell runs. If a malicious value is passed, it could break out of the shell command. Always assign to a bash variable first and quote the variable:
```bash
# Safe pattern
TAG="${{ github.event.inputs.tag }}"
gh release view "$TAG" --json assets  # $TAG is quoted, safe
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `release: published` fires AFTER `softprops/action-gh-release` completes its asset uploads (within the same `release.yml` job) — so the 300s poll timeout is generous, not a baseline | Asset-readiness poll mechanics | If assets are uploaded asynchronously after the publish event, poll may need longer timeout; 5 min should cover realistic cases |
| A2 | All four expected platform binaries (linux, macos-arm64, macos-x64, windows) are always uploaded by `release.yml` — no partial uploads | Output Contract | If release.yml changes its asset list, poll will hang until timeout; poll should be updated in sync with release.yml |
| A3 | `gh release view` returns an empty string (not an error exit code) when the release exists but has no assets yet | Poll mechanics | If it exits non-zero on empty assets, the `2>/dev/null || echo ""` fallback handles it, but the all-present check logic must be verified |
| A4 | `sha256sum` output format is always `<hash>  <filename>` (two spaces) — `awk '{print $1}'` correctly isolates the hash | SHA256 computation | SHA256sum on all Ubuntu runner versions uses this format; this is POSIX-standard |
| A5 | The Nix Phase 26 job will handle hex → SRI conversion itself; setup job outputs hex only | Output Contract | If Phase 26 cannot easily convert, the output contract may need a `sha256sri_*` addition |

**If this table is empty:** It is not — see A1–A5 above.

---

## Open Questions

1. **RELEASE_TOKEN secret creation**
   - What we know: The PAT must have `repo` scope (or `contents: write` with fine-grained permissions)
   - What's unclear: Has the user already created this secret? Phase 21 plan should include a verification step or instruction to create it.
   - Recommendation: Plan Wave 0 or task 1 includes "verify `RELEASE_TOKEN` exists in repo secrets" with instructions if missing.

2. **`softprops/action-gh-release@v2` vs `@v1`**
   - What we know: `release.yml` currently uses `softprops/action-gh-release@v2`; the `token:` input field exists in both v1 and v2
   - What's unclear: Whether `@v2` has any behavior difference for the trigger suppression fix
   - Recommendation: The `token:` field change applies equally to v1 and v2 — no version change needed.

3. **Windows asset name convention**
   - What we know: `release.yml` uploads `nsyte-windows-{VERSION}.exe` (confirmed from line 545 of release.yml)
   - What's unclear: Whether future release workflow changes might add/remove assets
   - Recommendation: The poll should check for STANDARD binaries only (not compressed variants) and document that the expected-asset list must be kept in sync with `release.yml`.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: .github/workflows/release.yml] — confirmed asset names, token field location, softprops/action-gh-release@v2 usage
- [VERIFIED: packages/aur/PKGBUILD, packages/homebrew/Formula/nsyte.rb, packages/scoop/bucket/nsyte.json, packages/winget/*.yaml, flake.nix] — confirmed Phase 20 placeholder strings that setup job outputs will patch
- [VERIFIED: docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/passing-information-between-jobs] — job outputs syntax, `>> $GITHUB_OUTPUT`, `needs.<id>.outputs.<key>` pattern
- [VERIFIED: cli.github.com/manual/gh_release_view] — `--json assets`, `--jq '.assets[].name'` syntax
- [VERIFIED: docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/using-jobs-in-a-workflow] — sibling job isolation via independent `needs:` dependencies
- [VERIFIED: codegenes.net/blog/triggering-a-new-workflow-from-another-workflow/] — GITHUB_TOKEN suppresses downstream release events; PAT required

### Secondary (MEDIUM confidence)
- [CITED: docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#release] — `release: published` activity type, draft release suppression behavior
- [CITED: community discussion on needs.*.result values] — `success`, `failure`, `cancelled`, `skipped` return values
- [CITED: github.blog/changelog/2022] — deprecated `set-output` command, replacement with GITHUB_OUTPUT file

### Tertiary (LOW confidence)
- [ASSUMED: A1] — release: published fires after asset upload completes — not explicitly documented in GitHub's release event timing; polling is the defensive pattern

---

## Metadata

**Confidence breakdown:**
- PAT requirement (INFRA-03): HIGH — core GitHub behavior, verified by multiple sources
- Job outputs syntax: HIGH — verified from official docs
- Asset poll mechanics: HIGH — gh CLI flags verified; poll pattern is standard bash
- Job isolation pattern: HIGH — verified from official docs
- Failure mode behavior (needs.result): MEDIUM — behavior confirmed by community discussions, not primary docs
- Release timing (poll timeout): LOW — exact timing not documented; 300s is a conservative estimate

**Research date:** 2026-05-05
**Valid until:** 2026-08-05 (GitHub Actions syntax is stable; gh CLI flags are stable)
