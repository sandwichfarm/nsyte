# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Agents can discover nsyte and use it end-to-end without prior knowledge
**Current focus:** Phase 4 — Validation

## Current Position

Phase: 4 of 4 (Validation)
Plan: 1 of 2 in current phase — COMPLETE
Status: In Progress
Last activity: 2026-02-24 — Plan 04-01 complete

Progress: [█████████░] 90%

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
| Phase 03 P01 | 2 min | 2 tasks | 1 file |
| Phase 03.1-cross-reference-fixes P01 | 2 | 2 tasks | 3 files |
| Phase 04-validation P01 | 1 | 2 tasks | 5 files |

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
- [Phase 03, 03-01]: nsyte-config SKILL.md bunkerPubkey warning placed in both table row and standalone block for emphasis
- [Phase 03, 03-01]: Interactive Config Editing section leads with TTY constraint before keyboard reference
- [Phase 03.1-cross-reference-fixes]: nsyte bunker connect is the correct subcommand — nsyte bunker add does not exist; corrected in nostr-concepts.md, nsyte-auth/SKILL.md, and nsyte-deploy/SKILL.md
- [Phase 03.1-cross-reference-fixes]: nsyte init is documented in nsyte-setup skill — nsyte-auth prerequisites now reference nsyte-setup instead of nsyte-config
- [Phase 04-validation]: SKILL.md descriptions must include Nostr/decentralized context vocabulary for agent skill discovery
- [Phase 04-validation]: Real relay URLs in SKILL.md examples replaced with wss://relay.example.com placeholder (no-real-credentials policy)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 blockers resolved: auth priority confirmed from CLI source; install commands confirmed from README/scripts
- Phase 3: `.nsite/config.json` schema completeness needs verification from nsyte source before writing config reference

## Session Continuity

Last session: 2026-02-24T12:57:33Z
Stopped at: Completed 04-01-PLAN.md — SPEC-04 SKILL.md vocabulary compliance
Resume file: None
