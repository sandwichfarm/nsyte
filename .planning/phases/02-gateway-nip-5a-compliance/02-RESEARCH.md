# Phase 2: Gateway NIP-5A Compliance - Research

**Researched:** 2026-03-26
**Status:** Complete

## Research Question

What do we need to know to plan the gateway/resolver update from the old `<identifier>.<npub>` hostname format to the NIP-5A `<pubkeyB36><dTag>` format?

## Findings

### 1. Current Hostname Parsing (`extractNpubAndIdentifier`)

**Location:** `src/lib/gateway.ts` lines 83-110

The function currently handles two formats:
- **Root site:** `npub123.localhost` -- splits on `.`, checks `parts[0].startsWith("npub")`, calls `normalizeToPubkey(parts[0])`
- **Named site:** `blog.npub123.localhost` -- checks `parts.length >= 3`, takes `parts[0]` as identifier and `parts[1]` as npub

**Return type:** `AddressPointer | null` (from applesauce-core) with fields `{ pubkey, kind, identifier }`

**What changes:** The entire function body must be replaced. New logic:
1. If first DNS label starts with "npub" -> root site (unchanged behavior)
2. Otherwise, take first DNS label, extract first 50 chars as base36-encoded pubkey, remainder as dTag
3. Import `base36Decode` from `src/lib/nip5a.ts` (created in Phase 1)
4. Validate the 50-char prefix decodes to a valid 32-byte pubkey
5. Validate the dTag suffix (0-13 chars matching `^[a-z0-9-]{0,13}$`)

### 2. Downstream Dependencies of `extractNpubAndIdentifier`

The function is called exactly once at `gateway.ts` line 260:
```typescript
const sitePointer = extractNpubAndIdentifier(hostname);
```

All downstream code uses the `AddressPointer` return type. Since we keep the same return type, no downstream changes are needed. The rest of `handleRequest()` works with `sitePointer.pubkey`, `sitePointer.identifier`, and `sitePointer.kind` generically.

### 3. `getSiteCacheKey` Method

**Location:** `src/lib/gateway.ts` line 135

```typescript
private getSiteCacheKey(npub: string, identifier?: string): string {
    return identifier ? `${npub}:${identifier}` : `${npub}:root`;
}
```

This method is **never called** anywhere in the codebase (dead code). The actual cache key used throughout the file is `siteAddress` from `getReplaceableAddressFromPointer(sitePointer)`. This dead method can be removed during this phase for cleanup, but it's not blocking.

### 4. `parseSiteIdentifier` in run.ts

**Location:** `src/commands/run.ts` lines 21-64

Handles three formats:
1. `naddr1...` -- decoded via applesauce-core's `decodePointer` (keeps as-is)
2. `<name>.npub1...` -- subdomain format (lines 36-50, **must be removed**)
3. Plain `npub1...` -- root site (keeps as-is)

The subdomain format block (regex match + AddressPointer construction) must be removed per D-04/D-05 from CONTEXT.md. After removal, only `naddr1...` and plain `npub1...` formats are accepted.

### 5. Gateway Startup Messages

**Location:** `src/lib/gateway.ts` lines 162-178

Current output shows:
```
Access nsites via:
  Root site: http://{npub}.localhost:{port}/path/to/file
  Named site: http://{identifier}.{npub}.localhost:{port}/path/to/file
Example: http://npub1abc123.localhost:{port}/index.html
Example: http://blog.npub1abc123.localhost:{port}/index.html
```

Must be updated to show new NIP-5A format:
```
Access nsites via:
  Root site: http://{npub}.localhost:{port}/path/to/file
  Named site: http://{pubkeyB36}{dTag}.localhost:{port}/path/to/file
Example: http://npub1abc123.localhost:{port}/index.html
Example: http://{50-char-base36}{dtag}.localhost:{port}/index.html
```

### 6. Localhost Redirect Logic

**Location:** `src/lib/gateway.ts` lines 244-246

When the gateway receives a request to bare `localhost`, it redirects to the target site URL:
```typescript
const redirectUrl = targetIdentifier
  ? `http://${targetIdentifier}.${targetNpub}.localhost:${port}${url.pathname}${url.search}`
  : `http://${targetNpub}.localhost:${port}${url.pathname}${url.search}`;
