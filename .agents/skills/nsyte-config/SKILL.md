---
name: nsyte-config
description: Manages nsyte project configuration including relay URLs, Blossom server URLs, and site metadata. Use when the user wants to configure, update, or validate nsyte settings in .nsite/config.json.
---

## Prerequisites

- nsyte must be installed and available in PATH (see `nsyte-setup` skill if not installed)
- `.nsite/config.json` must exist (created by `nsyte init`)
- For Nostr/Blossom domain concepts (relays, pubkeys, Blossom servers), see the `nsyte-concepts` skill

---

## Interactive Config Editing (`nsyte config`)

**Requires an interactive terminal (TTY).** Exits with error in CI/scripts/pipes:

```
Config editor requires an interactive terminal
```

For non-TTY contexts, use direct JSON editing + `nsyte validate` instead.

```bash
# Run from the project root (where .nsite/config.json lives)
nsyte config
```

### Keyboard reference

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move between fields |
| `ENTER` | Start editing field / expand array or object |
| `s` | Save all changes to `.nsite/config.json` |
| `r` | Reset — discard unsaved changes |
| `h` | Toggle help line |
| `q` | Quit (prompts to save if unsaved changes exist) |
| `ESC` | Collapse all expanded sections (or quit if none expanded) |
| `DEL` / `BACKSPACE` | Delete array item or object property (with confirm) |

**Special field: `bunkerPubkey`** — pressing `ENTER` opens a bunker-selection overlay. Do not edit
this field manually; always use `nsyte bunker use`. See the `nsyte-auth` skill.

---

## Config Schema Reference

Config file: `.nsite/config.json`

### Required

| Field | Type | Description |
|-------|------|-------------|
| `relays` | `string[]` | Nostr relay URLs (`wss://`, unique items) |
| `servers` | `string[]` | Blossom server URLs (`https://`, unique items) |

### Authentication

| Field | Type | Description |
|-------|------|-------------|
| `bunkerPubkey` | string | 64-char **hex** pubkey of the configured bunker. Set by `nsyte bunker use` only. Schema pattern: `^[0-9a-fA-F]{64}$`. |

**Warning:** Setting `bunkerPubkey` manually creates a dangling reference (no keychain entry).
Always set via `nsyte bunker use`. See the `nsyte-auth` skill.

### Site identity

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | string \| null | `null` | Empty/null = root site (kind 15128). Non-empty = named site (kind 35128). |
| `title` | string | — | Human-readable site title |
| `description` | string | — | Site description |
| `fallback` | string | — | Path to 404 fallback HTML file (for SPAs) |

### Publishing (root sites only — `id` must be null/empty)

| Field | Type | Description |
|-------|------|-------------|
| `publishProfile` | boolean | Publish Nostr profile event. Requires non-empty `profile` object. |
| `publishRelayList` | boolean | Publish relay list event |
| `publishServerList` | boolean | Publish Blossom server list event |
| `publishAppHandler` | boolean | Publish app handler event. Requires `appHandler.id`. |

### Other fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gatewayHostnames` | `string[]` | `["nsite.lol"]` | Gateway hostnames for site URLs |
| `profile` | object | — | Nostr profile fields: `name`, `display_name`, `about`, `picture`, `banner`, `website`, `nip05`, `lud16`, `lud06` |
| `appHandler` | object | — | Required `kinds` array + optional `id`, `name`, `description`, `icon`, `platforms` |
| `$schema` | string | — | JSON Schema URI for editor autocomplete (`nsyte validate --schema`) |

### Validation rules

- `publishAppHandler: true` requires `appHandler.id`
- `publish*` fields (`publishProfile`, `publishRelayList`, `publishServerList`) are only valid when `id` is null/empty
- `publishProfile: true` requires a non-empty `profile` object

---

## Scriptable Validation (`nsyte validate`)

```bash
nsyte validate                              # validate .nsite/config.json (exit 0 = valid, 1 = invalid)
nsyte val                                   # alias
nsyte validate --file /path/to/config.json  # validate specific file
nsyte validate --schema                     # print JSON Schema URI for editor integration
```

Success output:
```
✓ Configuration is valid!

Configuration Summary:
  Relays: 2
  Servers: 1
  Title: My Site
```

Failure: prints error list and exits 1. Use in CI pre-flight checks before deploy.

---

## Programmatic Config Editing (no TTY)

When `nsyte config` cannot be used (CI, scripts, pipes):

1. Edit `.nsite/config.json` directly
2. Run `nsyte validate` to verify the result

**NEVER manually set `bunkerPubkey`** — always use `nsyte bunker use` from an interactive terminal.
See the `nsyte-auth` skill.

---

## Troubleshooting

**"Config editor requires an interactive terminal"** — running `nsyte config` outside a TTY. Use
direct JSON editing + `nsyte validate` instead.

**Validation errors after manual edit** — run `nsyte validate` for specific errors. Common causes:
malformed relay/server URLs, `publishAppHandler: true` without `appHandler.id`, `publish*` fields
on a named site (`id` non-empty), or `publishProfile: true` with empty `profile`.

**bunkerPubkey causes auth failure** — pubkey is set in config but keychain entry is missing.
Fix: `nsyte bunker use <pubkey>` from an interactive terminal. See the `nsyte-auth` skill.
