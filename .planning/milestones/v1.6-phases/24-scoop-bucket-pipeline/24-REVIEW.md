---
phase: 24-scoop-bucket-pipeline
reviewed: 2026-05-05T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - .github/workflows/publish-packages.yml
  - docs/RELEASING.md
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: clean
---

# Phase 24: Code Review Report

**Reviewed:** 2026-05-05
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

The `publish-scoop` job is structurally sound and consistent with the `publish-homebrew`
job that preceded it. The eight focus-area checklist items are almost entirely satisfied:
no `${{ }}` in `run:` bodies, `SCOOP_BUCKET_TOKEN` is env-only, the placeholder check is
present, `jq empty` runs after substitution, `git diff --cached --quiet` guards the commit,
`timeout-minutes: 10` is set, RELEASING.md covers all five required topics, and the clone
is unauthenticated with the authenticated remote set separately. No injection vulnerability,
no secret leak, no data-loss path.

Two warnings and two info items remain. The most impactful is a missing `Rotation` section
for `SCOOP_BUCKET_TOKEN` in RELEASING.md (the PAT expires and silently breaks the pipeline
just like `RELEASE_TOKEN`, but no runbook exists for rotating it).

---

## Warnings

### WR-01: No rotation runbook for SCOOP_BUCKET_TOKEN in RELEASING.md

**File:** `docs/RELEASING.md:329–457`
**Issue:** The `RELEASE_TOKEN` section has a dedicated "Rotation" subsection (line 72)
that explains expiry symptoms, calendar-reminder hygiene, and the update-in-place procedure.
The `SCOOP_BUCKET_TOKEN` section (and `HOMEBREW_TAP_TOKEN` section) mentions expiry only
in the PAT-creation step ("90 days recommended") but provides no equivalent runbook for
what happens when the token expires and how to rotate it. Because the symptom of an expired
`SCOOP_BUCKET_TOKEN` is identical to the symptom of a missing one (`Authentication failed`
or `repository not found`), a maintainer troubleshooting a silent publish failure will not
find rotation guidance in the Scoop section. They must infer by analogy from the
`RELEASE_TOKEN` section, which is error-prone under stress.
**Fix:** Add a `## Rotation` subsection after "Adding SCOOP_BUCKET_TOKEN to repository
secrets" (mirroring lines 72–83) with the Scoop-specific equivalent:

```markdown
## Rotation

PATs expire. When `SCOOP_BUCKET_TOKEN` expires, the `publish-scoop` job fails at the
push step with `Authentication failed` — the clone succeeds because the repo is public.

**Process:**
1. Set a calendar reminder for the day before the token's expiry date.
2. Create a new PAT with the same scope (fine-grained, `sandwichfarm/scoop-nsyte`,
   Contents: Read and write).
3. Navigate to `https://github.com/sandwichfarm/nsyte/settings/secrets/actions`, click
   **SCOOP_BUCKET_TOKEN**, then **Update secret**, and paste the new token value.
4. Verify with `gh secret list -R sandwichfarm/nsyte`.
```

---

### WR-02: Token embedded in git remote URL is visible to any step that runs `git remote -v` or `git config --get remote.origin.url` after the clone step

**File:** `.github/workflows/publish-packages.yml:237–238`
**Issue:**
```yaml
run: |
  git clone "https://github.com/sandwichfarm/scoop-nsyte.git" /tmp/scoop
  git -C /tmp/scoop remote set-url origin "https://x-access-token:${SCOOP_BUCKET_TOKEN}@github.com/sandwichfarm/scoop-nsyte.git"
```
GitHub Actions masks the secret value in log output, so the raw token string is redacted.
However, the authenticated URL is stored in `/tmp/scoop/.git/config` on disk and is
readable by any subsequent step in the same job. If a future step inadvertently runs
`git -C /tmp/scoop remote -v` or a diagnostic `cat /tmp/scoop/.git/config`, the masked
value can appear in annotated form. This is the same pattern used in `publish-homebrew`
(line 187), so it is a systemic choice — but it is still a credential-in-config-file risk.

The preferred mitigation for GitHub Actions is a credential helper that is never written
to disk. The pattern used here is the standard `x-access-token` approach and is widely
accepted as the practical alternative when `actions/checkout` tokens are not applicable,
but the reviewer flags it so the team is aware rather than discovering it via accidental
log exposure later.

**Fix (preferred):** Use a git credential helper instead of embedding in the URL:
```bash
git clone "https://github.com/sandwichfarm/scoop-nsyte.git" /tmp/scoop
git -C /tmp/scoop config credential.helper \
  '!f() { echo "username=x-access-token"; echo "password=${SCOOP_BUCKET_TOKEN}"; }; f'
# remote.origin.url stays clean; credential helper injects at push time
```
This keeps `.git/config` free of the token. If the current in-URL approach is intentionally
kept for parity with `publish-homebrew`, accept this as known and document it.

---

## Info

### IN-01: `jq` not installed by default on `ubuntu-latest` — implicit dependency undocumented

**File:** `.github/workflows/publish-packages.yml:256`
**Issue:** The `Patch manifest` step runs `jq empty /tmp/scoop/bucket/nsyte.json` (line 256)
without first installing `jq`. On GitHub-hosted `ubuntu-latest` runners, `jq` is in fact
pre-installed (it is listed in the runner software manifest), so this will not fail in
practice. However, there is no comment or explicit `apt-get install jq` step, making it
a silent environmental assumption. If the runner image ever drops `jq` from pre-installed
packages, this step fails with `jq: command not found` and the error message will be
confusing because the prior placeholder check passed.
**Fix:** Either add a comment noting the implicit dependency or add an explicit install
step before the patch step:
```yaml
- name: Install jq
  run: sudo apt-get install -y --no-install-recommends jq
```
(Note: `jq` is also used in `publish-homebrew`'s local-verify recipe in RELEASING.md but
not in the Homebrew CI step itself, so this is unique to the Scoop job.)

---

### IN-02: RELEASING.md Scoop section has no `Troubleshooting` subsection

**File:** `docs/RELEASING.md:329–457`
**Issue:** The `RELEASE_TOKEN` section has a detailed troubleshooting checklist (lines
87–105) covering ordered causes and symptoms. The `SCOOP_BUCKET_TOKEN` section mentions
the failure symptom once (line 340: "Authentication failed or repository not found") but
provides no ordered troubleshooting checklist. By contrast the `publish-homebrew` section
has the same gap — this is a consistency issue affecting both, not a Scoop-specific
regression.

A maintainer debugging a Scoop publish failure needs to distinguish: (a) token missing,
(b) token expired, (c) token has wrong repo scope, (d) bucket repo does not exist.
These causes have identical symptoms but different fixes.

**Fix:** Add a `## Troubleshooting` subsection to the Scoop section (mirroring the
`RELEASE_TOKEN` troubleshooting structure):
```markdown
## Troubleshooting publish-scoop failures

**Symptom: Clone succeeds but push fails with `Authentication failed`**

1. `SCOOP_BUCKET_TOKEN` expired — create a new PAT (see Rotation above).
2. `SCOOP_BUCKET_TOKEN` not set — confirm it appears in Settings → Secrets.
3. PAT lacks Contents write permission on `sandwichfarm/scoop-nsyte`.

**Symptom: Clone fails with `repository not found`**

1. `sandwichfarm/scoop-nsyte` repo does not exist — create it (see Bootstrap above).
2. PAT has no read permission on `sandwichfarm/scoop-nsyte` (fine-grained private repo).
```

---

_Reviewed: 2026-05-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
