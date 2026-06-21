# Phase 24 Human UAT Checklist — Scoop Bucket Pipeline

Use this checklist to confirm the phase-24 deliverables work end-to-end. All automated checks have passed; the items below require a live GitHub environment, a Windows machine, or a published release asset.

---

## Prerequisites

Before running any test:

- [ ] `SCOOP_BUCKET_TOKEN` is registered as a repository secret on `sandwichfarm/nsyte`
  - Confirm with `gh secret list -R sandwichfarm/nsyte` — `SCOOP_BUCKET_TOKEN` should appear
- [ ] The `sandwichfarm/scoop-nsyte` repository exists on GitHub and its default branch is `main`
- [ ] A GitHub release exists (or will be triggered) with a Windows `.exe` asset named `nsyte-windows-${VERSION}.exe`

---

## Test 1 — CI Push: publish-scoop Job Runs Green

**Trigger:** Use `workflow_dispatch` on `publish-packages.yml` with a real release tag (e.g., `v1.5.0`), or wait for the next real `release: published` event.

**Steps:**

1. Navigate to Actions → publish packages → Run workflow → enter tag → Run.
2. Wait for the `setup` job to complete (polls for assets, computes checksums — up to ~5 min).
3. Observe the `publish-scoop` job.

**Expected outcomes:**

- [ ] `publish-scoop` job is green (exit 0)
- [ ] No `PLACEHOLDER_` marker errors in the job log
- [ ] `jq empty` step passes silently
- [ ] The commit step shows a commit message of `nsyte ${VERSION}` (or "already up to date" on a re-run of the same version — idempotency)
- [ ] `sandwichfarm/scoop-nsyte` repository shows a new commit with `bucket/nsyte.json` updated

**Verify the pushed manifest:**

```bash
curl -fsSL https://raw.githubusercontent.com/sandwichfarm/scoop-nsyte/main/bucket/nsyte.json | jq .
```

Expected: `version` field equals the release version string (no `v` prefix), `url` contains the correct GitHub release download URL with the real version, `hash` is a 64-character hex SHA256 string.

---

## Test 2 — Local Manifest Verify (SCOOP-04)

Run on a Linux machine with `jq`, `curl`, and `sha256sum`.

```bash
VERSION="1.5.0"   # replace with a real published version

SHA256_WINDOWS=$(curl -fsSL \
  "https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-windows-${VERSION}.exe" \
  | sha256sum | awk '{print $1}')

mkdir -p /tmp/scoop-test/bucket
cp packages/scoop/bucket/nsyte.json /tmp/scoop-test/bucket/nsyte.json
sed -i "s|PLACEHOLDER_VERSION|${VERSION}|g"               /tmp/scoop-test/bucket/nsyte.json
sed -i "s|PLACEHOLDER_SHA256_WINDOWS|${SHA256_WINDOWS}|g" /tmp/scoop-test/bucket/nsyte.json

grep "PLACEHOLDER_" /tmp/scoop-test/bucket/nsyte.json && { echo "FAIL: placeholder survived"; exit 1; }
jq empty /tmp/scoop-test/bucket/nsyte.json && echo "JSON valid"
jq . /tmp/scoop-test/bucket/nsyte.json
```

**Expected outcomes:**

- [ ] No `PLACEHOLDER_` markers remain after substitution
- [ ] `jq empty` exits 0 (valid JSON)
- [ ] `jq .` output shows:
  - `version` equals `${VERSION}` (e.g., `"1.5.0"`)
  - `url` equals `https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-windows-${VERSION}.exe#/nsyte.exe` with real version strings
  - `hash` is a 64-character lowercase hex string (the SHA256 of the Windows binary)

---

## Test 3 — End-User Install (Windows, optional but recommended)

On a Windows machine with Scoop installed:

```powershell
scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte
scoop install nsyte
nsyte --version
```

**Expected outcomes:**

- [ ] `scoop install nsyte` completes without hash mismatch errors
- [ ] `nsyte --version` prints the correct release version

---

## Test 4 — Idempotency (re-run same version)

Re-trigger `publish-packages.yml` with the same tag used in Test 1.

**Expected outcome:**

- [ ] The `publish-scoop` job completes green
- [ ] Job log contains "No changes to bucket/nsyte.json — bucket already up to date for v${VERSION}. Skipping push."
- [ ] No new commit appears in `sandwichfarm/scoop-nsyte`

---

## Sign-off

| Test | Result | Notes | Date |
|------|--------|-------|------|
| Test 1 — CI push green | PASS / FAIL | | |
| Test 2 — Local verify | PASS / FAIL | | |
| Test 3 — End-user install (Windows) | PASS / FAIL / SKIP | | |
| Test 4 — Idempotency | PASS / FAIL | | |

Phase 24 is complete when Tests 1 and 2 both pass. Test 3 is strongly recommended before a public announcement. Test 4 can be run at any time to confirm the guard works.
