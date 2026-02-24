# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Agents can discover nsyte and use it end-to-end without prior knowledge
**Current focus:** Phase 3 — Config and Auth Skills

## Current Position

Phase: 3 of 4 (Config and Auth Skills)
Plan: 2 of 3 in current phase
Status: Executing
Last activity: 2026-02-24 — Plan 03-02 complete

Progress: [██████░░░░] 60%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 3 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-scaffolding | 2 | 7 min | 3.5 min |
| 02-install-and-deploy-skills | 2 | 5 min | 2.5 min |

**Recent Trend:**
- Last 5 plans: 5 min, 2 min, 3 min, 2 min
- Trend: fast

*Updated after each plan completion*

| Phase 03 P02 | 2 min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Multiple skills over single skill: Agents load only what's relevant; better progressive disclosure
- Skills live in nsyte repo: Ship with CLI, versioned together, single source of truth
- Cover all v1 commands: Install, deploy, config, CI, auth — full lifecycle without gaps
- nsyte-deploy gets disable-model-invocation: true to prevent autonomous deployment without user approval
- nsyte-concepts gets user-invocable: false — background domain knowledge, not user-facing workflow
- Skill name field must be byte-for-byte identical to parent directory name (no aliases)
- Custom SKILL.md behavioral flags must nest under metadata: key — skills-ref rejects unknown top-level frontmatter fields
- Binary install path documented as recommended — no Deno runtime dependency required
- Pre-flight scripts are report-only (exit 0/1), never install or modify system
- SKILL.md references both pre-flight scripts by path for inline agent invocation
- Auth documented as --sec flag only (Priority 1) with stored bunker as Priority 2 — no standalone env var auth path
- nbunksec1... is a credential format value passed to --sec, not a --nbunksec flag
- nsyte-concepts SKILL.md body added in Phase 2 (minimal, points to references file)
- [Phase 03]: nsyte-auth covers only interactive bunker management — no CI/deploy content
- [Phase 03]: nsyte-ci covers only credential generation and headless deploy — no bunker management
- [Phase 03]: --nbunksec flag documented only as a warning (does not exist); --sec is the correct flag

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 blockers resolved: auth priority confirmed from CLI source; install commands confirmed from README/scripts
- Phase 3: `.nsite/config.json` schema completeness needs verification from nsyte source before writing config reference

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 03-02-PLAN.md — nsyte-auth and nsyte-ci SKILL.md bodies written
Resume file: None
