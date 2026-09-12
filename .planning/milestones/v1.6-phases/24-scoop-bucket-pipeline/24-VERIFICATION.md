---
phase: 24-scoop-bucket-pipeline
verified: 2026-05-05T00:00:00Z
status: human_needed
score: 9/9 automated checks verified
overrides_applied: 0
human_verification:
  - test: "Trigger publish-packages.yml via workflow_dispatch with a real or test tag after SCOOP_BUCKET_TOKEN is registered. Confirm the publish-scoop job runs to completion and the scoop-nsyte bucket repo receives a new commit with correct version and hash."
    expected: "publish-scoop job green; sandwichfarm/scoop-nsyte bucket/nsyte.json contains real version string (no PLACEHOLDER_ markers) and correct SHA256 for the Windows binary."
    why_human: "CI job pushes to an external GitHub repository (sandwichfarm/scoop-nsyte). Cannot verify the bucket repo exists, that SCOOP_BUCKET_TOKEN is registered, or that the push succeeds without running the workflow against a live release."
  - test: "Run the local verify recipe from RELEASING.md (SCOOP-04 section) against a published release version."
    expected: "jq . prints the patched manifest with no PLACEHOLDER_ strings; url and hash fields contain real values; JSON is valid."
    why_human: "Requires downloading a real Windows binary from a published GitHub release to compute SHA256. Cannot be done in a static codebase check."
---

# Phase 24: Scoop Bucket Pipeline Verification Report

**Phase Goal:** The `sandwichfarm/scoop-nsyte` bucket is live and the manifest is automatically updated on every release with the correct URL and hash via the `publish-scoop` CI job.

**Verified:** 2026-05-05T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | publish-scoop CI job is a real implementation, not a stub | VERIFIED | Lines 223-270 of publish-packages.yml contain a complete clone → patch → validate → commit → push pipeline. No TODO/stub markers in the scoop job. |
| 2 | Two sed substitutions target exact placeholder names in nsyte.json | VERIFIED | Line 247: `s\|PLACEHOLDER_VERSION\|${VERSION}\|g` — matches `PLACEHOLDER_VERSION` (3 occurrences in nsyte.json: version field + 2 in url field; `/g` flag handles all). Line 248: `s\|PLACEHOLDER_SHA256_WINDOWS\|${SHA256_WINDOWS}\|g` — matches `PLACEHOLDER_SHA256_WINDOWS` in hash field. |
| 3 | PLACEHOLDER_ fail-fast check is present | VERIFIED | Lines 250-254: `if grep -q "PLACEHOLDER_" ...; then ... exit 1; fi` — exits 1 if any marker survives substitution. |
| 4 | jq empty JSON validation is present | VERIFIED | Line 256: `jq empty /tmp/scoop/bucket/nsyte.json` — validates JSON syntax after patching. |
| 5 | Idempotency guard (git diff --cached --quiet) is present | VERIFIED | Lines 265-269: `if git -C /tmp/scoop diff --cached --quiet; then echo "...already up to date..."; exit 0; fi` — skips push when manifest is unchanged. |
| 6 | No `${{ }}` expressions appear directly inside run: blocks | VERIFIED | All 25 `${{ }}` occurrences in the file are confined to `env:`, `outputs:`, and `with:` keys. Shell bodies use environment variables (`${VERSION}`, `${SHA256_WINDOWS}`, etc.) exclusively. YAML valid per `python3 -c "import yaml; yaml.safe_load(...)"`. |
| 7 | Credential helper used; token not embedded in clone URL | VERIFIED | Line 237: clone URL is plain `https://github.com/sandwichfarm/scoop-nsyte.git`. Line 238: `git -C /tmp/scoop config credential.helper '!f() { echo "username=x-access-token"; echo "password=${SCOOP_BUCKET_TOKEN}"; }; f'` — token injected via helper, never in URL. |
| 8 | RELEASING.md covers all required Scoop runbook sections | VERIFIED | All six required sections present: (a) prerequisite explanation (line 329), (b) PAT creation with fine-grained and classic options (lines 347-360), (c) secret registration steps (lines 362-378), (d) rotation runbook with symptom (lines 381-389), (e) bootstrap steps for scoop-nsyte repo (lines 393-420), (f) local verify recipe SCOOP-04 with jq validation (lines 427-468). |
| 9 | YAML structurally valid | VERIFIED | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish-packages.yml'))"` exits 0. |

