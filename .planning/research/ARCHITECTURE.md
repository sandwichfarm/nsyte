# Architecture Research

**Domain:** Agent Skills integration into existing Deno/TypeScript CLI (nsyte)
**Researched:** 2026-02-24
**Confidence:** HIGH (spec verified against agentskills.io official documentation + Claude Code official docs)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Agent at Runtime                                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                Discovery Layer (startup)                       │  │
│  │  Load name+description from each SKILL.md frontmatter (~100   │  │
│  │  tokens per skill total — minimal context cost)                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                            ↓ task matches description?               │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                Activation Layer (on demand)                    │  │
│  │  Load full SKILL.md body (<5000 tokens, <500 lines)            │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                            ↓ references needed?                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │               Resource Layer (on demand)                       │  │
│  │  scripts/  references/  assets/                                │  │
│  │  (loaded only when agent reads/executes specific files)        │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    nsyte repo: .agents/skills/                       │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  nsyte-setup │  │nsyte-deploy  │  │ nsyte-manage │               │
│  │  SKILL.md    │  │  SKILL.md    │  │  SKILL.md    │  ...          │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                         ↓ optional supporting files                  │
│                  ┌─────────────────────┐                             │
│                  │   references/       │                             │
│                  │   nostr-concepts.md │                             │
│                  │   commands-ref.md   │                             │
│                  └─────────────────────┘                             │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `SKILL.md` frontmatter | Discovery metadata: name + description loaded at agent startup | Agent discovery system |
| `SKILL.md` body | Full instructions loaded when skill activates; step-by-step task guidance | Agent context window |
| `references/` files | Detailed documentation loaded on demand by agent; keeps SKILL.md concise | SKILL.md (linked from body) |
| `scripts/` directory | Executable code agents run; output consumed, not source loaded | Agent bash/exec tools |
| `assets/` directory | Static resources agents reference by path, not loaded into context | SKILL.md (referenced by path) |

## Recommended Project Structure

The `.agents/skills/` path is the universal cross-agent standard. Claude Code also looks at `.claude/skills/`. Using `.agents/skills/` maximizes compatibility across agents (Gemini CLI, OpenCode, Codex, VS Code Copilot, etc.) that all recognize this path.

```
nsyte/                              # repo root
├── .agents/
│   └── skills/                     # cross-agent discovery path
│       ├── nsyte-setup/            # installation + first-run skill
│       │   ├── SKILL.md            # required entrypoint
│       │   └── references/
│       │       └── platforms.md    # platform-specific install details
│       ├── nsyte-deploy/           # deploy command area
│       │   ├── SKILL.md
│       │   └── references/
│       │       ├── auth-methods.md # nsec vs bunker auth explanation
│       │       └── blossom.md      # Blossom server concepts
│       ├── nsyte-manage/           # list, browse, download, purge, sites
│       │   ├── SKILL.md
│       │   └── references/
│       │       └── commands-ref.md # flags and examples for each command
│       ├── nsyte-config/           # config, validate, bunker, ci commands
│       │   ├── SKILL.md
│       │   └── references/
│       │       └── config-schema.md # all config fields with types + defaults
│       └── nsyte-concepts/         # nostr/blossom domain knowledge
│           ├── SKILL.md            # lightweight; user-invocable: false
│           └── references/
│               ├── nostr-primer.md # relays, events, pubkeys, NIPs
│               └── blossom-primer.md # Blossom servers, blob storage
└── src/                            # existing CLI source (unchanged)
```

### Structure Rationale

- **`.agents/skills/` over `.claude/skills/`:** The `.agents/` path is the cross-agent universal standard. Claude Code, Gemini CLI, OpenCode, VS Code Copilot, and Codex all recognize it. Using `.claude/skills/` would lock skills to Claude Code only.
- **One skill directory per command area, not per command:** Grouping related commands (e.g., list+browse+download+purge into `nsyte-manage`) reduces the number of skill descriptions agents load at startup. Individual commands within a group are documented inside the SKILL.md body and references.
- **`nsyte-concepts/` as a background skill:** Domain knowledge (Nostr, Blossom) that cuts across all other skills. Set `user-invocable: false` so Claude loads it automatically when relevant but it does not appear as a user slash command.
- **`references/` for domain depth:** Nostr and Blossom concepts are unfamiliar to most agents. Keeping them in reference files means they are only loaded into context when an agent actually needs them — not on every skill activation.
- **Skill name prefix `nsyte-`:** Namespacing prevents collisions in an agent's global skill set (agents aggregate skills from multiple projects). Without a prefix, `deploy` or `config` could conflict with other projects.

