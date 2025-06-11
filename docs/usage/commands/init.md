---
title: init
description: Initialize a new nsyte site
---

# init

Initialize a new nsyte site in the current directory.

## Description

The `init` command creates a new nsyte site by:

1. Creating the `.nsite` directory
2. Generating a default configuration file
3. Setting up initial project structure

## Usage

```bash
nsyte init [options]
```

## Options

- `--force`: Overwrite existing configuration
- `--template`: Use a specific template
- `--no-git`: Skip git initialization

## Examples

Basic initialization:

```bash
nsyte init
```

Force initialization:

```bash
nsyte init --force
```

Use template:

```bash
nsyte init --template=blog
```

## Configuration

The initialization process creates a `.nsite/config.json` file with default settings:

```json
{
  "bunkerPubkey": "",
  "relays": [],
  "servers": [],
  "profile": {
    "name": "",
    "about": ""
  }
}
```

## Project Structure

After initialization, your project will have this structure:

```
.
├── .nsite/
│   └── config.json
├── .nsite-ignore
└── README.md
```

## Next Steps

After initialization:

1. Configure your [relays and servers](../configuration.md#relays-and-servers)
2. Set up your [authentication](../configuration.md#authentication)
3. Start [building your site](../index.md#building-your-site)
