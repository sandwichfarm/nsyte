---
title: Security Guide
description: Security best practices for nsyte sites
---

# Security Guide

This guide covers security best practices for deploying and managing nsyte sites.

## Authentication

### Bunker Keys

Your bunker key is the primary authentication method for nsyte. Keep it secure:

1. **Storage**
   - Never commit keys to version control
   - Use environment variables
   - Store in secure secret management
   - Rotate keys regularly

2. **Permissions**
   - Use minimal required permissions
   - Create separate keys for different environments
   - Revoke unused keys
   - Monitor key usage

3. **Rotation**
   - Rotate keys every 90 days
   - Use key versioning
   - Update all environments
   - Keep old keys for rollback

### Environment Variables

```bash
# Good
export NSYTE_BUNKER_KEY="nsec1..."

# Bad
NSYTE_BUNKER_KEY="nsec1..." # In .env file
```

## Relay Security

### Relay Selection

1. **Criteria**
   - Reputation
   - Uptime
   - Performance
   - Location
   - Privacy policy

2. **Configuration**
   - Use multiple relays
   - Geographic distribution
   - Fallback options
   - Regular health checks

3. **Monitoring**
   - Relay status
   - Response times
   - Error rates
   - Connection quality

### Relay Management

```json
{
  "relays": [
    {
      "url": "wss://relay1.example.com",
      "weight": 1,
      "fallback": true
    },
    {
      "url": "wss://relay2.example.com",
      "weight": 2,
      "fallback": false
    }
  ]
}
```

## Content Security

### File Security

1. **Uploads**
   - Validate file types
   - Check file sizes
   - Scan for malware
   - Use content hashing

2. **Access Control**
   - Set proper permissions
   - Use private relays
   - Implement rate limiting
   - Monitor access patterns

3. **Content Types**
   - Allow only necessary types
   - Validate MIME types
   - Check file signatures
   - Sanitize filenames

### Example Configuration

```json
{
  "security": {
    "maxFileSize": 10485760,
    "allowedTypes": [
      "text/html",
      "text/css",
      "application/javascript",
      "image/png",
      "image/jpeg"
    ],
    "rateLimit": {
      "requests": 100,
      "period": 3600
    }
  }
}
```

## Deployment Security

### CI/CD Security

1. **Secrets Management**
   - Use platform secrets
   - Encrypt sensitive data
   - Rotate credentials
   - Audit access

2. **Build Security**
   - Lock dependencies
   - Scan for vulnerabilities
   - Sign artifacts
   - Verify integrity

3. **Deployment Process**
   - Require approvals
   - Use staging
   - Rollback capability
   - Audit logs

### Example GitHub Actions

```yaml
name: Secure Deploy

on:
  push:
    branches: [ main ]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          
      - name: Build
        run: npm run build
        
      - name: Deploy
        if: success()
        env:
          NSYTE_BUNKER_KEY: ${{ secrets.NSYTE_BUNKER_KEY }}
        run: nsyte upload ./dist
```

## Monitoring and Alerts

### Security Monitoring

1. **What to Monitor**
   - Authentication attempts
   - File access patterns
   - Relay performance
   - Error rates
   - Resource usage

2. **Alerting**
   - Failed authentications
   - Unusual access
   - Relay issues
   - Rate limit breaches
   - System errors

3. **Logging**
   - Access logs
   - Error logs
   - Audit trails
   - Performance metrics
   - Security events

### Example Monitoring Setup

```yaml
monitoring:
  alerts:
    - name: auth_failures
      condition: auth_failures > 5
      period: 300
      action: notify_security
      
    - name: relay_errors
      condition: relay_errors > 10
      period: 600
      action: notify_ops
      
    - name: rate_limit
      condition: rate_limit_breaches > 0
      period: 60
      action: notify_ops
```

## Incident Response

### Preparation

1. **Documentation**
   - Incident response plan
   - Contact information
   - Recovery procedures
   - Communication templates

2. **Tools**
   - Monitoring systems
   - Logging tools
   - Communication channels
   - Backup systems

3. **Team**
   - Assign roles
   - Define responsibilities
   - Regular training
   - Practice drills

### Response Steps

1. **Detection**
   - Monitor alerts
   - Review logs
   - Verify incidents
   - Assess impact

2. **Containment**
   - Isolate affected systems
   - Block malicious access
   - Preserve evidence
   - Document actions

3. **Recovery**
   - Restore from backup
   - Verify integrity
   - Update security
   - Monitor for recurrence

4. **Post-Incident**
   - Document incident
   - Analyze root cause
   - Update procedures
   - Team review

## Best Practices

### General Security

1. **Regular Updates**
   - Keep nsyte updated
   - Update dependencies
   - Patch vulnerabilities
   - Review configurations

2. **Access Control**
   - Principle of least privilege
   - Regular access review
   - Strong authentication
   - Session management

3. **Data Protection**
   - Encrypt sensitive data
   - Secure backups
   - Data retention
   - Privacy compliance

### Development Security

1. **Code Security**
   - Code review
   - Security testing
   - Dependency scanning
   - Secure coding practices

2. **Environment Security**
   - Secure development
   - Staging security
   - Production hardening
   - Regular audits

3. **Deployment Security**
   - Secure pipelines
   - Artifact signing
   - Environment isolation
   - Access control

## Getting Help

- Check the [GitHub Issues](https://github.com/sandwichfarm/nsyte/issues)
- Review the [Deployment Guide](./deployment.md)
- Join the [Nostr channel](https://njump.me/npub1...)
- Contact security team

## Next Steps

- Set up [monitoring and alerts](./monitoring.md)
- Review [deployment security](./deployment.md#security)
- Learn about [CI/CD security](./ci-cd.md#security)
- Implement [incident response](./incident-response.md) 