## Architectural Patterns

### Pattern 1: Progressive Disclosure — Three Tiers

**What:** Structure each skill so that information is loaded in proportion to what is actually needed.
**When to use:** Always. This is the core spec requirement.
**Trade-offs:** Requires upfront thought about what is "essential" vs "reference" content. Pays off in reduced context usage.

**Tiers for nsyte:**

```
Tier 1 — Discovery (always loaded, ~100 tokens per skill):
  frontmatter name + description

Tier 2 — Activation (loaded when skill triggers, <500 lines):
  SKILL.md body: quick-start steps, common invocation patterns,
  flags, auth overview, explicit links to references/

Tier 3 — Reference (loaded on demand):
  references/nostr-primer.md  — relay/event/pubkey concepts
  references/auth-methods.md  — nsec vs NIP-46 bunker details
  references/blossom.md       — Blossom server upload mechanics
  references/config-schema.md — full config field reference
```

### Pattern 2: Domain-Specific Reference Organization

**What:** Split reference files by domain, not by command, so agents load only the domain knowledge relevant to the current task.
**When to use:** When skills cover a domain with specialized vocabulary agents are unlikely to know.
**Trade-offs:** Requires more files. Pays off when domain knowledge is large and partially overlapping across skills.

**Example for nsyte:**

```
references/
├── nostr-primer.md     # relays, events, pubkeys, signing — shared by deploy+manage
├── blossom.md          # Blossom servers, blob upload — shared by deploy+download
├── auth-methods.md     # nsec vs bunker decision tree — deploy+ci+bunker skills
└── config-schema.md    # all .nsite/config.json fields — config+validate skills
```

The `nsyte-deploy/SKILL.md` body links: "For Nostr concepts, see [references/nostr-primer.md](references/nostr-primer.md)." The agent reads it only when it needs that context.

### Pattern 3: Invocation Control — Auto vs. Manual

**What:** Use `disable-model-invocation: true` for skills with side effects (deploy, purge); allow automatic invocation for informational skills (manage, concepts).
**When to use:** Any skill that modifies remote state (deploy, purge, announce) should require explicit user invocation. Informational skills can auto-activate.
**Trade-offs:** Manual-only skills require user to know the skill exists. Mitigate with a clear `nsyte-setup` skill that explains available commands.

**Classification for nsyte:**

| Skill | Invocation | Reason |
|-------|-----------|--------|
| `nsyte-setup` | Manual + Auto | Discovery skill; auto-activates on "install nsyte" |
| `nsyte-deploy` | Manual only (`disable-model-invocation: true`) | Deploys to live network; side effects |
| `nsyte-manage` | Auto | Read-mostly (list, browse); low risk |
| `nsyte-config` | Auto | Config reading is safe; bunker setup guided |
| `nsyte-concepts` | Auto only (`user-invocable: false`) | Background knowledge, not a user command |

## Data Flow

### Skill Activation Flow

```
User task
    ↓
Agent loads frontmatter descriptions for all skills in .agents/skills/
    ↓
Agent matches task to description → e.g., "deploy my site" → nsyte-deploy
    ↓
Agent reads full .agents/skills/nsyte-deploy/SKILL.md body into context
    ↓
SKILL.md body instructs: run `nsyte init` first if no config,
then `nsyte deploy --private-key <key> [path]`
    ↓
Agent references auth-methods.md if user hasn't provided auth
    ↓
Agent executes nsyte CLI commands via Bash tool
    ↓
Agent reads CLI output, handles errors per SKILL.md guidance
```

### Cross-Skill Reference Flow

