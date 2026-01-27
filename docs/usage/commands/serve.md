---
title: serve
description: Build and serve local nsite files for development
---

# `nsyte serve`

Build and serve your local nsite files for development and testing purposes. This command creates a
local development server that serves your files as they would appear when published.

## Usage

```bash
nsyte serve [options]
```

## Options

- `--port <port>`: Port number to serve on (default: 3000)
- `--host <host>`: Host to bind to (default: localhost)
- `--open`: Open the site in your default browser
- `--help`: Show help information

## Examples

### Basic Serve

```bash
nsyte serve
```

Serves the local nsite on `http://localhost:3000`.

### Custom Port

```bash
nsyte serve --port 8080
```

Serves on `http://localhost:8080`.

### Custom Host

```bash
nsyte serve --host 0.0.0.0 --port 3000
```

Serves on all network interfaces, accessible from other devices on your network.

### Open in Browser

```bash
nsyte serve --open
```

Serves the site and automatically opens it in your default web browser.

## What It Does

The serve command:

1. **Reads Configuration**: Loads your `.nsite/config.json` to understand the project structure
2. **Builds Files**: Processes your local files according to nsite rules
3. **Applies Fallback**: Uses the configured fallback file for client-side routing
4. **Serves Content**: Starts a local HTTP server to serve your files
5. **Live Reload**: Automatically reloads when files change (if supported)

## File Processing

The serve command mimics how your nsite will behave when published:

### Fallback Handling

If you have a `fallback` configured in your config (e.g., `"/index.html"`), the serve command will:

- Serve the fallback file for any non-existent paths
- Support client-side routing for SPAs (React, Vue, etc.)

### Content Types

Files are served with appropriate MIME types:

- `.html` → `text/html`
- `.css` → `text/css`
- `.js` → `application/javascript`
- `.json` → `application/json`
- Images → appropriate image types
- And more...

### Directory Structure

The serve command respects your project's directory structure and serves files from the configured
source directory.

## Development Features

### Hot Reload

The serve command can watch for file changes and automatically reload the browser (feature
availability depends on implementation).

### Error Handling

- Shows helpful error messages for missing files
- Serves fallback content for 404 errors
- Displays server logs for debugging

### Network Access

When using `--host 0.0.0.0`, you can access your nsite from:

- Other devices on your network
- Mobile devices for testing
- Virtual machines

## Use Cases

### SPA Development

For single-page applications with client-side routing:

```bash
nsyte serve --open
```

The fallback configuration ensures all routes are handled by your SPA.

### Mobile Testing

Test your nsite on mobile devices:

```bash
nsyte serve --host 0.0.0.0
```

Then access `http://[your-ip]:3000` from your mobile device.

### Production Preview

Preview how your nsite will look when published:

```bash
nsyte serve --port 8080
```

This gives you a local preview of the exact content that will be uploaded.

## Configuration

The serve command respects these configuration options from `.nsite/config.json`:

- `fallback`: File to serve for 404 errors (enables SPA routing)
- Source directory settings
- File ignore patterns (from `.nsite-ignore`)

## Comparison with Other Servers

### vs. `python -m http.server`

- ✅ Respects nsite fallback configuration
- ✅ Proper MIME types
- ✅ Understands nsite project structure

### vs. `npx serve`

- ✅ No Node.js dependency
- ✅ nsite-specific features
- ✅ Integrated with nsite configuration

### vs. Production nsite

- ⚠️ Local files (not from Blossom)
- ⚠️ No relay integration
- ✅ Same fallback behavior
- ✅ Same file structure

## Troubleshooting

### Port Already in Use

```
Error: Port 3000 is already in use
```

**Solution**: Use a different port:

```bash
nsyte serve --port 3001
```

### Permission Denied

```
Error: Permission denied binding to port 80
```

**Solution**: Use a port above 1024 or run with sudo (not recommended):

```bash
nsyte serve --port 8080
```

### Files Not Found

```
Error: Source directory not found
```

**Solution**: Ensure you're running the command from your project directory with a valid
`.nsite/config.json`.

## Related Commands

- [`nsyte upload`](upload.md) - Upload your files after testing locally
- [`nsyte run`](run.md) - Run a resolver server for npub subdomains
- [`nsyte validate`](validate.md) - Validate your configuration
- [`nsyte debug`](debug.md) - Debug your published nsite
