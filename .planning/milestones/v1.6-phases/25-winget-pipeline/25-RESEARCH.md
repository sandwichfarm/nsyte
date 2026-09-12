# Phase 25: Winget Pipeline - Research

**Researched:** 2026-05-05
**Domain:** Windows Package Manager (winget) CI publish automation using wingetcreate
**Confidence:** HIGH

## Summary

The `publish-winget` job in `.github/workflows/publish-packages.yml` is currently a stub. This phase replaces it with a real `wingetcreate update` invocation on a `windows-latest` runner that auto-submits a manifest PR to `microsoft/winget-pkgs` on every release.

The core tooling is Microsoft's own `wingetcreate` CLI, downloaded via `https://aka.ms/wingetcreate/latest`. It handles forking `microsoft/winget-pkgs`, committing updated manifests (bumping `PackageVersion` and `InstallerSha256`), and opening the PR — the CI job only needs to supply the version, installer URL, SHA256 (passed implicitly via the URL which wingetcreate downloads), and a PAT.

**ManifestVersion 1.12.0 is confirmed current and correct** — the local templates already use the right value, resolving WR-02.

**Primary recommendation:** Download the self-contained exe with `iwr https://aka.ms/wingetcreate/latest/self-contained -OutFile wingetcreate.exe`, pass the token via `WINGET_CREATE_GITHUB_TOKEN` env var (not `--token` flag, to avoid log exposure), and handle the pre-bootstrap case with an explicit exit-0 guard based on process exit code.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `microsoft/winget-create` CLI (`wingetcreate`) — official Microsoft tool, handles fork+PR automation
- Job runs on `windows-latest` (wingetcreate is .NET; runs natively on Windows runners)
- WINGET_FORK_TOKEN PAT must have access to the user's fork of `microsoft/winget-pkgs`
- Use `wingetcreate update sandwichfarm.nsyte --version $VERSION --urls "...nsyte-windows-$VERSION.exe" --token $TOKEN --submit` style invocation

### Claude's Discretion
- Exact `wingetcreate` flags
- ManifestVersion verification approach (curl the schema repo, parse latest version) — this is critical given WR-02
- Conditional skip if `wingetcreate` reports the package isn't in the index yet (graceful degradation: warn and exit 0 vs fail)

### Deferred Ideas (OUT OF SCOPE)
- Bootstrap PR automation — explicitly NOT in scope; manual PR is the right path for first submission
- Direct manifest commits without `wingetcreate` — defer; not the standard pattern
</user_constraints>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest PR creation | CI job (windows-latest) | — | wingetcreate is .NET, requires Windows runner |
| Token auth | GitHub Actions secret | — | PAT with `public_repo` classic scope |
| Version/SHA extraction | Upstream `setup` job (ubuntu-latest) | — | Already computed as job outputs |
| Bootstrap (one-time) | Maintainer manual step | RELEASING.md docs | First submission preferred as manual PR per Microsoft |
| ManifestVersion verification | CI step / RELEASING.md note | — | Informational; wingetcreate manages ManifestVersion itself |

---

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| wingetcreate | latest (`aka.ms/wingetcreate/latest`) | Fork + commit + PR to `microsoft/winget-pkgs` | Official Microsoft tool; the only supported automated path |
| windows-latest runner | current | .NET runtime environment for wingetcreate | wingetcreate is a .NET exe; requires Windows |

### Installation on Runner

Two download options exist:

**Option A — self-contained (recommended for CI):** [CITED: github.com/microsoft/winget-create/README.md]
```powershell
iwr https://aka.ms/wingetcreate/latest/self-contained -OutFile wingetcreate.exe
```
No separate .NET install step needed. Larger download (~80MB) but zero dependency risk.

**Option B — requires .NET 8.0 on runner:** [CITED: github.com/microsoft/winget-create/README.md]
```powershell
iwr https://aka.ms/wingetcreate/latest -OutFile wingetcreate.exe
```
`windows-latest` does have .NET preinstalled but the exact version can drift. Use Option A to eliminate the dependency entirely.