Skills in this project do not load each other. Instead:

- `nsyte-concepts/SKILL.md` is an auto-loaded background skill
- Other skills reference shared documentation files within their own `references/` subdirectory
- Shared reference content (nostr-primer.md, blossom.md) is duplicated or symlinked across skills, or centralized in `nsyte-concepts/references/` with other skills linking to it

The spec warns: "Keep file references one level deep from SKILL.md. Avoid deeply nested reference chains." Cross-skill loading chains are not supported by the spec. Each skill is self-contained.

### Key Data Flows

1. **Install flow:** `nsyte-setup` skill body → agent checks if `nsyte` is in PATH → if not, guides platform-specific install → references/platforms.md loaded for OS-specific detail
2. **Deploy flow:** `nsyte-deploy` skill body → agent runs `nsyte init` → reads .nsite/config.json expectations → runs `nsyte deploy` → interprets output
3. **Auth decision flow:** SKILL.md body describes auth priority (env var > nsec flag > bunker) → `references/auth-methods.md` loaded if agent needs full auth decision tree
4. **Config flow:** `nsyte-config` skill body → guides `nsyte config` commands → `references/config-schema.md` loaded if agent needs field reference

## Scaling Considerations

These skills are static markdown files — scalability refers to skill count and description token budget, not infrastructure.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 skills (initial) | Single flat structure under `.agents/skills/`. Each skill self-contained. |
| 5-10 skills (target) | Prefix namespacing (`nsyte-*`) prevents collisions. Skill descriptions must stay concise since all are loaded at startup. |
| 10+ skills | Consider `disable-model-invocation: true` on lower-priority skills to remove their descriptions from the startup context budget. Claude Code has a ~16,000 character fallback budget for skill descriptions. |

### Scaling Priorities

1. **First constraint hit:** Agent description token budget. All skill descriptions load at startup. With 6 skills at 100 tokens each = ~600 tokens. Well within budget for any reasonable skill count. Only a concern if nsyte adds 20+ skills.
2. **Second constraint:** SKILL.md body length. The 500-line / 5000-token limit per skill is enforced by recommendation, not by spec. Splitting to `references/` files resolves this if any skill grows large.

## Anti-Patterns

### Anti-Pattern 1: One Skill Per Command

**What people do:** Create 15 separate skills, one per nsyte command (init, deploy, list, browse, download, purge, config, bunker, ci, announce, validate, serve, run, debug, sites).
**Why it's wrong:** Each skill's description loads at agent startup. 15 × ~100 tokens = ~1500 tokens of fixed overhead. More critically, agents must choose between 15 overlapping skills when tasks span multiple commands. The `deploy` workflow requires `init` + `config` + `deploy` — splitting these creates skill fragmentation.
**Do this instead:** Group by user journey (setup, deploy, manage, config). 4-5 skills covering the full lifecycle is the right scope.

### Anti-Pattern 2: All Instructions in One Skill

**What people do:** Create a single `nsyte` skill with all 15 commands documented inline, Nostr concepts, Blossom concepts, auth options, config reference — the full manual.
**Why it's wrong:** Violates the 500-line / 5000-token recommendation. Loads all documentation into context even when the agent only needs to run `nsyte list`. Context is wasted on irrelevant content.
**Do this instead:** Use the three-tier progressive disclosure pattern. SKILL.md body covers the 80% case; references/ files cover depth on demand.

### Anti-Pattern 3: Cross-Skill Loading Chains

**What people do:** `nsyte-deploy/SKILL.md` contains "See [../nsyte-concepts/references/nostr-primer.md](../nsyte-concepts/references/nostr-primer.md) for concepts."
**Why it's wrong:** The spec states: "Keep file references one level deep from SKILL.md. Avoid deeply nested reference chains." Cross-skill paths break this rule and may partially load. Agent implementations may use `head -100` rather than full-file reads for nested references.
**Do this instead:** Each skill is self-contained. If `nsyte-deploy` needs nostr concepts, put a `nostr-primer.md` in `nsyte-deploy/references/`. Accept some duplication. OR centralize shared reference files in `nsyte-concepts/references/` and accept that agents must load the concepts skill body first.

