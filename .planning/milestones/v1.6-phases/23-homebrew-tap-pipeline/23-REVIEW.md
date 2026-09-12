---
phase: 23-homebrew-tap-pipeline
reviewed: 2026-05-05T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - .github/workflows/publish-packages.yml
  - docs/RELEASING.md
findings:
  critical: 1
  warning: 1
  info: 2
  total: 4
status: clean
---

# Phase 23: Code Review Report

**Reviewed:** 2026-05-05
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the `publish-homebrew` job in the publish workflow and the new Homebrew sections
in RELEASING.md. The Homebrew job itself is structurally sound: `HOMEBREW_TAP_TOKEN` is
only accessed via `env:` blocks, `timeout-minutes: 10` is present, placeholder sanity check
is in place, and the `git diff --cached --quiet` idempotency guard is present before commit.

One critical script-injection pattern exists in the three sibling stub jobs
(`publish-scoop`, `publish-winget`, `publish-nix`) — these jobs directly interpolate
`${{ needs.setup.outputs.version }}` inside `run:` shell scripts, violating the
`env:`-only rule for job outputs in run blocks. While version values are computed (not
raw user input), this pattern normalises the dangerous form and would be exploitable if
the version value ever contained shell metacharacters. One token-exposure warning exists
for the clone URL construction. Two info-level items cover stub job timeouts and a
macOS-incompatible tool reference in docs.

---

## Critical Issues

### CR-01: Script injection — `${{ }}` expression directly in `run:` blocks (three stub jobs)

**File:** `.github/workflows/publish-packages.yml:231`, `:242`, `:254`

**Issue:** The `publish-scoop`, `publish-winget`, and `publish-nix` stub jobs interpolate
`${{ needs.setup.outputs.version }}` directly inside the `run:` shell script body:

```yaml
# publish-scoop (line 231), publish-winget (line 242), publish-nix (line 254)
run: |
  echo "Version available: ${{ needs.setup.outputs.version }}"
```

GitHub Actions expands `${{ }}` expressions before the shell sees the script. If
`needs.setup.outputs.version` ever contains shell metacharacters (e.g., because a
release tag was manually crafted as `1.0.0"; malicious_cmd #`), those characters are
injected directly into the shell command string and executed. The `publish-homebrew`
and `publish-aur` jobs correctly use `env:` to pass the value and then reference the
env var (`${VERSION}`) in the shell script — this form is never injectable because the
shell treats the env var as data, not code.

These are currently stubs that exit 0, but this pattern will persist into the real
implementations in phases 24–26 unless it is corrected now.

**Fix:** Move the expression into an `env:` block and reference the env var in the
shell script body, mirroring the pattern already used in `publish-homebrew`:

```yaml
  publish-scoop:
    name: Publish to Scoop
    needs: [setup]
    if: needs.setup.result == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: TODO — phase 24 will replace this stub
        env:
          VERSION: ${{ needs.setup.outputs.version }}
        run: |
          echo "TODO: phase 24 will implement Scoop publish here."
          echo "Version available: ${VERSION}"
          echo "Stub exiting 0 — workflow scaffold validation only."
```

Apply the same fix to `publish-winget` (line 242) and `publish-nix` (line 254).

---

## Warnings

### WR-01: `HOMEBREW_TAP_TOKEN` embedded in git clone URL — potential log exposure

**File:** `.github/workflows/publish-packages.yml:186`

**Issue:** The token is passed directly in the authenticated clone URL:

```bash
git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/sandwichfarm/homebrew-nsyte.git" /tmp/tap
```

GitHub Actions masks secrets by value in log output, but the masking only applies to
the raw secret string. A URL that embeds the token may appear in git's own diagnostic
output (e.g., error messages, verbose git logging) in a form the masker does not
recognise. The full command line is also visible in the process table on the runner
for the duration of the clone. The `publish-aur` sibling job avoids this entirely by
using SSH keys instead of embedded credentials.

**Fix:** Configure git credentials via `git config credential.helper` so the token is
never embedded in a URL that git might echo. A minimal safe pattern:

```bash
git clone "https://github.com/sandwichfarm/homebrew-nsyte.git" /tmp/tap
git -C /tmp/tap remote set-url origin \
  "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/sandwichfarm/homebrew-nsyte.git"
```

The initial clone URL contains no secret. The push remote is set with the token, but
git only transmits this URL on push — it is not echoed to stdout in normal operation.
Alternatively, use `git config --global credential.helper store` with a `.netrc`-style
approach to keep the token entirely out of URLs.

---

## Info

### IN-01: Stub jobs missing `timeout-minutes`

**File:** `.github/workflows/publish-packages.yml:222`, `:234`, `:246`

**Issue:** `publish-scoop`, `publish-winget`, and `publish-nix` do not declare
`timeout-minutes`. GitHub Actions defaults to 360 minutes (6 hours). If a future
implementation of any stub hangs (network wait, interactive prompt, etc.), it will
consume a runner slot for up to 6 hours before GitHub cancels it.

**Fix:** Add `timeout-minutes: 10` (matching `publish-aur` and `publish-homebrew`)
to each stub job definition:

```yaml
  publish-scoop:
    name: Publish to Scoop
    needs: [setup]
    if: needs.setup.result == 'success'
    runs-on: ubuntu-latest
    timeout-minutes: 10   # add this line
```

### IN-02: `sha256sum` in BREW-04 local verify recipe is macOS-incompatible

**File:** `docs/RELEASING.md:292-294`

**Issue:** The BREW-04 local verification recipe uses `sha256sum` to compute hashes:

```bash
SHA256_MACOS_ARM64=$(curl -fsSL "..." | sha256sum | awk '{print $1}')
SHA256_MACOS_X64=$(curl -fsSL "..." | sha256sum | awk '{print $1}')
SHA256_LINUX_X64=$(curl -fsSL "..." | sha256sum | awk '{print $1}')
```

`sha256sum` is a GNU coreutils tool. macOS ships `shasum` instead; `sha256sum` is not
available unless the user has installed GNU coreutils via Homebrew. Because this section
is specifically about verifying a Homebrew formula and its primary audience is macOS
maintainers, most readers will hit `command not found: sha256sum`.

**Fix:** Use a portable form that works on both macOS and Linux:

```bash
hash_file() { shasum -a 256 "$@" 2>/dev/null || sha256sum "$@"; }
SHA256_MACOS_ARM64=$(curl -fsSL "..." | hash_file | awk '{print $1}')
```

Or simply note the macOS equivalent inline:

```
# macOS: use `shasum -a 256` in place of `sha256sum`
```

---

_Reviewed: 2026-05-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
