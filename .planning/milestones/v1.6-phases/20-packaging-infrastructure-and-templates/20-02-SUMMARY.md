---
phase: 20-packaging-infrastructure-and-templates
plan: 02
subsystem: infra
tags: [scoop, winget, packaging, windows, yaml, json, templates]

# Dependency graph
requires: []
provides:
  - Scoop bucket manifest for Windows x64 with autoupdate (packages/scoop/bucket/nsyte.json)
  - Winget version manifest ManifestVersion 1.12.0 (packages/winget/sandwichfarm.nsyte.version.yaml)
  - Winget installer manifest portable x64 (packages/winget/sandwichfarm.nsyte.installer.yaml)
  - Winget en-US locale manifest (packages/winget/sandwichfarm.nsyte.locale.en-US.yaml)
affects: [phase-24-ci, phase-25-winget-submission]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PLACEHOLDER_VERSION bare semver with v prefix only in URL paths, not in version fields"
    - "PLACEHOLDER_SHA256_WINDOWS as common hash placeholder for both Scoop and Winget"
    - "Scoop flat top-level schema with autoupdate.hash.mode=download (no sidecar SHA file)"
    - "Winget triple-manifest layout: version.yaml + installer.yaml + locale.en-US.yaml"
    - "Scoop #/nsyte.exe URL fragment convention renames downloaded binary inside apps/ dir"

key-files:
  created:
    - packages/scoop/bucket/nsyte.json
    - packages/winget/sandwichfarm.nsyte.version.yaml
    - packages/winget/sandwichfarm.nsyte.installer.yaml
    - packages/winget/sandwichfarm.nsyte.locale.en-US.yaml
  modified: []

key-decisions:
  - "Scoop manifest uses flat top-level schema, not legacy architecture.64bit nesting"
  - "autoupdate.hash.mode=download because nsyte publishes no SHA sidecar file alongside the EXE"
  - "Winget ManifestVersion 1.12.0 verified March 2026; Phase 25 must re-verify before PR submission"
  - "InstallerType portable for Winget (self-contained EXE, no installer chrome, no InstallerSwitches needed)"
  - "PLACEHOLDER_SHA256_WINDOWS used in both Scoop hash field and Winget InstallerSha256 — Phase 24 CI replaces both"

patterns-established:
  - "PLACEHOLDER_VERSION: bare semver without v prefix; v appears only in download URL path segments"
  - "PLACEHOLDER_SHA256_WINDOWS: 64-char lowercase hex SHA256; NO sha256: prefix; Phase 24 CI fills this value"

requirements-completed: [INFRA-01, SCOOP-01, WINGET-01]

# Metrics
duration: 2min
completed: 2026-05-05
---

# Phase 20 Plan 02: Windows Packaging Templates Summary

**Four well-formed Windows package manager templates: Scoop flat-schema manifest with autoupdate and Winget triple-manifest set (version/installer/locale) using InstallerType portable at ManifestVersion 1.12.0**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-05T11:51:33Z
- **Completed:** 2026-05-05T11:53:13Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments
- Created `packages/scoop/bucket/nsyte.json` using the current flat Scoop schema with `checkver.github` for automatic tag detection, `autoupdate` with `$version` runtime variable, and `autoupdate.hash.mode=download` because nsyte publishes no SHA sidecar file
- Created three Winget manifests in `packages/winget/` that share PackageIdentifier `sandwichfarm.nsyte`, PackageVersion `PLACEHOLDER_VERSION`, and ManifestVersion `1.12.0`
- Installer manifest uses InstallerType `portable` with Architecture `x64` and `PLACEHOLDER_SHA256_WINDOWS` as bare hex hash placeholder (no sha256: prefix per Pitfall 5)
- All files pass Python JSON/YAML syntax validation; all placeholder strings are correctly positioned for Phase 24 CI `sed` substitution

## Placeholder Strings Introduced

