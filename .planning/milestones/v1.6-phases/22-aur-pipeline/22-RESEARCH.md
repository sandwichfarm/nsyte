# Phase 22: AUR Pipeline - Research

**Researched:** 2026-05-05
**Domain:** GitHub Actions AUR publish pipeline — Arch Linux container, SSH key injection, PKGBUILD templating, AUR git push
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `aurpublish`-style mechanism: clone via `git clone ssh://aur@aur.archlinux.org/nsyte-bin.git`, edit, commit, push
- `.SRCINFO` regenerated via `makepkg --printsrcinfo > .SRCINFO` (requires arch container)
- Run job inside Arch Linux container (`docker run archlinux:latest`) — only environment with `makepkg` and pacman tooling pre-available
- SSH key delivered via secret `AUR_SSH_PRIVATE_KEY`; known_hosts pinned to `aur.archlinux.org`
- Use `actions/checkout@v4` to fetch nsyte repo for templates; separate clone for AUR remote
- AUR template: `packages/aur/PKGBUILD` — placeholders `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_X86_64`
- Checksums are consumed from setup job outputs: `${{ needs.setup.outputs.sha256_linux_x64 }}` and `${{ needs.setup.outputs.version }}`
- Only file modified by this phase: `.github/workflows/publish-packages.yml` `publish-aur` job

### Claude's Discretion
- Exact container image tag (`archlinux:latest` vs pinned digest)
- Whether to use `aurpublish` action (3rd party) or hand-rolled script — prefer hand-rolled for clarity
- Commit message format on AUR push (e.g., `chore: update to v{VERSION}` vs `Update to {VERSION}`)
- Job timeout (likely 10 min — clone + sed + push is fast)

### Deferred Ideas (OUT OF SCOPE)
- aarch64-linux support (deferred; not yet built by release.yml)
- AUR `nsyte` (source package, builds from .ts) — only `nsyte-bin` (prebuilt) ships in this milestone
- AUR commit signing (gpg key) — not standard for AUR `-bin` packages
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUR-02 | CI computes per-arch SHA256 checksums from published release assets and patches PKGBUILD before pushing | Checksums already computed by setup job; sed substitution pattern for exact placeholders documented |
| AUR-03 | CI regenerates `.SRCINFO` via `makepkg --printsrcinfo` after patching PKGBUILD and commits both files atomically | makepkg available in archlinux:base-devel container; non-root user requirement and container design documented |
| AUR-04 | `AUR_SSH_PRIVATE_KEY` secret is configured and the `publish-aur` CI job pushes successfully on release | webfactory/ssh-agent v0.10.0 + ssh-keyscan pattern documented; known_hosts strategy decided |
| AUR-05 | Maintainer can verify the AUR package locally with `makepkg -si` in a Docker Arch container before a real release | Docker Arch container invocation and local test instructions documented |
</phase_requirements>

---

## Summary

Phase 22 replaces the stub `publish-aur` job in `.github/workflows/publish-packages.yml` with real publish logic. The job must: set up SSH credentials from the `AUR_SSH_PRIVATE_KEY` secret, clone the AUR git remote `ssh://aur@aur.archlinux.org/nsyte-bin.git` (which emits an "empty repository" warning on first run — this is expected and harmless), copy and sed-substitute the `packages/aur/PKGBUILD` template, run `makepkg --printsrcinfo` to regenerate `.SRCINFO`, then commit and push both files atomically to the AUR remote.

The critical design constraint is that `makepkg` refuses to run as root. The recommended approach is to use `runs-on: ubuntu-latest` with Docker steps rather than a `container:` job — this pattern keeps SSH agent forwarding straightforward and is the approach used by every maintained AUR publish action in the ecosystem (KSXGitHub/github-actions-deploy-aur, archlinux-downgrade/aur-publish-action). Alternatively, the job can run `container: archlinux:base-devel` but must then create a non-root builduser and use `runuser` or `sudo -u` for the `makepkg` step. Either approach produces the same result; the Docker step approach is slightly simpler for SSH key forwarding.

