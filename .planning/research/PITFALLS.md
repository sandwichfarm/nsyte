# Pitfalls Research

**Domain:** Agent Skills integration for a Nostr/Blossom CLI tool (nsyte)
**Researched:** 2026-02-24
**Confidence:** HIGH (official spec + Anthropic best-practices docs + community sources)

## Critical Pitfalls

### Pitfall 1: Name/Directory Mismatch Causes Silent Discovery Failure

**What goes wrong:**
The `name` field in SKILL.md frontmatter must exactly match the parent directory name. If `nsyte-deploy/SKILL.md` has `name: nsyte_deploy` (underscore instead of hyphen), the skill silently fails to load. Agents receive no error — the skill simply never appears in the available skills list.

**Why it happens:**
Developers often choose a `name` that reads well in prose, then create a directory using their normal file-naming conventions (with underscores, uppercase, or spaces). The spec's strict constraint (lowercase, hyphens only, no consecutive hyphens, no leading/trailing hyphens) is easy to violate accidentally.

**How to avoid:**
- Name the directory first, then copy it verbatim to the `name` field
- Run `skills-ref validate ./skill-dir` on every skill before shipping
- Use a CI check: `find skills/ -name SKILL.md | xargs skills-ref validate`

**Warning signs:**
- Skills do not appear when you inspect the agent's available skills list
- No errors thrown — just absence of the skill

**Phase to address:** Skill scaffolding phase (when creating the directory and SKILL.md structure for each nsyte command)

---

### Pitfall 2: Vague Description Prevents Skill Activation

**What goes wrong:**
The description field is the only signal agents use to decide whether a skill is relevant. There is no algorithmic keyword matching or embedding search — activation is pure LLM reasoning against the description text. A description like `"Deploys websites using nsyte"` will never trigger for a user who types `"publish my static site to Nostr"` because the agent has no way to bridge the terminology gap.

**Why it happens:**
Authors write descriptions from the perspective of someone who already knows the tool. They use the tool's terminology (`nsyte`, `Blossom`, `deploy`) but agents must match user intent expressed in user vocabulary (`publish`, `host`, `upload`, `static site`, `website`).

**How to avoid:**
- Write in third person (spec requirement): "Deploys static sites to the Nostr network using nsyte..."
- Include both action vocabulary (deploy, publish, upload, host) and context vocabulary (static site, website, Nostr, decentralized)
- Add explicit trigger phrase: "Use when the user wants to deploy or publish a static website, host files on Nostr, or use nsyte to upload content."
- Keep description under 200 characters with keywords front-loaded

**Warning signs:**
- Users ask about functionality but the skill never activates
- You have to explicitly mention the skill name for it to trigger
- Skills that use Nostr jargon exclusively fail to fire for generic queries

**Phase to address:** Every skill's description writing — treat as the most important field, not an afterthought

---

### Pitfall 3: Nostr Domain Concepts Left Unexplained

**What goes wrong:**
nsyte uses deeply domain-specific concepts: relays, Blossom servers, NIP-46 bunker auth, pubkeys (npub/nsec), and event kinds. Agents have no reliable prior knowledge of these. If a skill says "configure your relay list" without explaining what a relay is or what valid relay URLs look like, the agent will either make bad guesses or fail to complete the task.

**Why it happens:**
The natural instinct when writing docs is to assume the reader has context. For human docs, a link to "Nostr basics" suffices. For agent skills, there is no browsing — the agent has only what's in the skill at activation time.

**How to avoid:**
- Include a "Nostr Concepts" section in each skill that uses protocol-level terms, or a shared `references/nostr-concepts.md` that skills reference
- Define relay (WSS URL for Nostr protocol), Blossom server (HTTPS URL for file storage), bunker (NIP-46 remote signer), pubkey formats (npub = human-readable, hex = raw)
- Do NOT assume agent knows what `wss://relay.damus.io` is or why it's needed
- Include one valid example of each concept type (URL format, key format, etc.)

**Warning signs:**
- Agent tries to use HTTP instead of WSS for relay URLs
- Agent confuses Blossom server URLs with relay URLs
- Agent generates a random string instead of a real pubkey format
- Agent skips auth steps or invents flags that don't exist

**Phase to address:** Design the `references/nostr-concepts.md` shared reference file before writing individual command skills

---

### Pitfall 4: Token Budget Exhaustion from Monolithic SKILL.md

**What goes wrong:**
nsyte has 15 commands. If a single SKILL.md tries to cover all of them, it will exceed the 500-line / 5000-token recommendation. Once loaded, the entire file competes with conversation history and other context. An oversized skill degrades agent performance on all tasks, not just the one it was loaded for.

**Why it happens:**
It feels simpler to write one comprehensive skill than to design a multi-skill structure. The temptation is especially strong for a CLI with inter-related commands (init → config → deploy → purge form a natural workflow).

