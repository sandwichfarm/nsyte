# Phase 1: Encoding & Validation Primitives - Research

**Researched:** 2026-03-26
**Status:** Complete

## Domain Analysis

### Base36 Encoding for NIP-5A

**What NIP-5A requires:**
- `pubkeyB36` is the author's raw 32-byte pubkey encoded with base36 (lowercase, digits 0-9 then letters a-z) and is always exactly 50 characters
- Named site domains use `<pubkeyB36><dTag>.nsite-host.com` format (single DNS label)
- Root sites continue to use `<npub>.nsite-host.com`

**Implementation approach — BigInt conversion:**
- `@scure/base` (already a dependency) does NOT export a `base36` codec — only base16/32/58/64/bech32
- Use JavaScript's native `BigInt` for encoding: convert 32 bytes to BigInt, call `.toString(36)`, left-pad to 50 chars with `'0'`
- Decoding: parse base36 string back to BigInt (using `parseInt` per char or `BigInt("0x" + ...)` approach), convert BigInt to 32-byte Uint8Array
- Verified: max 32-byte value (all 0xFF) produces exactly 50 base36 chars; lower values produce fewer chars requiring left-padding

**Key findings from testing:**
- `BigInt.toString(36)` produces lowercase output natively
- Left-padding with `'0'` to 50 chars preserves roundtrip fidelity
- All 32-byte values produce between 1 and 50 base36 characters
- The "no padding" note in NIP-5A refers to not using structural padding like base64's `=` — the 50-char guarantee comes from left-padding with zero digits

### dTag Validation

**NIP-5A constraints:**
- Regex: `^[a-z0-9-]{1,13}$`
- Must NOT end with a hyphen
- 13-char limit derives from 63-char DNS label limit minus 50 chars for pubkeyB36
- Only lowercase letters, digits, and hyphens allowed

**Suggestion generator (from CONTEXT.md D-04, D-05):**
- On invalid input, provide actionable suggestion: e.g., `Invalid site identifier "My_Blog". Try "my-blog"`
- Transformations: uppercase -> lowercase, underscores -> hyphens, truncate if >13 chars, strip invalid chars, remove trailing hyphens

## Codebase Patterns

### Module organization
- Encoding utilities live in `src/lib/` as standalone modules (nip46.ts, nip05.ts pattern)
- Decision D-06: new file `src/lib/nip5a.ts` for all NIP-5A utilities
- Import pattern from nip46.ts: `import { bech32 } from "@scure/base"` — but we won't need @scure/base since no base36 codec exists there

### Test patterns
- Tests use `@std/assert` (assertEquals, assertThrows) and `@std/testing/bdd` (describe, it)
- Test files in `tests/unit/` named `<module>_test.ts`
- BDD-style with describe/it blocks
- Test file for this module: `tests/unit/nip5a_test.ts`

### Dependencies available
- `@noble/hashes/utils` — `bytesToHex`, `hexToBytes` (for converting between hex and bytes)
- `@scure/base` — has bech32 but NOT base36 (confirmed by listing exports)
- No additional dependencies needed — BigInt is built into JavaScript

## Validation Architecture

### Test vectors for base36 encoding
1. All zeros (32 bytes of 0x00) → 50 chars of '0' → "00000000000000000000000000000000000000000000000000"
2. All 0xFF (32 bytes) → "6dp5qcb22im238nr3wvp0ic7q99w035jmy2iw7i6n43d37jtof" (max value, exactly 50 chars naturally)
3. Known pubkey from NIP spec: `266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5` → encode → decode → same bytes
4. Single byte value (0x01 in last byte) → "00000000000000000000000000000000000000000000000001"

### Test vectors for dTag validation
1. Valid: "blog", "my-site", "a", "1234567890123" (13 chars)
2. Invalid — too long: "12345678901234" (14 chars)
3. Invalid — trailing hyphen: "blog-"
4. Invalid — uppercase: "Blog"
5. Invalid — underscores: "my_site"
6. Invalid — empty string: ""
7. Invalid — special chars: "my.site", "my site"

### Test vectors for suggestion generator
1. "My_Blog" → suggest "my-blog"
2. "HELLO" → suggest "hello"
3. "this-is-way-too-long-name" → suggest truncated version
4. "valid-name" → no suggestion needed (valid)
5. "blog-" → suggest "blog"

## Risk Assessment

### Low risk
- Pure utility functions with no side effects
- No network calls, no file I/O
- No external dependencies beyond JavaScript built-ins
- Straightforward BigInt math

### Edge cases to handle
- All-zero pubkey (pathological but valid)
- Leading zeros in base36 string (must preserve during decode)
- Empty dTag (invalid per regex — must reject)
- dTag that is just hyphens like "-" (valid per regex but fails trailing hyphen check? No — single "-" ends with "-" so rejected)

## RESEARCH COMPLETE