The first-time bootstrap is a non-problem for CI: cloning `ssh://aur@aur.archlinux.org/nsyte-bin.git` when the package does not yet exist returns an empty repository, and the first push creates the package. The only prerequisite is that the AUR account must have `nsyte-bin` registered in its package ownership (or the SSH key must belong to an account that has already registered the package name by cloning the empty AUR repo at least once from a local machine). [ASSUMED] — this one-time step must be done manually before CI's first push can succeed.

**Primary recommendation:** Run `publish-aur` on `runs-on: ubuntu-latest` (not a container job) and use `docker run` for the `makepkg --printsrcinfo` step only. Set up SSH with `webfactory/ssh-agent@v0.10.0` + a `ssh-keyscan` step for `aur.archlinux.org`. Use `sed -i` to substitute placeholders. Hand-roll all git operations — no third-party AUR publish action needed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Checksum computation | CI setup job (already done, Phase 21) | — | Centralized in setup job; publish-aur job only consumes the output |
| PKGBUILD template substitution | CI publish-aur job (runner shell) | — | sed runs on ubuntu-latest runner; no container needed for this step |
| `.SRCINFO` regeneration | Arch Linux container (Docker step) | — | makepkg is only available in Arch Linux environment |
| SSH key management | CI runner (webfactory/ssh-agent) | — | SSH agent socket stays on the runner; git push runs on runner |
| AUR git operations | CI publish-aur job (runner shell) | — | git clone + commit + push run on runner, not inside container |
| AUR package registration (bootstrap) | Human (one-time) | — | AUR account creation and SSH key registration cannot be automated |

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `webfactory/ssh-agent` | v0.10.0 | Load `AUR_SSH_PRIVATE_KEY` into ssh-agent | Industry standard for SSH key injection in Actions; v0.10.0 released 2026-03-11 on Node 24 [VERIFIED: webfactory/ssh-agent GitHub] |
| `actions/checkout` | v4 | Check out nsyte repo for PKGBUILD template | Already used throughout this repo's workflows [VERIFIED: grep on release.yml] |
| `archlinux:base-devel` | latest | Docker image for `makepkg --printsrcinfo` | Smallest official Arch image with base-devel pre-installed; `archlinux:latest` is the base image without build tools — use `base-devel` [ASSUMED] |
| `git` | system (runner) | AUR clone, commit, push | Ubuntu runner has git pre-installed |
| `sed` | system (runner) | Substitute PKGBUILD placeholders | POSIX sed available on ubuntu-latest |
| `ssh-keyscan` | system (runner) | Populate known_hosts for aur.archlinux.org | Pre-installed on ubuntu-latest; acceptable security tradeoff for AUR (not storing secrets) |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `docker` | system (runner) | Run archlinux container for makepkg | Only for the printsrcinfo step |
| `makepkg` | system (container) | Generate `.SRCINFO` | Inside `archlinux:base-devel` container only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled git operations | `KSXGitHub/github-actions-deploy-aur@v4.1.3` | Action handles setup but adds dependency; hand-rolled is fewer moving parts and makes the job transparent |
| `runs-on: ubuntu-latest` + `docker run` | `container: archlinux:base-devel` job | Container job complicates SSH_AUTH_SOCK forwarding; docker run step is simpler for this use case |
| `ssh-keyscan` at runtime | Hard-coded known_hosts key in repo | Runtime keyscan is a minor MITM risk; for AUR (non-secret push) it is the near-universal ecosystem choice |

**Installation:** No new npm/pip packages. All tools are pre-installed on `ubuntu-latest` runners or available via `docker pull archlinux:base-devel`.

---

## Architecture Patterns

### System Architecture Diagram

