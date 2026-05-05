# Releasing nsyte

This document covers the `RELEASE_TOKEN` prerequisite for the package-manager publish workflow and explains how to create, configure, rotate, and troubleshoot it.

---

## RELEASE_TOKEN prerequisite

A Personal Access Token (PAT) named `RELEASE_TOKEN` **must** be configured as a repository secret before the publish workflow can fire.

**Why this is required:** GitHub intentionally suppresses workflow events triggered by actions that use `GITHUB_TOKEN`. When `release.yml` creates a release using `GITHUB_TOKEN`, the resulting `release: published` event is silently invisible to other workflows — including `publish-packages.yml`. A user-classed PAT bypasses this suppression. Concretely: `.github/workflows/release.yml` line 446 uses `RELEASE_TOKEN` in the `softprops/action-gh-release` step; when that step fires, the resulting release event propagates and `.github/workflows/publish-packages.yml` starts running.

**Symptom of forgetting the secret:** A tag push (or a `workflow_dispatch` run of `release.yml`) produces a GitHub Release normally, but `publish-packages.yml` never appears in the Actions tab. No package-manager index gets updated. There is no error — the workflow simply does not start.

---

## Creating the PAT

Choose one of two options. Fine-grained is preferred because it limits blast radius if the token is ever compromised.

**Option A — Classic (simpler)**

1. Navigate to https://github.com/settings/tokens
2. Click **Generate new token (classic)**.
3. Set a descriptive note (e.g., `nsyte release publish`).
4. Set an expiry date — 90 days is a good default. Avoid "No expiration"; an indefinite token is a higher risk if leaked.
5. Select scope: `repo` (the top-level checkbox — this includes `Contents: write`).
6. Click **Generate token**. Copy the value immediately — GitHub never shows it again. It starts with `ghp_`.

**Option B — Fine-grained (preferred)**

1. Navigate to https://github.com/settings/personal-access-tokens
2. Click **Generate new token**.
3. Set a descriptive name (e.g., `nsyte release publish`).
4. Set an expiry date (90 days recommended).
5. Under **Repository access**, select **Only select repositories** → choose `sandwichfarm/nsyte`.
6. Under **Repository permissions**, set **Contents** to **Read and write**. No other permissions are needed.
7. Click **Generate token**. Copy the value immediately — it starts with `github_pat_`.

---

## Adding the secret to the repository

1. Navigate to https://github.com/sandwichfarm/nsyte/settings/secrets/actions
2. Click **New repository secret**.
3. Name: `RELEASE_TOKEN` — exactly this, case-sensitive, no whitespace.
4. Value: paste the PAT string from above.
5. Click **Add secret**. The name appears in the list; the value is masked and never shown again.

---

## Verifying the setup

**Manual check:**

In the repository Settings → Secrets and variables → Actions, confirm `RELEASE_TOKEN` appears in the repository secrets list.

**CLI check (requires an authenticated `gh` session):**

```bash
gh secret list -R sandwichfarm/nsyte
```

`RELEASE_TOKEN` should appear in the output. (The value is not shown — this is correct.)

**Functional check (optional but thorough):**

Trigger `release.yml` via `workflow_dispatch` and set `draft: true` if the workflow supports it, or use a pre-release tag. Convert the resulting draft to a published release in the GitHub UI. Within ~30 seconds, `publish-packages.yml` should appear in the Actions tab and reach at least the `setup` job.

---

## Rotation

PATs expire. When `RELEASE_TOKEN` expires, the next release silently fails to trigger `publish-packages.yml` — same symptom as if the secret was never set.

**Process:**

1. Set a calendar reminder for the day before the token's expiry date.
2. Create a new PAT with the same scope (Option A or B above).
3. Navigate to https://github.com/sandwichfarm/nsyte/settings/secrets/actions, click **RELEASE_TOKEN**, then **Update secret**, and paste the new token value.
4. Verify with `gh secret list -R sandwichfarm/nsyte` or by triggering a test release.

You do not need to rename the secret — updating the value in place is sufficient. Active workflows mid-run that reference `${{ secrets.RELEASE_TOKEN }}` will continue to use the old value until their run completes; only new runs pick up the new value.

---

## Troubleshooting

