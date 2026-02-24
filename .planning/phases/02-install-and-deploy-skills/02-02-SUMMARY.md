---
phase: 02-install-and-deploy-skills
plan: "02"
subsystem: agent-skills
tags: [skills, deploy, nostr, documentation]
dependency_graph:
  requires: []
  provides: [nsyte-deploy-skill, nsyte-concepts-skill]
  affects: [nsyte-setup-skill]
tech_stack:
  added: []
  patterns: [skill-body-authoring, agent-decision-tree]
key_files:
  created: []
  modified:
    - .agents/skills/nsyte-deploy/SKILL.md
    - .agents/skills/nsyte-concepts/SKILL.md
    - .agents/skills/nsyte-concepts/references/nostr-concepts.md
decisions:
  - "Auth documented as --sec flag only (Priority 1) with stored bunker as Priority 2 — no standalone env var auth path"
  - "nbunksec1... documented as credential format (value passed to --sec), not a --nbunksec flag"
  - "nsyte-concepts SKILL.md body added in Phase 2 (minimal, points to references file)"
metrics:
  duration: "2 min"
  completed: "2026-02-24"
  tasks_completed: 2
  files_changed: 3
---

# Phase 02 Plan 02: Deploy Skills Summary

**One-liner:** Complete nsyte-deploy skill body with auth decision tree, output states, and error recovery; fixed nostr-concepts.md to use nsyte init instead of non-existent nsyte login command.

## What Was Built

### Task 1: nsyte-deploy SKILL.md body (commit a0463f1)

Wrote the complete skill body for `.agents/skills/nsyte-deploy/SKILL.md` (187 lines inserted, 194 total). The body covers:

- **Prerequisites** — references nsyte-setup skill and nsyte-concepts for domain vocabulary
- **Authentication** — full decision tree: `--sec` flag (Priority 1) auto-detecting nsec/nbunksec/bunker-URL/hex formats, then stored bunker from `.nsite/config.json` (Priority 2)
- **Deploy Workflow** — step-by-step with common flags table
- **Output Interpretation** — three states: full success, partial success (check Blossom Server Summary), total failure (check Relay Issues and Errors)
- **Error Recovery** — relay unavailable, Blossom rejection, auth error, config missing
- **CI/CD Mode** — `--non-interactive` with `--sec "${NBUNK_SECRET}"` pattern, exit code documentation

### Task 2: nostr-concepts.md fixes and nsyte-concepts SKILL.md body (commit ba9e54f)

Two targeted edits:

1. **Fixed nostr-concepts.md** — Replaced three occurrences of `nsyte login` with `nsyte init` (Pubkey section and nsec/Private Key section). The `login` command does not exist in the current CLI; `nsyte init` is the correct command for project setup and auth initialization.

2. **Added minimal body to nsyte-concepts/SKILL.md** — Replaced stub comment with a 32-line body explaining the skill's purpose (auto-loaded background context), pointing to `references/nostr-concepts.md`, and listing all six concept categories covered.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

| Check | Result |
|-------|--------|
| nsyte-deploy SKILL.md under 200 lines | PASS (194 lines) |
| nsyte-concepts SKILL.md has real body | PASS (32 lines) |
| No `nsyte login` in nostr-concepts.md | PASS (0 occurrences) |
| deploy skill references nsyte-concepts | PASS (line 15) |
| deploy skill has no `--nbunksec` flag | PASS (0 occurrences) |
| All three output states documented | PASS (Full success, Partial success, Total failure) |
| nsyte init in nostr-concepts.md | PASS (2 occurrences) |

## Self-Check: PASSED

All files confirmed present on disk. All commits confirmed in git log.
