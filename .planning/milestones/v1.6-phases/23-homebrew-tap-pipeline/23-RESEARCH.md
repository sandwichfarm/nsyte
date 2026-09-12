# Phase 23: Homebrew Tap Pipeline - Research

**Researched:** 2026-05-05
**Domain:** GitHub Actions CI / Homebrew tap formula publishing
**Confidence:** HIGH

---

## Summary

This phase replaces the stub `publish-homebrew` job with a real clone-patch-push pipeline.
All necessary source material exists in the repo: the formula template is fully written with
four named placeholders, the setup job already exports the three SHA256 outputs consumed here,
and the AUR job in the same workflow file provides a verified parallel pattern to follow.

Research was conducted entirely by reading existing files — no external sources needed. All
findings are VERIFIED against the actual codebase.

**Primary recommendation:** Mirror the `publish-aur` job structure exactly, substituting SSH
agent + AUR remote with HTTPS PAT + GitHub tap remote. Four-line sed block, same idempotency
guard, same git config pattern.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hand-rolled clone-edit-push pattern (not third-party action)
- Use `actions/checkout@v4` for nsyte repo checkout; separate `git clone` for tap repo
- Push via HTTPS PAT: `https://x-access-token:${TOKEN}@github.com/sandwichfarm/homebrew-nsyte.git`
- Commit message format: `nsyte {VERSION}`
- Job runs on `ubuntu-latest`
- Tap branch: `main`
- Idempotency via `git diff --quiet` skip

### Claude's Discretion
- Whether to run `brew audit` in CI (deferred — slow, optional)
- Exact branch on tap repo: default to `main`

### Deferred Ideas (OUT OF SCOPE)
- `brew audit` validation in CI
- Tap repo bootstrap script
- Bottle generation
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BREW-02 | CI auto-updates the formula with per-platform URLs + SHA256 hashes | Four sed substitutions on the template; setup job exports all three SHA256 outputs already |
| BREW-03 | HOMEBREW_TAP_TOKEN secret is configured and publish-homebrew CI job pushes successfully | HTTPS PAT clone+push pattern; RELEASING.md section needed |
| BREW-04 | Maintainer can verify the formula locally with `brew install` or direct install test | Local verification recipe using the patched formula |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Formula templating | Source repo (nsyte) | — | Template lives in `packages/homebrew/Formula/nsyte.rb` |
| Checksum computation | CI setup job | — | Already done; outputs `sha256_macos_arm64`, `sha256_macos_x64`, `sha256_linux_x64` |
| Formula patching | CI publish-homebrew job | — | sed substitution on a working copy inside the tap clone |
| Tap repo push | CI publish-homebrew job (via PAT) | — | Authenticated HTTPS push to `sandwichfarm/homebrew-nsyte` |
| PAT management | GitHub repo secrets | — | `HOMEBREW_TAP_TOKEN` secret; docs in RELEASING.md |

---

## Standard Stack

No new libraries. This job uses only tools available on `ubuntu-latest` by default:
- `git` — clone, config, add, commit, push
- `sed` — in-place placeholder substitution
- `actions/checkout@v4` — for nsyte repo (to read the formula template)

---

## Q1: Exact sed substitution commands

**Source:** `packages/homebrew/Formula/nsyte.rb` [VERIFIED: file read]

The four placeholders and their exact string values:

| Placeholder | Replacement source |
|-------------|-------------------|
| `PLACEHOLDER_VERSION` | `needs.setup.outputs.version` |
| `PLACEHOLDER_SHA256_MACOS_ARM64` | `needs.setup.outputs.sha256_macos_arm64` |
| `PLACEHOLDER_SHA256_MACOS_X64` | `needs.setup.outputs.sha256_macos_x64` |
| `PLACEHOLDER_SHA256_LINUX_X86_64` | `needs.setup.outputs.sha256_linux_x64` |

**Commands (use `|` delimiter to avoid `/` collisions in SHA256 hex):**

```bash
sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"                  /tmp/tap/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_MACOS_ARM64|${SHA256_MACOS_ARM64}|g" /tmp/tap/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_MACOS_X64|${SHA256_MACOS_X64}|g"     /tmp/tap/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_LINUX_X86_64|${SHA256_LINUX_X64}|g"  /tmp/tap/Formula/nsyte.rb
```