---

## Architecture Patterns

### System Architecture Diagram

```
release: published event
        |
        v
  setup job (ubuntu-latest)
  - polls release assets
  - downloads nsyte-windows-$VERSION.exe
  - outputs: version, sha256_windows
        |
        v
  publish-winget job (windows-latest)
  - needs: [setup]
  - downloads wingetcreate.exe
  - checks if package exists in winget-pkgs (guard)
  - runs: wingetcreate update sandwichfarm.nsyte
             --version $VERSION
             --urls $INSTALLER_URL
             --submit
  - WINGET_CREATE_GITHUB_TOKEN env var provides auth
        |
        v
  wingetcreate forks/syncs microsoft/winget-pkgs
  opens PR: "Update sandwichfarm.nsyte version to X.Y.Z"
        |
        v
  microsoft/winget-pkgs maintainers review + merge PR
```

### Recommended Project Structure (no new files needed)

The job modifies only `.github/workflows/publish-packages.yml`. The existing `packages/winget/` templates remain as bootstrap reference material — wingetcreate fetches and updates the live manifest from the index, not from local files.

```
.github/workflows/publish-packages.yml   # publish-winget job updated here
packages/winget/                         # bootstrap reference only, unchanged
docs/RELEASING.md                        # add WINGET_FORK_TOKEN + bootstrap section
```

### Pattern: wingetcreate update invocation

**What:** Download exe, set token via env var, run update with submit flag.
**When to use:** Every release, after bootstrap PR is merged.

```powershell
# Source: github.com/microsoft/winget-create/blob/main/doc/update.md
# Source: github.com/microsoft/winget-create/blob/main/doc/token.md

# Token passed via env var to avoid command-line log exposure
$env:WINGET_CREATE_GITHUB_TOKEN = "${{ secrets.WINGET_FORK_TOKEN }}"

.\wingetcreate.exe update sandwichfarm.nsyte `
  --version $env:VERSION `
  --urls "https://github.com/${{ github.repository }}/releases/download/v$($env:VERSION)/nsyte-windows-$($env:VERSION).exe" `
  --submit `
  --no-open
```

`--no-open` suppresses the browser auto-open behavior that would hang a headless runner.

### Pattern: Graceful pre-bootstrap skip

wingetcreate exits with a non-zero code when the package identifier is not found in the winget-pkgs index. The correct strategy is to catch this and exit 0 with a warning rather than failing the publish workflow (pre-bootstrap is an expected transient state). [ASSUMED — exact error message and exit code not documented; based on tool behavior described in wingetcreate issues and docs]

```powershell
# Run wingetcreate and capture exit code
.\wingetcreate.exe update sandwichfarm.nsyte `
  --version $env:VERSION `
  --urls $env:INSTALLER_URL `
  --submit `
  --no-open
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Host "::warning::wingetcreate exited with code $exitCode."
  Write-Host "::warning::If the package is not yet in the winget-pkgs index, this is expected before the manual bootstrap PR is merged."
  Write-Host "::warning::See docs/RELEASING.md for bootstrap instructions."
  exit 0
}
```

**Note:** This treats ALL non-zero exits as warnings and exits 0. This is the correct behavior for pre-bootstrap. Once the package is live in the index, real failures (bad token, network, fork sync issues) should still be visible in the CI log warnings. The planner may want to refine this to only suppress the specific "not found" exit code once the exact code is known. [ASSUMED: exit code not confirmed in official docs]

### Pattern: ManifestVersion verification (informational only)

The CONTEXT.md specifies a verification step to resolve WR-02. wingetcreate manages ManifestVersion itself when running `update` — it reads the existing manifest from the index and preserves its ManifestVersion. The local templates are only used for the bootstrap PR.

