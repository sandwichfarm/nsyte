---
title: AI Agent Skills
description: Install the nsyte Agent Skill so AI coding agents can deploy and manage nsites correctly
---

# AI Agent Skills

nsyte publishes an [Agent Skill](https://skills.sh/sandwichfarm/nsyte) — a `SKILL.md` document that
AI coding agents load on demand. With it installed, an agent knows how to install nsyte, write a
valid `.nsite/config.json`, authenticate with a NIP-46 bunker or `--sec`, preview deploys with
`--dry-run`, deploy to Blossom servers, inspect and update published sites, set up CI/CD, and work
through common errors — without you pasting docs into the conversation.

The skill follows the open [Agent Skills](https://agentskills.io) format and works with Claude Code,
Codex, Cursor, OpenCode, GitHub Copilot, Gemini CLI, Cline, Windsurf, and every other agent the
[skills CLI](https://skills.sh) supports.

## Install

```bash
npx skills add sandwichfarm/nsyte
```

The CLI detects which agents you have installed and links the skill into each one's skills
directory. Useful options:

| Option                  | Effect                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `-g`, `--global`        | Install for your user (all projects) instead of this project |
| `-a <agent>`, `--agent` | Target specific agents, e.g. `-a claude-code -a codex`       |
| `-y`, `--yes`           | Skip confirmation prompts (scripts / CI)                     |
| `--copy`                | Copy files instead of symlinking                             |
| `--skill nsyte`         | Select the skill explicitly (the repo currently ships one)   |

Later:

```bash
npx skills list            # show installed skills
npx skills update          # pull the latest version of every installed skill
npx skills remove nsyte    # uninstall
```

## Manual install

The skill is a plain directory — copy `skills/nsyte/` from the
[repository](https://github.com/sandwichfarm/nsyte/tree/main/skills/nsyte) into your agent's skills
folder:

```bash
git clone --depth 1 https://github.com/sandwichfarm/nsyte /tmp/nsyte

# Claude Code, this project
mkdir -p .claude/skills && cp -r /tmp/nsyte/skills/nsyte .claude/skills/

# Claude Code, user-wide
mkdir -p ~/.claude/skills && cp -r /tmp/nsyte/skills/nsyte ~/.claude/skills/

# Agent-neutral directory read by many agents
mkdir -p .agents/skills && cp -r /tmp/nsyte/skills/nsyte .agents/skills/
```

## What the skill contains

```
skills/nsyte/
├── SKILL.md                  # instructions: setup, config, auth, deploy, inspect, CI, troubleshooting
├── references/
│   └── nostr-concepts.md     # relays, pubkeys, nsec, Blossom, NIP-46, event kinds — for agents new to Nostr
└── assets/
    └── config.schema.json    # JSON Schema for .nsite/config.json
```

The skill is deliberately conservative: it tells agents to prefer `--dry-run` before publishing,
never to print or commit secrets, never to hand-edit `bunkerPubkey`, and to confirm with you before
running `delete` or `undeploy`.

## Keeping it current

The skill is checked in CI by the same drift gate that validates the command reference pages
(`deno task check-doc-drift`): every command must be mentioned, every flag the skill references must
exist in source, and the bundled config schema must match `src/schemas/config.schema.json`. If you
notice the skill giving stale advice, please
[open an issue](https://github.com/sandwichfarm/nsyte/issues) or a PR against `skills/nsyte/`.

## See Also

- [Installation](../installation.md) — install the nsyte CLI itself
- [CI/CD](ci-cd.md) — the automation flow the skill teaches agents
- [Security](security.md) — how credentials are stored
