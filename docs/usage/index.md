---
title: Basic Usage
description: Getting started with nsyte - basic commands and workflows
---

# Basic Usage

This guide covers the most common workflows and commands you'll use with nsyte. For a complete
reference of all commands, see the [Command Reference](./commands.md).

## Initializing a Project

The first step in using nsyte is to initialize your project. This creates the necessary
configuration files and sets up your authentication.

```bash
nsyte init
```

This interactive command will:

1. Ask for your authentication method (private key or bunker)
2. Configure your relays and servers
3. Create a `.nsite` directory with your configuration

![nsyte init demo](../assets/init-demo.png)

## Uploading Your Site

The most common command you'll use is `upload`. This command publishes your website files to the
configured relays and servers.

```bash
# Basic upload
nsyte upload ./dist

# Upload with options
nsyte upload ./dist --force --concurrency 8 --verbose
```

Common options:

- `--force`: Re-upload all files, even if they haven't changed
- `--purge`: Delete files that no longer exist locally
- `--verbose`: Show detailed progress
- `--concurrency`: Number of parallel uploads (default: 4)
- `--fallback`: HTML file to use as 404.html (for SPAs)

## Managing Files

### Listing Published Files

To see what files are currently published:

```bash
nsyte ls
```

This will show:

- File paths
- Upload dates
- File sizes
- Status (if available)

### Downloading Files

To download your published files:

```bash
nsyte download ./backup
```

This is useful for:

- Creating backups
- Migrating to a different setup
- Verifying published content

## Authentication Methods

nsyte supports three authentication methods:

### 1. Generated Private Key

The simplest method - nsyte will generate a new nostr key pair for you.

### 2. Existing Private Key

Use your own nostr private key.

### 3. nostr Bunker (NIP-46)

The most secure method - keeps your keys on a separate device.

```bash
# Connect to a bunker
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'

# List connected bunkers
nsyte bunker list
```

## Common Workflows

### Deploying a Static Site

1. Build your site:

```bash
npm run build  # or your build command
```

2. Upload the built files:

```bash
nsyte upload ./dist
```

### Deploying a Single Page Application (SPA)

For SPAs with client-side routing:

```bash
nsyte upload ./dist --fallback=/index.html
```

### Updating Your Site

1. Make your changes
2. Build your site
3. Upload the changes:

```bash
nsyte upload ./dist
```

### CI/CD Integration

To automate deployments in CI/CD:

1. Generate CI/CD credentials locally:

```bash
nsyte ci
# Follow prompts to connect bunker
# Copy the generated nbunksec (shown only once!)
```

2. Add the nbunksec to your CI/CD secrets (e.g., `NBUNK_SECRET`)

3. Use in your pipeline:

```bash
nsyte upload ./dist --nbunksec $NBUNK_SECRET
```

## Next Steps

- Learn about [configuration options](./configuration.md)
- Set up [CI/CD integration](../guides/ci-cd.md)
- Read about [security best practices](../guides/security.md)
