---
phase: 20
slug: packaging-infrastructure-and-templates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | shell / bash (file existence + syntax checks) |
| **Config file** | none — no test framework install needed |
| **Quick run command** | `ls packages/aur/PKGBUILD packages/homebrew/Formula/nsyte.rb packages/scoop/bucket/nsyte.json packages/winget/*.yaml flake.nix 2>&1` |
| **Full suite command** | `bash -c 'namcap packages/aur/PKGBUILD 2>&1 || true; ruby -c packages/homebrew/Formula/nsyte.rb; python3 -c "import json,sys; json.load(open(\"packages/scoop/bucket/nsyte.json\"))"` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (file existence check)
- **After every plan wave:** Run full suite (syntax checks)
- **Before `/gsd-verify-work`:** All files exist and pass syntax checks
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | INFRA-01, AUR-01 | — | No hardcoded secrets | file-check | `test -f packages/aur/PKGBUILD` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | BREW-01 | — | N/A | file-check | `test -f packages/homebrew/Formula/nsyte.rb` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 1 | SCOOP-01 | — | N/A | file-check | `test -f packages/scoop/bucket/nsyte.json && python3 -c "import json; json.load(open('packages/scoop/bucket/nsyte.json'))"` | ❌ W0 | ⬜ pending |
| 20-01-04 | 01 | 1 | WINGET-01 | — | N/A | file-check | `ls packages/winget/*.yaml \| wc -l \| grep -q 3` | ❌ W0 | ⬜ pending |
| 20-01-05 | 01 | 1 | NIX-01 | — | N/A | file-check | `test -f flake.nix && grep -q 'outputs' flake.nix` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/` directory structure created
- [ ] `flake.nix` at repo root

*Phase 20 creates files from scratch — Wave 0 is the file creation itself.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PKGBUILD is syntactically valid | AUR-01 | `namcap` requires Arch Linux | Run `namcap packages/aur/PKGBUILD` in Docker Arch container |
| Homebrew formula parses correctly | BREW-01 | `brew` not available in CI | Run `ruby -c packages/homebrew/Formula/nsyte.rb` |
| Winget manifests validate | WINGET-01 | `winget validate` requires Windows | Run `winget validate packages/winget/` on Windows |
| Nix flake evaluates | NIX-01 | `nix` not installed in dev env | Run `nix flake check` in NixOS container |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
