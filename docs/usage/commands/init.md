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
nsyte init
```

## Options

This command has no per-command options. See [global options](_global-options.md).

## Examples

Basic initialization:

```bash
nsyte init
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
└── .nsite/
    └── config.json
```

`init` only creates the `.nsite/` directory and `config.json`. Add a `.nsyte-ignore` file by hand if
you need to exclude files from deployment.

## Next Steps

After initialization:

1. Configure your [relays and servers](../configuration.md#relays-and-servers)
2. Set up your [authentication](../configuration.md#authentication)
3. Start [building your site](../index.md#building-your-site)

Inherits global options. See [global options](_global-options.md).
