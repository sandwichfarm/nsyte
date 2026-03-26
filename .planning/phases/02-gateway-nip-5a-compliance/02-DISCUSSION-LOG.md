# Phase 2: Gateway NIP-5A Compliance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 02-gateway-nip-5a-compliance
**Areas discussed:** Local dev URL format, Run command input, 404 fallback scope

---

## Local Dev URL Format

| Option | Description | Selected |
|--------|-------------|----------|
| Full NIP-5A format only | Use real base36+dTag format even locally. Consistent, but long URLs. | ✓ |
| Both formats | Support NIP-5A + shorter local-only format. Gateway auto-detects. | |
| You decide | Let Claude determine best approach | |

**User's choice:** Full NIP-5A format only
**Notes:** Consistency with production over convenience

---

## Run Command Input

| Option | Description | Selected |
|--------|-------------|----------|
| naddr only | Only accept naddr format. Drop old name.npub format. | |
| naddr + npub (root only) | naddr for named sites, plain npub for root sites. | ✓ |
| You decide | Let Claude pick | |

**User's choice:** naddr + npub (root only)
**Notes:** Simpler than old format, human-friendly for root sites

---

## 404 Fallback Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Verify existing is correct | Review existing code, ensure NIP-5A compliance, fix gaps. No rewrite. | ✓ |
| You decide | Let Claude audit and fix | |

**User's choice:** Verify existing is correct
**Notes:** Existing implementation already has 404.html fallback with compressed variants

## Claude's Discretion

- Error messages for invalid hostnames
- Debug output format
- Hostname parsing edge cases

## Deferred Ideas

None
