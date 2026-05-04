---
title: serve
description: Build and serve local nsite files for development
---

# `nsyte serve`

Serve a local directory over HTTP for development and testing. Useful for previewing your nsite
files before deploying them. The server binds to `localhost` only and supports directory listing.

## Usage

```bash
nsyte serve [options]
```

## Options

- `-p, --port <port>`: Port number for the local server (default: `8080`)
- `-d, --dir <dir>`: Directory to serve (defaults to current directory) (default: `"."`)

## Examples

### Basic Serve

```bash
nsyte serve
```

Serves the current directory on `http://localhost:8080`.

### Custom Port

```bash
nsyte serve --port 3000
```

Serves on `http://localhost:3000`.

### Custom Directory

```bash
nsyte serve --dir ./public
```

Serves files from the `./public` directory instead of the current directory.

## What It Does

The serve command:

1. **Resolves the directory**: Defaults to the current working directory; override with `-d, --dir`
2. **Starts an HTTP server**: Listens on the chosen port (default `8080`) on `localhost`
3. **Serves files with directory listing enabled**: Files are served via Deno's standard
   `serveDir` helper, which sets MIME types automatically and renders an index for directories
   without an `index.html`

## Use Cases

### Preview Before Deploy

Quickly preview a built site directory before running `nsyte deploy`:

```bash
nsyte serve --dir ./dist
```

### Different Project Layout

Serve a non-default directory while keeping the project's `.nsite/config.json` intact:

```bash
nsyte serve --dir ./public --port 3000
```

## Limitations

- **Localhost only**: The server binds to `localhost`. There is no `--host` option; for sharing a
  preview across a LAN, use a separate tool such as `ssh -R` or a tunnel.
- **No SPA fallback**: `nsyte serve` does not read `.nsite/config.json`, so the configured
  `fallback` is not applied. Non-existent paths return `404` rather than falling through to
  `index.html`. If you need SPA-style routing during local preview, deploy to a staging nsite or
  use a dedicated SPA dev server.
- **No live reload**: File changes do not trigger an automatic browser reload.

## Troubleshooting

### Port Already in Use

```
Error: Port 8080 is already in use
```

**Solution**: Use a different port:

```bash
nsyte serve --port 3001
```

### Permission Denied

```
Error: Permission denied binding to port 80
```

**Solution**: Use a port above 1024:

```bash
nsyte serve --port 8080
```

### Directory Not Found

```
Directory not found: /absolute/path/to/dir
```

**Solution**: Confirm the path passed to `--dir` exists relative to the current working directory.

## Related Commands

- [`nsyte deploy`](deploy.md) - Deploy your files after testing locally
- [`nsyte run`](run.md) - Run a resolver server for npub subdomains
- [`nsyte validate`](validate.md) - Validate your configuration
- [`nsyte debug`](debug.md) - Debug your published nsite

Inherits global options. See [global options](_global-options.md).
