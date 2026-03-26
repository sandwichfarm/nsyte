# Phase 1: Encoding & Validation Primitives - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-encoding-validation-primitives
**Areas discussed:** Base36 implementation, Validation error UX, Module organization

---

## Base36 Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| @scure/base (Recommended) | Already a dependency. Has base encoding utilities. Consistent with existing nip46.ts usage. | ✓ |
| Pure BigInt math | Zero new deps. Convert 32-byte array to BigInt, divide by 36 repeatedly. More code but self-contained. | |
| You decide | Let Claude pick the best approach based on what @scure/base actually supports for base36 | |

**User's choice:** @scure/base (Recommended)
**Notes:** Existing dependency, consistent with codebase patterns

---

## Validation Error UX

| Option | Description | Selected |
|--------|-------------|----------|
| Reject with suggestion | Error + suggest fix: 'Invalid site identifier "My_Blog". Try "my-blog"' | ✓ |
| Reject with rules | Error + state the rules: 'Must match [a-z0-9-], max 13 chars, no trailing hyphen' | |
| You decide | Let Claude pick the best error message approach | |

**User's choice:** Reject with suggestion
**Notes:** Provide helpful corrections, not just rules

---

## Module Organization

| Option | Description | Selected |
|--------|-------------|----------|
| New src/lib/nip5a.ts | Single file for all NIP-5A utilities. Clean NIP-aligned naming. | ✓ |
| Separate files | src/lib/base36.ts for encoding + src/lib/validation.ts for dTag rules. More granular. | |
| You decide | Let Claude pick based on codebase conventions | |

**User's choice:** New src/lib/nip5a.ts
**Notes:** All NIP-5A utilities in one file

## Claude's Discretion

- Test structure and specific test vectors
- Internal implementation details of suggestion generator
- Export structure decisions

## Deferred Ideas

None