| Placeholder | Files | Replaced By |
|---|---|---|
| `PLACEHOLDER_VERSION` | All 4 files — version/PackageVersion fields AND URL path segments | Phase 24 CI (bare semver, no v prefix) |
| `PLACEHOLDER_SHA256_WINDOWS` | `nsyte.json` hash field, `installer.yaml` InstallerSha256 field | Phase 24 CI (64-char lowercase hex sha256 of the Windows EXE) |

Note: Scoop `autoupdate.url` uses `$version` (NOT a placeholder) — this is a Scoop runtime variable that Scoop substitutes automatically after `checkver` detects a new tag. CI must not touch this variable.

## ManifestVersion Note

Winget `ManifestVersion: "1.12.0"` was verified against `microsoft/winget-pkgs` schema as of March 2026. **Phase 25 must re-verify the current ManifestVersion before opening the PR to winget-pkgs**, as Microsoft periodically bumps the required schema version.

## Syntax Validation

```
python3 -m json.tool packages/scoop/bucket/nsyte.json  -> OK
python3 yaml.safe_load (all 3 winget files)            -> OK
```

## Task Commits

Each task was committed atomically:

1. **Task 1: Create packages/scoop/bucket/nsyte.json** - `a130356` (feat)
2. **Task 2: Create three packages/winget/ YAML manifests** - `55f2b2d` (feat)

## Files Created

- `packages/scoop/bucket/nsyte.json` — Scoop bucket manifest, flat schema, Windows x64, with checkver.github + autoupdate ($version + mode:download)
- `packages/winget/sandwichfarm.nsyte.version.yaml` — Winget version manifest, ManifestType version
- `packages/winget/sandwichfarm.nsyte.installer.yaml` — Winget installer manifest, InstallerType portable, Architecture x64
- `packages/winget/sandwichfarm.nsyte.locale.en-US.yaml` — Winget en-US locale manifest, Publisher Sandwich Farm LLC, 4 tags

## Decisions Made

- Scoop flat schema (not `architecture.64bit` nesting) — the legacy nested schema from `.packaging/scoop/nsyte.json` is outdated; current Scoop uses the flat top-level structure
- `autoupdate.hash.mode=download` — nsyte does not publish a `.sha256` sidecar file alongside the EXE, so Scoop must download the binary to compute the hash on update; Phase 24 may optionally add a sidecar in a future plan
- Winget ManifestVersion `1.12.0` — current as of March 2026; Phase 25 must re-verify before submitting to winget-pkgs
- `InstallerType: portable` for Winget — self-contained EXE requires no installer chrome; portable installers do not require InstallerSwitches
- `PLACEHOLDER_SHA256_WINDOWS` shared across both Scoop and Winget — the same Windows EXE is referenced in both, so the same SHA256 value applies; one substitution covers both files

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None - these are template files with explicitly named placeholders, not stubs. All placeholder strings are intentional and documented for Phase 24 CI replacement.

## Threat Flags

None - these are static manifest template files with no network endpoints, auth paths, or trust boundaries introduced.

## Next Phase Readiness

- `packages/scoop/bucket/nsyte.json` and all three `packages/winget/*.yaml` files are ready for Phase 24 CI integration (release workflow substitution of PLACEHOLDER_VERSION and PLACEHOLDER_SHA256_WINDOWS)
- Phase 25 (Winget PR submission) must re-verify ManifestVersion before opening the winget-pkgs PR
- No blockers for subsequent phases

---
*Phase: 20-packaging-infrastructure-and-templates*
*Completed: 2026-05-05*

## Self-Check: PASSED

All created files verified present on disk. All task commits verified in git log.

| Item | Status |
|------|--------|
| packages/scoop/bucket/nsyte.json | FOUND |
| packages/winget/sandwichfarm.nsyte.version.yaml | FOUND |
| packages/winget/sandwichfarm.nsyte.installer.yaml | FOUND |
| packages/winget/sandwichfarm.nsyte.locale.en-US.yaml | FOUND |
| Commit a130356 | FOUND |
| Commit 55f2b2d | FOUND |
