# Phase 3: Deploy & Spec Alignment - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire NIP-5A dTag validation into the deploy command (fail early before upload), add optional `source` tag support with git remote auto-detection, and replace `nsite-nip.md` with a link-only `NIP-5A.md`.

</domain>

<decisions>
## Implementation Decisions

### Source Tag Config
- **D-01:** New `source` field in `.nsite/config.json` for repository URL. If absent, auto-detect from `git remote get-url origin`. Config takes priority over auto-detect.
- **D-02:** Source URL must be http or https per NIP-5A spec. If auto-detected URL is SSH (git@...), convert to HTTPS equivalent.
- **D-03:** Add `source` tag to manifest template in `createSiteManifestTemplate()` when a source URL is available.

### NIP-5A Documentation
- **D-04:** Replace `nsite-nip.md` with `NIP-5A.md` containing only a link to the published spec (https://github.com/nostr-protocol/nips/blob/master/5A.md) and a one-liner description. No duplicated spec content.

### Deploy Validation
- **D-05:** Validate dTag right after config is loaded, before any file hashing or uploading begins. Use Phase 1's validation function from `src/lib/nip5a.ts`. Error with suggestion on failure.
- **D-06:** Validation only at deploy time (not during init). Keep it simple — one validation point.

### Claude's Discretion
- Config schema update details for the new `source` field
- SSH-to-HTTPS URL conversion logic
- Exact error message formatting at deploy time

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### NIP-5A Specification
- Published NIP-5A at https://github.com/nostr-protocol/nips/blob/master/5A.md — Authoritative spec, specifically the `source` tag definition

### Deploy Command
- `src/commands/deploy.ts` lines 1482-1515 — Manifest creation with site ID handling
- `src/commands/deploy.ts` lines 938-973 — Config reading and site type determination

### Manifest Template
- `src/lib/manifest.ts` lines 52-103 — `createSiteManifestTemplate()` where source tag must be added

### Config
- `src/lib/config.ts` lines 740-760 — Current identifier validation (to be replaced with nip5a.ts import)
- `src/schemas/config.schema.json` lines 120-134 — Schema for `id` field, needs `source` field addition

### Phase 1 Utilities
- `src/lib/nip5a.ts` — dTag validation with suggestions (created in Phase 1)

### Current Spec Doc
- `nsite-nip.md` — To be deleted and replaced with `NIP-5A.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/nip5a.ts` (Phase 1): `validateDTag()` and `suggestIdentifier()` functions
- `createSiteManifestTemplate()` in manifest.ts: Already handles optional metadata tags (title, description, servers, relays)

### Established Patterns
- Config schema validated with ajv + config.schema.json
- Optional config fields use `oneOf` with type + null
- Manifest metadata passed as optional object parameter

### Integration Points
- Deploy command reads `config.id` — validation goes right after config load
- Manifest template takes `metadata` param — add `source` to this interface
- Config schema needs new `source` field definition

</code_context>

<specifics>
## Specific Ideas

- Auto-detect source: `git remote get-url origin` — convert SSH URLs (git@github.com:user/repo.git) to HTTPS (https://github.com/user/repo)
- NIP-5A.md should be minimal: title, link to spec, one sentence saying "nsyte implements this specification"
- The `nsite-nip.md` file is at repo root, not in src/ — simple rename/replace

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-deploy-spec-alignment*
*Context gathered: 2026-03-26*
