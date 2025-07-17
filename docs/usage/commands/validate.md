---
title: validate
description: Validate nsyte configuration file against the JSON schema
---

# `nsyte validate`

Validate the nsyte configuration file against the official JSON schema to ensure it's properly formatted and contains valid values.

## Usage

```bash
nsyte validate [options]
```

## Options

- `--file <path>`: Path to configuration file to validate (default: `.nsite/config.json`)
- `--schema`: Show the JSON schema location and exit
- `--help`: Show help information

## Examples

### Validate Current Project Config

```bash
nsyte validate
```

This validates the configuration file in the current project's `.nsite/config.json`.

### Validate Specific File

```bash
nsyte validate --file path/to/config.json
```

### Show Schema Location

```bash
nsyte validate --schema
```

This displays the URL of the JSON schema used for validation.

## What It Validates

The validate command checks your configuration against the official JSON schema, ensuring:

### Required Fields
- All required configuration properties are present
- Field types match the expected types (string, number, boolean, array, object)

### Field Formats
- **URLs**: Relay and server URLs are properly formatted
- **Event Kinds**: App handler kinds are valid integers (0-65535)
- **File Paths**: Fallback paths are valid
- **Email Addresses**: Profile email fields are valid (if present)

### Value Constraints
- **Arrays**: Have appropriate minimum/maximum lengths
- **Strings**: Meet length requirements and format patterns
- **Numbers**: Are within valid ranges

### Optional Fields
- Profile information (name, about, picture, etc.)
- App handler configuration
- Publication settings (publishServerList, publishRelayList, etc.)
- Fallback configuration

## Configuration Schema

The configuration uses the JSON schema available at:
```
https://nsyte.run/schemas/config.schema.json
```

You can add this to your configuration file for editor support:

```json
{
  "$schema": "https://nsyte.run/schemas/config.schema.json",
  "bunkerPubkey": "abc123...",
  "relays": ["wss://relay1", "wss://relay2"],
  "servers": ["https://server1", "https://server2"]
}
```

## Example Valid Configuration

```json
{
  "$schema": "https://nsyte.run/schemas/config.schema.json",
  "bunkerPubkey": "9c08bc96a5c8b1c9b8e2f1a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4",
  "relays": [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol"
  ],
  "servers": [
    "https://cdn.hzrd149.com",
    "https://cdn.sovbit.host"
  ],
  "profile": {
    "name": "My nsite",
    "about": "A decentralized website on nostr",
    "picture": "https://example.com/avatar.jpg",
    "website": "https://example.com"
  },
  "publishServerList": true,
  "publishRelayList": true,
  "publishProfile": true,
  "fallback": "/index.html",
  "appHandler": {
    "enabled": true,
    "kinds": [1, 30023, 30311],
    "name": "My Event Viewer",
    "description": "Views notes and articles"
  }
}
```

## Common Validation Errors

### Invalid URL Format
```
Error: "relays[0]" must be a valid WebSocket URL
```

**Fix**: Ensure relay URLs start with `wss://` or `ws://`

### Invalid Event Kind
```
Error: "appHandler.kinds[0]" must be between 0 and 65535
```

**Fix**: Use valid event kind numbers within the allowed range

### Missing Required Field
```
Error: "bunkerPubkey" is required when using bunker authentication
```

**Fix**: Add the required field or use a different authentication method

### Invalid Type
```
Error: "publishServerList" must be a boolean
```

**Fix**: Use `true` or `false` instead of strings or numbers

## Exit Codes

- `0`: Configuration is valid
- `1`: Configuration is invalid (validation errors found)
- `2`: File not found or not readable

## Editor Support

Many editors support JSON schema validation when the `$schema` property is present:

- **VS Code**: Install the "JSON" extension (usually included)
- **WebStorm/IntelliJ**: Built-in support
- **Vim/Neovim**: Use coc-json or similar LSP plugin
- **Emacs**: Use lsp-mode with json-ls

## Related Commands

- [`nsyte init`](init.md) - Initialize a new project with valid configuration
- [`nsyte debug`](debug.md) - Debug nsite setup and configuration
- [`nsyte deploy`](deploy.md) - Deploy files (validates config automatically)