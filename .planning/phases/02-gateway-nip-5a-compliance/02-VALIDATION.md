---
phase: 2
slug: gateway-nip-5a-compliance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno.test (built-in) |
| **Config file** | `deno.test.json` |
| **Quick run command** | `deno test tests/unit/gateway_test.ts tests/unit/run_command_test.ts` |
| **Full suite command** | `deno test --config deno.test.json` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `deno test tests/unit/gateway_test.ts tests/unit/run_command_test.ts`
- **After every plan wave:** Run `deno test --config deno.test.json`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | URL-02 | unit | `deno test tests/unit/gateway_test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | URL-03 | unit | `deno test tests/unit/gateway_test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | URL-02 | unit | `deno test tests/unit/run_command_test.ts` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 2 | MAN-02 | unit | `deno test tests/unit/gateway_test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/gateway_test.ts` — test stubs for extractNpubAndIdentifier with NIP-5A format (URL-02, URL-03, MAN-02)
- [ ] Export `extractNpubAndIdentifier` from gateway.ts (or create testable wrapper) so tests can import it

*Existing `tests/unit/run_command_test.ts` covers parseSiteIdentifier utilities but reimplements them locally. May need updating to test actual exported function.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Startup messages show new URL format | URL-02 | Console output visual check | Run `nsyte run` and verify output shows `{base36pubkey}{dtag}.localhost` format |
| Browser redirect to correct URL | URL-02 | Requires running gateway | Start gateway, visit `localhost:6798`, verify redirect URL format |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
