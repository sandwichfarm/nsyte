---
title: config
description: Interactive configuration editor
---

# config

Interactive TUI (Terminal User Interface) for editing nsyte configuration files with a full-screen editor.

## Usage

```bash
nsyte config [options]
```

## Options

- `-p, --path <path>` — Path to config file (default: `./nsyte.yaml`)

## Keyboard Shortcuts

### Navigation
- **Arrow keys** — Navigate between fields
- **Enter** — Edit selected field
- **Tab** — Move to next field

### Editing
- **s** — Save changes
- **r** — Reset to original values
- **ESC** — Collapse all expanded sections

### Help & Exit
- **h** — Show help
- **q** — Quit (prompts if unsaved changes)

### Array & Object Management
- **+** — Add item to array (when array is selected)
- **-** — Delete selected array item
- **Space** — Expand/collapse objects and arrays

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
- **Profile metadata**: Edit profile fields with validation
- **App handler config**: Configure NIP-89 handlers with visual editor

### Safety
- Tracks unsaved changes with visual indicator
- Confirms before quitting with unsaved changes
- Validates configuration before saving
- Creates backup of original file

## Examples

Edit project configuration:

```bash
nsyte config
```

Edit custom configuration file:

```bash
nsyte config -p /path/to/custom/config.yaml
```

Edit configuration in current directory:

```bash
nsyte config -p ./nsyte.yaml
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
- **Expand arrays** with Space to see and edit individual items
- Press **h** for in-editor help and keyboard shortcuts
- Configuration is only saved when you press **s** (safe to explore without changes)

## See Also

- [`nsyte init`](init.md) - Initialize a new nsyte project with guided setup
- [`nsyte validate`](validate.md) - Validate configuration file without editing
- [Configuration Reference](../configuration.md) - Complete configuration options documentation