**Symptom: `publish-packages.yml` never appears in the Actions tab after a release**

Check in this order:

1. **`release.yml` step still uses `GITHUB_TOKEN`** — verify line 446 of `.github/workflows/release.yml` reads `token: ${{ secrets.RELEASE_TOKEN }}`, not `${{ secrets.GITHUB_TOKEN }}`. This is the most common cause.
2. **`RELEASE_TOKEN` secret not set** — confirm it is present in Settings → Secrets and variables → Actions.
3. **`RELEASE_TOKEN` expired or revoked** — create a new PAT and update the secret.
4. **PAT lacks required scope** — for a classic token, `repo` scope is required. For fine-grained, `Contents: Read and write` on `sandwichfarm/nsyte`.

**Symptom: `publish-packages.yml` setup job fails with "Release assets not available after 300s"**

Check in this order:

1. **`release.yml` build jobs failed** — open the `release.yml` run for that tag and look for red jobs. If binaries were not produced, assets were never uploaded.
2. **Release was published before asset upload completed** — rare; `softprops/action-gh-release` publishes and uploads atomically, but large uploads occasionally lag. Re-run `publish-packages.yml` manually via `workflow_dispatch`.
3. **Asset names changed in `release.yml`** — if someone renamed the binary outputs in `release.yml`, the expected-asset list in `publish-packages.yml`'s poll step is stale. Update the expected names in the poll to match the current `release.yml` output section.

---

## AUR_SSH_PRIVATE_KEY prerequisite

A private SSH key named `AUR_SSH_PRIVATE_KEY` **must** be configured as a repository secret before the `publish-aur` CI job can push to the AUR git remote.

**Why this is required:** The AUR (Arch User Repository) accepts package updates only via SSH-authenticated `git push` to `ssh://aur@aur.archlinux.org/<pkgname>.git`. The `publish-aur` job in `.github/workflows/publish-packages.yml` loads this secret into an ssh-agent (via `webfactory/ssh-agent@v0.10.0`) and performs an authenticated push of the patched PKGBUILD and regenerated `.SRCINFO`. Without the secret, the SSH agent has no key to present and the push fails immediately.

**Symptom of forgetting the secret (or registering an unmatched key):** The `publish-aur` job fails at the `Clone AUR remote` step with `Permission denied (publickey)`. The four sibling jobs (`publish-homebrew`, `publish-scoop`, `publish-winget`, `publish-nix`) are unaffected — failure isolation is by design (INFRA-05).

---

## Generating and registering the AUR SSH key

This is a one-time human bootstrap. CI cannot self-register the SSH key or the package name.

1. **Create an AUR account** at https://aur.archlinux.org/register/ if not already done.
2. **Generate an SSH keypair** (or reuse an existing one):
   ```bash
   ssh-keygen -t ed25519 -C "nsyte AUR CI" -f ~/.ssh/aur_nsyte_ed25519
   ```
   This produces `~/.ssh/aur_nsyte_ed25519` (private) and `~/.ssh/aur_nsyte_ed25519.pub` (public).
3. **Register the public key** in the AUR account settings:
   - Navigate to https://aur.archlinux.org/account/<your-username>/edit
   - Paste the contents of `~/.ssh/aur_nsyte_ed25519.pub` into the **SSH Public Key** field.
   - Save.
4. **Bootstrap the `nsyte-bin` package name** by cloning the empty AUR remote once from your local machine — this registers the package under your account so future pushes are authorized:
   ```bash
   GIT_SSH_COMMAND="ssh -i ~/.ssh/aur_nsyte_ed25519" \
     git clone ssh://aur@aur.archlinux.org/nsyte-bin.git
   # warning: You appear to have cloned an empty repository.
   ```
   The empty-repo warning is the documented bootstrap path. Do not commit anything from your local machine — leave the empty clone alone; CI's first push will populate it.
5. **Add the private key as the `AUR_SSH_PRIVATE_KEY` secret:**
   - Navigate to https://github.com/sandwichfarm/nsyte/settings/secrets/actions
   - Click **New repository secret**.
   - Name: `AUR_SSH_PRIVATE_KEY` — exactly this, case-sensitive, no whitespace.
   - Value: paste the **entire** contents of `~/.ssh/aur_nsyte_ed25519` (private key file), including the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines and the trailing newline.
   - Click **Add secret**.

