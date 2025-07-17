# JSR Publishing Setup

This guide explains how to set up automatic publishing to JSR (JavaScript Registry) when creating releases.

## Prerequisites

1. **JSR Account**: Create an account at [jsr.io](https://jsr.io)
2. **Package Scope**: Create a scope for your package (e.g., `@nsyte`)
3. **GitHub Repository**: Your package must be in a GitHub repository

## Setup Instructions

### 1. Link GitHub Repository to JSR

1. Go to your package page on JSR: `https://jsr.io/@nsyte/cli`
2. Click on "Settings" tab
3. Under "GitHub Repository", link your GitHub repository:
   - Username/Organization: `your-github-username`
   - Repository: `nsyte`
4. Click "Save"

This enables OIDC (OpenID Connect) authentication, allowing GitHub Actions to publish without requiring a separate token.

### 2. Verify GitHub Actions Permissions

The release workflow already includes the necessary permissions:

```yaml
permissions:
  contents: read
  id-token: write # Required for OIDC authentication with JSR
```

The `id-token: write` permission is crucial - it allows GitHub Actions to authenticate with JSR using OIDC.

### 3. Package Configuration

Ensure your `deno.json` includes:

```json
{
  "name": "@nsyte/cli",
  "version": "0.19.0",
  "exports": "./src/cli.ts"
}
```

The workflow automatically updates the version to match the Git tag when publishing.

## How It Works

1. **Tag Push**: When you push a tag like `v1.0.0`, the workflow triggers
2. **Version Update**: The workflow updates `deno.json` to match the tag version
3. **OIDC Auth**: GitHub Actions authenticates with JSR using OIDC (no token needed)
4. **Publish**: The package is published to JSR
5. **GitHub Release**: Binary releases are created with installation instructions

## Troubleshooting

### Package Already Exists Error

If you get an error that the package already exists with that version:
- JSR doesn't allow republishing the same version
- Increment your version number and create a new tag

### Authentication Errors

If authentication fails:
1. Verify the GitHub repository is linked in JSR settings
2. Ensure the workflow has `id-token: write` permission
3. Check that your JSR scope and package name match `deno.json`

### Dry Run Testing

Test the publish process without actually publishing:

```bash
deno publish --dry-run
```

## Manual Publishing

If needed, you can manually publish from your local machine:

```bash
# Ensure you're logged in to JSR
deno publish
```

Note: Manual publishing requires authentication via browser.

## Benefits of JSR Publishing

1. **Cross-Runtime Support**: Works with Deno, Node.js, Bun, and browsers
2. **TypeScript Native**: Publishes TypeScript directly, no build step needed
3. **Documentation**: Auto-generates documentation from your code
4. **Provenance**: Links packages to their source code and build process
5. **No Token Management**: OIDC eliminates the need for managing secrets

## Additional Resources

- [JSR Documentation](https://jsr.io/docs)
- [Publishing Packages Guide](https://jsr.io/docs/publishing-packages)
- [Using JSR with Deno](https://jsr.io/docs/with/deno)