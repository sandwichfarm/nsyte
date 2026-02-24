# Feature Research

**Domain:** Agent Skills packages for CLI tools (agentskills.io format)
**Researched:** 2026-02-24
**Confidence:** HIGH (primary sources: official agentskills.io spec, Claude API best practices guide, VS Code docs)

## Feature Landscape

### Table Stakes (Users Expect These)

Features agents assume exist. Missing these = the skill package fails to function or is rejected by agent runtimes.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Valid SKILL.md frontmatter (`name` + `description`) | Spec requirement — all agent runtimes validate this; no frontmatter = skill not loaded | LOW | `name`: max 64 chars, lowercase/hyphens only, must match directory name. `description`: max 1024 chars, non-empty, third-person, no XML tags |
| Directory name matches skill `name` field | Spec constraint — runtimes validate name-to-directory match | LOW | Must be consistent or validation fails |
| Descriptions that trigger correct activation | Agents use description to decide when to activate; vague descriptions = skill never fires or fires wrong | LOW | Must include both *what* and *when*: triggers, keywords, specific task types the skill handles |
| Instructions within token budget | Spec recommends < 5000 tokens (~500 lines) for SKILL.md body; exceeding this degrades context efficiency | LOW | Violating budget doesn't break the skill but hurts agent performance |
| Progressive disclosure structure | Agents load metadata (~100 tokens) at startup, full instructions only when activated — skills that front-load everything waste context | MEDIUM | Move detailed reference material to `references/`, large docs to separate files |
| Agent-agnostic instructions | Skills must work across Claude Code, Cursor, VS Code Copilot, Gemini CLI, OpenCode, etc. — tool-specific assumptions break portability | MEDIUM | Avoid assuming specific shell environments, OS, or runtime features unless stated in `compatibility` field |
| Coverage of all major use cases for the tool | Agents fail gaps they fall into — if nsyte has 15 commands and skills only cover 5, agents will get stuck on the other 10 | HIGH | For nsyte: init, deploy, list, browse, download, purge, config, bunker, ci, announce, validate, serve, run, debug, sites all need coverage |
| Installation/detection guidance | Agents may not have nsyte installed; without a skill covering how to detect and install it, agents hit a hard wall before any other skill activates | MEDIUM | Should detect if installed (`which nsyte` or equivalent), guide installation if missing |
| Nostr/Blossom domain context | Agents have no prior knowledge of Nostr concepts (relays, events, pubkeys, NIP-46, Blossom servers) — skills must explain what is unique to this domain | MEDIUM | Terms like "bunker," "relay," and "nsite" need brief inline explanation in relevant skills |
| Forward-slash file paths | Spec anti-pattern: Windows backslash paths break on Unix — all `references/` links and script paths must use forward slashes | LOW | Spec explicitly flags this as anti-pattern |

### Differentiators (Competitive Advantage)

