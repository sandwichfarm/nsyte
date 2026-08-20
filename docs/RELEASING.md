# Releasing nsyte

This document covers the release and package-manager publishing workflow.

---

## Release authentication and package dispatch

`release.yml` uses the short-lived repository `GITHUB_TOKEN` to create the
GitHub Release. The release job has job-scoped `contents: write` permission for
the release and `actions: write` permission to dispatch
`publish-packages.yml` after a non-draft release is created.

GitHub suppresses most workflow events caused by `GITHUB_TOKEN`, including the
`release: published` event. `workflow_dispatch` is an explicit exception, so
the release workflow invokes that event directly with the release tag and
`manager=all`. This avoids a long-lived `RELEASE_TOKEN` PAT and its rotation and
expiry failure modes.

`publish-packages.yml` keeps its `release: published` trigger for releases
published by a user and its manual trigger for recovery or a targeted package
manager update.

---

## Troubleshooting

**Symptom: `publish-packages.yml` never appears in the Actions tab after a
release**

Check in this order:

1. **The release is a draft** — package publishing is intentionally skipped for
   draft releases.
2. **The `Publish packages` step failed** — inspect the `Create Release` job in
   `release.yml`; it needs job-scoped `actions: write` permission.
3. **The workflow was renamed or disabled** — verify
   `.github/workflows/publish-packages.yml` is enabled and its filename still
   matches the dispatch command in `release.yml`.
4. **Recovery** — run `publish-packages.yml` manually with the release tag and
   `manager=all`.

**Symptom: `publish-packages.yml` setup job fails with "Release assets not
available after 300s"**

Check in this order:

1. **`release.yml` build jobs failed** — open the `release.yml` run for that tag
   and look for red jobs. If binaries were not produced, assets were never
   uploaded.
2. **Release was published before asset upload completed** — rare;
   `softprops/action-gh-release` publishes and uploads atomically, but large
   uploads occasionally lag. Re-run `publish-packages.yml` manually via
   `workflow_dispatch`.
3. **Asset names changed in `release.yml`** — if someone renamed the binary
   outputs in `release.yml`, the expected-asset list in `publish-packages.yml`'s
   poll step is stale. Update the expected names in the poll to match the
   current `release.yml` output section.

---

## AUR_SSH_PRIVATE_KEY prerequisite

A private SSH key named `AUR_SSH_PRIVATE_KEY` must be configured as a repository
secret before `publish-aur` can push to the AUR remotes.

The job updates three AUR packages:

- `nsyte` - source build from the GitHub release tarball
- `nsyte-bin` - binary package from the Linux release asset
- `nsite-git` - VCS package built from the latest git source

`nsyte` and `nsyte-bin` already exist on AUR. `nsite-git` still needs the first
authenticated push. AUR creates the package page from that first push.

The local `~/.ssh/aur` key is passphrase-protected and failed non-interactive
SSH verification during pipeline setup. For CI, use an unencrypted dedicated
key:

```bash
ssh-keygen -t ed25519 -N "" -C "nsyte AUR CI" -f ~/.ssh/aur_nsyte_ci_ed25519
```

Register `~/.ssh/aur_nsyte_ci_ed25519.pub` in the AUR account, then store the
private key as the `AUR_SSH_PRIVATE_KEY` repository secret:

```bash
gh secret set AUR_SSH_PRIVATE_KEY -R sandwichfarm/nsyte < ~/.ssh/aur_nsyte_ci_ed25519
gh secret list -R sandwichfarm/nsyte
```

Prepare all three AUR package workdirs locally:

```bash
scripts/prepare-aur-packages.sh 0.27.1
```

After AUR SSH works, clone, commit, and push all three AUR repos with:

```bash
scripts/prepare-aur-packages.sh 0.27.1 --clone --push
```

After the first push, future releases update all three AUR packages
automatically.

---

## Verifying AUR PKGBUILDs locally

This checks the same substitution and metadata generation path used by CI:

