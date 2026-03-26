# Project Research Summary

**Project:** nsyte Agent Skills package
**Domain:** Agent Skills authoring for a Nostr/Blossom static site deployment CLI
**Researched:** 2026-02-24
**Confidence:** HIGH

## Executive Summary

nsyte is a Deno/TypeScript CLI that deploys static sites to the Nostr decentralized network using Blossom blob storage servers. The goal of this project is to create an Agent Skills package — a set of SKILL.md files following the agentskills.io open standard — that enables AI coding agents (Claude Code, Gemini CLI, Cursor, VS Code Copilot, and 20+ others) to assist users with nsyte operations. This is a file-authoring task with no runtime code changes required; skills are pure YAML-frontmatter Markdown files committed to the repository under `.agents/skills/`.

The recommended approach is a set of 5 focused skill directories grouped by user journey phase: installation/setup, deploy, config/auth, management, and background Nostr/Blossom domain concepts. Each skill uses a three-tier progressive disclosure model: a frontmatter description (~100 tokens) for agent discovery, a SKILL.md body under 500 lines for activation-time instructions, and `references/` files loaded on demand for deep domain content. This structure is the core architectural mandate of the Agent Skills spec and is essential for cross-agent compatibility and context efficiency.

The primary risks are structural — silent skill loading failures from name/directory mismatches, skills that never activate because descriptions use tool jargon instead of user vocabulary, and agents failing on Nostr-specific concepts (relays, bunker auth, Blossom servers) that no generalist agent will know without explicit instruction. All critical risks are preventable during skill design and writing. The validator tool `skills-ref` catches spec violations before shipping, and description quality can be verified empirically by testing whether the correct skill activates for representative user queries without explicitly naming the skill.

## Key Findings

### Recommended Stack

The Agent Skills open standard (agentskills.io, released 2025-12-18) is the only applicable standard and is supported by every major AI coding agent tool. Skills require no installation for users — they are committed as static Markdown files to the repository. The only tooling required is the `skills-ref` Python CLI for development-time validation. No Deno code changes, no build steps, and no npm packages are needed.

**Core technologies:**
- Agent Skills spec (YAML frontmatter + Markdown): The skill format — required, no alternative
- `.agents/skills/` directory path: Cross-agent discovery standard recognized by Claude Code, Gemini CLI, OpenCode, VS Code Copilot, and others; use this path over `.claude/skills/` to maximize compatibility
- `skills-ref` validator (Python, dev-time only): The only official spec validator; marked "not for production" but the only tool available for catching violations; use via `skills-ref validate <skill-dir>` in development

See `/home/sandwich/Develop/nsyte/.planning/research/STACK.md` for full detail.

### Expected Features

The feature set divides cleanly into three tiers: what must exist for the skill package to function at all, what significantly improves agent reliability, and what can be deferred to v2.

**Must have (table stakes):**
- Valid SKILL.md frontmatter with spec-compliant `name` and `description` fields — skills silently fail to load without these
- Directory names that exactly match the `name` field — mismatch causes silent discovery failure
- Descriptions that trigger correct activation — must include user-vocabulary action words (deploy, publish, host) AND context words (Nostr, static site, decentralized), written in third person
- `nsyte-install` skill as prerequisite chain root — agents cannot use any other skill without knowing how to install nsyte (a Deno binary, not an npm package)
- `nsyte-init` and `nsyte-deploy` skills — covers the primary value-delivery workflow end-to-end
- `references/nostr-concepts.md` shared reference — Nostr relay/pubkey/bunker concepts are unknown to generalist agents and needed by multiple skills

**Should have (competitive):**
- `nsyte-manage` skill covering list, browse, download, purge, and sites commands
- `nsyte-ci` skill with non-interactive environment patterns (env var auth, `--ci` flag, exit codes)
- Dedicated `nsyte-auth` skill covering bunker/NIP-46 setup in depth
- Conditional workflow branching (private key vs. bunker auth) with explicit decision trees
- Checklist-driven multi-step workflows for deploy and CI setup
- Error recovery guidance per skill (relay unavailable, bunker timeout, Blossom server rejection)

