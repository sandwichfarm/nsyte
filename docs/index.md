---
title: Documentation
description: Complete documentation for nsyte - publish your site to nostr and blossom servers
---

# nsyte Documentation

> ⚠️ nsyte is alpha. use at your own risk.

Welcome to the nsyte documentation! nsyte is a command-line tool for publishing websites to nostr
and Blossom servers, enabling decentralized, censorship-resistant website hosting.

## Quick Start

```bash
# Install nsyte (see installation guide for your platform)
brew install sandwichfarm/tap/nsyte

# Initialize your project
nsyte init

# Upload your website
nsyte upload ./dist
```

## Documentation Sections

### Getting Started

- [**Installation**](installation.md) - Install nsyte on your platform
- [**Basic Usage**](usage/index.md) - Learn the fundamentals

### Core Features

- [**Configuration**](usage/configuration.md) - Configure nsyte for your needs
- [**Commands**](usage/commands/upload.md) - Complete command reference

### Advanced Topics

- [**CI/CD Integration**](guides/ci-cd.md) - Automated deployments
- [**Security Best Practices**](guides/security.md) - Keep your deployments secure
- [**Local Development**](guides/local-setup.md) - Development environment setup

## Key Features

- **🌐 Decentralized Hosting** - Publish to multiple Blossom servers and nostr relays
- **🔐 Secure by Design** - NIP-46 bunker support for key security
- **⚡ Fast & Efficient** - Concurrent uploads and smart diffing
- **🚀 CI/CD Ready** - Perfect for automated deployments

## Need Help?

- Check the [Installation Guide](installation.md) if you're having trouble getting started
- Review [Basic Usage](usage/index.md) for common workflows
- See [Security Guide](guides/security.md) for best practices
- Browse [Command Reference](usage/commands/upload.md) for detailed options

## About nsyte

nsyte is a fork of [nsite-cli](https://github.com/flox1an/nsite-cli) by
[flox1an](https://github.com/flox1an), ported to Deno with enhanced features and improved
performance.
 
# Deployment fix 1749698739