```bash
VERSION="0.27.1"
SHA256_SOURCE=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/archive/refs/tags/v${VERSION}.tar.gz" | sha256sum | awk '{print $1}')
SHA256_X86_64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-linux-${VERSION}" | sha256sum | awk '{print $1}')

rm -rf /tmp/nsyte-aur-check
mkdir -p /tmp/nsyte-aur-check

for package in nsyte nsyte-bin nsite-git; do
  repo="/tmp/nsyte-aur-check/${package}"
  mkdir -p "$repo"
  cp "packages/aur/${package}/PKGBUILD" "$repo/PKGBUILD"
  sed -i "s/PLACEHOLDER_VERSION/${VERSION}/g" "$repo/PKGBUILD"
  case "$package" in
    nsyte) sed -i "s/PLACEHOLDER_SHA256_SOURCE/${SHA256_SOURCE}/g" "$repo/PKGBUILD" ;;
    nsyte-bin) sed -i "s/PLACEHOLDER_SHA256_X86_64/${SHA256_X86_64}/g" "$repo/PKGBUILD" ;;
  esac
  grep "PLACEHOLDER_" "$repo/PKGBUILD" && { echo "substitution failed"; exit 1; }
  (cd "$repo" && makepkg --printsrcinfo > .SRCINFO)
  (cd "$repo" && namcap PKGBUILD)
done
```

---

## Homebrew tap deploy key

The Homebrew tap is `https://github.com/sandwichfarm/homebrew-nsyte`.

It has already been created, seeded with `Formula/nsyte.rb` for `0.27.1`, and
configured with a write deploy key. The private key is stored on
`sandwichfarm/nsyte` as `HOMEBREW_TAP_SSH_KEY`.

The release job clones the tap over SSH:

```bash
git clone git@github.com:sandwichfarm/homebrew-nsyte.git /tmp/tap
```

If the key is rotated, create a new passwordless deploy key, add its public key
to `sandwichfarm/homebrew-nsyte` with write access, and update the repository
secret:

```bash
ssh-keygen -t ed25519 -N "" -C "nsyte homebrew tap ci" -f /tmp/homebrew-nsyte
gh repo deploy-key add /tmp/homebrew-nsyte.pub -R sandwichfarm/homebrew-nsyte -w -t "nsyte publish-packages"
gh secret set HOMEBREW_TAP_SSH_KEY -R sandwichfarm/nsyte < /tmp/homebrew-nsyte
rm /tmp/homebrew-nsyte /tmp/homebrew-nsyte.pub
```

End-user install path:

```bash
brew tap sandwichfarm/nsyte https://github.com/sandwichfarm/homebrew-nsyte
brew install nsyte
```

---

## Verifying the Homebrew formula locally (BREW-04)

A maintainer can verify the patched formula installs correctly before a real CI
run. This requires Homebrew installed on macOS (or Homebrew on Linux).

```bash
# Pick a published version
VERSION="1.5.0"

# Compute SHA256s for each platform binary
# Note: on macOS use `shasum -a 256` in place of `sha256sum` (GNU coreutils is not pre-installed on macOS)
SHA256_MACOS_ARM64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-macos-arm64-${VERSION}" | sha256sum | awk '{print $1}')
SHA256_MACOS_X64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-macos-x64-${VERSION}" | sha256sum | awk '{print $1}')
SHA256_LINUX_X64=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-linux-${VERSION}" | sha256sum | awk '{print $1}')

# Patch a working copy (same logic as CI)
mkdir -p /tmp/brew-test/Formula
cp packages/homebrew/Formula/nsyte.rb /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"                       /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_MACOS_ARM64|${SHA256_MACOS_ARM64}|g" /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_MACOS_X64|${SHA256_MACOS_X64}|g"     /tmp/brew-test/Formula/nsyte.rb
sed -i "s|PLACEHOLDER_SHA256_LINUX_X86_64|${SHA256_LINUX_X64}|g"  /tmp/brew-test/Formula/nsyte.rb

# Sanity check: no PLACEHOLDER markers should remain
grep "PLACEHOLDER_" /tmp/brew-test/Formula/nsyte.rb && { echo "substitution failed"; exit 1; }

# On macOS with Homebrew installed — install directly from the patched local formula file
brew install --formula /tmp/brew-test/Formula/nsyte.rb
nsyte --version
```

