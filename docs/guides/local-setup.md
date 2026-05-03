---
title: Local Development Setup
description: Setting up nsyte for local development and testing
---

# Local Development Setup

This guide covers setting up nsyte for local development and testing your sites before deployment.

## Prerequisites

- [Deno](https://deno.land/) 2.0 or later
- Git
- A bunker-compatible signer (Amber, Alby, etc.)

## Development Installation

### Option 1: Install from Source

```bash
git clone https://github.com/sandwichfarm/nsyte.git
cd nsyte
deno task compile
```

### Option 2: Install from JSR

```bash
# Install latest from JSR
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

### Option 3: Development Build from Source

```bash
git clone https://github.com/sandwichfarm/nsyte.git
cd nsyte
deno install -A -f -g -n nsyte src/cli.ts
```

## Testing Your Setup

### Initialize a Test Project

```bash
mkdir test-site
cd test-site
nsyte init
```

During initialization:

- Connect your bunker signer when prompted
- Configure at least one relay for testing
- Optionally configure blossom servers

### Create Test Content

```bash
echo "<html><body><h1>Test Site</h1></body></html>" > index.html
echo "# Test" > README.md
```

### Test Deploy

```bash
nsyte deploy .
```

### Verify Deployment

```bash
nsyte list
```

The canonical command is `list`; `ls` is also accepted as an alias (see the
[list command reference](../usage/commands/ls.md)).

## Local Development Workflow

### Building Your Site

Build your static site using your preferred tools:

```bash
# React/Next.js
npm run build

# Jekyll
bundle exec jekyll build

# Hugo
hugo

# Or any other static site generator
```

### Testing Before Deploy

Test locally before uploading:

```bash
# Serve locally first
python -m http.server 8000
# or
npx serve dist/
```

### Deploy to Test Environment

```bash
# Deploy to staging relays first
nsyte deploy ./dist --relays "wss://test-relay.example.com"
```

## Development Commands

### Build Commands

```bash
# Build for current platform
deno task compile

# Build for all platforms  
deno task compile:all

# Run tests
deno task test
```

### Debug Mode

Use verbose output for debugging:

```bash
nsyte deploy . --verbose
```

## Configuration Tips

### Multiple Environments

Use the global `-c, --config <path>` flag (inherited by every subcommand) to
target a different config file per environment. The flag accepts an absolute
path or one relative to the current working directory; the default is
`.nsite/config.json`.

```bash
# Development
nsyte --config .nsyte-dev.json init

# Production
nsyte --config .nsyte-prod.json init

# The flag works on every subcommand:
nsyte --config .nsyte-prod.json deploy ./dist
```

### Ignore Files

Create `.nsyte-ignore` to exclude development files:

```
node_modules/
.git/
*.log
.env
.nsyte-dev.json
```

The legacy filename `.nsite-ignore` is also recognized by the file scanner for
backwards compatibility, but `.nsyte-ignore` is the canonical name (matching
the README and configuration reference).

## Troubleshooting

### Common Issues

**Permission Errors**

- Ensure Deno has necessary permissions
- Check file system permissions
- Verify bunker connection

**Connection Issues**

- Test relay connectivity manually
- Check network/firewall settings
- Verify relay URLs are correct

**Authentication Problems**

- Reconnect bunker signer
- Check bunker permissions
- Generate new CI token if needed

### Getting Help

- [GitHub Issues](https://github.com/sandwichfarm/nsyte/issues)
- [Deployment Guide](./deployment.md)
- [Security Guide](./security.md)

## Next Steps

- [Set up CI/CD automation](./ci-cd.md)
- [Configure production deployment](./deployment.md)
- [Review security practices](./security.md)
