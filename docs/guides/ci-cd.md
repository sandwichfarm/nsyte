---
title: CI/CD Guide
description: Setting up continuous integration and deployment for nsyte sites
---

# CI/CD Guide

This guide explains how to set up continuous integration and deployment (CI/CD) for your nsyte sites using popular CI/CD platforms.

## GitHub Actions

### Basic Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Site

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
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install Dependencies
        run: npm ci
        
      - name: Build Site
        run: npm run build
        
      - name: Install nsyte
        run: npm install -g nsyte
        
      - name: Deploy Site
        if: github.ref == 'refs/heads/main'
        env:
          NSYTE_BUNKER_KEY: ${{ secrets.NSYTE_BUNKER_KEY }}
        run: nsyte upload ./dist
```

### Advanced Workflow

For more complex sites, you might want to:

1. Cache dependencies
2. Run tests
3. Build in stages
4. Deploy to staging first

```yaml
name: Deploy Site

on:
  push:
    branches: [ main, staging ]
  pull_request:
    branches: [ main, staging ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install Dependencies
        run: npm ci
        
      - name: Run Tests
        run: npm test
        
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install Dependencies
        run: npm ci
        
      - name: Build Site
        run: npm run build
        
      - name: Upload Build Artifact
        uses: actions/upload-artifact@v4
        with:
          name: site
          path: ./dist
          
  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Download Build Artifact
        uses: actions/download-artifact@v4
        with:
          name: site
          path: ./dist
          
      - name: Install nsyte
        run: npm install -g nsyte
        
      - name: Deploy to Staging
        env:
          NSYTE_BUNKER_KEY: ${{ secrets.NSYTE_BUNKER_STAGING_KEY }}
          NSYTE_RELAYS: ${{ secrets.NSYTE_STAGING_RELAYS }}
        run: nsyte upload ./dist
        
  deploy-production:
    needs: [build, deploy-staging]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Download Build Artifact
        uses: actions/download-artifact@v4
        with:
          name: site
          path: ./dist
          
      - name: Install nsyte
        run: npm install -g nsyte
        
      - name: Deploy to Production
        env:
          NSYTE_BUNKER_KEY: ${{ secrets.NSYTE_BUNKER_KEY }}
          NSYTE_RELAYS: ${{ secrets.NSYTE_RELAYS }}
        run: nsyte upload ./dist
```

## GitLab CI

### Basic Pipeline

Create `.gitlab-ci.yml`:

```yaml
image: node:20

stages:
  - test
  - build
  - deploy

test:
  stage: test
  script:
    - npm ci
    - npm test

build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/

deploy:
  stage: deploy
  script:
    - npm install -g nsyte
    - nsyte upload ./dist
  only:
    - main
  environment:
    name: production
```

### Advanced Pipeline

For more complex setups:

```yaml
image: node:20

stages:
  - test
  - build
  - deploy-staging
  - deploy-production

variables:
  NPM_TOKEN: ${NPM_TOKEN}

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/

test:
  stage: test
  script:
    - npm ci
    - npm test
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'

build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

deploy-staging:
  stage: deploy-staging
  script:
    - npm install -g nsyte
    - nsyte upload ./dist
  environment:
    name: staging
    url: https://staging.example.com
  only:
    - staging
  when: manual

deploy-production:
  stage: deploy-production
  script:
    - npm install -g nsyte
    - nsyte upload ./dist
  environment:
    name: production
    url: https://example.com
  only:
    - main
  when: manual
```

## Best Practices

### 1. Security

- Store secrets in CI/CD platform
- Use environment-specific keys
- Rotate keys regularly
- Limit key permissions

### 2. Performance

- Cache dependencies
- Use build artifacts
- Optimize build steps
- Parallel jobs when possible

### 3. Reliability

- Run tests before deploy
- Use staging environment
- Manual approval for production
- Monitor deployments

### 4. Maintenance

- Keep workflows updated
- Review dependencies
- Monitor build times
- Clean up old artifacts

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Node.js version
   - Verify dependencies
   - Review build logs
   - Check file permissions

2. **Deployment Failures**
   - Verify secrets
   - Check relay status
   - Review permissions
   - Check network access

3. **Cache Issues**
   - Clear cache
   - Update cache key
   - Check cache size
   - Verify paths

### Getting Help

- Check the [GitHub Issues](https://github.com/sandwichfarm/nsyte/issues)
- Review the [Deployment Guide](./deployment.md)
- Join the [Nostr channel](https://njump.me/npub1...)

## Next Steps

- Review [deployment strategies](./deployment.md)
- Learn about [security best practices](./security.md)
- Set up [monitoring and alerts](./monitoring.md) 