```
release: published event
         |
         v
    [setup job] (Phase 21 — already exists)
    - polls for asset readiness
    - downloads linux binary, computes sha256
    - outputs: version, sha256_linux_x64
         |
         v
    [publish-aur job]
    runs-on: ubuntu-latest
         |
         +-- Step 1: actions/checkout@v4
         |   (fetches packages/aur/PKGBUILD template)
         |
         +-- Step 2: webfactory/ssh-agent@v0.10.0
         |   (loads AUR_SSH_PRIVATE_KEY into ssh-agent)
         |
         +-- Step 3: ssh-keyscan aur.archlinux.org >> ~/.ssh/known_hosts
         |
         +-- Step 4: git clone ssh://aur@aur.archlinux.org/nsyte-bin.git /tmp/aur-nsyte-bin
         |   (empty repo warning on first run — expected)
         |
         +-- Step 5: cp packages/aur/PKGBUILD /tmp/aur-nsyte-bin/PKGBUILD
         |   sed substitute PLACEHOLDER_VERSION and PLACEHOLDER_SHA256_X86_64
         |
         +-- Step 6: docker run --rm -v /tmp/aur-nsyte-bin:/pkg archlinux:base-devel
         |   sh -c "cd /pkg && useradd -m builder && chown -R builder /pkg
         |           && sudo -u builder makepkg --printsrcinfo > .SRCINFO"
         |   (generates .SRCINFO from patched PKGBUILD)
         |
         +-- Step 7: git -C /tmp/aur-nsyte-bin config user.email / user.name
         |   git -C /tmp/aur-nsyte-bin add PKGBUILD .SRCINFO
         |   git -C /tmp/aur-nsyte-bin commit -m "chore: update to v{VERSION}"
         |   git -C /tmp/aur-nsyte-bin push origin master
         |
         v
    AUR git remote receives PKGBUILD + .SRCINFO
    AUR package page updated within minutes
```

### Recommended Project Structure

No new directories required. This phase only modifies:

```
.github/
└── workflows/
    └── publish-packages.yml    # publish-aur job stub → real implementation
docs/
└── RELEASING.md                # Add AUR_SSH_PRIVATE_KEY section
```

### Pattern 1: PKGBUILD Placeholder Substitution

**What:** Use `sed -i` to replace the exact placeholder strings defined in `packages/aur/PKGBUILD`.
**When to use:** After copying the template to the AUR clone directory, before running `makepkg --printsrcinfo`.

```bash
# Source: packages/aur/PKGBUILD — placeholders are PLACEHOLDER_VERSION and PLACEHOLDER_SHA256_X86_64
VERSION="${{ needs.setup.outputs.version }}"
SHA256="${{ needs.setup.outputs.sha256_linux_x64 }}"
PKGBUILD="/tmp/aur-nsyte-bin/PKGBUILD"

sed -i "s/PLACEHOLDER_VERSION/${VERSION}/g" "$PKGBUILD"
sed -i "s/PLACEHOLDER_SHA256_X86_64/${SHA256}/g" "$PKGBUILD"
```

**Why these exact patterns:** The PKGBUILD uses literal strings `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_X86_64` (confirmed by reading `packages/aur/PKGBUILD`). Simple `s/OLD/NEW/g` substitution is safe because these placeholders contain no regex special characters. [VERIFIED: read packages/aur/PKGBUILD]

### Pattern 2: SSH Setup for AUR Push

**What:** Load SSH key into agent, add AUR host to known_hosts.
**When to use:** Before any `git` command touching the AUR remote.

```yaml
- uses: webfactory/ssh-agent@v0.10.0
  with:
    ssh-private-key: ${{ secrets.AUR_SSH_PRIVATE_KEY }}

- name: Add AUR host key to known_hosts
  run: ssh-keyscan aur.archlinux.org >> ~/.ssh/known_hosts
```

[VERIFIED: webfactory/ssh-agent v0.10.0 documentation — action does NOT auto-populate known_hosts; ssh-keyscan is the standard workaround]

### Pattern 3: AUR Clone (First-Time + Update)

**What:** Clone AUR remote; works whether package exists or not.
**When to use:** Every CI run.

