---
title: Configuration
description: Configuration options and settings for nsyte
---

# Configuration

nsyte uses a configuration file to store your settings. This guide explains all available
configuration options and how to use them.

## Configuration File

The configuration is stored in `.nsite/config.json` in your project directory. This file is created
when you run `nsyte init` and can be modified manually or through the CLI.

## Basic Configuration

Here's a basic configuration file with all available options:

```json
{
  "bunkerPubkey": "abc123...",
  "relays": ["wss://relay.damus.io", "wss://nos.lol"],
  "servers": ["https://blossom.server"],
  "publishProfile": true,
  "publishRelayList": true,
  "publishServerList": true,
  "profile": {
    "name": "My Name",
    "display_name": "Display Name",
    "about": "Description of myself",
    "picture": "https://example.com/avatar.jpg",
    "banner": "https://example.com/banner.jpg",
    "website": "https://mysite.com",
    "nip05": "me@mysite.com",
    "lud16": "me@getalby.com"
  },
  "publishAppHandler": true,
  "appHandler": {
    "id": "my-app-handler",
    "kinds": [1, 30023],
    "name": "My Event Viewer",
    "description": "Views notes and articles",
    "platforms": {
      "web": {
        "patterns": [
          { "url": "https://myapp.com/e/<bech32>", "entities": ["nevent", "note"] },
          { "url": "https://myapp.com/a/<bech32>", "entities": ["naddr"] }
        ]
      }
    }
  },
  "fallback": "/index.html"
}
```

## Configuration Options

### Authentication

- `bunkerPubkey`: Your nostr bunker public key (if using NIP-46)
- `privateKey`: Your nostr private key (if not using bunker)

### Relays and Servers

- `relays`: Array of WebSocket URLs for nostr relays
- `servers`: Array of HTTP(S) URLs for blossom servers
- `publishRelayList`: Whether to publish the relay list as kind 10002 (default: false, **root sites
  only**)
- `publishServerList`: Whether to publish the Blossom server list as kind 10063 (default: false,
  **root sites only**)

### Profile Metadata

- `publishProfile`: Whether to publish profile metadata as kind 0 (default: false, **root sites
  only**)
- `profile.name`: Your name
- `profile.display_name`: Your display name
- `profile.about`: A description about yourself
- `profile.picture`: URL to your avatar image
- `profile.banner`: URL to your banner/header image
- `profile.website`: Your website URL
- `profile.nip05`: Your NIP-05 identifier (e.g., `user@domain.com`)
- `profile.lud16`: Your Lightning address for receiving payments (e.g., `user@getalby.com`)
- `profile.lud06`: Legacy Lightning address (LNURL)

### Routing

- `fallback`: The HTML file to use for client-side routing (e.g., `/index.html` for SPAs)

### Root Site Only Metadata

Profile, relay list, and server list are **user-level metadata** and can only be published from
**root sites** (where `id` is `null`, `""`, or unset). Named sites cannot publish these to prevent
conflicts.

**Root site** (can publish user metadata):

```json
{
  "id": null,
  "publishProfile": true,
  "publishRelayList": true,
  "publishServerList": true,
  "profile": {
    "name": "My Name"
  }
}
```

**Named site** (cannot publish user metadata):

```json
{
  "id": "blog",
  "publishProfile": true // ❌ ERROR - not allowed for named sites
}
```

If you try to publish user-level metadata from a named site, you'll get a validation error during
`nsyte deploy`.

### NIP-89 App Handler

- `publishAppHandler`: Whether to publish app handler announcement (default: false)
- `appHandler.id`: Optional unique identifier for this handler (defaults to site
  id). Used as the `d` tag in kind 31990 events.
- `appHandler.kinds`: Array of event kind numbers this nsite can handle (**required** when `appHandler` is configured)

