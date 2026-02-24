---
phase: 01-scaffolding
plan: 02
subsystem: infra
tags: [skills, agents, nostr, blossom, skills-ref, validator]

# Dependency graph
requires:
  - phase: 01-01
    provides: Six .agents/skills/ directories with valid SKILL.md frontmatter stubs and nsyte-concepts/references/ placeholder
provides:
  - Canonical Nostr/Blossom domain vocabulary reference at .agents/skills/nsyte-concepts/references/nostr-concepts.md
  - Six skill directories all passing skills-ref validate with zero errors
  - Agent-readable definitions for: Relay, Pubkey, nsec/Private Key, Blossom Server, NIP-46/Bunker Auth, Nostr Event
affects:
  - 01-03 (will use nostr-concepts.md for terminology when writing skill bodies)
  - Phase 2 skills (deploy, setup) import vocabulary from this reference

# Tech tracking
tech-stack:
  added: [skills-ref (dev-only Python validator, /tmp/skills-ref-venv)]
  patterns:
    - "Custom skill frontmatter fields (disable-model-invocation, user-invocable) belong under metadata: not as top-level keys"
    - "skills-ref validate is the authoritative structural check for all SKILL.md files"
    - "nostr-concepts.md: every section must have a For agents: actionable guidance paragraph"

key-files:
  created:
    - .agents/skills/nsyte-concepts/references/nostr-concepts.md
  modified:
    - .agents/skills/nsyte-deploy/SKILL.md
    - .agents/skills/nsyte-concepts/SKILL.md

key-decisions:
  - "Custom frontmatter fields must be nested under metadata: — skills-ref rejects top-level unknown fields"
  - "disable-model-invocation and user-invocable preserved as metadata: subfields to maintain semantic intent"

patterns-established:
  - "SKILL.md metadata pattern: custom behavioral flags go under metadata: key, not as top-level frontmatter"
  - "nostr-concepts.md definition pattern: concept description + For agents: actionable guidance paragraph"

requirements-completed: [SPEC-01, SPEC-02, SPEC-05]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Phase 1 Plan 02: Nostr Concepts Reference and Skills Validation Summary

**71-line agent-readable nostr-concepts.md with six domain definitions and all six skills passing skills-ref validate after moving custom flags under metadata:**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T10:32:23Z
- **Completed:** 2026-02-24T10:34:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Wrote complete nostr-concepts.md with six sections (Relay, Pubkey, nsec/Private Key, Blossom Server, NIP-46/Bunker Auth, Nostr Event), each with actionable "For agents:" guidance — no real credentials anywhere
- Installed skills-ref validator in a temporary venv and discovered two SKILL.md frontmatter violations
- Fixed both violations by moving custom flags under `metadata:` and confirmed all six skills pass `skills-ref validate` with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Write nostr-concepts.md with full agent-readable definitions** - `8150c11` (feat)
2. **Task 2: Install skills-ref validator and validate all six skills** - `51b3741` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `.agents/skills/nsyte-concepts/references/nostr-concepts.md` - 71-line Nostr/Blossom vocabulary reference for agents
- `.agents/skills/nsyte-deploy/SKILL.md` - Moved `disable-model-invocation` under `metadata:` to pass validator
- `.agents/skills/nsyte-concepts/SKILL.md` - Moved `user-invocable` under `metadata:` to pass validator

## Decisions Made
- Custom behavioral flags (`disable-model-invocation`, `user-invocable`) moved under `metadata:` to comply with skills-ref spec while preserving their semantic intent. The skills-ref validator only allows: `allowed-tools`, `compatibility`, `description`, `license`, `metadata`, `name` as top-level fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid frontmatter fields in nsyte-deploy and nsyte-concepts SKILL.md files**
- **Found during:** Task 2 (Install skills-ref validator and validate all six skills)
- **Issue:** `disable-model-invocation: true` and `user-invocable: false` were top-level frontmatter keys; skills-ref rejects unknown top-level fields
- **Fix:** Moved both fields under `metadata:` subkey — `metadata: { disable-model-invocation: true }` and `metadata: { user-invocable: false }` respectively
- **Files modified:** `.agents/skills/nsyte-deploy/SKILL.md`, `.agents/skills/nsyte-concepts/SKILL.md`
- **Verification:** `skills-ref validate` reports "Valid skill" for all six directories
- **Committed in:** `51b3741` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — invalid frontmatter)
**Impact on plan:** Auto-fix required for plan success criterion (skills-ref validate passing). Semantic intent of both flags preserved under metadata:. No scope creep.

## Issues Encountered

skills-ref discovered that Plan 01-01's custom frontmatter fields (`disable-model-invocation`, `user-invocable`) were placed as top-level YAML keys which the validator rejects. The fix is straightforward and preserves intent — the fields are semantically meaningful to agents even under `metadata:`.

## User Setup Required

None - no external service configuration required. skills-ref venv is at `/tmp/skills-ref-venv` (dev-only, not committed).

## Next Phase Readiness
- nostr-concepts.md is ready for Plans 01-03 and all Phase 2 skills to reference
- All six SKILL.md files are validator-clean — Phase 2 can write body content without structural concerns
- STATE.md blockers still apply: nsyte auth priority order and exact install command should be confirmed from source before Phase 2 skill bodies are written

---
*Phase: 01-scaffolding*
*Completed: 2026-02-24*

## Self-Check: PASSED

All created/modified files verified present on disk. Task commits 8150c11 and 51b3741 verified in git log.
