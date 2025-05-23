---
title: Deployment Guide
description: How to deploy your site using nsyte
---

# Deployment Guide

This guide covers different deployment strategies and best practices for deploying your site using nsyte.

## Basic Deployment

The simplest way to deploy your site is using the `upload` command:

```bash
nsyte upload ./dist
```

This will:
1. Upload your files to configured relays
2. Publish to configured blossom servers
3. Update your site's metadata

## Deployment Strategies

### 1. Manual Deployment

Suitable for:
- Small sites
- Infrequent updates
- Personal projects

Steps:
1. Build your site
2. Run `nsyte upload`
3. Verify the deployment

### 2. Automated Deployment

Suitable for:
- Team projects
- Frequent updates
- Production sites

Options:
- GitHub Actions
- GitLab CI
- Custom scripts

See [CI/CD Guide](./ci-cd.md) for detailed setup instructions.

### 3. Staged Deployment

Suitable for:
- Large sites
- Critical applications
- Testing environments

Steps:
1. Deploy to staging relays
2. Test the deployment
3. Deploy to production

## Deployment Options

### Basic Upload

```bash
nsyte upload ./dist
```

### Force Re-upload

```bash
nsyte upload ./dist --force
```

### Purge Deleted Files

```bash
nsyte upload ./dist --purge
```

### Set Concurrency

```bash
nsyte upload ./dist --concurrency 8
```

### SPA Support

```bash
nsyte upload ./dist --fallback=/index.html
```

## Deployment Checklist

Before deploying:

1. **Configuration**
   - [ ] Verify relay configuration
   - [ ] Check server settings
   - [ ] Review ignore patterns

2. **Authentication**
   - [ ] Ensure proper authentication
   - [ ] Verify bunker connection
   - [ ] Check key permissions

3. **Content**
   - [ ] Build site
   - [ ] Test locally
   - [ ] Check file sizes
   - [ ] Verify links

4. **Deployment**
   - [ ] Backup current site
   - [ ] Run upload
   - [ ] Verify deployment
   - [ ] Check site metadata

## Best Practices

### 1. Performance

- Optimize images and assets
- Use appropriate file formats
- Enable compression
- Implement caching

### 2. Reliability

- Use multiple relays
- Configure fallback servers
- Monitor deployment status
- Keep backups

### 3. Security

- Use secure authentication
- Protect sensitive data
- Regular key rotation
- Monitor access

### 4. Maintenance

- Regular updates
- Monitor site health
- Clean up old files
- Update dependencies

## Troubleshooting

### Common Issues

1. **Upload Failures**
   - Check network connectivity
   - Verify relay status
   - Review file permissions
   - Check authentication
   - Ensure you are allowed to publish to provided relays
   - Ensure that provided relays are not rate-limited.

2. **Missing Files**
   - Review ignore patterns
   - Check file paths
   - Verify build output
   - Check file permissions

3. **Authentication Errors**
   - Verify keys
   - Check bunker connection
   - Review permissions
   - Check configuration

### Getting Help

- Check the [GitHub Issues](https://github.com/sandwichfarm/nsyte/issues)
- Review the [Security Guide](./security.md)
- Join the [Nostr channel](https://njump.me/npub1...)

## Next Steps

- Set up [CI/CD integration](./ci-cd.md)
- Review [security best practices](./security.md)
- Learn about [local development](../usage/index.md) 