**Defer (v2+):**
- Skills for remaining individual commands: announce, validate, serve, run, debug, sites
- `compatibility` field with version requirements (adds maintenance overhead before it's needed)
- Pre-flight validation scripts in `scripts/` (add when agents demonstrably struggle with prerequisite checking)
- Plan-validate-execute pattern for `purge` (defer until purge is confirmed to be an agent use case)

See `/home/sandwich/Develop/nsyte/.planning/research/FEATURES.md` for the full prioritization matrix.

### Architecture Approach

The skill package uses a three-tier progressive disclosure architecture within a flat, namespaced directory structure under `.agents/skills/`. Each skill directory is self-contained — skills do not load each other. Shared domain content (Nostr concepts) is either duplicated into each skill's own `references/` subdirectory or centralized in a background skill (`nsyte-concepts/`) that agents auto-load. Reference files are kept one level deep from each SKILL.md to avoid the partial-read failure mode where agents use `head -100` on nested files.

**Major components:**
1. `nsyte-setup/SKILL.md` — Installation detection, platform-specific install commands, first-run verification; prerequisite for all other skills
2. `nsyte-deploy/SKILL.md` + `references/` — Primary workflow: init, auth (private key or bunker), deploy; most important skill for agent usefulness
3. `nsyte-config/SKILL.md` + `references/` — Config management, bunker setup, CI/CD non-interactive patterns
4. `nsyte-manage/SKILL.md` + `references/` — List, browse, download, purge, sites, serve, run, debug
5. `nsyte-concepts/SKILL.md` + `references/` — Background skill (`user-invocable: false`); Nostr relay/pubkey/NIP-46 concepts and Blossom server basics; auto-loaded when relevant

Side-effect skills (`nsyte-deploy`) should use `disable-model-invocation: true` to require explicit user invocation. Informational and config skills can auto-activate.

See `/home/sandwich/Develop/nsyte/.planning/research/ARCHITECTURE.md` for component boundaries, data flow diagrams, and anti-patterns.

### Critical Pitfalls

1. **Name/directory mismatch causes silent discovery failure** — Name the directory first, copy verbatim to the `name` field, then run `skills-ref validate` before shipping. No error is thrown on mismatch — skills just disappear from the available list.

2. **Vague descriptions prevent skill activation** — Every description must include action vocabulary (deploy, publish, upload, host) AND context vocabulary (Nostr, decentralized, static site), written in third person with an explicit "Use when..." trigger phrase. Test empirically: the correct skill should activate without the user naming it.

3. **Nostr domain concepts left unexplained** — Agents have zero reliable prior knowledge of relays (WSS URLs), Blossom servers (HTTPS file storage), NIP-46 bunker auth, or pubkey formats. Define these in `references/nostr-concepts.md` and ensure every skill that uses these terms references it. This is the most likely failure mode in practice.

4. **Token budget exhaustion from a monolithic skill** — With 15 commands, a single SKILL.md will exceed the 500-line/5000-token recommendation. Group by user journey (5 skills), not by command (15 skills). Move detailed content to `references/` files.

5. **Missing installation skill** — Without `nsyte-setup`, agents encountering nsyte for the first time will guess the install method incorrectly (nsyte is a Deno binary, not available via npm or brew by default). This skill gates the entire skill package being useful.

See `/home/sandwich/Develop/nsyte/.planning/research/PITFALLS.md` for integration gotchas, security mistakes, and the "looks done but isn't" checklist.

## Implications for Roadmap

Based on research, the skill package has clear dependency ordering. Content decisions cascade: Nostr/Blossom vocabulary must be established before writing individual skills, and the install skill must be created before any workflow skill can assume nsyte is available. The architecture research provides a recommended build order that matches the dependency chain.

### Phase 1: Foundation — Concepts and Scaffolding

**Rationale:** All skills share Nostr/Blossom vocabulary. Establishing the shared reference file and the directory structure prevents terminology drift and rework across later phases. The name/directory mismatch pitfall is prevented at this stage, not after 5 skills are written.
**Delivers:** `.agents/skills/` directory structure with one skill skeleton per capability area (frontmatter only, valid and spec-compliant); `nsyte-concepts/references/nostr-primer.md` and `blossom-primer.md`; `skills-ref validate` passing for all skeletons.
**Addresses:** Table-stakes spec compliance; cross-agent compatibility; shared vocabulary for all later phases.
**Avoids:** Name/directory mismatch (Pitfall 1); token budget exhaustion from monolithic structure (Pitfall 4); Nostr concepts undefined (Pitfall 3).

### Phase 2: Install and Setup Skill

**Rationale:** This skill is the prerequisite chain root — no other skill is useful without it. Agents cannot deploy if they cannot install nsyte. This must be complete before testing any other skill in real agent environments.
**Delivers:** `nsyte-setup/SKILL.md` with detection (`nsyte --version`), install instructions for Linux/macOS/Windows (platform binary downloads), PATH verification, and first-run verification steps.
**Addresses:** Installation/detection guidance (FEATURES.md P1); prerequisite chain root (FEATURES.md dependency graph).
**Avoids:** Installation skill missing (Pitfall 5); assumes tool availability without detection (FEATURES.md anti-feature).

### Phase 3: Core Workflow — Deploy Skill

**Rationale:** Deploy is the primary value-delivery workflow and the highest-priority skill. It has the most complex auth decision tree (private key vs. bunker) and defines the pattern that later skills reference.
**Delivers:** `nsyte-deploy/SKILL.md` covering `nsyte init`, auth priority (env var > nsec > bunker), `nsyte deploy [path]`, output interpretation, and error recovery for relay/Blossom failures. Supporting reference files: `auth-methods.md`, `blossom.md`.
**Addresses:** `nsyte-deploy` skill (FEATURES.md P1); progressive disclosure (FEATURES.md P1); conditional workflow branching (FEATURES.md P2); error recovery (FEATURES.md P2).
**Avoids:** Vague descriptions (Pitfall 2); Nostr concepts unexplained (Pitfall 3); missing "what success looks like" (PITFALLS.md UX section).

### Phase 4: Config and Auth Skill

**Rationale:** Config and CI/CD patterns are the second-most-common failure mode after deployment. The non-interactive CI context is meaningfully different from interactive deploy (env var auth, `--ci` flag, exit codes) and must be kept separate to avoid cross-contaminating instructions.
**Delivers:** `nsyte-config/SKILL.md` covering `nsyte config`, `nsyte bunker`, `nsyte ci`, and `nsyte validate`; reference files: `config-schema.md`, `ci-patterns.md`. Includes auth decision tree (bunker vs. nsec) and CI non-interactive guidance.
**Addresses:** `nsyte-ci` skill (FEATURES.md P2); `nsyte-auth` bunker/NIP-46 skill (FEATURES.md P2); `compatibility` field (FEATURES.md P3 deferred but `compatibility` declaration for network + runtime is free to add here).
**Avoids:** CI mode treated as optional (PITFALLS.md integration gotchas); config file location confusion (PITFALLS.md integration gotchas).

### Phase 5: Management Skill

**Rationale:** List, browse, download, purge, and sites are post-deploy lifecycle management. These are lower priority than the core deploy workflow but needed for a complete skill package. Purge is irreversible and requires explicit care.
**Delivers:** `nsyte-manage/SKILL.md` covering `nsyte list`, `nsyte browse`, `nsyte download`, `nsyte purge` (with confirmation step), `nsyte sites`, `nsyte serve`, `nsyte run`, `nsyte debug`; reference file: `commands-ref.md` with flags and examples.
**Addresses:** `nsyte-manage` skill (FEATURES.md P2); site lifecycle management coverage (FEATURES.md table stakes: all major use cases covered).
**Avoids:** Coverage gaps causing agent dead-ends (FEATURES.md table stakes).

### Phase 6: Polish and Validation

**Rationale:** Spec compliance and description quality can't be fully validated until all skills are written. This phase runs the full validation checklist, tests real skill activation with representative queries, and ensures no security issues (real credentials in examples, over-broad `allowed-tools`).
**Delivers:** All skills passing `skills-ref validate`; all SKILL.md bodies under 500 lines; descriptions tested with representative queries; security review complete (no real nsec keys, placeholder URLs only); `argument-hint` fields added where applicable.
**Addresses:** "Looks done but isn't" checklist (PITFALLS.md); security review (PITFALLS.md security section); UX improvements (ARCHITECTURE.md Pattern 3 invocation control).
**Avoids:** All five critical pitfalls caught at this gate before shipping.

### Phase Ordering Rationale

- Phases 1 and 2 must precede all others: directory structure and vocabulary established first prevents rework; install skill is the dependency root.
- Phase 3 (deploy) before Phases 4-5: deploy defines the auth model and config expectations that config and manage skills reference.
- Phase 6 as a final gate: description testing and validation requires complete skills to test against.
- Skills are independently shippable after each phase — the package gains value incrementally, not all-or-nothing.

### Research Flags

Phases with standard, well-documented patterns (skip deep research during planning):
- **Phase 1 (Scaffolding):** Spec is precise about directory structure and frontmatter rules; no ambiguity.
- **Phase 2 (Install Skill):** Pattern is well-understood; primary work is researching current nsyte install methods from the project's own release assets.
- **Phase 6 (Validation):** Mechanical checklist execution; no new research needed.

Phases that may benefit from targeted research during planning:
- **Phase 3 (Deploy Skill):** The auth decision tree (private key vs. NIP-46 bunker) involves nsyte-specific behavior that should be verified against the actual CLI source or `--help` output before writing. Auth priority order (env var > nsec > bunker) needs confirmation.
- **Phase 4 (Config Skill):** The `.nsite/config.json` schema and all supported fields should be verified from source before writing `config-schema.md`. CI-specific behavior of `nsyte ci` (does it block on missing env vars? exit codes?) needs verification.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All spec details sourced from official agentskills.io and Anthropic/Claude Code docs; no guesses |
| Features | HIGH | Feature classification derived from spec constraints + official best practices; only `skills-ref` validator rated MEDIUM due to its own "not for production" caveat |
| Architecture | HIGH | Directory structure, component boundaries, and three-tier model sourced from spec and official docs; cross-agent path (`.agents/skills/`) confirmed by multiple agent tool docs |
| Pitfalls | HIGH | All five critical pitfalls derived from spec constraints + Anthropic best-practices docs; some community sources rated MEDIUM but core pitfalls are spec-backed |

**Overall confidence:** HIGH

### Gaps to Address

- **nsyte CLI auth priority order:** Research assumes `env var > nsec flag > bunker` but this should be confirmed against actual CLI source or `--help` output before writing the deploy skill. Handle during Phase 3 planning.
- **`.nsite/config.json` schema completeness:** The config schema reference file needs to enumerate all supported fields with types and defaults. This requires reading nsyte source or docs, not external research. Handle during Phase 4 planning.
- **Current nsyte install method:** The exact install command (curl script? deno install? GitHub releases only?) should be confirmed from the project's own README/releases before writing the install skill. Handle during Phase 2 planning.
- **`skills-ref` validator portability:** Validator is marked "not for production"; if it fails to validate correctly for any reason, fallback is manual checklist review against spec. Low risk given simplicity of spec rules.

## Sources

### Primary (HIGH confidence)
- [agentskills.io/specification](https://agentskills.io/specification) — Frontmatter fields, naming rules, directory structure, validation
- [agentskills.io/what-are-skills](https://agentskills.io/what-are-skills) — Progressive disclosure model, three-level loading
- [agentskills.io/integrate-skills](https://agentskills.io/integrate-skills) — Agent discovery, XML prompt format, skills-ref
- [platform.claude.com/docs — Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — Claude Code directory locations, cross-surface limitations
- [platform.claude.com/docs — Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — Description writing, progressive disclosure, anti-patterns
- [code.claude.com/docs — Extend Claude with skills](https://code.claude.com/docs/en/skills) — Claude Code-specific frontmatter, `.claude/skills/`, slash command integration
- [github.com/anthropics/skills](https://github.com/anthropics/skills) — Official Anthropic example skills (pdf, mcp-builder, skill-creator)
- [claude.com/blog — Agent Skills announcement](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills) — Official Anthropic announcement

### Secondary (MEDIUM confidence)
- [geminicli.com/docs/cli/skills/](https://geminicli.com/docs/cli/skills/) — Cross-agent path compatibility for Gemini CLI
- [opencode.ai/docs/skills/](https://opencode.ai/docs/skills/) — OpenCode skills directory recognition
- [github.com/agentskills/agentskills skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) — Validator tool; rated MEDIUM because library self-declares "not for production"
- [vercel.com/blog — Agent Skills FAQ](https://vercel.com/blog/agent-skills-explained-an-faq) — Practitioner analysis from Vercel (maintains skills.sh)
- [mintlify.com/blog/skill-md](https://www.mintlify.com/blog/skill-md) — Practitioner analysis, real-world patterns
- [smartscope.blog — Agent Skills guide](https://smartscope.blog/en/blog/agent-skills-guide/) — Community guide on common loading failures, verified against spec
- [leehanchung.github.io — Claude Skills deep dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/) — Technical analysis; implementation internals rated LOW, spec-backed findings rated MEDIUM

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
