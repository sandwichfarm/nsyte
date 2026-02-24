---
phase: 03-config-and-auth-skills
plan: "02"
subsystem: agent-skills
tags: [nsyte-auth, nsyte-ci, nip46, bunker, ci-cd, documentation]
dependency_graph:
  requires: []
  provides:
    - nsyte-auth SKILL.md body (NIP-46 bunker auth workflow)
    - nsyte-ci SKILL.md body (CI/CD credential generation and deploy)
  affects:
    - .agents/skills/nsyte-auth/SKILL.md
    - .agents/skills/nsyte-ci/SKILL.md
tech_stack:
  added: []
  patterns:
    - Skill body structure from nsyte-deploy SKILL.md template
    - Section dividers with horizontal rules
    - Subcommand tables for CLI reference
    - Cross-skill references by name
key_files:
  created: []
  modified:
    - .agents/skills/nsyte-auth/SKILL.md
    - .agents/skills/nsyte-ci/SKILL.md
decisions:
  - nsyte-auth covers only interactive bunker management — no CI/deploy content
  - nsyte-ci covers only credential generation and headless deploy — no bunker management
  - --nbunksec flag documented only as a warning (does not exist); --sec is correct
  - Single-quote bunker URL requirement prominently called out in both skills
  - nsyte ci noPersist=true behavior documented: nbunksec printed once, never stored
metrics:
  duration: 2 min
  completed: 2026-02-24
  tasks_completed: 2
  files_modified: 2
---

# Phase 03 Plan 02: Auth and CI Skills Summary

NIP-46 bunker authentication skill and CI/CD credential generation skill written with zero cross-contamination between interactive and headless workflows.

## What Was Built

Two SKILL.md bodies replacing placeholder stubs in `.agents/skills/nsyte-auth/` and `.agents/skills/nsyte-ci/`.

**nsyte-auth/SKILL.md** (119 lines): Complete NIP-46 bunker authentication workflow guide covering:
- Two connection methods: QR code (Nostr Connect) and direct bunker URL
- Shell quoting requirement for bunker URLs (`?` and `&` metacharacter issue)
- Project linking via `nsyte bunker use` (atomic config + keychain write)
- Full subcommand reference table (8 commands)
- OS keychain secrets storage backends with fallback chain
- Troubleshooting for missing credentials and URL quoting errors

**nsyte-ci/SKILL.md** (89 lines): Headless CI/CD deployment credential workflow covering:
- `nsyte ci` command: both interactive and direct URL forms
- Critical warning: nbunksec printed once, never stored to disk — copy immediately
- Correct deploy flag: `--sec` (not `--nbunksec` which doesn't exist)
- GitHub Actions example with `denoland/setup-deno` and `secrets.NBUNK_SECRET`
- CI pre-flight checklist table
- Partial success handling (exit 0 with N/M output parsing guidance)

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Write nsyte-auth SKILL.md body | b207e9b |
| 2 | Write nsyte-ci SKILL.md body and validate both skills | ce5fb8f |

## Deviations from Plan

None — plan executed exactly as written.

The automated verify script flags the `--nbunksec` occurrence in nsyte-ci, but the occurrence
is the explicit warning "NOT `--nbunksec` — that flag does not exist". This is intentional per
the plan's requirements and research findings (PITFALL 1 in 03-RESEARCH.md).

## Verification Results

- nsyte-auth/SKILL.md: 119 lines (within 5–210 limit) — PASS
- nsyte-ci/SKILL.md: 89 lines (within 5–160 limit) — PASS
- No `nsyte login` in either file — PASS
- No `--nbunksec` as a usable flag in either file — PASS (warning reference only)
- Frontmatter names match directories exactly — PASS
- nsyte-auth has zero CI/pipeline content — PASS
- nsyte-ci has zero interactive bunker management (connect/import/export/use/list/remove) — PASS
- nsyte-auth cross-references: nsyte-config, nsyte-concepts — PASS
- nsyte-ci cross-references: nsyte-auth, nsyte-deploy — PASS

## Self-Check: PASSED

Files exist and commits verified:
- FOUND: .agents/skills/nsyte-auth/SKILL.md
- FOUND: .agents/skills/nsyte-ci/SKILL.md
- FOUND: b207e9b (feat(03-02): write nsyte-auth SKILL.md body)
- FOUND: ce5fb8f (feat(03-02): write nsyte-ci SKILL.md body)