Features that make nsyte's skill package stand out. Not required by the spec, but create meaningful value for agents using nsyte.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Domain-specific reference files per major area | BigQuery-style pattern: `references/auth.md`, `references/deploy.md`, `references/nostr-concepts.md` — agents load only what's relevant, keeping context tight | MEDIUM | Particularly valuable for nsyte because Nostr concepts are domain-specific and most agents will need them but only when dealing with Nostr-related commands |
| Conditional workflow patterns (branching based on state) | Agents handling "first time setup vs. existing project" need different paths; explicit branching prevents guessing | MEDIUM | init vs. deploy, private key vs. bunker auth — two of the most common fork points in nsyte's lifecycle |
| Pre-flight validation scripts | Executable scripts that check prerequisites (nsyte installed, config exists, relay reachable) before workflows run; far more reliable than asking agents to generate equivalent checks | HIGH | Requires `scripts/` directory; spec-supported; converts fragile agent-generated code into deterministic helpers |
| Checklist-driven complex workflows | For multi-step commands (deploy, CI setup), provide a markdown checklist Claude can copy and check off — dramatically improves reliability on operations with 5+ steps | LOW | Auth-to-publish pipeline is a prime candidate; bunker setup is another |
| Searchable reference files with grep patterns | Provide grep idioms in SKILL.md body pointing to relevant section in reference files — reduces random file exploration and improves context efficiency | LOW | Example from official best practices: `grep -i "relay" references/nostr-concepts.md` |
| Explicit error recovery guidance | Skills that explain what to do when things fail (network errors, auth failures, missing config) prevent agents from looping or abandoning tasks | MEDIUM | nsyte has multiple failure modes: relay unavailable, bunker timeout, Blossom server rejection — all worth covering |
| Feedback loops with validation steps | Plan-validate-execute pattern for destructive operations (purge, deploy overwrite) — structured intermediate output that can be verified before execution | HIGH | Particularly important for `purge` command which is irreversible |
| CI/CD-specific skill | CI context has meaningfully different requirements (non-interactive, env var auth, exit codes) vs. interactive use — a dedicated skill prevents agents from applying wrong patterns | MEDIUM | nsyte's `ci` command exists specifically for this; the skill should mirror that distinction |
| `compatibility` field usage | Declaring what the skill requires (`nsyte >= X.Y`, `deno`, network access) lets agents and runtimes warn users before attempting unsupported tasks | LOW | Optional spec field; most skills skip it, but nsyte has real binary/runtime dependencies worth declaring |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem helpful but create concrete problems in practice.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Single monolithic skill for all 15 commands | Seems simpler to author and maintain | Violates progressive disclosure — all 15 commands load into context even for single-command tasks; description becomes too vague to trigger correctly; exceeds 500-line token budget; single vague description can't match the specificity needed for 15 different operations | Multiple focused skills (e.g., `nsyte-deploy`, `nsyte-auth`, `nsyte-manage`, `nsyte-install`) that load only when the matching operation is requested |
| Exhaustive flag/option documentation inline | Agents "need to know all the options" | Bloats SKILL.md beyond token budget; agents rarely need all options; most flags have sensible defaults; better to show the common path and reference man page or `--help` for edge cases | Put exhaustive flag docs in `references/commands.md`; SKILL.md shows the happy path only |
| Time-sensitive version pinning in instructions | "Use nsyte 1.2.3 for X" | Becomes wrong as versions advance; creates maintenance debt in skill files; agents use outdated instructions | Use "current method" / "deprecated pattern" sections instead; let `compatibility` field declare minimum version |
| Assuming tool availability without detection | Skip "is nsyte installed?" check because it feels obvious | Agents frequently encounter tools for the first time via skills; hard failure on missing binary is worse than a brief install check | Installation/detection skill as a prerequisite; use `which nsyte || echo "not installed"` pattern |
| Nesting reference files more than one level deep | Seems like good organization | Agents partially read nested files using `head -100` preview rather than full reads, leading to incomplete information; spec explicitly warns against this | Keep all references one level deep from SKILL.md: `references/auth.md`, not `references/auth/nip46.md` |
| Instructions in first or second person | Natural conversational tone | Spec warning: description must be third-person; inconsistent POV in description causes discovery problems in some runtimes | Use third-person throughout: "Deploys a static site to Nostr" not "I will deploy" or "You can deploy" |
| Offering multiple tool alternatives without a default | "You can use pdfplumber, PyMuPDF, or pdf2image" seems helpful | Agents must choose without context; often picks wrong one or asks user; increases token usage and reduces reliability | Pick one and state it clearly: "Use nsyte deploy. For CI pipelines, use nsyte ci instead." — provide escape hatches only for genuinely distinct contexts |
| Embedding Nostr protocol deep-dives in SKILL.md | Agents need to understand the Nostr protocol to use nsyte | Nostr protocol details are large; most tasks don't need full protocol understanding; wastes context for agents doing simple deploy operations | Reference file `references/nostr-concepts.md` with only the concepts nsyte commands actually require (relay URLs, pubkeys, NIP-46 bunker pattern); SKILL.md links to it conditionally |

## Feature Dependencies