```bash
git clone ssh://aur@aur.archlinux.org/nsyte-bin.git /tmp/aur-nsyte-bin
# WARNING: You appear to have cloned an empty repository.
# ^^^ This warning on first run is expected — git push creates the package.
```

[VERIFIED: AUR submission guidelines — first push to an empty clone creates the AUR package]

### Pattern 4: Docker Step for makepkg --printsrcinfo

**What:** Run `makepkg --printsrcinfo` in an Arch Linux container as a non-root user.
**When to use:** After PKGBUILD is substituted, before git commit.

```bash
docker run --rm \
  -v /tmp/aur-nsyte-bin:/pkg \
  archlinux:base-devel \
  bash -c "
    pacman -Sy --noconfirm 2>/dev/null
    useradd -m builder
    chown -R builder /pkg
    cd /pkg
    sudo -u builder makepkg --printsrcinfo > .SRCINFO
  "
```

**Critical:** `makepkg` refuses to run as root. The non-root user creation inside the container is required. `pacman -Sy` (sync without upgrade) is sufficient for a fresh container because no package downloads are needed — `makepkg --printsrcinfo` does not build, it only parses PKGBUILD metadata. [ASSUMED — pacman sync might not be needed at all for --printsrcinfo; test to confirm]

### Pattern 5: Atomic AUR Commit and Push

**What:** Stage both files and push in a single operation.
**When to use:** After `.SRCINFO` is generated.

```bash
VERSION="${{ needs.setup.outputs.version }}"
git -C /tmp/aur-nsyte-bin config user.name "nsyte-bot"
git -C /tmp/aur-nsyte-bin config user.email "sandwich.farm@protonmail.com"
git -C /tmp/aur-nsyte-bin add PKGBUILD .SRCINFO
git -C /tmp/aur-nsyte-bin commit -m "chore: update to v${VERSION}"
git -C /tmp/aur-nsyte-bin push origin master
```

[CITED: AUR submission guidelines — both PKGBUILD and .SRCINFO must be committed together]

### Anti-Patterns to Avoid

- **Running makepkg as root:** makepkg refuses to run as root. Always create a non-root user in the container or use `--asroot` (not recommended and not needed for `--printsrcinfo`).
- **Using `container:` job-level for SSH:** When a job runs inside a container, `webfactory/ssh-agent` sets `SSH_AUTH_SOCK` on the runner host but the socket path may not be accessible inside the container. Running SSH operations outside the container (on the runner directly) avoids this complication entirely.
- **Relying on array index for checksum assignment:** The PKGBUILD uses named placeholders (`PLACEHOLDER_SHA256_X86_64`), not array positions. The sed substitution correctly uses named replacement — never use array index position to assign checksums.
- **Pushing to AUR before both files are staged:** AUR rejects pushes where `.SRCINFO` is missing or out of sync with PKGBUILD. Always `git add PKGBUILD .SRCINFO` together.
- **Using `archlinux:latest` instead of `archlinux:base-devel`:** `archlinux:latest` is a base image without build tools. `archlinux:base-devel` includes `makepkg`, `base-devel`, and `fakeroot` which are required for `makepkg --printsrcinfo`. [ASSUMED — verify by checking Docker Hub archlinux tags]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSH key injection into CI | Custom key-to-file step | `webfactory/ssh-agent@v0.10.0` | Handles key format differences, PEM vs OpenSSH, multiple keys, cleanup |
| `.SRCINFO` generation | Custom parser of PKGBUILD fields | `makepkg --printsrcinfo` | Only canonical tool; custom parsers miss edge cases in PKGBUILD arrays |
| AUR host key verification | Custom fingerprint check | `ssh-keyscan` with post-verification | ssh-keyscan is the universal pattern; custom fingerprint embedding requires maintenance |

**Key insight:** The only truly non-trivial part of this phase is the makepkg non-root user dance. Everything else (sed, git, ssh) is standard shell. Keep the job as a shell script rather than delegating to a third-party action — the job is simple enough that an action adds overhead without benefit.

