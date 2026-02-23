---
title: browse
description: Interactive TUI browser for managing files on the nostr network
---

# browse

Interactive Terminal User Interface (TUI) browser for managing files on the nostr network. Browse,
select, filter, and delete files with an intuitive keyboard-driven interface.

## Usage

```bash
nsyte browse [options]
```

## Options

- `-r, --relays <relays>` — Nostr relays to query (comma-separated)
- `--sec <secret>` — Secret for signing (auto-detects: nsec, nbunksec, bunker://, hex)
- `-p, --pubkey <npub>` — Public key to browse (npub, hex, or NIP-05 like name@domain.com)
- `--use-fallback-relays` — Include default nsyte relays for better discovery
- `--use-fallbacks` — Enable all fallback options (relays)

## Examples

Browse files using project config:

```bash
nsyte browse
```

Browse files for a specific public key:

```bash
nsyte browse --pubkey npub1... --relays wss://relay.example
```

Browse files using authentication:

```bash
nsyte browse --sec nsec1...
```

Browse with fallback relays:

```bash
nsyte browse --use-fallbacks
```

Browse using NIP-05 identifier:

```bash
nsyte browse -p alice@example.com
```

## Keyboard Shortcuts

### Navigation

- `↑/↓` — Navigate through files
- `Enter` — Toggle detail view / Open directory
- `i` — Switch identity (shows identity selection menu)
- `s` — Switch site (when multiple sites are available)
- `q` — Quit the browser

### Selection & Filtering

- `Space` — Select/deselect current file (multi-select)
- `/` — Enter filter mode to search files by path or hash
- `ESC` — Clear filter / Exit detail view

### Actions

- `d` — Delete selected files (requires confirmation)

### Filter Mode

- Type to filter files by name, path, or SHA256 hash
- Real-time filtering as you type
- `ESC` — Exit filter mode

### Delete Confirmation

- Type `yes` to confirm deletion
- Requires authentication for signing delete events
- `ESC` — Cancel deletion

## Visual Indicators

- **Relay indicators** — Colored symbols show which relays have the file
- **Server indicators** — Colored symbols show which Blossom servers have the file
- **Selected files** — Highlighted with bright magenta background
- **Focused file** — Highlighted with darker magenta background
- **Ignored files** — Shown in red (based on `.nsite-ignore` rules)
- **Deleting files** — Shown in red during deletion

## Authentication

Delete operations require authentication. The browse command supports:

1. **Unified `--sec` flag** — Auto-detects format (nsec, nbunksec, bunker://, hex)
2. **Project config** — Uses authentication from `.nsite/config.json`
3. **Interactive prompt** — If no authentication is provided, you'll be prompted when attempting to delete

## Features

### Identity Selection and Display

The current identity (npub) is displayed in the header next to "nsyte browse" in green. When run
outside a project or without explicit authentication, browse shows an interactive menu to select a
nostr identity. You can:

- Choose from existing bunkers (displayed as full npub strings)
- Enter an npub manually
- Generate a new private key
- Use an existing private key
- Connect to a new NSEC bunker

Press `i` at any time during browsing to switch to a different identity. The header will update to
show the new identity.

### Multi-Site Support

When a pubkey has multiple sites (root site and named sites), you can switch between them:

- Press `s` to open the site selection menu
- Choose from available sites with their titles and file counts
- The current site name is displayed in the header

### File Tree View

Files are displayed in a hierarchical tree structure with directories collapsed by default. Only
files (not directories) can be selected or operated on.

### Multi-Selection

Select multiple files for batch operations. The footer shows the count of selected files.

### Filtering

Filter files by name, path, or SHA256 hash. The filter remains active until cleared.

### Delete Operations

When deleting files, the browser:

1. Creates and publishes NIP-09 delete events to relays
2. Deletes the corresponding blobs from all Blossom servers where they exist
3. Verifies that files were actually removed from relays
4. Updates the display with deletion status

Delete operations show detailed error messages if any deletions fail, including specific relay or
server errors.

### Propagation Display

The browser shows which relays and blossom servers have each file:

- **Relay indicators**: Colored triangles (𓅦) show relay propagation
- **Server indicators**: Colored squares (🌸) show blossom server availability
- **Background checking**: Automatically checks blossom server availability in the background
- **Detail view**: Shows complete lists of relays and servers with colored indicators

### Performance

- **Throttled rendering**: Maximum 10 FPS to prevent screen tearing
- **Background checks**: Non-blocking blossom server availability checks
- **Responsive design**: Adapts to terminal size changes automatically

## See Also

- [`nsyte ls`](ls.md) - List files in a simple text format
- [`nsyte deploy`](deploy.md) - Deploy files to the network
- [`nsyte purge`](purge.md) - Remove files using command-line options
- [`nsyte download`](download.md) - Download files from the network