**How to avoid:**
- Use one skill per capability area, not one skill per command: e.g., `installing-nsyte`, `deploying-sites`, `managing-auth`, `managing-config`, `site-management`
- Keep each SKILL.md under 500 lines; push detailed reference material to `references/`
- The main SKILL.md body should be a guide with pointers; details live in referenced files
- A `references/nostr-concepts.md` shared across skills avoids repeating definitions

**Warning signs:**
- Draft SKILL.md exceeds 400 lines and you haven't covered all edge cases yet
- You feel compelled to explain every flag and option inline

**Phase to address:** Skill architecture planning — decide skill boundaries before writing any SKILL.md content

---

### Pitfall 5: Installation Skill Missing or Incomplete

**What goes wrong:**
An agent encountering nsyte for the first time must be able to detect whether it's installed and install it if not. Without an explicit installation skill, the agent will either guess (`brew install nsyte`? `npm install nsyte`?) or fail silently when nsyte commands return "command not found". nsyte is a Deno binary distributed as platform-specific releases — not a standard npm package.

**Why it happens:**
Authors focus on the tool's primary functionality (deploy, manage) and assume installation is a solved problem. But the Agent Skills format is explicitly designed for agents that may have no prior knowledge.

**How to avoid:**
- Create a dedicated `installing-nsyte` skill as the first skill in the collection
- Include: detection command (`nsyte --version`), install command per platform (Linux/macOS/Windows), verification step, and common failure modes (PATH not set, wrong binary for arch)
- Reference the GitHub releases URL or the official install script
- Explain that nsyte is a Deno CLI binary, not a Node/npm package

**Warning signs:**
- No skill addresses the "is nsyte installed?" question
- Install instructions in other skills assume nsyte is already available

**Phase to address:** First skill to write — gates all other skills being useful

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Duplicate Nostr concept explanations in each skill | Each skill is self-contained | Descriptions drift; updating concepts requires editing N skills | Never — use a shared `references/nostr-concepts.md` |
| Single mega-skill covering all commands | One place to edit | Exceeds token budget; poor progressive disclosure; skill never triggers appropriately | Never for nsyte's 15-command scope |
| Skip the `compatibility` field | Less to write | Agents don't know this requires a Deno runtime and real Nostr relays/Blossom servers | Never — specify network and runtime requirements |
| Use generic description without trigger phrases | Faster to write | Skill never activates for most real queries | Never for the primary discovery description |
| Omit validation steps in deploy workflow | Simpler instructions | Agent deploys to wrong server/relay, no feedback loop to catch errors | Only in a first draft for iteration |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| NIP-46 bunker auth | Describing bunker as "like a password" — agent tries to pass raw credentials | Explain bunker as a remote signer: agent runs `nsyte bunker connect <bunker-url>` and nsyte handles the protocol |
| Blossom servers | Confusing Blossom server with Nostr relay — agent tries to publish files to a relay WSS URL | Explicitly state: Blossom = HTTPS file storage (`https://`), relay = Nostr event routing (`wss://`); they serve different purposes |
| Multi-platform install | Providing only Linux instructions | Include all three platforms; agents run on CI and developer machines across all OSes |
| Config file location | Not specifying where `.nsite/config.json` lives relative to CWD | Explain config is project-local (`.nsite/config.json` in project root), not global |
| `nsyte ci` command | Agent treats CI mode as optional | Explain CI mode is required in non-interactive environments; without it, nsyte hangs waiting for keyboard input |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Over-triggering broad skills | Every task loads the deploy skill even for unrelated work | Narrow description to specific trigger contexts; don't use generic words like "file" or "server" in description | Immediately if description matches everyday programming vocabulary |
| Deep reference chains | Agent reads SKILL.md, which references `advanced.md`, which references `details.md` — agent uses `head -100` and gets incomplete info | Keep all references one level deep from SKILL.md | Every time agent follows a chain beyond 1 hop |
| Missing TOC in long reference files | Agent reads first 100 lines of a 300-line reference file and misses critical info | Add table of contents at top of any reference file over 100 lines | Consistently for files without TOC |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Including real private keys (nsec) in skill examples | Key exposure — private key is the Nostr identity | Use placeholder keys only: `nsec1example...` or `<your-nsec-here>`; never a real key |
| Skill scripts with unchecked file writes | Agent overwrites `.nsite/config.json` with bad data | Scripts should validate before writing; add `--dry-run` patterns where possible |
| Over-broad `allowed-tools` field | Agent can run arbitrary bash via skill | Specify only tools the skill actually needs (e.g., `Bash(nsyte:*)` not `Bash`) |
| Bundling real server URLs as defaults | Agents route all traffic through a single server you don't control | Use placeholder URLs (`https://your-blossom-server.example.com`) in examples |

---

## UX Pitfalls (Agent Experience)

