# Requirements: nsyte Agent Skills

**Defined:** 2026-02-24
**Core Value:** Agents can discover nsyte and use it end-to-end without prior knowledge

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Setup

- [x] **SETUP-01**: Agent can detect if nsyte is installed and guide multi-platform installation via `nsyte-install` skill
- [x] **SETUP-02**: Agent can initialize a project with config and auth selection via `nsyte-init` skill
- [x] **SETUP-03**: Pre-flight validation scripts in `scripts/` for prerequisite checking

### Deployment

- [x] **DEPL-01**: Agent can deploy a static site to Nostr/Blossom via `nsyte-deploy` skill
- [ ] **DEPL-02**: Shared Nostr domain vocabulary available in `references/nostr-concepts.md`
- [x] **DEPL-03**: Error recovery guidance included in deploy skill for common failures (relay unavailable, auth errors, Blossom rejection)

### Config & Auth

- [x] **CONF-01**: Agent can manage nsyte configuration and settings via `nsyte-config` skill
- [x] **CONF-02**: Agent can set up non-interactive CI/CD deployment via `nsyte-ci` skill
- [ ] **CONF-03**: Agent can guide NIP-46 bunker auth setup via dedicated `nsyte-auth` skill

### Spec Compliance

- [x] **SPEC-01**: All skills have valid SKILL.md frontmatter with `name` and `description` fields
- [x] **SPEC-02**: Directory names match skill `name` fields exactly
- [ ] **SPEC-03**: All SKILL.md bodies are under 500 lines / 5000 tokens
- [ ] **SPEC-04**: All descriptions are third-person with specific activation trigger keywords
- [x] **SPEC-05**: Skills placed in `.agents/skills/` directory for cross-agent discovery

## v2 Requirements

### Management

- **MGMT-01**: Agent can list, browse, download, purge, and manage sites via `nsyte-manage` skill
- **MGMT-02**: Remaining command skills for announce, validate, serve, run, debug
- **MGMT-03**: Plan-validate-execute pattern for destructive operations (purge)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Single monolithic skill | Violates progressive disclosure, exceeds token budget, vague descriptions |
| Exhaustive flag documentation inline | Bloats SKILL.md beyond token budget; agents can use `--help` |
| Version-pinned instructions | Creates maintenance debt; use `compatibility` field instead |
| MCP server integration | Separate concern from Agent Skills format |
| CLI modifications | Skills describe existing nsyte behavior, no CLI changes needed |
| Hosting skills on external registry | Skills ship in the nsyte repo alongside the CLI |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 2 | Complete |
| SETUP-02 | Phase 2 | Complete |
| SETUP-03 | Phase 2 | Complete |
| DEPL-01 | Phase 2 | Complete |
| DEPL-02 | Phase 3.1 | Pending |
| DEPL-03 | Phase 2 | Complete |
| CONF-01 | Phase 3 | Complete |
| CONF-02 | Phase 3 | Complete |
| CONF-03 | Phase 3.1 | Pending |
| SPEC-01 | Phase 1 | Complete (01-01) |
| SPEC-02 | Phase 1 | Complete (01-01) |
| SPEC-03 | Phase 4 | Pending |
| SPEC-04 | Phase 4 | Pending |
| SPEC-05 | Phase 1 | Complete (01-01) |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-02-24 after 01-01 completion (SPEC-01, SPEC-02, SPEC-05 complete)*