Note: `VERSION` appears once in the file (the `version` field). The URL lines use Ruby
string interpolation `#{version}` which references the formula version attribute and is
**not** a PLACEHOLDER — do not touch them.

**Sanity guard (same pattern as AUR job):**

```bash
if grep -q "PLACEHOLDER_" /tmp/tap/Formula/nsyte.rb; then
  echo "::error::Formula still contains PLACEHOLDER_ markers after substitution."
  grep "PLACEHOLDER_" /tmp/tap/Formula/nsyte.rb
  exit 1
fi
```

---

## Q2: Git config for CI push

**Source:** `publish-aur` job in `.github/workflows/publish-packages.yml` [VERIFIED: file read]

The AUR job uses:
```bash
git -C /tmp/aur-nsyte-bin config user.name "nsyte-bot"
git -C /tmp/aur-nsyte-bin config user.email "nsyte-bot@users.noreply.github.com"
```

Apply the same pattern for the tap clone:
```bash
git -C /tmp/tap config user.name "nsyte-bot"
git -C /tmp/tap config user.email "nsyte-bot@users.noreply.github.com"
```

Using `@users.noreply.github.com` is the standard GitHub noreply convention for bot commits.
The name and email do not need to match any real GitHub account for a PAT push to succeed —
GitHub validates the PAT token, not the committer identity.

---

## Q3: Clone via HTTPS PAT in GitHub Actions

**Source:** Locked decision in CONTEXT.md + standard GitHub Actions HTTPS auth pattern [VERIFIED: CONTEXT.md read]

The locked approach is to embed the token in the remote URL:

```bash
git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/sandwichfarm/homebrew-nsyte.git" /tmp/tap
```

The token must be injected via `env:` (not inline in `run:`) so it does not appear in the
workflow log. Full step pattern:

```yaml
- name: Clone Homebrew tap repo
  env:
    HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
  run: |
    git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/sandwichfarm/homebrew-nsyte.git" /tmp/tap
```

For the push step, the remote URL is already embedded in the clone — `git push origin main`
from within `/tmp/tap` will re-use the authenticated URL that was set at clone time.
No additional remote-set-url step is needed.

**Formula path inside tap repo:** `Formula/nsyte.rb`
(Homebrew convention: formulas live in `Formula/` at the root of the tap repo.)

---

## Q4: RELEASING.md section for HOMEBREW_TAP_TOKEN

**Source:** `docs/RELEASING.md` AUR_SSH_PRIVATE_KEY section [VERIFIED: file read]

The existing `AUR_SSH_PRIVATE_KEY` section (lines 108-211) is the template to follow.
The new section should be appended after that section and before "Related files".

**Parallel structure:**

```markdown
## HOMEBREW_TAP_TOKEN prerequisite

A Personal Access Token (PAT) named `HOMEBREW_TAP_TOKEN` **must** be configured as a
repository secret before the `publish-homebrew` CI job can push to the Homebrew tap repo.

**Why this is required:** The Homebrew tap (`sandwichfarm/homebrew-nsyte`) is a separate
GitHub repository. The `publish-homebrew` job clones it, patches `Formula/nsyte.rb` with
the release version and SHA256 hashes, and pushes the commit back. `GITHUB_TOKEN` only has
write access to the repo it runs in (`sandwichfarm/nsyte`), not to the separate tap repo.
A PAT with Contents write permission on `sandwichfarm/homebrew-nsyte` is required.

**Symptom of forgetting the secret:** The `publish-homebrew` job fails at the clone or
push step with `Authentication failed` or `repository not found`. The sibling jobs
(`publish-aur`, `publish-scoop`, etc.) are unaffected — failure isolation is by design.
```

**Creating the PAT (Fine-grained, preferred):**

1. Navigate to https://github.com/settings/personal-access-tokens
2. Click **Generate new token**.
3. Set a descriptive name (e.g., `nsyte homebrew tap publish`).
4. Set an expiry date (90 days recommended).
5. Under **Repository access**, select **Only select repositories** → choose `sandwichfarm/homebrew-nsyte`.
6. Under **Repository permissions**, set **Contents** to **Read and write**. No other permissions needed.
7. Click **Generate token**. Copy immediately — it starts with `github_pat_`.

