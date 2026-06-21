# Phase 22: AUR Pipeline - Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 2
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.github/workflows/publish-packages.yml` (`publish-aur` job only) | CI workflow job | request-response (publish event → git push) | `.github/workflows/publish-packages.yml` setup job + `publish-homebrew` stub (same file) | exact — same workflow file, same `needs: [setup]` / `if:` guard pattern |
| `docs/RELEASING.md` | documentation | N/A | `docs/RELEASING.md` itself (append new section) | exact — existing doc, same style |

---

## Pattern Assignments

### `.github/workflows/publish-packages.yml` — `publish-aur` job (CI workflow job, event-driven publish)

**Analog:** The `setup` job (lines 21–89) and the existing `publish-aur` stub (lines 91–101) in the same file.

**Job-level structure pattern** (lines 91–101 — the stub being replaced, and lines 93–95 — the guard pattern used by every sibling job):

```yaml
publish-aur:
  name: Publish to AUR
  needs: [setup]
  if: needs.setup.result == 'success'
  runs-on: ubuntu-latest
  timeout-minutes: 10        # Claude's discretion — add this; not on the stub
  steps:
```

Every sibling publish job (`publish-homebrew`, `publish-scoop`, `publish-winget`, `publish-nix`) uses exactly this pattern at lines 103–108, 115–120, 127–132, 139–144.

**Consuming setup outputs pattern** (how to reference `needs.setup.outputs.*` — established by the `setup` job's `outputs:` block at lines 24–29):

```yaml
# In the step's env: block
env:
  VERSION: ${{ needs.setup.outputs.version }}
  SHA256_X86_64: ${{ needs.setup.outputs.sha256_linux_x64 }}
```

Output names are `version` and `sha256_linux_x64` (confirmed at lines 26–27 of publish-packages.yml).

**Step 1 — Checkout (copy verbatim from any sibling pattern):**

```yaml
- name: Checkout nsyte repo (for PKGBUILD template)
  uses: actions/checkout@v4
```

**Step 2 — SSH agent setup (no existing analog in this repo — use RESEARCH.md Pattern 2):**

```yaml
- name: Set up SSH agent with AUR key
  uses: webfactory/ssh-agent@v0.10.0
  with:
    ssh-private-key: ${{ secrets.AUR_SSH_PRIVATE_KEY }}

- name: Add AUR host to known_hosts
  run: ssh-keyscan aur.archlinux.org >> ~/.ssh/known_hosts
```

**Step 3 — AUR clone (RESEARCH.md Pattern 3):**

```yaml
- name: Clone AUR remote
  run: |
    git clone ssh://aur@aur.archlinux.org/nsyte-bin.git /tmp/aur-nsyte-bin
    # "You appear to have cloned an empty repository." on first run is expected.
```

**Step 4 — PKGBUILD template substitution (RESEARCH.md Pattern 1; placeholder strings verified in `packages/aur/PKGBUILD` lines 4 and 17):**

```yaml
- name: Patch PKGBUILD from template
  env:
    VERSION: ${{ needs.setup.outputs.version }}
    SHA256_X86_64: ${{ needs.setup.outputs.sha256_linux_x64 }}
  run: |
    cp packages/aur/PKGBUILD /tmp/aur-nsyte-bin/PKGBUILD
    sed -i "s/PLACEHOLDER_VERSION/${VERSION}/g"             /tmp/aur-nsyte-bin/PKGBUILD
    sed -i "s/PLACEHOLDER_SHA256_X86_64/${SHA256_X86_64}/g" /tmp/aur-nsyte-bin/PKGBUILD
```

Placeholder strings are `PLACEHOLDER_VERSION` (PKGBUILD line 4) and `PLACEHOLDER_SHA256_X86_64` (PKGBUILD line 17). No regex special characters — literal `s/OLD/NEW/g` is safe.

**Step 5 — makepkg --printsrcinfo in Docker (RESEARCH.md Pattern 4):**

```yaml
- name: Regenerate .SRCINFO in Arch Linux container
  run: |
    docker run --rm \
      -v /tmp/aur-nsyte-bin:/pkg \
      archlinux:base-devel \
      bash -c "
        pacman -Sy --noconfirm 2>/dev/null || true
        useradd -m builder
        chown -R builder /pkg
        cd /pkg
        sudo -u builder makepkg --printsrcinfo > .SRCINFO
      "
```

Critical: `makepkg` refuses root. Non-root user creation is mandatory. `cd /pkg` before the redirect ensures `.SRCINFO` lands in the volume mount. Use `archlinux:base-devel`, NOT `archlinux:latest` (latest is minimal, lacks makepkg).

**Step 6 — Atomic AUR commit and push (RESEARCH.md Pattern 5):**

```yaml
- name: Commit and push to AUR
  env:
    VERSION: ${{ needs.setup.outputs.version }}
  run: |
    git -C /tmp/aur-nsyte-bin config user.name "nsyte-bot"
    git -C /tmp/aur-nsyte-bin config user.email "sandwich.farm@protonmail.com"
    git -C /tmp/aur-nsyte-bin add PKGBUILD .SRCINFO
    git -C /tmp/aur-nsyte-bin commit -m "chore: update to v${VERSION}"
    git -C /tmp/aur-nsyte-bin push origin master