If `nsyte --version` prints the correct version, the formula is well-formed and
the binary is installable. The same substitution logic runs in CI; a green local
run gives confidence in the upcoming CI push to the tap.

**Alternatively — verify via the tap after a CI push:**

```bash
brew tap sandwichfarm/nsyte https://github.com/sandwichfarm/homebrew-nsyte
brew install nsyte
nsyte --version
```

This is the end-user install path and the final functional check after a real
release.

---

## Scoop bucket deploy key

The Scoop bucket is `https://github.com/sandwichfarm/scoop-nsyte`.

It has already been created, seeded with `bucket/nsyte.json` for `0.27.1`, and
configured with a write deploy key. The private key is stored on
`sandwichfarm/nsyte` as `SCOOP_BUCKET_SSH_KEY`.

The release job clones the bucket over SSH:

```bash
git clone git@github.com:sandwichfarm/scoop-nsyte.git /tmp/scoop
```

If the key is rotated, create a new passwordless deploy key, add its public key
to `sandwichfarm/scoop-nsyte` with write access, and update the repository
secret:

```bash
ssh-keygen -t ed25519 -N "" -C "nsyte scoop bucket ci" -f /tmp/scoop-nsyte
gh repo deploy-key add /tmp/scoop-nsyte.pub -R sandwichfarm/scoop-nsyte -w -t "nsyte publish-packages"
gh secret set SCOOP_BUCKET_SSH_KEY -R sandwichfarm/nsyte < /tmp/scoop-nsyte
rm /tmp/scoop-nsyte /tmp/scoop-nsyte.pub
```

End-user install path:

```bash
scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte
scoop install nsyte
```

---

## Verifying the Scoop manifest locally (SCOOP-04)

A maintainer can verify the patched manifest is well-formed before a real CI
run. This requires `jq` and `curl` (standard on Linux maintainer machines).

```bash
# Pick a real published version that has a Windows .exe on the GitHub release page
VERSION="1.5.0"  # replace with a real published version

# Compute SHA256 of the published Windows binary
SHA256_WINDOWS=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-windows-${VERSION}.exe" | sha256sum | awk '{print $1}')

# Patch a working copy (same logic as CI)
mkdir -p /tmp/scoop-test/bucket
cp packages/scoop/bucket/nsyte.json /tmp/scoop-test/bucket/nsyte.json
sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"               /tmp/scoop-test/bucket/nsyte.json
sed -i "s|PLACEHOLDER_SHA256_WINDOWS|${SHA256_WINDOWS}|g" /tmp/scoop-test/bucket/nsyte.json

# Sanity check: no PLACEHOLDER markers should remain
grep "PLACEHOLDER_" /tmp/scoop-test/bucket/nsyte.json && { echo "substitution failed"; exit 1; }

# JSON validation
jq empty /tmp/scoop-test/bucket/nsyte.json && echo "JSON is valid"

# Pretty-print for visual inspection
jq . /tmp/scoop-test/bucket/nsyte.json
```

If `jq .` prints the manifest cleanly with no PLACEHOLDER strings and the `url`
and `hash` fields contain real values, the manifest is correct. Note that
`PLACEHOLDER_VERSION` is embedded in the `url` field as well as the `version`
field — the `sed /g` flag in the CI step (and in the recipe above) replaces both
occurrences in a single pass.

**End-to-end functional check (after a real CI push to the bucket):**

```bash
scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte
scoop install nsyte
nsyte --version
```

This is the end-user install path and the final functional check after a real
release.

---

## WINGET_FORK_TOKEN prerequisite

A Personal Access Token (PAT) named `WINGET_FORK_TOKEN` **must** be configured
as a repository secret before the `publish-winget` CI job can submit manifest
PRs to `microsoft/winget-pkgs`.

**Why this is required:** `wingetcreate update --submit` forks
`microsoft/winget-pkgs` under the token owner's GitHub account, commits the
updated manifests, and opens a PR. This requires write access to the fork (which
wingetcreate creates automatically) and the ability to open PRs on the upstream
repo. `GITHUB_TOKEN` does not have access to external repos.