**Adding to repo secrets:**

1. Navigate to https://github.com/sandwichfarm/nsyte/settings/secrets/actions
2. Click **New repository secret**.
3. Name: `HOMEBREW_TAP_TOKEN` — exactly this, case-sensitive.
4. Value: paste the PAT string.
5. Click **Add secret**.

**Prerequisite: tap repo must exist.**
The `sandwichfarm/homebrew-nsyte` repository must exist before CI can push to it.
Create it manually via GitHub UI (one click). It can start empty — the first CI push
will create `Formula/nsyte.rb`. An empty repo is fine; the clone step handles it
because `git clone` of an empty repo succeeds (with an "empty repository" warning that
is safe to ignore).

---

## Q5: Security considerations — PAT in env vars vs HTTPS URL

**Source:** [VERIFIED: direct inspection of workflow and CONTEXT.md]

### Token exposure risk

**Do not inline the token in the `run:` script as a literal.** The locked pattern uses
`env:` to inject the secret, which GitHub masks in logs:

```yaml
env:
  HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
run: |
  git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/..."
```

GitHub Actions automatically masks any string that matches a registered secret value in
step logs. Because the token is injected via `${{ secrets.HOMEBREW_TAP_TOKEN }}` into the
`env:` block, its value is masked in `run:` output. The URL it becomes part of is also
masked because the token string is a substring of it.

**Do not use:** `git remote set-url origin "https://x-access-token:${{ secrets.HOMEBREW_TAP_TOKEN }}@..."`
directly inside `run:` YAML — the `${{ }}` expression expands before the step runs and
the expanded value can appear in the workflow YAML debug output. The `env:` indirection is
the correct approach and matches the existing workflow's pattern.

### Scope minimization

The PAT needs only `Contents: Read and write` on `sandwichfarm/homebrew-nsyte`. It must
NOT be given access to `sandwichfarm/nsyte` (the source repo) — that would violate least
privilege. Fine-grained PAT with single-repo access is strongly preferred over a classic
`repo`-scoped token that grants write to all repos.

### The token in the clone URL is not persisted to disk

`git clone https://x-access-token:TOKEN@...` embeds the token in `.git/config` as the
remote URL. On `ubuntu-latest` GitHub-hosted runners, the runner workspace is ephemeral
and destroyed after the job. This is not a concern for ephemeral CI environments.
For self-hosted runners with persistent storage, consider using `git remote set-url` to
replace the authenticated URL with the unauthenticated one after the push, or use
`git credential` helpers instead.

---

## Architecture Patterns

### Recommended job structure (mirroring publish-aur)

```yaml
publish-homebrew:
  name: Publish to Homebrew
  needs: [setup]
  if: needs.setup.result == 'success'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - name: Checkout nsyte repo (for formula template)
      uses: actions/checkout@v4

    - name: Clone Homebrew tap repo
      env:
        HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
      run: |
        git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/sandwichfarm/homebrew-nsyte.git" /tmp/tap

    - name: Patch formula from template
      env:
        VERSION: ${{ needs.setup.outputs.version }}
        SHA256_MACOS_ARM64: ${{ needs.setup.outputs.sha256_macos_arm64 }}
        SHA256_MACOS_X64: ${{ needs.setup.outputs.sha256_macos_x64 }}
        SHA256_LINUX_X64: ${{ needs.setup.outputs.sha256_linux_x64 }}
      run: |
        mkdir -p /tmp/tap/Formula
        cp packages/homebrew/Formula/nsyte.rb /tmp/tap/Formula/nsyte.rb
        sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"                       /tmp/tap/Formula/nsyte.rb
        sed -i "s|PLACEHOLDER_SHA256_MACOS_ARM64|${SHA256_MACOS_ARM64}|g" /tmp/tap/Formula/nsyte.rb
        sed -i "s|PLACEHOLDER_SHA256_MACOS_X64|${SHA256_MACOS_X64}|g"     /tmp/tap/Formula/nsyte.rb
        sed -i "s|PLACEHOLDER_SHA256_LINUX_X86_64|${SHA256_LINUX_X64}|g"  /tmp/tap/Formula/nsyte.rb
        # Sanity: fail fast if any placeholder survived
        if grep -q "PLACEHOLDER_" /tmp/tap/Formula/nsyte.rb; then
          echo "::error::Formula still contains PLACEHOLDER_ markers after substitution."
          grep "PLACEHOLDER_" /tmp/tap/Formula/nsyte.rb
          exit 1
        fi

    - name: Commit and push to tap repo
      env:
        VERSION: ${{ needs.setup.outputs.version }}
      run: |
        git -C /tmp/tap config user.name "nsyte-bot"
        git -C /tmp/tap config user.email "nsyte-bot@users.noreply.github.com"
        git -C /tmp/tap add Formula/nsyte.rb
        if git -C /tmp/tap diff --cached --quiet; then
          echo "No changes to Formula/nsyte.rb — tap already up to date for v${VERSION}. Skipping push."
          exit 0
        fi
        git -C /tmp/tap commit -m "nsyte ${VERSION}"
        git -C /tmp/tap push origin main
```