```
[nsyte-install skill]
    └──prerequisite──> [All other nsyte skills]
                           (can't deploy without nsyte installed)

[nsyte-auth skill]
    └──prerequisite──> [nsyte-deploy skill]
    └──prerequisite──> [nsyte-ci skill]
    └──prerequisite──> [nsyte-manage skill]
                           (all operations require authentication)

[nsyte-init skill]
    └──prerequisite──> [nsyte-deploy skill]
                           (deploy requires initialized project config)

[references/nostr-concepts.md]
    └──enhances──> [nsyte-deploy skill]
    └──enhances──> [nsyte-auth skill]
    └──enhances──> [nsyte-manage skill]
                      (shared reference file, loaded on demand)

[nsyte-deploy skill]
    └──enhances──> [nsyte-manage skill]
                      (post-deploy management workflows)

[scripts/check-prerequisites.sh] ──supports──> [nsyte-install skill]
[scripts/validate-config.sh]     ──supports──> [nsyte-deploy skill]

[nsyte-ci skill] ──conflicts with (context assumptions)──> [nsyte-deploy skill]
    (CI skill assumes non-interactive env; deploy skill assumes interactive;
     keep separate to prevent wrong patterns bleeding into CI context)
```

### Dependency Notes

- **nsyte-install requires nothing**: It is the entry point; it must be self-contained and work before nsyte exists on the system
- **All other skills require nsyte-install to have run**: The install skill is the prerequisite chain root — reference it explicitly in each skill's "Prerequisites" section
- **nsyte-auth enables deploy, ci, and manage**: Authentication setup (private key vs. bunker) must be covered before workflows that require signing can be documented; consider merging auth into init or making it an explicit prerequisite
- **nsyte-deploy and nsyte-ci conflict in context assumptions**: Deploy assumes interactive prompts available; CI assumes `NSYTE_PRIVATE_KEY` env var and `--ci` flag; keeping them separate prevents cross-contamination of instructions
- **references/nostr-concepts.md enhances multiple skills**: A shared reference file means Nostr concepts are written once and loaded only when a skill explicitly references them — avoids duplicating explanation across 5+ skills

## MVP Definition

### Launch With (v1)

Minimum viable skill package — what's needed for an agent to complete the primary nsyte workflow end-to-end.

- [ ] `nsyte-install` skill — prerequisite chain root; agents must be able to detect and install nsyte before anything else works
- [ ] `nsyte-init` skill — project initialization; sets up `.nsite/config.json` and authentication
- [ ] `nsyte-deploy` skill — the primary value delivery; deploy a static site to Nostr/Blossom
- [ ] `references/nostr-concepts.md` — shared reference; explains relays, pubkeys, NIP-46 bunker, Blossom — loaded on demand by any skill that needs it
- [ ] Valid frontmatter and spec-compliant structure across all skills — non-negotiable for cross-agent compatibility

### Add After Validation (v1.x)

Features to add once the core deploy workflow is confirmed working across major agent runtimes.

- [ ] `nsyte-manage` skill covering list, browse, download, purge — add when agents consistently succeed at deploy and need lifecycle management
- [ ] `nsyte-ci` skill — add when CI/CD integration requests emerge; the non-interactive context diverges enough from interactive deploy that it deserves its own skill
- [ ] `nsyte-auth` dedicated skill covering bunker/NIP-46 setup in depth — add when auth complexity generates questions or failures in practice
- [ ] Pre-flight validation scripts in `scripts/` — add when agents demonstrate they struggle with prerequisite checking

### Future Consideration (v2+)

Features to defer until the core skill package has proven value.