---

## Common Pitfalls

### Pitfall 1: makepkg Refuses to Run as Root

**What goes wrong:** `docker run archlinux:base-devel makepkg --printsrcinfo` fails with `ERROR: Running makepkg as root is not allowed as it can cause permanent, catastrophic damage to your system.`
**Why it happens:** makepkg has a hard root check. GitHub Actions containers run as root by default.
**How to avoid:** Create a non-root user inside the container (`useradd -m builder`) and run `sudo -u builder makepkg --printsrcinfo > .SRCINFO`.
**Warning signs:** Exit code 1, error message contains "Running makepkg as root is not allowed".

### Pitfall 2: SSH_AUTH_SOCK Not Available in Container Job

**What goes wrong:** When `container:` is used at the job level and webfactory/ssh-agent runs in that context, git push via SSH fails with `Permission denied (publickey)`.
**Why it happens:** webfactory/ssh-agent sets `SSH_AUTH_SOCK` to a Unix socket path on the runner. When `container:` is used, steps run inside the container but the socket may not be bind-mounted.
**How to avoid:** Keep the job on `runs-on: ubuntu-latest` (no `container:` at job level). Use `docker run` as a step only for `makepkg --printsrcinfo`. All git/ssh operations run directly on the runner.
**Warning signs:** `git push` succeeds locally but fails in CI with publickey error despite correct secret.

### Pitfall 3: AUR Empty Repository Warning Treated as Error

**What goes wrong:** Script treats the "You have cloned an empty repository" warning from `git clone` as a fatal error.
**Why it happens:** Scripts checking `$?` after git clone may see exit 0 but the warning message causes confusion; some scripts pipe stderr to check for errors.
**How to avoid:** Accept exit 0 from `git clone` even with the warning. The first push to an empty AUR clone creates the package — this is the documented first-time bootstrap path.
**Warning signs:** CI fails on `git clone` step with no actual error, only a warning message.

### Pitfall 4: pacman Database Not Updated in Fresh Container

**What goes wrong:** Docker container runs but `makepkg --printsrcinfo` fails due to missing dependencies in the container image.
**Why it happens:** `archlinux:base-devel` has packages installed but the pacman database may be stale in a cached image layer.
**How to avoid:** Run `pacman -Sy --noconfirm` at the start of the container step. Note: `--printsrcinfo` does not install or build anything, so this is a precaution more than a requirement.
**Warning signs:** `error: database file for 'core' does not exist` or package-not-found errors.

### Pitfall 5: `.SRCINFO` Written to Wrong Location

**What goes wrong:** `makepkg --printsrcinfo > .SRCINFO` writes `.SRCINFO` to the container's working directory instead of the mounted volume path.
**Why it happens:** The redirect target is relative to the container's `$CWD` at the time of execution.
**How to avoid:** Explicitly `cd /pkg && sudo -u builder makepkg --printsrcinfo > .SRCINFO` so the output lands in the volume mount that the runner host can read.
**Warning signs:** `git add .SRCINFO` fails with "pathspec .SRCINFO did not match any files".

### Pitfall 6: AUR Account / SSH Key Not Registered Before CI

**What goes wrong:** CI push to `ssh://aur@aur.archlinux.org/nsyte-bin.git` fails with `Permission denied (publickey)` or `remote: You are not allowed to access this repository`.
**Why it happens:** AUR requires the SSH public key to be registered in the account's AUR profile, AND the AUR account must have package maintainer rights for `nsyte-bin`.
**How to avoid:** The AUR account and SSH public key registration is a one-time manual step that MUST be done before CI can push. See bootstrap section in Open Questions.
**Warning signs:** Push fails even though `AUR_SSH_PRIVATE_KEY` secret is correctly set.

---

## Code Examples

### Complete publish-aur Job (Annotated)