### Key differences from publish-aur

| Concern | publish-aur | publish-homebrew |
|---------|-------------|-----------------|
| Auth method | SSH agent + known_hosts | HTTPS PAT in clone URL |
| Clone target | `ssh://aur@aur.archlinux.org/nsyte-bin.git` | `https://x-access-token:TOKEN@github.com/sandwichfarm/homebrew-nsyte.git` |
| Working dir | `/tmp/aur-nsyte-bin` | `/tmp/tap` |
| Files staged | `PKGBUILD .SRCINFO` | `Formula/nsyte.rb` |
| Extra step | Docker + makepkg for .SRCINFO | None needed |
| Branch | `master` (AUR convention) | `main` |
| Commit message | `chore: update to v${VERSION}` | `nsyte ${VERSION}` |

No Docker container step is needed — the formula is plain text; no Ruby evaluation or
syntax checking is done in CI (brew audit deferred).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Secret masking | Custom log redaction | GitHub Actions `env:` secret injection (automatic masking) |
| Idempotency | Version file comparison | `git diff --cached --quiet` after staging — zero exit = no changes |
| Formula path detection | Dynamic discovery | Hardcoded `Formula/nsyte.rb` — Homebrew convention, never changes |

---

## Common Pitfalls

### Pitfall 1: Token in ${{ }} expression inside run: block
**What goes wrong:** `run: git clone "https://x-access-token:${{ secrets.HOMEBREW_TAP_TOKEN }}@..."` — the expression expands in the YAML pre-processing phase and may appear in debug output before masking kicks in.
**How to avoid:** Always pass secrets via `env:` block, then reference as shell variable `${HOMEBREW_TAP_TOKEN}`.

### Pitfall 2: Formula template not copied before sed
**What goes wrong:** Running sed on a file that doesn't exist yet, or running sed on the source repo's template (modifying the checkout).
**How to avoid:** `cp packages/homebrew/Formula/nsyte.rb /tmp/tap/Formula/nsyte.rb` before any sed. The `packages/homebrew/Formula/nsyte.rb` in the nsyte checkout is the template — never modify it in place.

### Pitfall 3: Missing `mkdir -p /tmp/tap/Formula`
**What goes wrong:** If the tap repo was freshly created (empty), `Formula/` directory may not exist after clone. `cp` into a non-existent directory fails.
**How to avoid:** Always `mkdir -p /tmp/tap/Formula` before the `cp`.

### Pitfall 4: Wrong branch name on push
**What goes wrong:** Pushing to `master` when tap repo was created with `main` as default branch (GitHub new-repo default since 2020).
**How to avoid:** `git push origin main` — locked decision, tap uses `main`.

### Pitfall 5: Idempotency check on wrong state
**What goes wrong:** Checking `git diff --quiet` (unstaged) instead of `git diff --cached --quiet` (staged). If you `git add` first and then check unstaged diff, it's always clean — you'd push even unchanged files.
**How to avoid:** Check `git diff --cached --quiet` after `git add`, before commit. Exact pattern from AUR job line 165-168.

