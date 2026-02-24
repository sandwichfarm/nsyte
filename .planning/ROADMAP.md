# Roadmap: nsyte Agent Skills

## Overview

Four phases build the Agent Skills package from the ground up: first establish a valid, spec-compliant directory structure with shared Nostr/Blossom vocabulary, then write the install and deploy skills (the prerequisite chain and primary workflow), then write the config and auth skills, and finally validate that every skill meets the spec's token budget and description quality requirements. Each phase ships usable skills; quality is locked in at the end.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Scaffolding** - Establish the `.agents/skills/` directory structure and shared Nostr/Blossom reference content; all skill directories pass `skills-ref validate` before any body content is written (completed 2026-02-24)
- [ ] **Phase 2: Install and Deploy Skills** - Write the install skill (prerequisite chain root) and deploy skill (primary value-delivery workflow), including auth decision tree and error recovery
- [ ] **Phase 3: Config and Auth Skills** - Write the config, CI/CD, and bunker auth skills covering non-interactive and NIP-46 setup patterns
- [ ] **Phase 4: Validation** - Verify every skill meets token budget, description quality, and spec compliance; confirm cross-agent discovery works

## Phase Details

### Phase 1: Scaffolding
**Goal**: A valid `.agents/skills/` directory structure exists with spec-compliant frontmatter skeletons and shared Nostr/Blossom vocabulary that all later skills will reference
**Depends on**: Nothing (first phase)
**Requirements**: SPEC-01, SPEC-02, SPEC-05
**Success Criteria** (what must be TRUE):
  1. `.agents/skills/` directory exists in the repo with one subdirectory per planned skill
  2. Each skill directory contains a SKILL.md whose `name` field exactly matches the directory name
  3. `skills-ref validate` passes for every skill skeleton without errors
  4. `references/nostr-concepts.md` exists and defines relays, pubkeys, Blossom servers, and NIP-46 in agent-readable form
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Create six skill directories with spec-compliant SKILL.md frontmatter stubs
- [x] 01-02-PLAN.md — Write nostr-concepts.md reference content and validate all skills with skills-ref

### Phase 2: Install and Deploy Skills
**Goal**: An agent encountering nsyte for the first time can detect whether it is installed, install it on any platform, initialize a project, and complete a full deploy — guided entirely by two skills
**Depends on**: Phase 1
**Requirements**: SETUP-01, SETUP-02, SETUP-03, DEPL-01, DEPL-02, DEPL-03
**Success Criteria** (what must be TRUE):
  1. `nsyte-setup/SKILL.md` covers installation detection (`nsyte --version`), platform-specific install commands, and first-run verification
  2. `nsyte-deploy/SKILL.md` covers `nsyte init`, the auth decision tree (env var > nsec > bunker), `nsyte deploy [path]`, output interpretation, and error recovery for relay/Blossom failures
  3. Pre-flight scripts in `scripts/` exist for prerequisite checking (Deno runtime, network access)
  4. `references/nostr-concepts.md` is referenced from the deploy skill for domain vocabulary
**Plans**: TBD

### Phase 3: Config and Auth Skills
**Goal**: An agent can manage nsyte configuration, set up NIP-46 bunker authentication, and configure non-interactive CI/CD deployment — without ambiguity between the interactive and non-interactive code paths
**Depends on**: Phase 2
**Requirements**: CONF-01, CONF-02, CONF-03
**Success Criteria** (what must be TRUE):
  1. `nsyte-config/SKILL.md` covers `nsyte config` and `nsyte validate` for reading and modifying project settings
  2. `nsyte-auth/SKILL.md` covers `nsyte bunker` and NIP-46 setup with explicit step-by-step instructions for connecting to a remote signer
  3. `nsyte-ci/SKILL.md` covers `nsyte ci` with non-interactive patterns: env var auth, `--ci` flag behavior, and exit codes
  4. Config and CI skills do not cross-contaminate instructions (interactive vs. non-interactive paths are clearly separated)
**Plans**: TBD

### Phase 4: Validation
**Goal**: Every shipped skill is spec-compliant, within token budget, and has descriptions that activate the correct skill for representative user queries without the user naming the skill
**Depends on**: Phase 3
**Requirements**: SPEC-03, SPEC-04
**Success Criteria** (what must be TRUE):
  1. Every SKILL.md body is under 500 lines (token budget compliance)
  2. Every skill description is written in third person and includes both action vocabulary (deploy, publish, host, install) and context vocabulary (Nostr, decentralized, static site)
  3. No SKILL.md contains real private keys, real pubkeys, or real relay URLs in examples — only placeholders
  4. `skills-ref validate` passes for all skills with no warnings or errors
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffolding | 2/2 | Complete    | 2026-02-24 |
| 2. Install and Deploy Skills | 0/? | Not started | - |
| 3. Config and Auth Skills | 0/? | Not started | - |
| 4. Validation | 0/? | Not started | - |