```

For named sites, this must be changed to use the NIP-5A format: `http://{base36pubkey}{dtag}.localhost:{port}`. This requires importing `base36Encode` from `src/lib/nip5a.ts` to convert the hex pubkey to base36. Root site redirects remain `http://{npub}.localhost:{port}`.

Similar update needed at lines 170-174 (console display of redirect target).

### 7. Error Messages

**Location:** `src/lib/gateway.ts` lines 264-271

Current error message references old format:
```
"Invalid request. Use npub subdomain (e.g., npub123.localhost or blog.npub123.localhost)"
```

Must be updated to reference new format:
```
"Invalid request. Use npub subdomain for root sites (e.g., npub1abc.localhost) or base36 format for named sites (e.g., {base36pubkey}{dtag}.localhost)"
```

### 8. 404 Fallback Logic

**Location:** `src/lib/gateway.ts` lines 1126-1218

The existing 404 fallback logic already:
1. Checks for `404.html.br` (brotli-compressed)
2. Checks for `404.html.gz` (gzip-compressed)
3. Checks for `404.html` (uncompressed)
4. Returns custom HTML 404 page if none found
5. Sets HTTP status 404 correctly (line 1545: `const statusCode = is404 ? 404 : 200`)

**NIP-5A spec requirement (from nsite-nip.md line 160):** "If a host server is unable to find a site manifest event or a matching `path` tag for the requested path, it MUST use `/404.html` as a fallback path"

The current implementation matches this spec requirement. The compressed variants (`.br`, `.gz`) are a bonus beyond the minimum spec. **No changes needed for 404 fallback.**

### 9. Phase 1 Dependency: `src/lib/nip5a.ts`

This file does not exist yet -- it will be created in Phase 1. Phase 2 needs to import:
- `base36Decode(str: string): Uint8Array` -- to decode 50-char base36 string to 32-byte pubkey
- `base36Encode(pubkey: Uint8Array): string` -- to encode pubkey to 50-char base36 for redirect URLs
- Possibly `isValidDTag(tag: string): boolean` -- for hostname dTag validation

The import path will be: `import { base36Decode, base36Encode } from "./nip5a.ts";`

### 10. Test Considerations

No gateway-specific tests exist currently. The `tests/unit/run_command_test.ts` tests utility functions but not `parseSiteIdentifier` directly (it reimplements utilities locally since the function isn't exported).

For Phase 2 testing:
- `extractNpubAndIdentifier` should be tested with the new format
- `parseSiteIdentifier` should be tested with `naddr1...` and `npub1...` only (old subdomain format rejected)
- Neither function is currently exported, so tests either need to export them or test through the gateway/command interface

### 11. Hex-to-Npub Conversion Pattern

The codebase uses `npubEncode()` from applesauce-core to convert hex pubkeys to npub format for display. This will still be used for root site display. For named sites in the new format, the display will use base36-encoded pubkey instead.

## Validation Architecture

### Testing Strategy

1. **Unit tests for `extractNpubAndIdentifier`:**
   - Valid NIP-5A named site hostname (50-char base36 + 1-13 char dTag)
   - Valid root site hostname (npub prefix)
   - Invalid base36 string (wrong length, invalid chars)
   - Missing dTag (exactly 50 chars = root-like but not npub = should be valid named site with empty identifier)
   - Old format (`blog.npub1xxx.localhost`) should return null

2. **Unit tests for updated `parseSiteIdentifier`:**
   - `naddr1...` still works
   - Plain `npub1...` still works
   - Old subdomain format (`blog.npub1xxx`) throws error
   - Empty/invalid input throws error

3. **Integration verification:**
   - Gateway startup messages show new format
   - Localhost redirect uses new format for named sites
   - 404 fallback still works (regression test)

## Key Risks

1. **Phase 1 not complete:** `src/lib/nip5a.ts` must exist with working `base36Decode`/`base36Encode` before this phase can execute
2. **Named site with empty dTag:** Need to decide behavior when hostname is exactly 50 valid base36 chars with no suffix -- this should be treated as a named site with empty identifier (equivalent to root? or error?)
3. **DNS label length limits:** A base36 pubkey (50 chars) + dTag (up to 13 chars) = up to 63 chars, which is exactly the DNS label limit. This is by design in NIP-5A but worth noting.

## RESEARCH COMPLETE
