---
title: serve
description: Serve local nsite files for development
---

# `nsyte serve`

Serve your local nsite files for development and testing. This command starts a local HTTP server
that serves files from a directory with directory listing and CORS enabled.

**Aliases:** `srv`

## Usage

```bash
nsyte serve [options]
```

## Options

- `-p, --port <port>` — Port number to serve on (default: 8080)
- `-d, --dir <dir>` — Directory to serve (default: current directory `.`)

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

### Serve a Specific Directory

```bash
nsyte serve -d ./dist
```

Serves the `./dist` directory.

### Custom Port and Directory

```bash
nsyte serve --port 3000 -d ./build
```

## What It Does

The serve command:

1. Resolves the specified directory (relative to current working directory)
2. Checks that the directory exists
3. Starts a local HTTP server using Deno's standard library
4. Serves files with directory listing enabled and CORS headers

## Features

- **Directory listing**: Browse files in a directory
- **CORS enabled**: Cross-origin requests are allowed
- **Proper MIME types**: Files served with appropriate content types
- **Simple and fast**: Lightweight static file server

## Use Cases

### Preview Before Deploying

```bash
# Build your site
npm run build

# Preview locally
nsyte serve -d ./dist

# Deploy when ready
nsyte deploy ./dist
```

### Quick File Server

```bash
# Serve current directory
nsyte serve
```

## Troubleshooting

### Port Already in Use

```
Error: Port 8080 is already in use
```

**Solution**: Use a different port:

```bash
nsyte serve --port 3001
```

### Directory Not Found

```
Directory not found: /path/to/dir
```

**Solution**: Ensure the directory exists and the path is correct.

## Related Commands

- [`nsyte deploy`](deploy.md) — Deploy your files after testing locally
- [`nsyte run`](run.md) — Run a resolver server for npub subdomains
- [`nsyte validate`](validate.md) — Validate your configuration
