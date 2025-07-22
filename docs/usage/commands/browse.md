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

- `-r, --relays <relays>` — The nostr relays to use (comma separated). If not specified, uses relays
  from project config or default discovery relays
- `-k, --privatekey <nsec>` — The private key (nsec/hex) to use for signing delete operations
- `-p, --pubkey <npub>` — The public key to browse files for (if not using private key)
- `-b, --bunker <url>` — The NIP-46 bunker URL to use for signing
- `--nbunksec <nbunksec>` — The NIP-46 bunker encoded as nbunksec

## Examples

Browse files using project config:

```bash
nsyte browse
```

Browse files for a specific public key:

```bash
nsyte browse --pubkey npub1... --relays wss://relay.example
```

Browse files using a private key:

```bash
nsyte browse --privatekey nsec1...
```

## Keyboard Shortcuts

### Navigation

- `↑/↓` — Navigate through files
- `←/→` — Navigate between pages
- `i` — Switch identity (shows identity selection menu)
- `q` — Quit the browser

### Selection

- `SPACE` — Select/deselect current file
- `a` — Deselect all (visible when files are selected)
- `s` — Toggle between viewing all files and selected files only

### Actions

- `ENTER` — View detailed information about the current file
- `/` — Enter filter mode to search files
- `DEL/BACKSPACE` — Delete selected files (requires confirmation)

### Filter Mode

- Type to filter files by name, path, or SHA256 hash
- `ENTER` — Apply filter
- `ESC` — Cancel filter

### Delete Confirmation

- Type `yes` to confirm deletion
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

1. **Private key** — Use `--privatekey` with an nsec or hex key
2. **Bunker** — Use `--bunker` with a bunker URL
3. **nbunksec** — Use `--nbunksec` with an encoded bunker secret
4. **Project config** — Uses authentication from `.nsite/config.json`
5. **Interactive prompt** — If no authentication is provided, you'll be prompted when attempting to
   delete

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

### Responsive Design

The interface adapts to terminal size changes, adjusting the number of visible files automatically.

## See Also

- [`nsyte ls`](ls.md) - List files in a simple text format
- [`nsyte deploy`](deploy.md) - Deploy files to the network
- [`nsyte purge`](purge.md) - Remove files using command-line options
- [`nsyte download`](download.md) - Download files from the network