- `appHandler.name`: Optional display name for your handler
- `appHandler.description`: Optional description of what your handler does
- `appHandler.platforms`: Platform-specific handler configurations
  - `platforms.web.patterns`: Array of custom URL patterns for web handling
    - `url`: Full URL pattern with `<bech32>` placeholder
    - `entities`: Supported entity types (`nevent`, `naddr`, `nprofile`, etc.)
  - `platforms.android`: Android app intent URL or package name
  - `platforms.ios`: iOS app URL scheme or universal link
  - `platforms.macos`: macOS app URL scheme or bundle identifier
  - `platforms.windows`: Windows app protocol or executable path
  - `platforms.linux`: Linux app command or desktop file

## Environment Variables

The following environment variables affect nsyte's runtime behavior:

- `LOG_LEVEL`: Logger verbosity (`debug`, `info`, `warn`, `error`; default: `info`)
- `NSITE_DISPLAY_MODE`: Display mode override for progress UI (e.g., `interactive`, `non-interactive`)
- `NSYTE_FORCE_ENCRYPTED_STORAGE`: Set to `true` to force encrypted file storage
  even if a native OS keychain is available
- `NSYTE_DISABLE_KEYCHAIN`: Set to `true` to skip the OS keychain backend
- `NSYTE_TEST_MODE`: Set to `true` to disable the keychain backend (used for
  testing)

To pass a config-file path, relay list, server list, or bunker secret, use the
corresponding CLI flag instead of an environment variable:

- `--config <path>` (or `-c <path>`) — global flag, accepts the config file path
- `--relays <list>` — per-command flag (e.g., `nsyte deploy --relays wss://relay1,wss://relay2`)
- `--servers <list>` — per-command flag
- `--sec <secret>` — per-command flag, accepts an `nsec`, `nbunksec`,
  `bunker://` URL, or 64-char hex secret

## Ignoring Files

Create a `.nsyte-ignore` file in your project root to specify files and directories that should be
excluded from uploads. This uses standard glob syntax:

```
# Ignore build artifacts
dist/
*.log

# Ignore specific config files
secrets.json
```

### Default Ignore Patterns

nsyte automatically ignores:

- `.git/**`
- `.DS_Store`
- `node_modules/**`
- `.nsyte-ignore`
- `.nsite/config.json`
- `.vscode/**`

## Configuration Management

### Editing Configuration

Use the interactive TUI editor:

```bash
nsyte config
```

This opens a full-screen terminal editor for `.nsite/config.json` (or pass
`-p <path>` for a custom config file). See the [config command reference](./commands/config.md)
for keyboard shortcuts and features.

### Other Ways to Update Configuration

1. Edit the file directly:

```bash
# Edit .nsite/config.json with your editor of choice
```

2. Override settings per-invocation via CLI flags (e.g., `--relays`, `--servers`,
   `--sec`); see each command's reference page for the supported flags.

## Best Practices

1. **Security**
   - Never commit `.nsite/config.json` to version control if it contains sensitive data
   - Use bunker authentication for better security
   - Use encrypted storage or OS keychain for bunker credentials
   - Rotate keys periodically

2. **Performance**
   - Use multiple relays for redundancy
   - Choose relays close to your users
   - Use CDN servers when possible
   - Enable caching in production deployments

3. **Maintenance**
   - Keep your configuration in version control (excluding sensitive data)
   - Document your configuration choices
   - Review and update regularly
   - Use `nsyte validate` to check configuration before deployment

## Troubleshooting

### Common Issues

1. **Configuration Not Found**
   - Run `nsyte init` to create the configuration
   - Check file permissions
   - Verify the path passed via `--config <path>` (or default `.nsite/config.json`)

2. **Authentication Errors**
   - Verify your keys
   - Check bunker connection
   - Ensure proper permissions

3. **Upload Failures**
   - Check relay connectivity
   - Verify server URLs
   - Review ignore patterns

## Next Steps

- Learn about [deployment options](../guides/deployment.md)
- Set up [CI/CD integration](../guides/ci-cd.md)
- Review [security best practices](../guides/security.md)