- [ ] Skills for remaining commands: announce, validate, serve, run, debug, sites — add based on observed agent usage patterns; not all 15 commands may be used via agents equally
- [ ] Checklist-driven workflow for `purge` with plan-validate-execute pattern — defer until purge is confirmed to be a use case agents attempt
- [ ] `compatibility` field with specific version requirements — defer until minimum version constraints are actually needed; adds maintenance overhead

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Valid spec-compliant SKILL.md frontmatter | HIGH | LOW | P1 |
| Activation-triggering descriptions (specific, third-person, with keywords) | HIGH | LOW | P1 |
| nsyte-install detection + install guidance | HIGH | LOW | P1 |
| nsyte-init workflow skill | HIGH | LOW | P1 |
| nsyte-deploy workflow skill | HIGH | MEDIUM | P1 |
| references/nostr-concepts.md shared reference | HIGH | MEDIUM | P1 |
| Progressive disclosure structure (SKILL.md → references/) | HIGH | LOW | P1 |
| nsyte-manage skill (list, browse, download, purge) | MEDIUM | MEDIUM | P2 |
| nsyte-ci non-interactive skill | MEDIUM | LOW | P2 |
| nsyte-auth bunker/NIP-46 dedicated skill | MEDIUM | MEDIUM | P2 |
| Conditional workflow branching (private key vs. bunker) | MEDIUM | LOW | P2 |
| Checklist-driven complex workflows (deploy, CI setup) | MEDIUM | LOW | P2 |
| Error recovery guidance per skill | MEDIUM | MEDIUM | P2 |
| Pre-flight validation scripts in scripts/ | MEDIUM | HIGH | P3 |
| Searchable grep patterns in SKILL.md for references | LOW | LOW | P3 |
| Plan-validate-execute for purge (feedback loop) | LOW | HIGH | P3 |
| Skills for announce, validate, serve, run, debug, sites | LOW | MEDIUM | P3 |
| `compatibility` field with version requirements | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch — skill package non-functional without these
- P2: Should have — significantly improves reliability and coverage
- P3: Nice to have — future consideration based on observed usage

## Competitor Feature Analysis

No direct competitors exist for "nsyte as Agent Skills package" — this is a novel domain. The closest analogues are skills packages from well-known tools.

| Feature | Anthropic pre-built skills (pptx, xlsx, docx, pdf) | Vercel/skills.sh community skills | nsyte skills approach |
|---------|------|------|------|
| Multiple focused skills vs. one monolith | Multiple separate skills (one per doc format) | One skill per workflow | Multiple skills by lifecycle phase |
| Shared reference files | Per-skill reference files | Varies by author | Shared `references/nostr-concepts.md` + per-skill references |
| Executable utility scripts | Yes — analyze, fill, validate scripts | Rare in community skills | Optional; valuable for prerequisite checking |
| Installation/detection guidance | N/A — tools are Python libs, always available | N/A | Required — nsyte is a binary that may not be installed |
| Domain terminology explanation | N/A — PDF, Excel are universally known | N/A | Required — Nostr, Blossom, relays, NIP-46 are not universally known |
| CI-specific skill | No | No | Yes — nsyte has an explicit CI command with different patterns |

## Sources

- [Agent Skills Specification — agentskills.io](https://agentskills.io/specification) (HIGH confidence — official spec)
- [Claude API Agent Skills Overview — platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) (HIGH confidence — official docs)
- [Claude API Agent Skills Best Practices — platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) (HIGH confidence — official docs)
- [Agent Skills — VS Code Copilot Docs](https://code.visualstudio.com/docs/copilot/customization/agent-skills) (HIGH confidence — official docs)
- [Agent Skills — Gemini CLI Docs](https://geminicli.com/docs/cli/skills/) (MEDIUM confidence — official Gemini CLI docs)
- [skill.md: An open standard for agent skills — Mintlify Blog](https://www.mintlify.com/blog/skill-md) (MEDIUM confidence — practitioner analysis, real-world patterns)
- [Claude Agent Skills: A First Principles Deep Dive — leehanchung.github.io](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/) (MEDIUM confidence — community analysis verified against official docs)
- [Agent Skills Explained: An FAQ — Vercel Blog](https://vercel.com/blog/agent-skills-explained-an-faq) (MEDIUM confidence — Vercel maintains skills.sh ecosystem tool)
- [agentskills/agentskills — GitHub](https://github.com/agentskills/agentskills) (HIGH confidence — spec repository)
- [anthropics/skills — GitHub](https://github.com/anthropics/skills) (HIGH confidence — official Anthropic example skills)

---
*Feature research for: Agent Skills packages for nsyte CLI tool*
*Researched: 2026-02-24*