**Score:** 9/9 automated checks verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/publish-packages.yml` | publish-scoop job with real implementation | VERIFIED | Lines 223-270: complete pipeline, no stub markers |
| `packages/scoop/bucket/nsyte.json` | Manifest template with PLACEHOLDER_ markers | VERIFIED | PLACEHOLDER_VERSION (×3: version + 2 in url), PLACEHOLDER_SHA256_WINDOWS (×1 in hash) |
| `docs/RELEASING.md` | Scoop runbook with all required sections | VERIFIED | All 6 sections present (lines 329-468) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| publish-scoop job (env: SHA256_WINDOWS) | needs.setup.outputs.sha256_windows | `${{ needs.setup.outputs.sha256_windows }}` in env: block | VERIFIED | Line 243 wires checksum output from setup job into the scoop patch step |
| publish-scoop job (env: VERSION) | needs.setup.outputs.version | `${{ needs.setup.outputs.version }}` in env: block | VERIFIED | Line 242 wires version into the scoop patch step |
| sed substitution PLACEHOLDER_VERSION | nsyte.json version + url fields | `/g` flag in sed | VERIFIED | `PLACEHOLDER_VERSION` appears 3× in nsyte.json; single `sed -i .../g` replaces all |
| SCOOP_BUCKET_TOKEN secret | git push authentication | credential.helper shell function | VERIFIED | Token flows from `${{ secrets.SCOOP_BUCKET_TOKEN }}` → env → credential helper → git push |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase produces a CI workflow and documentation, not a data-rendering component.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| YAML parses without error | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish-packages.yml'))"` | Exit 0 | PASS |
| nsyte.json is valid JSON | `python3 -c "import json; json.load(open('packages/scoop/bucket/nsyte.json'))"` | Exit 0 (file contains valid JSON with PLACEHOLDER_ strings as string values) | PASS |
| No `${{ }}` in run: shell bodies | raw line scan | 0 violations | PASS |
| Placeholder names in JSON match sed targets | grep PLACEHOLDER nsyte.json vs grep sed workflow | PLACEHOLDER_VERSION and PLACEHOLDER_SHA256_WINDOWS match exactly | PASS |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| SCOOP-02 | CI auto-updates Scoop manifest with URL and SHA256 on release | SATISFIED | publish-scoop job: cp template → sed PLACEHOLDER_VERSION → sed PLACEHOLDER_SHA256_WINDOWS → jq validate → git commit → git push |
| SCOOP-03 | SCOOP_BUCKET_TOKEN configured; publish-scoop CI job pushes on release | SATISFIED (code side) | Workflow consumes `secrets.SCOOP_BUCKET_TOKEN` via credential helper. Actual secret registration and live push require human verification. |
| SCOOP-04 | Maintainer can verify the manifest locally | SATISFIED | RELEASING.md lines 427-468 provide a complete local recipe: curl SHA256, sed patch, PLACEHOLDER check, jq validate, jq pretty-print. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.github/workflows/publish-packages.yml` | 279 | `TODO — phase 25 will replace this stub` | Info | publish-winget job is an explicit stub, but this is intentional (out of scope for phase 24). Does not affect publish-scoop. |
| `.github/workflows/publish-packages.yml` | 293 | `TODO — phase 26 will replace this stub` | Info | publish-nix job is an explicit stub, intentional (phase 26). Does not affect publish-scoop. |

No blockers or warnings in the publish-scoop job or its dependencies.

---

### Human Verification Required

#### 1. Live CI Push to Scoop Bucket

**Test:** Register `SCOOP_BUCKET_TOKEN` as a repository secret on `sandwichfarm/nsyte`, then trigger `publish-packages.yml` via `workflow_dispatch` with a real tag (e.g., `v1.5.0` or the next release tag).

**Expected:** The `publish-scoop` job completes green. The `sandwichfarm/scoop-nsyte` bucket repository receives a new commit with `bucket/nsyte.json` containing the correct version string (no `PLACEHOLDER_` markers), the correct Windows binary download URL, and the correct SHA256 hash. Running `scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte && scoop install nsyte && nsyte --version` on a Windows machine prints the correct version.

**Why human:** Requires: (a) the `sandwichfarm/scoop-nsyte` repo to exist on GitHub, (b) `SCOOP_BUCKET_TOKEN` secret to be registered, (c) a published GitHub release with a Windows binary asset. None of these can be verified from the local codebase.

#### 2. Local Manifest Verification (SCOOP-04 Recipe)

**Test:** On a Linux machine with `jq` and `curl`, run the SCOOP-04 recipe from `docs/RELEASING.md` against a published release version. Commands: compute SHA256 of the Windows binary, copy and patch the template, check for PLACEHOLDER_ markers, run `jq empty`, run `jq .`.

**Expected:** `jq .` prints the manifest cleanly. `version`, `url`, and `hash` fields contain real values (no `PLACEHOLDER_` strings). `jq empty` exits 0.

**Why human:** Requires downloading from a live GitHub release URL to compute a real SHA256. The local template contains placeholder strings by design — the recipe can only be fully verified against a real published binary.

---

### Gaps Summary

No automated gaps found. All 9 programmatic checks pass. The publish-scoop job is a complete, non-stub implementation with correct placeholder alignment, fail-fast guards, JSON validation, idempotency protection, proper credential hygiene, and comprehensive runbook documentation.

The two human verification items are environmental prerequisites (live GitHub repos, registered secrets, published release assets) that cannot be confirmed statically. They should be exercised before or immediately after the next release.

---

_Verified: 2026-05-05T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