```

Both PKGBUILD and .SRCINFO must be in the same commit — AUR rejects pushes where .SRCINFO is missing or desynced.

---

### `docs/RELEASING.md` — new `AUR_SSH_PRIVATE_KEY` section (documentation, append)

**Analog:** The existing `RELEASE_TOKEN prerequisite` section in `docs/RELEASING.md` lines 7–11 (heading, why-required, symptom). Copy this exact three-part section structure: heading → why required → symptom.

**Section heading pattern** (from RELEASING.md lines 7–8):

```markdown
## AUR_SSH_PRIVATE_KEY prerequisite

A private SSH key named `AUR_SSH_PRIVATE_KEY` **must** be configured as a repository secret before the `publish-aur` CI job can push to the AUR git remote.
```

**Why-required paragraph pattern** (mirror lines 10–11 of RELEASING.md):

Explain: AUR uses SSH key authentication; the key must be registered in the AUR account settings AND the AUR account must have maintainer rights for `nsyte-bin` before CI's first push.

**Symptom paragraph pattern** (mirror lines 13–14 of RELEASING.md):

```markdown
**Symptom of missing secret or unregistered key:** The `publish-aur` job fails with `Permission denied (publickey)` or `remote: You are not allowed to access this repository` at the `Clone AUR remote` step.
```

**Bootstrap steps pattern** (the one-time manual setup; use ordered list like the PAT creation sections in RELEASING.md lines 22–28):

```markdown
## Bootstrap (one-time, before CI can push)

1. Create an AUR account at https://aur.archlinux.org/register/ if not already done.
2. Generate an SSH keypair: `ssh-keygen -t ed25519 -C "nsyte AUR CI"`
3. Register the SSH public key in AUR account settings.
4. Bootstrap the package name by cloning the empty AUR remote from a local machine once (this registers nsyte-bin under the account).
5. Add `AUR_SSH_PRIVATE_KEY` secret to the GitHub repository with the private key content.
```

**Related files section** (mirror lines 109–112 of RELEASING.md):

```markdown
## Related files

- `packages/aur/PKGBUILD` — PKGBUILD template with `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_X86_64`.
- `.github/workflows/publish-packages.yml` — `publish-aur` job reads `AUR_SSH_PRIVATE_KEY` from secrets.
```

---

## Shared Patterns

### `needs: [setup]` guard
**Source:** `.github/workflows/publish-packages.yml` lines 93–95 (and repeated at lines 105–107, 117–119, 129–131, 141–143)
**Apply to:** The `publish-aur` job (only file modified in this phase)

```yaml
needs: [setup]
if: needs.setup.result == 'success'
runs-on: ubuntu-latest
```

### Version and checksum reference via `needs.setup.outputs`
**Source:** `.github/workflows/publish-packages.yml` lines 26–27 (setup job outputs declaration)
**Apply to:** Any step in `publish-aur` that needs the version string or SHA256

Output names to consume:
- `${{ needs.setup.outputs.version }}` — semver without `v` prefix (e.g., `1.6.0`)
- `${{ needs.setup.outputs.sha256_linux_x64 }}` — hex SHA256 string

### `env:` block for multi-use variables
**Source:** `.github/workflows/release.yml` lines 389–390 (env: on a step)
**Apply to:** Steps in `publish-aur` that reference `VERSION` or `SHA256_X86_64` multiple times in a `run:` block

Prefer `env:` at step level over inline `${{ }}` substitution inside `run:` blocks for secret-adjacent values — this keeps shell scripts readable and avoids quoting issues with `${{ }}` inside multiline bash.

### Step naming convention
**Source:** `.github/workflows/publish-packages.yml` (all jobs use imperative capitalized names)
**Apply to:** All steps in `publish-aur`

Pattern: `- name: Verb phrase` (e.g., "Checkout nsyte repo", "Clone AUR remote", "Patch PKGBUILD from template")

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| SSH agent setup via `webfactory/ssh-agent` | CI step | N/A | No existing SSH key injection in any workflow in this repo; use RESEARCH.md Pattern 2 verbatim |
| Docker step for `makepkg --printsrcinfo` | CI step | N/A | No Docker container steps in any existing workflow; use RESEARCH.md Pattern 4 verbatim |

---

## Metadata

**Analog search scope:** `.github/workflows/`, `packages/aur/`, `docs/`
**Files scanned:** 7 workflow files, PKGBUILD template, RELEASING.md
**Pattern extraction date:** 2026-05-05
