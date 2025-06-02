---
title: Security Guide
description: Security best practices for nsyte deployments
---

# Security Guide

This guide covers security best practices for deploying and managing nsyte sites.

## Key Management

### Bunker Security

Your bunker key is your primary authentication method. Keep it secure:

**Storage**
- Never commit keys to version control
- Use environment variables or secure secret management
- Store keys encrypted at rest
- Use different keys for different environments

**Example secure usage:**
```bash
# Export as environment variable
export NSYTE_BUNKER_KEY="nsec1..."

# Use in CI/CD with secrets
NSYTE_BUNKER_KEY: ${{ secrets.NSYTE_BUNKER_KEY }}
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
nsyte upload ./dist \
  --relays "wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol"
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
    branches: [ main ]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        env:
          NSYTE_BUNKER_KEY: ${{ secrets.NSYTE_BUNKER_KEY }}
        run: nsyte upload ./dist
```

### Content Security

**File Validation**
- Review files before upload
- Avoid uploading sensitive configuration files
- Use `.nsyteignore` to exclude unnecessary files
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

## Getting Help

- [GitHub Issues](https://github.com/sandwichfarm/nsyte/issues) for bug reports
- [Deployment Guide](./deployment.md) for deployment help
- [CI/CD Guide](./ci-cd.md) for automation setup 