### Anti-Pattern 4: Skill Names Without Namespace Prefix

**What people do:** `deploy/SKILL.md` with `name: deploy`.
**Why it's wrong:** An agent may have skills from many projects loaded simultaneously. A skill named `deploy` conflicts with Vercel's deploy skill, AWS CDK's deploy skill, etc. The `name` field must match the directory name.
**Do this instead:** `nsyte-deploy/SKILL.md` with `name: nsyte-deploy`. The prefix makes the skill uniquely identifiable.

### Anti-Pattern 5: Description Written in First Person

**What people do:** `description: "I can help you deploy your static site to Nostr using nsyte."`
**Why it's wrong:** Official Claude docs specify: "Always write in third person. The description is injected into the system prompt, and inconsistent point-of-view can cause discovery problems."
**Do this instead:** `description: "Deploys static sites to the Nostr network using nsyte. Use when the user wants to deploy, publish, or host a static site on Nostr or mentions nsyte."`

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| nsyte CLI binary | Agent executes via Bash tool: `nsyte <command> [flags]` | Skills instruct agents to call the compiled binary or `deno run src/cli.ts` |
| Nostr relays | Indirect — nsyte handles relay connection internally | Skills explain relay concept but agents do not connect directly |
| Blossom servers | Indirect — nsyte handles uploads internally | Skills explain blob storage concept for troubleshooting guidance |
| NIP-46 bunker | `nsyte bunker add <connection-string>` via CLI | `nsyte-config` skill guides bunker setup workflow |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `nsyte-setup` → other skills | None direct; sets up prerequisites | Guides install + init so other skills can assume nsyte is configured |
| `nsyte-deploy` ↔ `nsyte-concepts` | Shared vocabulary; concepts skill auto-loads | Deploy skill body should not re-explain Nostr; reference concepts skill as background |
| `nsyte-manage` ↔ `nsyte-deploy` | Conceptually sequential; no loading dependency | Agent may activate both in one session; both are independent |
| Any skill → `references/*.md` | Relative path link from SKILL.md body | One level deep only; agent reads file via Bash Read tool |

## Suggested Build Order

Skills have no runtime dependencies on each other, but the content of each skill depends on shared conceptual decisions. Build in this order:

1. **`nsyte-concepts/`** — Define the Nostr/Blossom vocabulary and explanations first. All other skills reference these concepts and should use consistent terminology.
2. **`nsyte-setup/`** — Installation and first-run. Defines the user journey entry point. Other skills can assume the state left by setup.
3. **`nsyte-deploy/`** — The core value proposition. Highest-priority skill for agent usefulness. Auth decisions and config prereqs defined here inform other skills.
4. **`nsyte-config/`** — Config management and CI/CD. Depends on deploy concepts for context about what config controls.
5. **`nsyte-manage/`** — List, browse, download, purge, sites, serve, run, debug. Depends on deploy having been established as the primary workflow.

Each skill is independently shippable, but building in this order ensures consistent terminology and avoids needing to revise earlier skills based on decisions made in later ones.

## Sources

- [Agent Skills Specification — agentskills.io](https://agentskills.io/specification) — HIGH confidence (official spec)
- [What Are Skills? — agentskills.io](https://agentskills.io/what-are-skills) — HIGH confidence (official)
- [Integrate Skills — agentskills.io](https://agentskills.io/integrate-skills.md) — HIGH confidence (official)
- [Extend Claude with Skills — Claude Code Docs](https://code.claude.com/docs/en/skills) — HIGH confidence (official)
- [Skill Authoring Best Practices — Anthropic Platform Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — HIGH confidence (official)
- [Gemini CLI Skills Directory Locations — geminicli.com](https://geminicli.com/docs/cli/skills/) — MEDIUM confidence (official Gemini CLI docs)
- [OpenCode Skills — opencode.ai](https://opencode.ai/docs/skills/) — MEDIUM confidence (official OpenCode docs)

---
*Architecture research for: Agent Skills integration into nsyte CLI*
*Researched: 2026-02-24*
