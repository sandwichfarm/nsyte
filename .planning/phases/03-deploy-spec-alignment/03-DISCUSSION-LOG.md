# Phase 3: Deploy & Spec Alignment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 03-deploy-spec-alignment
**Areas discussed:** Source tag config, NIP-5A.md content, Deploy validation UX

---

## Source Tag Config

| Option | Description | Selected |
|--------|-------------|----------|
| Config field only | New `source` field in config.json. User sets manually. | |
| Config + auto-detect | Config field takes priority, auto-detect from git remote if absent. | ✓ |
| Config + CLI flag | Config field + --source flag on deploy. No auto-detect. | |

**User's choice:** Config + auto-detect
**Notes:** Convenient for most projects, config overrides auto-detection

---

## NIP-5A.md Content

| Option | Description | Selected |
|--------|-------------|----------|
| Exact copy of published spec | Mirror the published NIP-5A as a reference copy. | |
| Link only | Just a link + one-liner description. No duplicated content. | ✓ |
| You decide | Let Claude determine best approach | |

**User's choice:** Link only (initially selected "Exact copy", then corrected to "Link only")
**Notes:** No duplicated content to maintain

---

## Deploy Validation UX

| Option | Description | Selected |
|--------|-------------|----------|
| Before upload starts (Recommended) | Validate dTag after config load, before file hashing/uploading. Fast fail. | ✓ |
| During init too | Validate in both nsyte init and deploy start. | |
| You decide | Let Claude determine best timing | |

**User's choice:** Before upload starts
**Notes:** Single validation point at deploy time

## Claude's Discretion

- Config schema update details
- SSH-to-HTTPS URL conversion
- Error message formatting

## Deferred Ideas

None