```yaml
publish-aur:
  name: Publish to AUR
  needs: [setup]
  if: needs.setup.result == 'success'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - name: Checkout nsyte repo (for PKGBUILD template)
      uses: actions/checkout@v4

    - name: Set up SSH agent with AUR key
      uses: webfactory/ssh-agent@v0.10.0
      with:
        ssh-private-key: ${{ secrets.AUR_SSH_PRIVATE_KEY }}

    - name: Add AUR host to known_hosts
      run: ssh-keyscan aur.archlinux.org >> ~/.ssh/known_hosts

    - name: Clone AUR remote
      run: |
        git clone ssh://aur@aur.archlinux.org/nsyte-bin.git /tmp/aur-nsyte-bin
        # Note: "You appear to have cloned an empty repository" on first run is expected.

    - name: Patch PKGBUILD from template
      env:
        VERSION: ${{ needs.setup.outputs.version }}
        SHA256_X86_64: ${{ needs.setup.outputs.sha256_linux_x64 }}
      run: |
        cp packages/aur/PKGBUILD /tmp/aur-nsyte-bin/PKGBUILD
        sed -i "s/PLACEHOLDER_VERSION/${VERSION}/g"             /tmp/aur-nsyte-bin/PKGBUILD
        sed -i "s/PLACEHOLDER_SHA256_X86_64/${SHA256_X86_64}/g" /tmp/aur-nsyte-bin/PKGBUILD

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

### Local Verification (AUR-05): Docker Arch Container Test

```bash
# Run inside packages/aur/ directory with a real version and sha256 substituted
docker run --rm \
  -v "$(pwd)/packages/aur:/pkg" \
  archlinux:base-devel \
  bash -c "
    pacman -Syu --noconfirm
    useradd -m builder
    chown -R builder /pkg
    cd /pkg
    sudo -u builder makepkg -si --noconfirm
  "
# Note: makepkg -si downloads the binary from GitHub releases.
# Test requires a published release to exist at the URL in the PKGBUILD.
# Use a real VERSION/SHA256 by substituting placeholders first, or test with a real release tag.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `updpkgsums` to regenerate checksums | Pre-computed checksums in setup job, sed-inject | Phase 21 design | No download of release assets inside AUR job; checksums already verified once |
| `aurpublish` wrapper script | Hand-rolled git + docker steps | This phase | Fewer dependencies, fully transparent |
| Running as root with `makepkg --asroot` | Non-root user in container | Arch Linux policy | Required; `--asroot` is deprecated and removed in some versions |

**Deprecated/outdated:**
- `makepkg --asroot`: Removed in newer makepkg versions; always create a non-root user instead.
- `archlinux:latest` for build tasks: Use `archlinux:base-devel` — `latest` does not include `base-devel`.

---

## Bootstrap: One-Time Manual Setup (Before CI Can Push)

This is NOT automated by this phase. The following must be done manually by the maintainer exactly once:

1. **Create AUR account** at https://aur.archlinux.org/register/ if not already done.
2. **Generate SSH keypair** (or reuse an existing one): `ssh-keygen -t ed25519 -C "nsyte AUR CI"`
3. **Register the SSH public key** in AUR account settings: https://aur.archlinux.org/account/<username>/edit
4. **Bootstrap the package name** by cloning the empty AUR remote from a local machine:
   ```bash
   git clone ssh://aur@aur.archlinux.org/nsyte-bin.git
   # warning: You appear to have cloned an empty repository.
   ```
   (This step registers `nsyte-bin` as a package under the AUR account.)
5. **Add `AUR_SSH_PRIVATE_KEY` secret** to GitHub repo settings with the private key content.
6. First CI run will push to the now-registered empty repo and create the live AUR package.

