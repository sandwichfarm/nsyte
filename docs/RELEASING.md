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

## Related files

- `.github/workflows/release.yml` — the release-creation workflow. Line 446 uses `RELEASE_TOKEN` in the `softprops/action-gh-release` step to create the release that fires the downstream event.
- `.github/workflows/publish-packages.yml` — the publish workflow. Triggered by `release: published`. Depends entirely on the PAT-initiated release event to start; will never run if `release.yml` uses `GITHUB_TOKEN` instead.
