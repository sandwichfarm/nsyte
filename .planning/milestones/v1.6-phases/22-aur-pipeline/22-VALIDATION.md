---
phase: 22
phase-slug: aur-pipeline
date: 2026-05-05
source: RESEARCH.md Validation Architecture section
---

# Phase 22: AUR Pipeline — Validation Strategy

## Test Framework

| Property | Value |
|----------|-------|
| Framework | No automated test framework for GitHub Actions YAML |
| Config file | none |
| Quick run command | `act -j publish-aur --dry-run` (requires `act` installed) or workflow_dispatch on a test tag |
| Full suite command | Manual: trigger `workflow_dispatch` with a real tag, verify AUR page updates |

**Rationale:** GitHub Actions YAML cannot be unit-tested without running in CI. The `act` CLI (local Actions runner) exists but requires additional setup. Functional testing requires an actual AUR account and SSH key. All tests for this phase are integration/smoke tests performed manually.

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUR-02 | Checksums patched into PKGBUILD (not hardcoded) | manual-only | Inspect PKGBUILD on AUR after CI run; grep for no PLACEHOLDERs | N/A |
| AUR-03 | `.SRCINFO` regenerated and committed with PKGBUILD atomically | manual-only | Check AUR git log after push — both files in same commit | N/A |
| AUR-04 | SSH push succeeds on release | manual-only | `workflow_dispatch` with test version tag | N/A |
| AUR-05 | `makepkg -si` works in Docker Arch container | manual/local | `docker run archlinux:base-devel ...` (see RESEARCH.md Code Examples) | N/A |

## Wave 0 Gaps

None — no test files to create; validation is manual/integration only.

## Structural Verification (Automated)

While functional integration tests are manual, structural correctness of the workflow YAML can be verified by grep after execution:

```bash
# AUR-02: Named placeholder substitution (not array index)
grep -q 'PLACEHOLDER_VERSION'          packages/aur/PKGBUILD  # template untouched

# AUR-04: SSH agent action present
grep -q 'webfactory/ssh-agent'         .github/workflows/publish-packages.yml
grep -q 'AUR_SSH_PRIVATE_KEY'          .github/workflows/publish-packages.yml

# AUR-03: makepkg + atomic commit logic present
grep -q 'makepkg --printsrcinfo'       .github/workflows/publish-packages.yml
grep -q 'git.*add PKGBUILD .SRCINFO'   .github/workflows/publish-packages.yml

# AUR-05: base-devel image used (not :latest)
grep -q 'archlinux:base-devel'         .github/workflows/publish-packages.yml
```

These structural checks are used in plan `<automated>` verify blocks and serve as the programmatic gate before manual integration testing.