**ManifestVersion 1.12.0 is confirmed current** — the winget-pkgs schema directory at `master` lists 1.12.0 as the latest schema version, and the 1.12.0 installer.md states: "This key must have the value '1.12.0'." [VERIFIED: github.com/microsoft/winget-pkgs/tree/master/doc/manifest/schema]

The informational verification step from CONTEXT.md (fetching the schema URL to log the current version) is worth keeping as a sanity step but is not load-bearing for the automated path.

```powershell
# Informational: confirm ManifestVersion still matches templates
$schemaUrl = "https://github.com/microsoft/winget-pkgs/blob/master/doc/manifest/schema/1.12.0/installer.md"
$expectedMV = "1.12.0"
$templateMV = (Select-String -Path "packages\winget\sandwichfarm.nsyte.installer.yaml" `
  -Pattern "ManifestVersion:\s*(.+)").Matches[0].Groups[1].Value.Trim()
if ($templateMV -ne $expectedMV) {
  Write-Host "::warning::Template ManifestVersion ($templateMV) differs from expected ($expectedMV). Update packages/winget/ templates."
}
```

### Anti-Patterns to Avoid

- **Passing `--token` on the command line:** Causes token to appear in CI logs. Use `WINGET_CREATE_GITHUB_TOKEN` env var instead. [CITED: github.com/microsoft/winget-create/blob/main/doc/token.md]
- **Using fine-grained PAT:** wingetcreate requires a classic PAT. Fine-grained tokens are explicitly not supported. [CITED: github.com/microsoft/winget-create/blob/main/doc/token.md]
- **Running on ubuntu-latest:** wingetcreate is a .NET exe that requires a Windows runner. The existing AUR/Homebrew/Scoop jobs run on ubuntu-latest; this job is the exception.
- **Forgetting `--no-open`:** Without this flag, wingetcreate tries to open a browser to the PR, which hangs a headless CI runner.
- **Using local YAML templates as wingetcreate input:** The `update` command reads from the live winget-pkgs index, not from local files. Local templates are bootstrap-only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fork + commit + PR to winget-pkgs | Custom git clone / push script | `wingetcreate update --submit` | wingetcreate handles fork creation, branch naming, commit format, PR title format — all to Microsoft's required conventions |
| Manifest YAML generation | Template substitution for installer/version/locale YAMLs | `wingetcreate update` | wingetcreate fetches existing manifest, bumps only version + URL + hash fields |
| Installer SHA256 download | Download exe in CI job | Use `sha256_windows` output from `setup` job | Already computed by the upstream job |

**Key insight:** wingetcreate is the only officially supported automated path. Microsoft will reject PRs that don't follow the required manifest format; wingetcreate enforces that format automatically.

---

## Common Pitfalls

### Pitfall 1: Classic PAT required (fine-grained not supported)
**What goes wrong:** CI fails with an authentication or API error when using a fine-grained PAT.
**Why it happens:** wingetcreate's GitHub OAuth flow does not support fine-grained tokens. [CITED: github.com/microsoft/winget-create/blob/main/doc/token.md]
**How to avoid:** Create a classic PAT at `github.com/settings/tokens` with `public_repo` scope. Optionally add `delete_repo` scope so wingetcreate can clean up failed fork attempts.
**Warning signs:** Immediate auth failure in the wingetcreate output.

### Pitfall 2: Fork sync lag on first run
**What goes wrong:** wingetcreate fails with "The forked repository could not be synced with the upstream commits."
**Why it happens:** If the user's fork of winget-pkgs is significantly behind, wingetcreate cannot fast-forward it. [CITED: officialaptivi.wordpress.com/2026/05/03/fixing-wingetcreate-fork-synchronization-issue]
**How to avoid:** Before the first automated CI run, manually sync the fork at `github.com/<username>/winget-pkgs` → "Sync Fork" → "Update Branch".
**Warning signs:** Error message mentions fork sync or upstream commits.

### Pitfall 3: URL count must match installer node count
**What goes wrong:** wingetcreate exits non-zero with "number of installer URLs must match existing installer nodes."
**Why it happens:** The existing manifest in winget-pkgs has a specific number of installer entries; `--urls` must supply exactly that many. [CITED: github.com/microsoft/winget-create/blob/main/doc/update.md]
**How to avoid:** nsyte has a single x64 Windows installer — one URL. The bootstrap PR must create a manifest with exactly one installer entry. If the bootstrap was done correctly, the update will always supply one URL.
**Warning signs:** Exit non-zero with URL count mismatch message.

### Pitfall 4: `--no-open` missing causes runner hang
**What goes wrong:** CI job hangs indefinitely after wingetcreate finishes, eventually timing out.
**Why it happens:** wingetcreate by default opens the new PR in a browser. On a headless runner, this call blocks.
**How to avoid:** Always include `--no-open` in CI invocations.
**Warning signs:** Job logs show wingetcreate completing but the step never exits.

### Pitfall 5: Installer URL pattern mismatch
**What goes wrong:** wingetcreate cannot detect architecture from the URL or binary.
**Why it happens:** The regex-based arch detection fails on non-standard filenames.
**How to avoid:** nsyte Windows binary is `nsyte-windows-$VERSION.exe`. The URL contains `windows` and no architecture substring. wingetcreate may need an override: `--urls "...nsyte-windows-$VERSION.exe|x64"`. [ASSUMED — test locally or check first CI run output]
**Warning signs:** wingetcreate outputs "Could not detect architecture" or "architecture does not match."

---

## Code Examples

### Complete publish-winget job (windows-latest)

```yaml
# Source: github.com/microsoft/winget-create/blob/main/doc/update.md
#         github.com/microsoft/winget-create/blob/main/doc/token.md
#         dev.to/techwatching/automatically-upgrade-your-package-on-winget-with-github-actions-2hgp

  publish-winget:
    name: Publish to Winget
    needs: [setup]
    if: needs.setup.result == 'success'
    runs-on: windows-latest
    timeout-minutes: 15
    steps:
      - name: Checkout nsyte repo (for ManifestVersion sanity check)
        uses: actions/checkout@v4

      - name: Verify ManifestVersion in templates (informational, resolves WR-02)
        env:
          VERSION: ${{ needs.setup.outputs.version }}
        shell: pwsh
        run: |
          $expected = "1.12.0"
          $templateMV = (Select-String -Path "packages\winget\sandwichfarm.nsyte.installer.yaml" `
            -Pattern "ManifestVersion:\s*(.+)").Matches[0].Groups[1].Value.Trim()
          if ($templateMV -ne $expected) {
            Write-Host "::warning::Template ManifestVersion ($templateMV) differs from expected ($expected). Update packages/winget/ templates before the next bootstrap."
          } else {
            Write-Host "ManifestVersion verified: $templateMV"
          }

      - name: Download wingetcreate (self-contained, no .NET dep)
        shell: pwsh
        run: |
          iwr https://aka.ms/wingetcreate/latest/self-contained -OutFile wingetcreate.exe

      - name: Submit manifest PR to winget-pkgs
        env:
          VERSION: ${{ needs.setup.outputs.version }}
          REPO: ${{ github.repository }}
          WINGET_CREATE_GITHUB_TOKEN: ${{ secrets.WINGET_FORK_TOKEN }}
        shell: pwsh
        run: |
          $installerUrl = "https://github.com/$($env:REPO)/releases/download/v$($env:VERSION)/nsyte-windows-$($env:VERSION).exe"
          Write-Host "Submitting winget manifest for version $($env:VERSION)"
          Write-Host "Installer URL: $installerUrl"

          .\wingetcreate.exe update sandwichfarm.nsyte `
            --version $env:VERSION `
            --urls "$installerUrl|x64" `
            --submit `
            --no-open

          $exitCode = $LASTEXITCODE
          if ($exitCode -ne 0) {
            Write-Host "::warning::wingetcreate exited with code $exitCode."
            Write-Host "::warning::If sandwichfarm.nsyte is not yet in the winget-pkgs index, run the manual bootstrap PR first."
            Write-Host "::warning::See docs/RELEASING.md ## Winget bootstrap for instructions."
            exit 0
          }
          Write-Host "Winget manifest PR submitted successfully."
```

### Local verify (maintainer machine, Windows)

```powershell
# Pick a published version
$VERSION = "1.5.0"
$REPO = "sandwichfarm/nsyte"

# Download wingetcreate
iwr https://aka.ms/wingetcreate/latest/self-contained -OutFile /tmp/wingetcreate.exe

# Dry run: generate manifests locally without submitting
/tmp/wingetcreate.exe update sandwichfarm.nsyte `
  --version $VERSION `
  --urls "https://github.com/$REPO/releases/download/v$VERSION/nsyte-windows-$VERSION.exe|x64" `
  --out /tmp/winget-test

# Inspect the generated manifests
ls /tmp/winget-test/manifests/s/sandwichfarm/nsyte/$VERSION/
```

The `--out` flag writes manifests locally without submitting. Use this to verify the generated YAML matches expectations before enabling the CI pipeline.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct manifest PRs by hand | `wingetcreate update --submit` | ~2022 | Standard automated path |
| .NET 6.0 required | .NET 8.0 (self-contained available) | ~2024 | Use self-contained exe to eliminate dep |
| `--token` flag (logs token) | `WINGET_CREATE_GITHUB_TOKEN` env var | Documented in token.md | Security improvement |

**Deprecated/outdated:**
- Passing `--token` on the CLI: Still works but logs the token. Replaced by env var.
- Using winget-releaser action (vedantmgoyal9): Uses Komac, not wingetcreate. Different tool, different token model. Avoid for this project since we're standardizing on wingetcreate.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | wingetcreate exits non-zero when `sandwichfarm.nsyte` is not in the index yet; exit-0 guard is correct approach | Common Pitfalls, Code Examples | If wingetcreate errors differently (e.g., hangs or outputs to stderr without exit code), the guard won't work — but first CI run will reveal this |
| A2 | `--urls "...nsyte-windows-$VERSION.exe|x64"` override required because filename has no arch substring | Pitfalls, Code Examples | If wingetcreate correctly auto-detects x64 from binary inspection, the `|x64` override is harmless but unnecessary |
| A3 | Fork sync issue is only a one-time or infrequent problem; CI will generally work once the fork exists | Common Pitfalls | If the maintainer's fork regularly falls far behind, manual sync guidance in RELEASING.md needs a stronger warning |

---

## Open Questions

1. **Exact wingetcreate exit code for "package not found"**
   - What we know: non-zero exit; error message likely mentions package identifier or manifest lookup
   - What's unclear: specific exit code value
   - Recommendation: Run the job once against a non-existent identifier in a test environment, capture exit code, then optionally tighten the guard to only suppress that specific code

2. **Whether `|x64` arch override is needed**
   - What we know: wingetcreate tries regex on URL then binary inspection
   - What's unclear: whether `nsyte-windows-$VERSION.exe` triggers correct x64 detection
   - Recommendation: Include `|x64` override as a defensive measure; it is harmless if detection would have worked anyway

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| windows-latest runner | wingetcreate execution | ✓ | GitHub-managed | — |
| `https://aka.ms/wingetcreate/latest/self-contained` | wingetcreate download | ✓ | Microsoft-hosted redirect | Fall back to `https://aka.ms/wingetcreate/latest` + setup-dotnet |
| WINGET_FORK_TOKEN secret | PR submission auth | ✗ (not set yet) | — | Maintainer must create classic PAT and set secret before first run |
| User's fork of `microsoft/winget-pkgs` | wingetcreate fork/PR creation | ✗ (may not exist) | — | wingetcreate creates it automatically on first run |

**Missing dependencies with no fallback:**
- `WINGET_FORK_TOKEN` secret — must be created by maintainer before CI can submit PRs (RELEASING.md section needed)

**Missing dependencies with fallback:**
- User's fork of winget-pkgs — wingetcreate auto-creates it; no action required unless fork sync issues arise

---

## Validation Architecture

This phase modifies a GitHub Actions YAML file and a docs file. There is no Deno test suite applicable. Validation is:

- **Static:** `actionlint` or YAML syntax check on the modified workflow file
- **Functional (phase gate):** Trigger `publish-packages.yml` via `workflow_dispatch` for a real or test tag and confirm `publish-winget` job completes with exit 0 and a PR appears in `microsoft/winget-pkgs`

### Wave 0 Gaps
None — no test framework to install. Validation is CI-native.

---

## RELEASING.md Sections Required (WINGET-03, WINGET-04)

The following sections must be added to `docs/RELEASING.md`, following the existing AUR/Homebrew/Scoop pattern:

**Section: `WINGET_FORK_TOKEN prerequisite`**
- Why required (wingetcreate needs write access to fork microsoft/winget-pkgs)
- Token type: classic PAT only (fine-grained not supported)
- Required scopes: `public_repo` (mandatory), `delete_repo` (optional, for fork cleanup on failure)
- How to create, add as secret, verify with `gh secret list`
- Symptom of missing/expired token

**Section: `Bootstrapping the winget package (one-time, WINGET-04)`**
- One-time manual PR to `microsoft/winget-pkgs` to add `sandwichfarm.nsyte`
- Fork `microsoft/winget-pkgs`, create directory `manifests/s/sandwichfarm/nsyte/$VERSION/`
- Copy `packages/winget/` YAMLs, substitute PLACEHOLDER values
- Open PR from fork to `microsoft/winget-pkgs`
- After merge: CI `wingetcreate update` handles all future version bumps

**Section: `Verifying winget locally (WINGET-05)`**
- Download wingetcreate, run with `--out /tmp/winget-test` (no `--submit`)
- Inspect generated manifests for correctness

---

## Sources

### Primary (HIGH confidence)
- `github.com/microsoft/winget-create/blob/main/doc/update.md` — update command syntax, all flags, URL count requirement
- `github.com/microsoft/winget-create/blob/main/doc/token.md` — `WINGET_CREATE_GITHUB_TOKEN` env var, classic PAT requirement, `public_repo` scope
- `github.com/microsoft/winget-create/blob/main/README.md` — self-contained download URL, .NET requirements
- `github.com/microsoft/winget-pkgs/tree/master/doc/manifest/schema` — confirmed 1.12.0 is latest schema version
- `github.com/microsoft/winget-pkgs/blob/master/doc/manifest/schema/1.12.0/installer.md` — confirmed ManifestVersion must be "1.12.0"

### Secondary (MEDIUM confidence)
- `dev.to/techwatching/automatically-upgrade-your-package-on-winget-with-github-actions-2hgp` — complete workflow YAML pattern, `iwr` download, `-s -v -u -t` flag usage
- `officialaptivi.wordpress.com/2026/05/03/fixing-wingetcreate-fork-synchronization-issue` — fork sync pitfall and manual sync fix
- `github.com/microsoft/winget-create/issues/130` — PAT permission issue; fork already existing resolves it

### Tertiary (LOW confidence)
- wingetcreate exit code for "package not found" — not officially documented; inferred from tool behavior reports

---

## Metadata

**Confidence breakdown:**
- Command syntax: HIGH — confirmed from official update.md
- Token handling: HIGH — confirmed from official token.md
- ManifestVersion 1.12.0: HIGH — verified against live winget-pkgs schema directory
- Installation method: HIGH — confirmed self-contained URL from README
- Pre-bootstrap exit code handling: LOW — exact exit code not in official docs; guard logic is correct pattern but may need tuning after first run

**Research date:** 2026-05-05
**Valid until:** 2026-08-05 (wingetcreate is stable; ManifestVersion schema changes infrequently)
