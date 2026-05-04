# Documentation Structure

This directory contains the nsyte documentation served by VitePress.

## Build

```bash
deno task docs:build
```

## Develop

```bash
deno task docs:dev
```

The VitePress config and custom theme live in `docs/.vitepress/`. `README.md` and `JSR_SETUP.md` are
contributor notes and are excluded from the published documentation build.