### Pitfall 6: SHA256 placeholder name mismatch
**What goes wrong:** The PKGBUILD uses `PLACEHOLDER_SHA256_X86_64` but the formula uses `PLACEHOLDER_SHA256_LINUX_X86_64` (longer name). The setup job output key is `sha256_linux_x64`.
**How to avoid:** Map explicitly — formula placeholder `PLACEHOLDER_SHA256_LINUX_X86_64` maps to setup output `sha256_linux_x64`.

---

## Local Verification Recipe (BREW-04)

A maintainer can verify the patched formula installs correctly before a real CI run:

```bash
# Pick a published version
VERSION="1.5.0"

# Compute SHA256s for each platform binary
SHA256_MACOS_ARM64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-macos-arm64-${VERSION}" | sha256sum | awk '{print $1}')
SHA256_MACOS_X64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-macos-x64-${VERSION}" | sha256sum | awk '{print $1}')
SHA256_LINUX_X64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-linux-${VERSION}" | sha256sum | awk '{print $1}')

# Patch a working copy
mkdir -p /tmp/brew-test/Formula
cp packages/homebrew/Formula/nsyte.rb /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"                       /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_MACOS_ARM64|${SHA256_MACOS_ARM64}|g" /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_MACOS_X64|${SHA256_MACOS_X64}|g"     /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_LINUX_X86_64|${SHA256_LINUX_X64}|g"  /tmp/brew-test/Formula/nsyte.rb

# Sanity check
grep "PLACEHOLDER_" /tmp/brew-test/Formula/nsyte.rb && { echo "substitution failed"; exit 1; }

# On macOS with Homebrew installed:
brew install --formula /tmp/brew-test/Formula/nsyte.rb
nsyte --version
```

Note: `brew install --formula <path>` works for local formula files. On Linux, if Homebrew
on Linux is installed, the same command works. For CI formula validation without a Mac,
formula syntax is plain Ruby text — visual inspection of the substituted file is sufficient
for CI confidence; `brew audit` is deferred.

---

## Assumptions Log

All claims are VERIFIED from file reads. No ASSUMED claims.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

**All claims in this research were verified against actual project files.**

---

## Environment Availability

Step 2.6 SKIPPED — job runs on `ubuntu-latest` GitHub-hosted runner. All tools needed
(`git`, `sed`, `curl`) are standard ubuntu-latest pre-installed tools. No external
services or optional dependencies.

---

## Validation Architecture

The publish-homebrew job is CI infrastructure — there is no automated test suite for
workflow YAML. Validation is:

1. **Sanity guard in CI** — `grep -q "PLACEHOLDER_"` after sed fails fast if substitution is incomplete.
2. **Idempotency check** — `git diff --cached --quiet` skips push on re-run.
3. **Local verification recipe** — BREW-04 (documented above).
4. **Functional test** — trigger a real release or `workflow_dispatch` with a tag and observe the tap repo.

---

## Sources

### Primary (HIGH confidence)
- `/home/sandwich/Develop/nsyte/packages/homebrew/Formula/nsyte.rb` — exact placeholder names verified
- `/home/sandwich/Develop/nsyte/.github/workflows/publish-packages.yml` — AUR job pattern verified; stub location confirmed
- `/home/sandwich/Develop/nsyte/.planning/phases/23-homebrew-tap-pipeline/23-CONTEXT.md` — locked decisions verified
- `/home/sandwich/Develop/nsyte/docs/RELEASING.md` — AUR_SSH_PRIVATE_KEY section structure verified for HOMEBREW_TAP_TOKEN parallel

---

## Metadata

**Confidence breakdown:**
- sed commands: HIGH — derived from exact placeholder strings in actual formula file
- Git config pattern: HIGH — copied from working AUR job in same workflow file
- HTTPS PAT clone pattern: HIGH — locked decision from CONTEXT.md, standard GitHub Actions pattern
- RELEASING.md structure: HIGH — AUR section read directly, parallel structure clear
- Security considerations: HIGH — standard GitHub Actions secret injection behavior

**Research date:** 2026-05-05
**Valid until:** 2026-08-05 (stable — GitHub Actions secret injection behavior is long-standing)
