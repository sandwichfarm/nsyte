---
phase: 23-homebrew-tap-pipeline
verified: 2026-05-05T00:00:00Z
status: human_needed
score: 8/8 must-haves verified
human_verification:
  - test: "Trigger a real release (or workflow_dispatch with a real published tag) and confirm the publish-homebrew job pushes Formula/nsyte.rb to sandwichfarm/homebrew-nsyte with correct version and SHA256 hashes, then verify brew tap sandwichfarm/nsyte && brew install nsyte && nsyte --version succeeds on macOS."
    expected: "sandwichfarm/homebrew-nsyte contains Formula/nsyte.rb with the release version number and no PLACEHOLDER_ strings; brew install nsyte installs the correct binary and nsyte --version prints the expected version."
    why_human: "Pushing to a separate GitHub repo (sandwichfarm/homebrew-nsyte) requires HOMEBREW_TAP_TOKEN to be configured as a live secret and the tap repo to exist. These are runtime/credentials conditions that cannot be verified by static code inspection."
---

# Phase 23: Homebrew Tap Pipeline Verification Report

**Phase Goal:** The `sandwichfarm/homebrew-nsyte` tap is live and the formula is automatically updated on every release with correct per-platform URLs and SHA256 hashes via the `publish-homebrew` CI job.

**Verified:** 2026-05-05T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | publish-homebrew job is a real implementation, not a stub | VERIFIED | Job contains 4 real steps (checkout, clone-tap, patch-formula, commit-push) with no TODO/echo-stub pattern. Contrast with publish-scoop/winget/nix, which all contain explicit "TODO — phase N will replace this stub" echo-only steps. |
| 2 | Job clones sandwichfarm/homebrew-nsyte via HTTPS | VERIFIED | Line 186: `git clone "https://github.com/sandwichfarm/homebrew-nsyte.git" /tmp/tap`; line 187 re-sets remote URL to token-authenticated form. |
| 3 | All four sed substitutions match exact placeholder names in the template | VERIFIED | Template placeholders: PLACEHOLDER_VERSION, PLACEHOLDER_SHA256_MACOS_ARM64, PLACEHOLDER_SHA256_MACOS_X64, PLACEHOLDER_SHA256_LINUX_X86_64. Workflow sed targets: identical set. One-to-one match confirmed by automated cross-check. |
| 4 | Post-patch sanity check fails the job if any PLACEHOLDER_ survives | VERIFIED | Lines 203–207: `grep -q "PLACEHOLDER_" /tmp/tap/Formula/nsyte.rb` followed by `exit 1` with a `::error::` annotation. |
| 5 | Idempotency guard skips push when formula is already up to date | VERIFIED | Lines 216–218: `if git -C /tmp/tap diff --cached --quiet; then echo "...already up to date..."; exit 0; fi` — re-runs on the same release tag do not create duplicate commits. |
| 6 | No `${{ }}` GitHub expressions inside run: blocks | VERIFIED | Automated YAML parse + scan found zero `${{` occurrences inside any `run:` block. All GitHub expressions appear only in `env:` sections; shell code references them as `${VAR}`. |
| 7 | RELEASING.md covers the full HOMEBREW_TAP_TOKEN lifecycle | VERIFIED | All five required sections present: "HOMEBREW_TAP_TOKEN prerequisite" (line 207), "Creating the HOMEBREW_TAP_TOKEN PAT" (line 225), "Adding HOMEBREW_TAP_TOKEN to repository secrets" (line 240), "Bootstrapping the Homebrew tap (one-time)" (line 258), "Verifying the Homebrew formula locally (BREW-04)" (line 282). |
| 8 | YAML is structurally valid | VERIFIED | `python3 -c "import yaml; yaml.safe_load(open(...))"` returns without error. |