**Verifying the setup:**

Confirm the secret exists with the GitHub CLI:

```bash
gh secret list -R sandwichfarm/nsyte
```

`AUR_SSH_PRIVATE_KEY` should appear alongside `RELEASE_TOKEN`. (Values are not shown — masked is correct.)

**Functional check (after the next real release):**

When `release.yml` publishes a new release, `publish-packages.yml` fires, the `setup` job computes checksums, and the `publish-aur` job clones the AUR remote, patches PKGBUILD, regenerates `.SRCINFO`, and pushes. The AUR `nsyte-bin` package page should show the new version within minutes. If the job fails at `Clone AUR remote` or `Commit and push to AUR`, re-check the SSH key registration and that step 4 above (empty-repo bootstrap clone) was done.

**Rotation:** SSH keys do not expire on their own. Rotate by generating a new keypair, updating the public key in your AUR account settings, and updating the `AUR_SSH_PRIVATE_KEY` secret value in repo settings. The old key can be removed from the AUR account once the new one is confirmed working.

---

## Verifying the AUR PKGBUILD locally (AUR-05)

Before the first real release, a maintainer can verify the PKGBUILD installs cleanly using the same Arch Linux container the CI job uses. This builds confidence that the template is well-formed and that a published release is actually installable, independent of the CI plumbing.

This recipe assumes a published GitHub release exists at the version under test (e.g., from a previous release before the AUR pipeline was wired). If no such release exists yet, skip this step — the first CI run on the next release will exercise the same logic.

```bash
# 1. Pick a real published version that has a Linux x86_64 binary on the GitHub release page.
VERSION="1.5.0"  # replace with a real published version

# 2. Compute the SHA256 of the published Linux binary.
SHA256=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-linux-${VERSION}" | sha256sum | awk '{print $1}')

# 3. Make a working copy of the PKGBUILD template and substitute the placeholders by name.
mkdir -p /tmp/aur-test
cp packages/aur/PKGBUILD /tmp/aur-test/PKGBUILD
sed -i "s/PLACEHOLDER_VERSION/${VERSION}/g"           /tmp/aur-test/PKGBUILD
sed -i "s/PLACEHOLDER_SHA256_X86_64/${SHA256}/g"      /tmp/aur-test/PKGBUILD

# 4. Sanity check: no PLACEHOLDER markers should remain.
grep "PLACEHOLDER_" /tmp/aur-test/PKGBUILD && { echo "substitution failed"; exit 1; }

# 5. Run makepkg -si inside an Arch Linux container as a non-root user.
docker run --rm -it \
  -v /tmp/aur-test:/pkg \
  archlinux:base-devel \
  bash -c '
    set -euo pipefail
    pacman -Syu --noconfirm
    useradd -m builder
    chown -R builder /pkg
    cd /pkg
    sudo -u builder makepkg -si --noconfirm
    nsyte --version
  '
```

If `nsyte --version` prints the version cleanly inside the container, the PKGBUILD is correct and the binary is installable. If the SHA256 mismatch error appears, the published release asset has been modified since publish — investigate before pushing the AUR update.

This is the same substitution logic and same container image the `publish-aur` CI job runs (just with `--printsrcinfo` instead of `-si`); a green local verification gives confidence in the upcoming CI run.

---

## Related files

- `.github/workflows/release.yml` — the release-creation workflow. Line 446 uses `RELEASE_TOKEN` in the `softprops/action-gh-release` step to create the release that fires the downstream event.
- `.github/workflows/publish-packages.yml` — the publish workflow. Triggered by `release: published`. Depends entirely on the PAT-initiated release event to start; will never run if `release.yml` uses `GITHUB_TOKEN` instead. The `publish-aur` job consumes `AUR_SSH_PRIVATE_KEY` from secrets and pushes to `ssh://aur@aur.archlinux.org/nsyte-bin.git`.
- `packages/aur/PKGBUILD` — the AUR template. Contains `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_X86_64` which CI substitutes by name before pushing. Maintainers can substitute these by hand for local verification (see "Verifying the AUR PKGBUILD locally" above).
