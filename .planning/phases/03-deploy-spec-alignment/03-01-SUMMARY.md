# Plan 03-01 Summary: Deploy Validation & Source Tag Support

## Status: COMPLETE

## What was built
- Added `source` field to config schema and ProjectConfig type for optional repository URL
- Added source tag support to `createSiteManifestTemplate` in manifest.ts
- Created `sshToHttpsUrl()` and `detectSourceUrl()` utilities for git remote auto-detection
- Wired NIP-5A dTag validation into deploy command (fails early before signer init)
- Wired source URL auto-detection into manifest creation in deploy command
- Created comprehensive unit tests for source URL utilities and manifest source tag

## Key files

### Created
- tests/unit/manifest_source_test.ts

### Modified
- src/schemas/config.schema.json (added source property)
- src/lib/config.ts (added source field to ProjectConfig)
- src/lib/manifest.ts (added source tag to template, updated metadata type)
- src/lib/utils.ts (added sshToHttpsUrl, detectSourceUrl)
- src/commands/deploy.ts (added dTag validation, source URL detection, imports)

## Self-Check: PASSED
- All type checks pass (`deno check`)
- All 8 new test steps pass
- All existing nip5a and utils tests pass (no regressions)
- dTag validation occurs before signer init
- Source tag included in manifest only when URL available
- SSH URLs correctly converted to HTTPS format

## Decisions
- Source URL detection priority: config.source > git remote origin > omit
- dTag validation placed between config null check and initSigner for earliest possible failure
- SSH-to-HTTPS conversion handles GitHub, GitLab, and other git hosting patterns