**Score:** 8/8 truths verified

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| BREW-02 | CI auto-updates the formula with per-platform URLs and SHA256 hashes on release | VERIFIED (static) | publish-homebrew job: copies template, substitutes PLACEHOLDER_VERSION + three SHA256 placeholders, post-patch sanity checks no survivors. The four sed targets match the four placeholders in the formula template exactly. |
| BREW-03 | HOMEBREW_TAP_TOKEN secret configured; publish-homebrew job pushes successfully on release | VERIFIED (static) / HUMAN NEEDED (runtime) | Static: HOMEBREW_TAP_TOKEN is referenced correctly in the `env:` block of the clone step and used to rewrite the remote URL for authenticated push. Runtime: whether the secret is actually registered and the tap repo exists requires a live test. |
| BREW-04 | Maintainer can verify the formula locally | VERIFIED | RELEASING.md section "Verifying the Homebrew formula locally (BREW-04)" provides a complete shell recipe: compute SHA256s per platform, patch a working copy with the same sed commands CI uses, sanity-check no placeholders survive, `brew install --formula` the patched file, verify `nsyte --version`. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/publish-packages.yml` (publish-homebrew job) | Real publish logic, not a stub | VERIFIED | 4-step implementation: checkout, clone-tap (HTTPS + PAT), patch-formula (4 sed + sanity check), commit-push (idempotency guard) |
| `packages/homebrew/Formula/nsyte.rb` | Template with PLACEHOLDER_ markers consumed by CI | VERIFIED | Contains exactly 4 PLACEHOLDER_ markers: PLACEHOLDER_VERSION (line 5), PLACEHOLDER_SHA256_MACOS_ARM64 (line 11), PLACEHOLDER_SHA256_MACOS_X64 (line 15), PLACEHOLDER_SHA256_LINUX_X86_64 (line 22) |
| `docs/RELEASING.md` | HOMEBREW_TAP_TOKEN sections | VERIFIED | 5 required sections present; includes PAT creation (fine-grained preferred), secret registration, one-time tap repo bootstrap, and local brew verify recipe |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| publish-homebrew job | packages/homebrew/Formula/nsyte.rb | `cp packages/homebrew/Formula/nsyte.rb /tmp/tap/Formula/nsyte.rb` | VERIFIED | Line 197; template is copied into tap clone before sed patching |
| publish-homebrew job | sandwichfarm/homebrew-nsyte repo | `git push origin main` with HOMEBREW_TAP_TOKEN | VERIFIED (static) | Lines 186–187 clone + re-auth; line 221 push. Runtime connectivity requires live credentials. |
| setup job outputs | publish-homebrew env vars | `needs.setup.outputs.{version,sha256_macos_arm64,sha256_macos_x64,sha256_linux_x64}` | VERIFIED | Lines 190–194: all four values passed through env: to the patch step shell variables |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| publish-packages.yml | 230–235 | `echo "TODO: phase 24 will implement Scoop publish here."` | Info | Expected — publish-scoop is an acknowledged stub for phase 24. No impact on phase 23 goal. |
| publish-packages.yml | 244–250 | `echo "TODO: phase 25 will implement Winget publish here."` | Info | Expected — publish-winget is an acknowledged stub for phase 25. No impact on phase 23 goal. |
| publish-packages.yml | 259–265 | `echo "TODO: phase 26 will implement Nix flake update here."` | Info | Expected — publish-nix is an acknowledged stub for phase 26. No impact on phase 23 goal. |

No anti-patterns found in the publish-homebrew job itself.

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for the publish-homebrew push path — requires live HOMEBREW_TAP_TOKEN credential and the tap repo to exist. Static checks confirmed the shell logic is correct; runtime behavior routed to Human Verification.

The sed substitution logic was spot-checked by cross-referencing placeholder names between the template and the workflow — all four match exactly with no typos.

---

### Human Verification Required

#### 1. End-to-end publish-homebrew push on release

**Test:** Trigger `publish-packages.yml` via `workflow_dispatch` using a real published release tag (e.g., the most recent release), OR publish a new release and let it fire automatically.

**Expected:**
- The `publish-homebrew` job completes green.
- `sandwichfarm/homebrew-nsyte` repository contains `Formula/nsyte.rb` with:
  - `version "X.Y.Z"` (no PLACEHOLDER_VERSION)
  - All three `sha256 "..."` lines populated with 64-character hex strings (no PLACEHOLDER_ text)
- The commit message is `nsyte X.Y.Z` (Homebrew convention).

**Why human:** Requires HOMEBREW_TAP_TOKEN to be registered as a live GitHub secret and the `sandwichfarm/homebrew-nsyte` repo to exist. Both are one-time bootstrap steps that CI cannot self-verify. The push succeeds or fails only at runtime.

**CLI check (after push):**
```bash
# Confirm formula landed in the tap
gh api repos/sandwichfarm/homebrew-nsyte/contents/Formula/nsyte.rb \
  --jq '.content' | base64 -d | grep -E 'version|sha256'
# Should show populated version and three sha256 values, no PLACEHOLDER_ strings
```

#### 2. End-user install via tap (macOS only)

**Test:** On a macOS machine with Homebrew installed:
```bash
brew tap sandwichfarm/nsyte https://github.com/sandwichfarm/homebrew-nsyte
brew install nsyte
nsyte --version
```

**Expected:** `nsyte --version` prints the correct version that was just released.

**Why human:** Requires macOS with Homebrew, a live tap repo that CI has already pushed to, and a real release binary available at the GitHub release URL. Cannot be run in the CI environment or this Linux system.

---

### Gaps Summary

No gaps. All 8 static must-haves are verified. The only outstanding items are runtime/credentials checks that require a real release and human execution.

The implementation is complete and correct by static analysis. The phase goal is achievable once the one-time bootstrap prerequisites are met:
1. `sandwichfarm/homebrew-nsyte` tap repo exists on GitHub (public, initialized with README so `main` branch exists).
2. `HOMEBREW_TAP_TOKEN` PAT secret registered in `sandwichfarm/nsyte` repo settings with Contents write on the tap repo.

Both prerequisites are documented in `docs/RELEASING.md`.

---

_Verified: 2026-05-05T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
