---
title: Configuration
description: Configuration options and settings for nsyte
---

# Configuration

nsyte uses a configuration file to store your settings. This guide explains all available configuration options and how to use them.

## Configuration File

The configuration is stored in `.nsite/config.json` in your project directory. This file is created when you run `nsyte init` and can be modified manually or through the CLI.

## Basic Configuration

Here's a basic configuration file with all available options:

```json
{
  "bunkerPubkey": "abc123...",
  "relays": ["wss://relay1", "wss://relay2"],
  "servers": ["https://server1", "https://server2"],
  "profile": {
    "name": "My Site",
    "about": "Description"
  },
  "publishServerList": true,
  "publishRelayList": true,
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
- `publishServerList`: Whether to publish the server list (default: true)
- `publishRelayList`: Whether to publish the relay list (default: true)

### Profile

- `profile.name`: Your site's name
- `profile.about`: A description of your site

### Routing

- `fallback`: The HTML file to use for client-side routing (e.g., `/index.html` for SPAs)

## Environment Variables

You can also configure nsyte using environment variables:

- `NSITE_CONFIG`: Path to configuration file (default: `.nsite/config.json`)
- `NSITE_RELAYS`: Comma-separated list of relay URLs
- `NSITE_SERVERS`: Comma-separated list of server URLs
- `NSITE_BUNKER`: Bunker connection string
- `NSITE_NBUNKSEC`: nbunksec string for authentication

## Ignoring Files

Create a `.nsite-ignore` file in your project root to specify files and directories that should be excluded from uploads. This uses standard glob syntax:

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
- `.nsite-ignore`
- `.nsite/config.json`
- `.vscode/**`

## Configuration Management

### Viewing Configuration

To view your current configuration:

```bash
nsyte config show
```

### Updating Configuration

You can update your configuration in several ways:

1. Using the CLI:
```bash
nsyte config set relays wss://relay1,wss://relay2
```

2. Editing the file directly:
```bash
# Edit .nsite/config.json
```

3. Using environment variables:
```bash
export NSITE_RELAYS=wss://relay1,wss://relay2
```

## Best Practices

1. **Security**
   - Never commit `.nsite/config.json` to version control
   - Use bunker authentication for better security
   - Rotate keys periodically

2. **Performance**
   - Use multiple relays for redundancy
   - Choose relays close to your users
   - Use CDN servers when possible

3. **Maintenance**
   - Keep your configuration in version control (excluding sensitive data)
   - Document your configuration choices
   - Review and update regularly

## Troubleshooting

### Common Issues

1. **Configuration Not Found**
   - Run `nsyte init` to create the configuration
   - Check file permissions
   - Verify the path in `NSITE_CONFIG`

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