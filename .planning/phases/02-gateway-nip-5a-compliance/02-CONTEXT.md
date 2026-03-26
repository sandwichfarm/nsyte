# Phase 2: Gateway NIP-5A Compliance - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the gateway/resolver to parse named site URLs using the NIP-5A `<pubkeyB36><dTag>` single-label hostname format, remove old `<identifier>.<npub>` format entirely, and verify 404 fallback matches spec. Root site npub subdomain format remains unchanged.

</domain>

<decisions>
## Implementation Decisions

### Hostname Parsing
- **D-01:** Use full NIP-5A format only for local development — no shortcut/convenience formats. `<pubkeyB36><dTag>.localhost:port` even though it's long (50-63 chars). Consistency with production matters more than brevity.
- **D-02:** Replace `extractNpubAndIdentifier()` in gateway.ts entirely. New logic: if hostname starts with "npub" → root site (unchanged). Otherwise, take first 50 chars as base36 pubkey, remainder as dTag. Import decode from `src/lib/nip5a.ts`.
- **D-03:** Remove old `<identifier>.<npub>` format from gateway. No backward compat.

### Run Command Input
- **D-04:** `nsyte run` accepts two input formats only: `naddr1...` for named sites, plain `npub1...` for root sites. The old `name.npub1...` subdomain format is removed from `parseSiteIdentifier()`.
- **D-05:** Update `parseSiteIdentifier()` in run.ts to remove the subdomain regex match block.

### 404 Fallback
- **D-06:** Verify existing 404.html fallback logic in gateway.ts matches NIP-5A spec exactly. Current implementation already tries 404.html (and compressed variants). Fix any gaps rather than rewrite.

### Gateway Display
- **D-07:** Update startup console messages (gateway.ts:162-168) to show new URL format examples with base36 pubkey.

### Claude's Discretion
- Exact error messages when base36 hostname decode fails
- Whether to log decoded pubkey in debug output
- Implementation details of hostname parsing edge cases

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### NIP-5A Specification
- Published NIP-5A at https://github.com/nostr-protocol/nips/blob/master/5A.md — Authoritative spec for hostname format, resolution, and 404 behavior

### Gateway Code (primary targets)
- `src/lib/gateway.ts` lines 83-110 — `extractNpubAndIdentifier()` function to be rewritten
- `src/lib/gateway.ts` lines 150-178 — Startup messages with URL format examples
- `src/lib/gateway.ts` lines 1126-1214 — Existing 404.html fallback logic to verify

### Run Command
- `src/commands/run.ts` lines 21-64 — `parseSiteIdentifier()` function to be updated

### Phase 1 Utilities
- `src/lib/nip5a.ts` — Base36 encode/decode + dTag validation (created in Phase 1)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/nip5a.ts` (Phase 1): Base36 decode for hostname → pubkey conversion
- `normalizeToPubkey()` from applesauce-core: Still used for npub → pubkey (root sites)
- `npubEncode()` from applesauce-core: Still used for display purposes

### Established Patterns
- Gateway uses `AddressPointer` type from applesauce-core for site identification
- Gateway has a `getSiteCacheKey()` method using `npub:identifier` format — may need updating
- Request handling flow: hostname → extract site pointer → resolve manifest → serve file

### Integration Points
- `extractNpubAndIdentifier()` return type (`AddressPointer | null`) should remain the same — downstream code in handleRequest expects this shape
- `parseSiteIdentifier()` in run.ts also returns `AddressPointer` — same contract
- Gateway cache keys use npub strings — consider using hex pubkey instead for consistency with base36

</code_context>

<specifics>
## Specific Ideas

- NIP-5A named site URL: `<pubkeyB36><dTag>.host.com` where pubkeyB36 is always exactly 50 chars (base36-encoded 32-byte pubkey). Simple split: first 50 chars = pubkey, remaining 0-13 chars = dTag.
- Root site URL unchanged: `<npub>.host.com` (starts with "npub1")
- If hostname doesn't start with "npub" and isn't 50+ chars of valid base36, return null (unknown format)
- Gateway 404 fallback already supports compressed variants (br, gz) — this exceeds NIP-5A minimum

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-gateway-nip-5a-compliance*
*Context gathered: 2026-03-26*
