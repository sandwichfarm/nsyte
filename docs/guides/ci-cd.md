---
title: CI/CD Guide
description: Setting up continuous integration and deployment for nsyte sites
---

---
title: ci
description: Create an nbunksec string for CI/CD use
---

# CI/CD

Using `nsyte` in your existing CI/CD workflow is straightforward. 

- Generate an `nbunksec` token locally (requires a bunker)
- Add the `nbunksec` to the secrets management solution for your chosen pipeline.
- Use `nsyte` in your pipeline, provide desired arguments and pass the secret containing the previous `nbunksec` to `nsyte`

## Generating a token

To generate a token you will need to have `nsyte` installed locally.

```bash 
nsyte ci
```

This command will guide you through connecting to bunker and will then output an `nbunksec`. The `nbunksec` provided will only be shown once, if you lose it, you will have to generate another one.

## Github Action (GHA)

### Option 1: Use `nsite-action` 

`nsite-action` implements `nsyte` and is available on Github Marketplace.

### Option 2: Build your own workflow

Create `.github/workflows/deploy-nsite.yml`:

```yaml
name: Deploy nsite

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      ##run commands to build your static site here...
      
      - name: Set up Deno
        uses: denoland/setup-deno@v1
        with:
          deno-version: '2.3.1'
        
      - name: Install nsyte
        run: deno install -A -f -n nsyte https://github.com/sandwichfarm/nsyte/raw/main/src/cli.ts
        
      - name: Deploy
        if: github.ref == 'refs/heads/main'
        env: 
          FALLBACK: "/index.html"
          RELAYS: "wss://some.relay.xyz,wss://another.relay.abc"
          SERVERS: "https://a.blossom.server.com,https://another.blossom.server"
        run: | 
          nsyte upload ./dist -i \
            --nbunksec ${{ secrets.NBUNKSEC }} \
            --relays ${{ env.RELAYS }} \
            --servers ${{ env.SERVERS }} \
            --fallback "/index.html"
```