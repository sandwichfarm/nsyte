# Phase 1: Encoding & Validation Primitives - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement base36 pubkey encoding/decoding and dTag format validation as standalone, tested utilities. These primitives are consumed by Phase 2 (gateway) and Phase 3 (deploy). No command-level changes in this phase.

</domain>

<decisions>
## Implementation Decisions

### Base36 Encoding
- **D-01:** Use `@scure/base` library for base36 encoding — already a dependency (used in nip46.ts for bech32), keeps encoding approach consistent across codebase
- **D-02:** Encode function takes 32-byte Uint8Array pubkey, returns exactly 50 lowercase characters. Decode reverses this.

### dTag Validation
- **D-03:** Validate against `^[a-z0-9-]{1,13}$` per NIP-5A, additionally reject trailing hyphens
- **D-04:** On validation failure, provide specific error message with a suggested fix (e.g., `Invalid site identifier "My_Blog". Try "my-blog" (lowercase, no underscores, max 13 chars)`)
- **D-05:** Validation function should return both a boolean result and the suggestion string for consumers to use

### Module Organization
- **D-06:** All NIP-5A utilities go in a single new file: `src/lib/nip5a.ts` — base36 encode/decode, dTag validation, and any NIP-5A constants. NIP-aligned naming.

### Claude's Discretion
- Test structure and specific test vectors (edge cases for base36 encoding)
- Internal implementation details of the suggestion generator
- Whether to export a `suggestIdentifier()` function separately or bundle with validation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### NIP-5A Specification
- `nsite-nip.md` (to be renamed to `NIP-5A.md` in Phase 3) -- Current internal spec doc, see Published NIP-5A at https://github.com/nostr-protocol/nips/blob/master/5A.md for authoritative spec

### Existing Encoding Patterns
- `src/lib/nip46.ts` -- Uses `@scure/base` bech32 encoding, reference for import pattern
- `src/lib/manifest.ts` -- Manifest kind constants (NSITE_ROOT_SITE_KIND, NSITE_NAME_SITE_KIND)

### Current Validation
- `src/lib/config.ts` lines 740-760 -- Current identifier validation (too permissive, to be replaced by Phase 3)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@scure/base` package: Already in deno.json deps, used in nip46.ts for bech32. Provides encoding primitives.
- `NSITE_ROOT_SITE_KIND` (15128) and `NSITE_NAME_SITE_KIND` (35128) constants in manifest.ts

### Established Patterns
- Encoding utilities live in `src/lib/` as standalone modules (nip46.ts, nip05.ts)
- Test files mirror source structure in `tests/unit/`
- Uses `@std/assert` for test assertions, `@std/testing` for test utilities

### Integration Points
- Phase 2 will import base36 encode/decode from `src/lib/nip5a.ts` into `src/lib/gateway.ts`
- Phase 3 will import dTag validation from `src/lib/nip5a.ts` into `src/commands/deploy.ts` and `src/lib/config.ts`

</code_context>

<specifics>
## Specific Ideas

- NIP-5A spec: pubkeyB36 is 32-byte pubkey encoded with base36, always exactly 50 characters
- dTag constraint: `^[a-z0-9-]{1,13}$`, must not end with `-`. 13-char limit from 63-char DNS label limit minus 50 chars for base36 pubkey.
- Error suggestions should transform invalid input: uppercase -> lowercase, underscores -> hyphens, truncate if too long

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 01-encoding-validation-primitives*
*Context gathered: 2026-03-26*