| Pitfall | Agent Impact | Better Approach |
|---------|-------------|-----------------|
| Instructions that require prior knowledge of Nostr | Agent guesses or fails silently on key/relay concepts | Define concepts inline or reference `nostr-concepts.md` explicitly |
| No "what success looks like" in deploy skill | Agent doesn't know if deployment succeeded | Include example of successful output, what URLs are produced, how to verify |
| Multiple skills with overlapping descriptions | Wrong skill activates | Make each skill's description scope exclusive; test with representative queries |
| No error recovery guidance | Agent gets stuck on relay connection failures | Include common failure modes and recovery steps (e.g., "if relay times out, try a different relay from the list") |
| Describing optional flags without defaults | Agent paralyzed by choices | State the recommended default explicitly: "Use `--servers` to specify Blossom servers; if omitted, uses servers from `.nsite/config.json`" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Installation skill:** Verify it covers detection (`nsyte --version`), install path for all three platforms, and PATH verification — not just one platform's curl command
- [ ] **Deploy skill:** Verify it covers both interactive (with keys) and CI (with env vars) authentication modes — agents running in CI will hit the non-interactive path
- [ ] **Auth skill:** Verify it explains the difference between private key auth and NIP-46 bunker auth — and when each is appropriate (bunker for interactive, env var for CI)
- [ ] **Config skill:** Verify it explains `.nsite/config.json` is project-local and must be initialized before deploy — agents won't know to run `nsyte init` first
- [ ] **Description fields:** Verify each description is written in third person, contains both action keywords and context keywords, and has an explicit "Use when..." trigger phrase
- [ ] **Name validation:** Verify every `name` field matches its parent directory exactly — run `skills-ref validate` on each
- [ ] **Token budget:** Verify no SKILL.md body exceeds 500 lines — run `wc -l` on each
- [ ] **Nostr concepts:** Verify relay (WSS), Blossom (HTTPS), pubkey formats, and bunker are defined somewhere reachable from every skill that uses them

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Name/directory mismatch discovered after shipping | LOW | Rename directory OR update `name` field to match; no downstream changes needed |
| Overly vague descriptions causing poor activation | LOW | Edit description field; no structural changes needed; test with representative queries |
| Nostr concepts missing — agents failing on domain terms | MEDIUM | Add `references/nostr-concepts.md`; update all skills to reference it; re-test each skill |
| Monolithic SKILL.md exceeds token budget | MEDIUM | Split into multiple skill directories; update any cross-references; update discovery paths |
| Installation skill missing | LOW | Write `installing-nsyte/SKILL.md`; it has no dependencies on other skills |
| CI/auth workflows incomplete | HIGH | Requires understanding of nsyte's env var auth model; test in actual CI environment; affects agent usefulness in most real deployments |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Name/directory mismatch | Skill scaffolding (Phase 1) | `skills-ref validate` passes for all skills |
| Vague descriptions | Every skill's writing phase | Test: ask agent "deploy my site to Nostr" — correct skill activates without naming it explicitly |
| Nostr concepts unexplained | Architecture design (before writing skills) | Ask agent to configure a relay; it produces a valid `wss://` URL without prompting |
| Token budget exhaustion | Architecture design (skill boundary decisions) | `wc -l` all SKILL.md files; none exceed 500 lines |
| Installation skill missing | First skill written (gates everything else) | Agent can install nsyte on a fresh machine with no prior knowledge |
| Missing CI/non-interactive auth guidance | Deploy skill writing phase | Agent completes deployment using only env vars, no interactive prompts |
| Deep reference chains | Reference file design | Manually trace every link from SKILL.md; no chain exceeds one hop |
| Real credentials in examples | Every skill's review pass | Grep all skill files for `nsec1` patterns that match real key format; none found |

---

## Sources

- [Agent Skills Specification — agentskills.io](https://agentskills.io/specification) — HIGH confidence (official spec)
- [Skill Authoring Best Practices — Anthropic/Claude docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — HIGH confidence (official Anthropic documentation)
- [Agent Skills Overview — Anthropic/Claude docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — HIGH confidence (official Anthropic documentation)
- [Agent Skills: Why SKILL.md Won't Load — SmartScope](https://smartscope.blog/en/blog/agent-skills-guide/) — MEDIUM confidence (community guide, verified against spec)
- [Claude Agent Skills: A First Principles Deep Dive — Lee Han Chung](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/) — MEDIUM confidence (deep technical analysis, some claims LOW confidence re: implementation internals)
- [Gemini CLI Skills Documentation](https://geminicli.com/docs/cli/skills/) — MEDIUM confidence (cross-agent reference for discovery patterns)
- [Equipping Agents for the Real World with Agent Skills — Anthropic Blog](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills) — HIGH confidence (official Anthropic announcement)

---
*Pitfalls research for: Agent Skills integration into nsyte Nostr/Blossom CLI*
*Researched: 2026-02-24*