[ASSUMED] — AUR account registration and SSH key association are manual prerequisites; CI cannot self-register.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `archlinux:base-devel` includes makepkg and base-devel tools without requiring pacman install | Standard Stack | If wrong, pacman install step needed in container; add `pacman -S --noconfirm base-devel` to docker run |
| A2 | AUR account + SSH key registration is a one-time human step that must precede CI's first push | Bootstrap section | If wrong (AUR has an API for this), complexity increases significantly; verify against AUR docs |
| A3 | `pacman -Sy` (sync without upgrade) is sufficient inside fresh container for `--printsrcinfo` | Code Examples | If `--printsrcinfo` needs package installs (it shouldn't), full `pacman -Syu` is needed |
| A4 | `makepkg --printsrcinfo` does not download any sources; it only parses PKGBUILD metadata | Architecture | If wrong, source URLs must be accessible from CI and the job needs network to release URLs |

---

## Open Questions (RESOLVED)

1. **AUR account bootstrap state** — RESOLVED
   - What we know: AUR requires the SSH public key in account settings and the package name must be registered
   - What's unclear: Has `nsyte-bin` already been registered on AUR? Has the SSH key already been generated?
   - Resolution: Plan 22-02 documents the full one-time bootstrap procedure for the maintainer (create AUR account, generate SSH keypair, register public key in AUR profile, clone empty AUR remote to register nsyte-bin, add AUR_SSH_PRIVATE_KEY to GitHub repo secrets). This is treated as a manual human prerequisite documented in docs/RELEASING.md.

2. **webfactory/ssh-agent inside container job** — RESOLVED
   - What we know: webfactory/ssh-agent v0.10.0 exports `SSH_AUTH_SOCK` on the runner; the socket may not be accessible inside a container job
   - What's unclear: Whether GitHub Actions now forwards the SSH_AUTH_SOCK socket into `container:` jobs automatically
   - Resolution: Avoided entirely — Plan 22-01 uses `runs-on: ubuntu-latest` (no job-level `container:`) and uses `docker run` only for the `makepkg --printsrcinfo` step. All git/ssh operations run directly on the runner where SSH_AUTH_SOCK is guaranteed available.

3. **Container image tag pinning** — RESOLVED
   - What we know: `archlinux:base-devel` has a `latest` tag; pinned digests exist but churn frequently
   - What's unclear: Whether `archlinux:latest` vs `archlinux:base-devel` is the right tag (CONTEXT.md says `:latest`)
   - Resolution: Use `archlinux:base-devel` (not `:latest`). CONTEXT.md's `:latest` mention was imprecise — `archlinux:latest` is the minimal base image without build tools; `archlinux:base-devel` includes makepkg, fakeroot, and base-devel which are required for `makepkg --printsrcinfo`. The "exact container image tag" is listed under Claude's Discretion in CONTEXT.md, so this deviation is within scope.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| docker | Arch Linux container step | ✓ | 29.4.2 | — |
| git | AUR clone/commit/push | ✓ | system | — |
| sed | PKGBUILD substitution | ✓ | system | awk or perl |
| ssh-keyscan | known_hosts setup | ✓ | system | hardcode known_hosts value |
| makepkg | .SRCINFO generation | available inside container | Arch system tool | KSXGitHub action (Docker-based) |
| AUR_SSH_PRIVATE_KEY secret | SSH push to AUR | NOT YET — must be configured | — | No fallback; required |
| AUR account with nsyte-bin registered | First CI push | NOT YET — must be done manually | — | No fallback; required |

**Missing dependencies with no fallback:**
- `AUR_SSH_PRIVATE_KEY` repository secret — must be added by maintainer before CI push can succeed
- AUR account registration + SSH key upload — one-time manual prerequisite

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

> nyquist_validation key absent from .planning/config.json — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | No automated test framework for GitHub Actions YAML |
| Config file | none |
| Quick run command | `act -j publish-aur --dry-run` (requires `act` installed) or workflow_dispatch on a test tag |
| Full suite command | Manual: trigger `workflow_dispatch` with a real tag, verify AUR page updates |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUR-02 | Checksums patched into PKGBUILD (not hardcoded) | manual-only | Inspect PKGBUILD on AUR after CI run; grep for no PLACEHOLDERs | N/A |
| AUR-03 | `.SRCINFO` regenerated and committed with PKGBUILD atomically | manual-only | Check AUR git log after push — both files in same commit | N/A |
| AUR-04 | SSH push succeeds on release | manual-only | `workflow_dispatch` with test version tag | N/A |
| AUR-05 | `makepkg -si` works in Docker Arch container | manual/local | `docker run archlinux:base-devel ...` (see Code Examples) | N/A |

**Rationale for manual-only:** GitHub Actions YAML cannot be unit-tested without running in CI. The `act` CLI (local Actions runner) exists but requires additional setup. Functional testing requires an actual AUR account and SSH key. All tests for this phase are integration/smoke tests performed manually.

### Wave 0 Gaps
- None — no test files to create; validation is manual/integration

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (AUR SSH key) | SSH keypair via GitHub secret; never committed to repo |
| V3 Session Management | no | CI job is stateless |
| V4 Access Control | no | AUR access controlled by SSH key ownership |
| V5 Input Validation | yes (version, sha256 strings from setup job) | Values come from controlled CI outputs, not user input; validate format before substitution |
| V6 Cryptography | no (existing AUR key; not hand-rolled) | Use standard ed25519 SSH key |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSH private key leakage | Information Disclosure | Store as GitHub encrypted secret; never echo or log |
| PKGBUILD injection via version string | Tampering | Version/sha256 values come from controlled CI setup job outputs; no user-supplied input reaches sed |
| MITM on ssh-keyscan of aur.archlinux.org | Spoofing | Acceptable risk for public AUR (not a secret being sent); verify fingerprint matches published AUR host keys if strict security required |
| Malicious archlinux:base-devel image | Tampering | Docker Hub official image; acceptable risk; could pin digest for additional assurance |

**Published AUR host key fingerprints (from Arch Linux news announcement):**
- Ed25519: `SHA256:RFzBCUItH9LZS0cKB5UE6ceAYhBD5C8GeOBip8Z11+4`
- ECDSA: `SHA256:uTa/0PndEgPZTf76e1DFqXKJEXKsn7m9ivhLQtzGOCI`
- RSA: `SHA256:5s5cIyReIfNNVGRFdDbe3hdYiI5OelHGpw2rOUud3Q8`
[CITED: https://archlinux.org/news/aur-migration-new-ssh-hostkeys/]

---

## Sources

### Primary (HIGH confidence)
- `packages/aur/PKGBUILD` — exact placeholder strings verified by direct read
- `.github/workflows/publish-packages.yml` — exact setup job output names verified by direct read
- webfactory/ssh-agent v0.9.0 README — action API, known_hosts behavior confirmed [CITED: https://github.com/webfactory/ssh-agent/tree/v0.9.0]
- webfactory/ssh-agent v0.10.0 release (2026-03-11) — Node 24 upgrade confirmed [VERIFIED: GitHub releases page]
- Arch Linux AUR SSH host key announcement — ed25519/ecdsa/rsa fingerprints [CITED: https://archlinux.org/news/aur-migration-new-ssh-hostkeys/]

### Secondary (MEDIUM confidence)
- KSXGitHub/github-actions-deploy-aur v4.1.3 — Docker-based approach confirmed; `ssh_keyscan_types` parameter confirmed [CITED: https://github.com/KSXGitHub/github-actions-deploy-aur]
- AUR submission guidelines — empty repo clone as first-push bootstrap path confirmed [CITED: https://wiki.archlinux.org/title/AUR_submission_guidelines]

### Tertiary (LOW confidence)
- `archlinux:base-devel` vs `archlinux:latest` distinction — inferred from KSXGitHub Dockerfile which uses `archlinux:base` and installs base-devel explicitly; not directly confirmed via Docker Hub tag listing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified in existing repo workflows or official action docs
- Architecture: HIGH — PKGBUILD template confirmed by direct read; setup job output names confirmed by direct read
- Pitfalls: MEDIUM — pitfalls 1-3 verified by ecosystem research; pitfalls 4-6 based on logical analysis of workflow

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (webfactory/ssh-agent releases infrequently; AUR SSH API stable)
