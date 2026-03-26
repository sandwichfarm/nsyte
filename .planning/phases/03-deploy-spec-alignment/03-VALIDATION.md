---
phase: 3
slug: deploy-spec-alignment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (built-in) with @std/testing/bdd |
| **Config file** | deno.json |
| **Quick run command** | `deno test tests/unit/nip5a_test.ts` |
| **Full suite command** | `deno test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `deno test tests/unit/nip5a_test.ts tests/unit/deploy_validation_test.ts`
- **After every plan wave:** Run `deno test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | VAL-02 | unit | `deno test tests/unit/deploy_validation_test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | MAN-01 | unit | `deno test tests/unit/manifest_source_test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | DOC-01 | file check | `test -f NIP-5A.md && ! test -f nsite-nip.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. Phase 1 creates `src/lib/nip5a.ts` with `validateDTag()` which Phase 3 imports. Test files for Phase 3 features will be created as part of each plan's tasks.

*No additional Wave 0 setup needed beyond Phase 1 completion.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deploy error message readability | VAL-02 | Subjective UX quality | Run `nsyte deploy` with invalid dTag, verify error is clear and includes suggestion |
| Git remote auto-detection | MAN-01 | Requires actual git repo context | From a git repo with origin remote, run deploy and verify source tag in manifest |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
