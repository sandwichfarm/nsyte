---
title: config
description: Interactive configuration editor
---

# config

Interactive TUI (Terminal User Interface) for editing nsyte configuration files with a full-screen
editor.

## Usage

```bash
nsyte config [options]
```

## Options

- `-p, --path <path>` — Path to config file (default: `.nsite/config.json`)

## Keyboard Shortcuts

### Navigation

- **↑ / ↓** — Move between fields
- **Enter** — Edit a value, expand/collapse an object or array, or add a new item
  (when the `[+]` row is selected)

### Editing

- **s** — Save changes
- **r** — Reset to original values
- **Delete / Backspace** — Delete the selected array item or object property
- **ESC** — Collapse expanded sections (quits if nothing is expanded)

### Help & Exit

- **h** — Show help
- **q** — Quit (prompts if unsaved changes)

## Features

### Interactive Editing

- Full-screen terminal interface with alternate screen buffer
- Navigate configuration structure with keyboard
- Edit fields inline with type validation
- Visual feedback for unsaved changes

### Configuration Structure

- **Nested objects**: Expand and collapse complex structures
- **Arrays**: Add, remove, and reorder items
- **Type validation**: Ensures valid values before saving
- **Required fields**: Highlights missing required configuration

### Special Features

- **Bunker selection**: Browse and select from stored bunkers with display names
- **Relay/server management**: Easy add/remove for arrays of URLs
- **Nested fields**: Edit profile and other nested values by expanding their objects

### Safety

- Tracks unsaved changes with visual indicator
- Confirms before quitting with unsaved changes
- Validates configuration before saving

## Examples

Edit project configuration:

```bash
nsyte config
```

Edit a custom configuration file:

```bash
nsyte config -p /path/to/custom/config.json
```

## Workflow

1. **Launch editor**: Opens full-screen TUI
2. **Navigate**: Use arrow keys to move between fields
3. **Edit**: Press Enter on a field to edit its value
4. **Save**: Press `s` to save changes
5. **Exit**: Press `q` to quit (confirms if unsaved changes)

## Configuration Validation

The editor validates your configuration before saving:

- **URL formats**: Ensures relay and server URLs are valid
- **Required fields**: Checks that all required fields are present
- **Type checking**: Validates field types (strings, numbers, booleans, arrays)
- **Schema compliance**: Validates against JSON schema

## Tips

- Use **bunker selector** to choose from stored bunkers instead of manually entering pubkeys
- **Expand arrays and objects** with Enter to see and edit individual items
- Press **h** for in-editor help and keyboard shortcuts
- Configuration is only saved when you press **s** (safe to explore without changes)

## See Also

- [`nsyte init`](init.md) - Initialize a new nsyte project with guided setup
- [`nsyte validate`](validate.md) - Validate configuration file without editing
- [Configuration Reference](../configuration.md) - Complete configuration options documentation

Inherits global options. See [global options](_global-options.md).
