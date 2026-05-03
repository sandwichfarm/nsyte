---
title: Security Guide
description: Comprehensive security guide for nsyte credential storage and deployment
---

# Security Guide

This guide covers nsyte's secure credential storage system and deployment security best practices.

## Credential Storage Security

nsyte uses a multi-tier security approach for storing sensitive bunker connection data:

### Storage Tiers

**Tier 1 (Best): Native OS Keychain**

- **macOS**: Keychain Services with hardware-backed encryption
- **Windows**: Credential Manager with DPAPI protection
- **Linux**: Secret Service API (libsecret) with desktop keyring

**Tier 2 (Good): Encrypted File Storage**

- AES-256-GCM encryption when native keychain unavailable
- PBKDF2 key derivation from system attributes
- Platform-specific storage locations

**Tier 3 (Fallback): Legacy Plain Text**

- Emergency fallback with security warnings
- Automatic migration to secure storage when available

### Storage Locations

**Secure Storage**: Platform-specific keychain or encrypted files

**Config Directories**:

- Linux: `~/.config/nsyte`
- macOS: `~/Library/Application Support/nsyte`
- Windows: `%APPDATA%\nsyte`

### Automatic Migration

Legacy plain-text storage is automatically migrated to secure storage:

- Reads existing `secrets.json` file
- Stores secrets using most secure available backend
- Removes legacy file after successful migration
- Process logged for audit purposes

## Key Management

### Bunker Security

Your bunker key is your primary authentication method. Keep it secure:

**Storage**

- Automatically stored using most secure available backend
- Never commit keys to version control
- Use environment variables or secure secret management for CI/CD
- Use different keys for different environments

**Example secure usage:**

```bash
# Local storage (automatically secure)
nsyte bunker connect bunker://...

# Generate CI/CD credentials
nsyte ci
# This creates a dedicated nbunksec for CI/CD use

# Use in CI/CD with secrets
nsyte deploy ./dist --sec ${{ secrets.NBUNK_SECRET }}
```

### Key Rotation

- Rotate keys regularly (every 90 days recommended)
- Use `nsyte ci` to generate new tokens for CI/CD
- Keep old keys temporarily for rollback purposes
- Update all deployment environments when rotating

## Relay Security

### Relay Selection

Choose relays carefully:

- Use reputable, well-maintained relays
- Prefer relays with good uptime records
- Consider geographic distribution
- Use multiple relays for redundancy

### Configuration

```bash
# Use multiple trusted relays
nsyte deploy ./dist \
  --relays "wss://relay.damus.io,wss://nos.lol"
```

## Deployment Security

### CI/CD Best Practices

1. **Secrets Management**
   - Use platform-provided secrets (GitHub Secrets, etc.)
   - Never log secrets in CI output
   - Rotate secrets regularly
   - Limit secret access to necessary workflows

2. **Secure Workflow Example**

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        run: nsyte deploy ./dist --sec ${{ secrets.NBUNK_SECRET }}
```

The `--sec` flag accepts an `nbunksec`, an `nsec`, a `bunker://` URL, or a
64-character hex secret. For CI/CD use generate a dedicated `nbunksec` with
`nsyte ci` and store it in your platform's secret manager as `NBUNK_SECRET`.

### Content Security

**File Validation**

- Review files before upload
- Avoid uploading sensitive configuration files
- Use `.nsyte-ignore` to exclude unnecessary files
- Validate file sizes and types

**Access Control**

- Use private relays for sensitive content
- Configure appropriate server permissions
- Monitor deployment logs
- Regular security audits

## Best Practices

### General Security

1. **Keep Updated**
   - Update nsyte regularly
   - Monitor security advisories
   - Update dependencies

2. **Monitor Deployments**
   - Check deployment logs
   - Verify uploads completed successfully
   - Monitor relay connectivity

3. **Backup Strategy**
   - Keep backups of your sites
   - Test restore procedures
   - Document recovery processes

### Environment Isolation

- Use separate keys for development/staging/production
- Configure different relay sets per environment
- Test deployments in staging first
- Implement approval processes for production

## Troubleshooting Security Issues

### Authentication Problems

- Verify bunker key format and validity
- Check bunker connection
- Ensure proper permissions
- Review configuration settings

### Deployment Failures

- Check relay connectivity
- Verify authentication credentials
- Review file permissions
- Monitor for rate limiting

## Testing Security Features

### Test Storage Backend

The fastest way to confirm storage is working is to list stored bunkers — if
the backend is healthy, this returns without error:

```bash
nsyte bunker list
```

If you have a checkout of the nsyte source repository, you can also run the
end-to-end secrets-management test, which exercises keychain, encrypted
storage, and storage/retrieval:

```bash
# From the nsyte repo root
deno run --allow-read --allow-write --allow-env --allow-run tests/test-secrets.ts
```

This script reports:

- Whether a native keychain provider is available on this platform
- Whether encrypted storage initializes successfully
- That a test secret can be stored, retrieved, and deleted

### Verify Bunker Storage

```bash
# List stored bunkers
nsyte bunker list

# Test bunker export/import
nsyte bunker export <pubkey>
nsyte bunker import <nbunksec>
```

## Getting Help

- [Platform-Specific Details](./security-platforms.md) for implementation specifics
- [Security Troubleshooting](./security-troubleshooting.md) for common issues
- [GitHub Issues](https://github.com/sandwichfarm/nsyte/issues) for bug reports
- [Deployment Guide](./deployment.md) for deployment help
- [CI/CD Guide](./ci-cd.md) for automation setup