**Token type: classic PAT only.** wingetcreate does not support fine-grained
tokens. Fine-grained PATs will produce an authentication error. See
[wingetcreate token docs](https://github.com/microsoft/winget-create/blob/main/doc/token.md).

**Required scopes:**

- `public_repo` — mandatory; allows forking and PR creation on public repos
- `delete_repo` — optional; allows wingetcreate to clean up failed fork attempts

**Symptom of missing or expired token:** The `publish-winget` job completes with
exit 0 but logs `::warning::wingetcreate exited with code <N>`. If the bootstrap
PR has already been merged (the package is in the index), a non-zero exit is
most likely a token problem. Check that the secret is set and the PAT has not
expired.

---

## Creating the WINGET_FORK_TOKEN PAT

wingetcreate requires a **classic** PAT. Fine-grained tokens are explicitly not
supported.

1. Navigate to https://github.com/settings/tokens (classic tokens page)
2. Click **Generate new token (classic)**.
3. Set a descriptive note (e.g., `nsyte winget publish`).
4. Set an expiry date — 90 days recommended. Avoid "No expiration".
5. Select scope: `public_repo` (under the `repo` group). Optionally also select
   `delete_repo` (under the top-level `delete_repo` checkbox).
6. Click **Generate token**. Copy the value immediately — it starts with `ghp_`.

---

## Adding WINGET_FORK_TOKEN to repository secrets

1. Navigate to https://github.com/sandwichfarm/nsyte/settings/secrets/actions
2. Click **New repository secret**.
3. Name: `WINGET_FORK_TOKEN` — exactly this, case-sensitive, no whitespace.
4. Value: paste the classic PAT from above.
5. Click **Add secret**.

Confirm the secret exists with the GitHub CLI:

```bash
gh secret list -R sandwichfarm/nsyte
```

`WINGET_FORK_TOKEN` should appear alongside the other publish secrets.

**Rotation:** Classic PATs expire. Set a calendar reminder before the expiry
date. Create a replacement PAT following the same steps, then update the secret
value in repository settings. The symptom of an expired token is the
`publish-winget` job exiting 0 with a warning after the bootstrap PR has been
merged.

---

## Bootstrapping the winget package (one-time, WINGET-04)

The very first submission of `sandwichfarm.nsyte` to `microsoft/winget-pkgs`
must be a **manual PR**. This is Microsoft's preferred path for new packages —
it allows human review of publisher metadata, license, and installer type before
automation takes over. After the bootstrap PR is merged and the package appears
in the index, all subsequent version bumps are handled automatically by the
`publish-winget` CI job.

### Bootstrap procedure

1. **Fork `microsoft/winget-pkgs`** at https://github.com/microsoft/winget-pkgs
   — click **Fork** and create the fork under the `sandwichfarm` account.

2. **Create the manifest directory in your fork:**
   ```
   manifests/s/sandwichfarm/nsyte/<VERSION>/
   ```
   where `<VERSION>` is the release version string (e.g., `1.6.0`).

3. **Copy and fill in the three YAML files** from `packages/winget/` in this
   repo:

   For each file, replace the PLACEHOLDER values:
   - `PLACEHOLDER_VERSION` → the real version (e.g., `1.6.0`)
   - `PLACEHOLDER_SHA256_WINDOWS` → the SHA256 of `nsyte-windows-<VERSION>.exe`
     from the GitHub release page

   ```bash
   VERSION="1.6.0"
   SHA256=$(curl -fsSL "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-windows-${VERSION}.exe" | sha256sum | awk '{print $1}')

   mkdir -p /tmp/winget-bootstrap/manifests/s/sandwichfarm/nsyte/${VERSION}

   for f in packages/winget/sandwichfarm.nsyte.*.yaml; do
     dest="/tmp/winget-bootstrap/manifests/s/sandwichfarm/nsyte/${VERSION}/$(basename $f)"
     sed -e "s/PLACEHOLDER_VERSION/${VERSION}/g" \
         -e "s/PLACEHOLDER_SHA256_WINDOWS/${SHA256}/g" \
         "$f" > "$dest"
   done

   # Sanity: no PLACEHOLDER markers should remain
   grep -r "PLACEHOLDER_" /tmp/winget-bootstrap/ && { echo "substitution failed"; exit 1; }
   ```

4. **Commit the three YAML files** to a branch in your fork named
   `sandwichfarm.nsyte-<VERSION>` (convention; not enforced).

5. **Open a PR** from your fork branch to `microsoft/winget-pkgs` main. PR title
   convention: `New package: sandwichfarm.nsyte version <VERSION>`

6. **Wait for Microsoft review.** The winget-pkgs maintainers typically review
   new package PRs within 1–3 business days. Automated checks (validation bots)
   run first; manual review follows if validation passes.

7. **After the PR is merged**, the `publish-winget` CI job will work
   automatically on the next release — wingetcreate will find the package in the
   index and submit a version-bump PR.

**Current bootstrap PR:** https://github.com/microsoft/winget-pkgs/pull/386658

**Note on the `publish-winget` job before bootstrap merge:** Until the bootstrap
PR is merged, the `publish-winget` CI job will exit 0 with a warning
(`wingetcreate exited with code <N>`). This is expected and by design — the job
does not fail the workflow while the package is not yet in the index.

---

## Verifying the winget manifests locally (WINGET-02)

A maintainer can generate the manifests locally without submitting to verify
they are well-formed. This requires Windows (or a Windows runner) and
`wingetcreate`.

```powershell
# Pick a published version
$VERSION = "1.6.0"
$REPO = "sandwichfarm/nsyte"

# Download wingetcreate (self-contained, no .NET install needed)
iwr https://aka.ms/wingetcreate/latest/self-contained -OutFile $env:TEMP\wingetcreate.exe

# Generate manifests locally without submitting
# --out writes to a local directory; --submit is omitted
& "$env:TEMP\wingetcreate.exe" update sandwichfarm.nsyte `
  --version $VERSION `
  --urls "https://github.com/$REPO/releases/download/v$VERSION/nsyte-windows-$VERSION.exe|x64" `
  --out "$env:TEMP\winget-test"

# Inspect the generated manifests
Get-ChildItem "$env:TEMP\winget-test\manifests\s\sandwichfarm\nsyte\$VERSION\"
```

If wingetcreate produces three YAML files (version, installer, locale) in the
output directory with the correct version and a real SHA256 (which wingetcreate
downloads and computes from the installer URL), the manifests are well-formed
and ready for submission.

**Note:** `wingetcreate update` without `--submit` requires the package to
already exist in the winget-pkgs index. Before the bootstrap PR is merged, use
the manual substitution steps in "Bootstrapping the winget package" above to
produce and visually inspect the initial YAML files instead.

---

## Related files

- `.github/workflows/release.yml` — the release-creation workflow. It creates
  releases with `GITHUB_TOKEN` and dispatches the package workflow after
  publishing a non-draft release.
- `.github/workflows/publish-packages.yml` — the publish workflow. Triggered by
  the release workflow's `workflow_dispatch`, by user-created
  `release: published` events, or manually for recovery and targeted updates.
- `packages/aur/nsyte/PKGBUILD` — source-build AUR template. Contains
  `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_SOURCE`.
- `packages/aur/nsyte-bin/PKGBUILD` — binary AUR template. Contains
  `PLACEHOLDER_VERSION` and `PLACEHOLDER_SHA256_X86_64`.
- `packages/aur/nsite-git/PKGBUILD` — VCS AUR template. Contains
  `PLACEHOLDER_VERSION`.
- `packages/homebrew/Formula/nsyte.rb` — the Homebrew formula template. Contains
  four `PLACEHOLDER_` markers that CI substitutes per-release before pushing to
  the tap. Maintainers can substitute these by hand for local verification (see
  "Verifying the Homebrew formula locally" above).
- `packages/scoop/bucket/nsyte.json` — the Scoop manifest template. Contains
  `PLACEHOLDER_VERSION` (appears in both the `version` field and the `url`
  field) and `PLACEHOLDER_SHA256_WINDOWS`, which CI substitutes per-release
  before pushing to the bucket. Maintainers can substitute these by hand for
  local verification (see "Verifying the Scoop manifest locally" above).
- `docs/PACKAGE_MANAGERS.md` — current status matrix for configured package
  surfaces and remaining external handoffs.
