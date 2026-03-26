# Phase 3: Deploy & Spec Alignment - Research

**Researched:** 2026-03-26
**Status:** Complete

## Research Question

What do I need to know to PLAN this phase well?

## Phase Scope

Wire NIP-5A dTag validation into the deploy command (fail early before upload), add optional `source` tag support with git remote auto-detection, and replace `nsite-nip.md` with a link-only `NIP-5A.md`.

**Requirements:** VAL-02, MAN-01, DOC-01

## Findings

### 1. Deploy Command Architecture

The deploy flow in `src/commands/deploy.ts` follows this sequence:

1. `deployCommand()` (line 245) is the entry point
2. `resolveContext()` (line 538) reads config from `.nsite/config.json`
3. `initSigner()` (line 690) sets up the signing key
4. Config values are extracted and relays/servers resolved (lines 287-325)
5. `displayConfig()` (line 930) shows deployment configuration
6. Files are scanned, compared, and uploaded
7. `createSiteManifestEvent()` is called (line 1509) with the manifest

**dTag validation insertion point:** Between line 268 (where `config` is extracted from `resolveContext()`) and line 276 (where `initSigner()` begins). This is the earliest possible point after config load. The `config.id` field holds the site identifier.

The pattern for extracting `siteId` is repeated at three locations (lines 939, 972, 1484):
```typescript
const siteId = config.id === null || config.id === "" ? undefined : config.id;
```

### 2. Manifest Template (`src/lib/manifest.ts`)

`createSiteManifestTemplate()` (lines 52-103) accepts:
- `files: FilePathMapping[]`
- `identifier?: string`
- `metadata?: { title?: string; description?: string; servers?: string[]; relays?: string[] }`

Tags are added in order: `d` tag, `path` tags, `server` tags, `relay` tags, `title`, `description`, `client`.

**Source tag insertion:** Add `source` to the `metadata` interface and append a `["source", url]` tag after the `description` tag and before the `client` tag. Follow the same pattern as title/description:
```typescript
if (metadata?.source) {
  tags.push(["source", metadata.source]);
}
```

### 3. Config Schema (`src/schemas/config.schema.json`)

The schema uses JSON Schema draft-07 with ajv validation. Optional fields like `title` and `description` are simple `{ "type": "string" }` entries. The `source` field should follow the same pattern but with a URL format constraint.

The `ProjectConfig` type in `src/lib/config.ts` (line 14) must also get a `source?: string` field.

### 4. Source URL Auto-Detection

CONTEXT.md specifies:
- New `source` field in `.nsite/config.json` for repository URL
- Auto-detect from `git remote get-url origin` when absent
- Convert SSH URLs (`git@github.com:user/repo.git`) to HTTPS (`https://github.com/user/repo`)
- Source URL must be http or https per NIP-5A spec

SSH-to-HTTPS conversion regex pattern:
```
git@([^:]+):(.+?)(?:\.git)?$  →  https://$1/$2
```

The auto-detection should happen in the deploy command, not in config loading, since it's runtime behavior. It should be a utility function for testability.

### 5. Phase 1 Dependencies

Phase 1 creates `src/lib/nip5a.ts` with:
- `validateDTag(tag: string): { valid: boolean; error?: string; suggestion?: string }`
- `suggestIdentifier(input: string): string`
- `DTAG_MAX_LENGTH = 13`
- `DTAG_REGEX = /^[a-z0-9-]{1,13}$/`

Phase 3 imports `validateDTag` from this module. The function returns a structured result that includes an optional suggestion, which the deploy command can display as an actionable error message.

### 6. Current `nsite-nip.md`

The file at repo root contains the full draft spec (174 lines). It still uses old URL format (`<identifier>.<npub>.nsite-host.com`) and is labeled "NIP-XX". Per CONTEXT.md, this should be replaced with a minimal `NIP-5A.md` containing only a link to the published spec.

### 7. Deploy Config Propagation

In the deploy command, the metadata object is built at line 1493:
```typescript
const metadata = {
  title: config.title,
  description: config.description,
  servers: manifestServers,
  relays: manifestRelays,
};
```

The `source` field needs to be added here, using either `config.source` or the auto-detected git URL.

### 8. Existing Test Patterns

Tests in `tests/unit/` use:
- `@std/assert` for assertions (`assertEquals`, `assertThrows`)
- `@std/testing/bdd` for structure (`describe`, `it`)
- Test files are named `{module}_test.ts`
- Config tests in `config_test.ts` test validation and schema

## Validation Architecture

### Test Strategy

1. **Unit tests for source URL utilities:**
   - SSH-to-HTTPS conversion
   - URL validation (http/https only)
   - Git remote auto-detection (mock `Deno.Command`)

2. **Unit tests for deploy validation integration:**
   - Valid dTag passes
   - Invalid dTag exits with error before upload
   - Source tag present in manifest when configured
   - Source tag absent when not configured

3. **Integration verification:**
   - `deno check` passes on all modified files
   - Existing tests still pass

## Risk Assessment

- **Low risk:** Schema changes are additive (new optional `source` field)
- **Low risk:** Documentation rename is a simple file operation
- **Medium risk:** Deploy command modification touches critical deployment path -- validation must not block valid deployments
- **Low risk:** Git auto-detection is best-effort -- failure should not block deploy

## Implementation Notes

1. The dTag validation should only trigger for named sites (when `config.id` is present and non-empty)
2. Source tag auto-detection from git should be silent on failure (no git repo, no remote) -- just skip the source tag
3. The `nsite-nip.md` replacement is a git operation: delete old file, create new `NIP-5A.md`
4. Config schema must keep `additionalProperties: false` so adding `source` requires explicit schema entry

---

## RESEARCH COMPLETE

*Phase: 03-deploy-spec-alignment*
*Researched: 2026-03-26*
