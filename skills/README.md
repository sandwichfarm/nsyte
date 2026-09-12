# nsyte agent skills

[![skills.sh](https://skills.sh/b/sandwichfarm/nsyte)](https://skills.sh/sandwichfarm/nsyte)

This directory holds [Agent Skills](https://skills.sh) for AI coding agents (Claude Code, Codex,
Cursor, OpenCode, Copilot, Gemini CLI, and others). A skill is a `SKILL.md` file plus optional
`references/` and `assets/` that teach an agent how to use nsyte correctly.

| Skill                     | What it covers                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`nsyte`](nsyte/SKILL.md) | Installing nsyte, project setup, `.nsite/config.json`, auth (NIP-46 / nsec / nbunksec), deploying, inspecting and updating sites, dry runs, secrets scanning, delete/undeploy, CI/CD, troubleshooting |

## Install

With the [skills CLI](https://skills.sh) (works with every supported agent):

```bash
npx skills add sandwichfarm/nsyte
```

Options:

```bash
npx skills add sandwichfarm/nsyte --skill nsyte          # pick the skill explicitly
npx skills add sandwichfarm/nsyte -a claude-code -a codex # target specific agents
npx skills add sandwichfarm/nsyte -g                      # install for the user, not just this project
npx skills add sandwichfarm/nsyte -y                      # skip prompts (CI / scripts)
npx skills update                                         # pull the latest version later
```

Browse the listing at <https://skills.sh/sandwichfarm/nsyte>.

### Manual install

Copy `skills/nsyte/` into your agent's skills directory, for example:

```bash
# Claude Code (project)
mkdir -p .claude/skills && cp -r skills/nsyte .claude/skills/

# Claude Code (user-wide)
mkdir -p ~/.claude/skills && cp -r skills/nsyte ~/.claude/skills/

# Agent-neutral location read by many agents
mkdir -p .agents/skills && cp -r skills/nsyte .agents/skills/
```

## Layout

```
skills/
└── nsyte/
    ├── SKILL.md                  # the skill (YAML frontmatter + instructions)
    ├── references/
    │   └── nostr-concepts.md     # relays, pubkeys, nsec, Blossom, NIP-46, event kinds
    └── assets/
        └── config.schema.json    # copy of src/schemas/config.schema.json
```

`SKILL.md` follows the [Agent Skills](https://agentskills.io) format: `name` and `description` are
required frontmatter; `license` and `metadata` are optional. The `description` is what agents use to
decide when the skill applies, so it names the trigger words (nsyte, nsite, Nostr, Blossom).

## Keeping the skill accurate

The skill is checked by the doc-drift gate (`deno task check-doc-drift`, also run in CI):

- every command in `src/commands/` must be mentioned in `skills/nsyte/SKILL.md`;
- every `--flag` the skill mentions must exist in source;
- `skills/nsyte/assets/config.schema.json` must be identical to `src/schemas/config.schema.json`.

When you add or rename a command or flag, update `SKILL.md` in the same PR. When you change the
config schema, copy it over:

```bash
cp src/schemas/config.schema.json skills/nsyte/assets/config.schema.json
```
