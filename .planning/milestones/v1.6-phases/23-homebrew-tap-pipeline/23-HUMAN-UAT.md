# Phase 23 Human UAT: Homebrew Tap Pipeline

These tests must be run by a human with access to the GitHub secrets and a macOS machine.
They cannot be automated because they require live credentials and the tap repo to exist.

---

## Prerequisites (one-time bootstrap — do these first)

- [ ] `sandwichfarm/homebrew-nsyte` repo exists on GitHub as a **public** repo, initialized with a `README.md` so the `main` branch exists.
- [ ] `HOMEBREW_TAP_TOKEN` PAT is registered as a repository secret in `sandwichfarm/nsyte`. The PAT must have Contents: Read and write on `sandwichfarm/homebrew-nsyte` (not on `sandwichfarm/nsyte`).

Verify both prerequisites:
```bash
gh secret list -R sandwichfarm/nsyte
# HOMEBREW_TAP_TOKEN should appear in the output
gh api repos/sandwichfarm/homebrew-nsyte --jq '.name'
# should print "homebrew-nsyte"
```

---

## UAT-1: CI Push — Formula lands in tap with correct content

**When:** After publishing a release OR after triggering `workflow_dispatch` on `publish-packages.yml` with a real published tag.

**Steps:**

1. Trigger the workflow:
   ```bash
   # Option A: via workflow_dispatch (uses an already-published release tag)
   gh workflow run publish-packages.yml -R sandwichfarm/nsyte \
     -f tag=vX.Y.Z   # replace with a real published tag
   ```
   Or publish a new release and let the `release: published` event fire automatically.

2. Monitor the `publish-homebrew` job:
   ```bash
   gh run list -R sandwichfarm/nsyte --workflow=publish-packages.yml --limit=3
   # Get the run ID, then:
   gh run watch <RUN_ID> -R sandwichfarm/nsyte
   ```

3. Once the job completes green, inspect the formula in the tap:
   ```bash
   gh api repos/sandwichfarm/homebrew-nsyte/contents/Formula/nsyte.rb \
     --jq '.content' | base64 -d
   ```

**Expected:**
- `publish-homebrew` job exits 0 (green).
- `Formula/nsyte.rb` in the tap contains:
  - `version "X.Y.Z"` (the actual release version, no `PLACEHOLDER_VERSION` text)
  - Three `sha256 "..."` lines with 64-character hex strings (no `PLACEHOLDER_` text)
- Commit message in the tap repo is `nsyte X.Y.Z`.

**Idempotency check (optional but recommended):**
Re-run the same `workflow_dispatch` with the same tag. The `publish-homebrew` job should print `No changes to Formula/nsyte.rb — tap already up to date for vX.Y.Z. Skipping push.` and exit 0 without creating a second commit.

---

## UAT-2: Local formula verify (BREW-04) — macOS only

Run this on macOS with Homebrew installed, before or after the CI push.

```bash
VERSION="X.Y.Z"   # replace with a real published version

SHA256_MACOS_ARM64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-macos-arm64-${VERSION}" | shasum -a 256 | awk '{print $1}')
SHA256_MACOS_X64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-macos-x64-${VERSION}" | shasum -a 256 | awk '{print $1}')
SHA256_LINUX_X64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-linux-${VERSION}" | sha256sum | awk '{print $1}')

mkdir -p /tmp/brew-test/Formula
cp packages/homebrew/Formula/nsyte.rb /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"                       /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_MACOS_ARM64|${SHA256_MACOS_ARM64}|g" /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_MACOS_X64|${SHA256_MACOS_X64}|g"     /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_LINUX_X86_64|${SHA256_LINUX_X64}|g"  /tmp/brew-test/Formula/nsyte.rb

grep "PLACEHOLDER_" /tmp/brew-test/Formula/nsyte.rb && { echo "FAIL: placeholder survived"; exit 1; } || echo "PASS: no placeholders"

brew install --formula /tmp/brew-test/Formula/nsyte.rb
nsyte --version
```

**Expected:** `nsyte --version` prints `X.Y.Z`.

---

## UAT-3: End-user tap install — macOS only

This is the install path a real end user would follow.

```bash
brew tap sandwichfarm/nsyte https://github.com/sandwichfarm/homebrew-nsyte
brew install nsyte
nsyte --version
```

**Expected:** `nsyte --version` prints the correct version. No error about missing formula or bad sha256.

---

## Pass/Fail Checklist

| Test | Prerequisite met | Outcome | Notes |
|------|-----------------|---------|-------|
| Bootstrap: tap repo exists | | | |
| Bootstrap: HOMEBREW_TAP_TOKEN secret exists | | | |
| UAT-1: CI job exits green | | | |
| UAT-1: Formula in tap has correct version + sha256s | | | |
| UAT-1: Idempotency — re-run skips push | | | |
| UAT-2: Local brew install from patched formula (macOS) | | | |
| UAT-3: brew tap + brew install from live tap (macOS) | | | |
