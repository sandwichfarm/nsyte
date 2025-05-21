---
title: nsyte Documentation
description: Documentation for nsyte - publish your site to nostr and blossom servers
---

# nsyte Documentation

> ⚠️ nsyte is alpha. use at your own risk.

nsyte is a command-line tool for publishing websites to nostr and Blossom servers. It enables decentralized, censorship-resistant website hosting.

![nsyte screen demo](../static/nsyte.gif)

## Quick Start

```bash
# Install
deno install -A -f -n nsyte https://github.com/sandwichfarm/nsyte/raw/main/src/cli.ts

# Initialize project (interactive setup)
nsyte init

# Upload website
nsyte upload ./dist
```

## Documentation Sections

- [Installation](./installation.md) - How to install nsyte
- [Basic Usage](./usage/index.md) - Getting started with nsyte
- [Command Reference](./usage/commands.md) - Detailed command documentation
- [Configuration](./usage/configuration.md) - Configuration options and settings

## Guides

- [Local Development Setup](./guides/local-setup.md) - Setting up your development environment
- [Deployment](./guides/deployment.md) - Deploying your site
- [CI/CD Integration](./guides/ci-cd.md) - Setting up continuous deployment
- [Security Best Practices](./guides/security.md) - Security considerations and recommendations

## About

nsyte is a fork of [nsite-cli](https://github.com/flox1an/nsite-cli) by [flox1an](https://github.com/flox1an) [[npub](https://njump.me/npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc)]. This fork has been ported to deno and rewritten in the process. Some behaviors in this fork are slightly different. 