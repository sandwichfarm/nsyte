---
title: config
description: Interactive configuration editor for nsyte project settings
---

# `nsyte config`

An interactive TUI (Terminal User Interface) editor for managing your nsyte project configuration.
Navigate, edit, and save configuration values without manually editing JSON files.

## Usage

```bash
nsyte config [options]
```

## Options

- `-p, --path <path>` — Path to config file (default: `.nsite/config.json`)

## Keyboard Shortcuts

### Navigation Mode

- `Up/Down` — Navigate between fields
- `Enter` — Edit a field value, or expand/collapse arrays and objects
- `s` — Save changes
- `r` — Reset to original values (discard changes)
- `h` — Toggle help display
- `Del/Backspace` — Delete array items or object properties
- `Escape` — Collapse all expanded sections, or quit
- `q` — Quit (prompts to save if there are unsaved changes)

### Edit Mode

- Type to modify the value
- `Enter` — Save the edited value
- `Escape` — Cancel editing
- `Backspace` — Delete character

### Bunker Selection

When editing the `bunkerPubkey` field, a special overlay appears:

- `Up/Down` — Navigate available bunkers
- `Enter` — Select a bunker or enter manual npub entry
- `Escape` — Cancel selection

## Features

### Field Types

The editor handles different field types:

- **Strings**: Direct text editing
- **Numbers**: Numeric input with validation
- **Booleans**: Toggle between true/false
- **Arrays**: Expand to view/edit individual items, add new items, or delete existing ones
- **Objects**: Expand to view/edit nested properties

### Array Editing

Arrays (like `relays` and `servers`) can be:

- Expanded to show individual items
- Items can be edited individually
- New items can be added via the `+` entry
- Items can be deleted with `Del/Backspace`
- Comma-separated input for bulk editing

### Validation

Configuration is validated before saving using the JSON schema. If validation fails, the editor
shows error messages and prevents saving invalid configuration.

### Bunker Integration

The `bunkerPubkey` field has a special handler that:

- Lists available bunkers from your secure storage
- Allows selecting from existing bunkers
- Supports manual npub entry
- Automatically converts npub to hex pubkey

## Examples

### Edit Current Project Config

```bash
nsyte config
```

### Edit a Specific Config File

```bash
nsyte config --path /path/to/config.json
```

## Related Commands

- [`nsyte init`](init.md) — Initialize a new project with configuration
- [`nsyte validate`](validate.md) — Validate configuration without the TUI
