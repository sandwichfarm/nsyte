# Documentation Structure

This directory contains the nsyte documentation organized for MkDocs.

## Security Documentation

The security documentation has been organized into three comprehensive guides:

### 1. Security Overview (`guides/security.md`)
- Multi-tier credential storage approach
- Key management best practices  
- Deployment security
- CI/CD integration
- Testing instructions

### 2. Platform-Specific Details (`guides/security-platforms.md`)
- Detailed implementation for each OS
- Native keychain specifics (macOS, Windows, Linux)
- Encrypted storage fallback details
- Security considerations and threat model

### 3. Security Troubleshooting (`guides/security-troubleshooting.md`)
- Common issues and solutions
- Platform-specific troubleshooting
- Advanced debugging techniques
- Security best practices

## Documentation Features

- ✅ **Organized Structure**: Properly categorized in mkdocs navigation
- ✅ **Cross-References**: Internal links between security guides
- ✅ **Code Examples**: Platform-specific commands and examples
- ✅ **Admonitions**: Info, warning, and tip boxes for better UX
- ✅ **Comprehensive Coverage**: From basic usage to advanced debugging

## Building Documentation

```bash
# Build the documentation site
mkdocs build

# Serve locally for development
mkdocs serve

# Deploy to GitHub Pages
mkdocs gh-deploy
```

## Navigation Structure

```
Documentation
├── Getting Started
│   ├── Installation
│   └── Basic Usage
├── Configuration
├── Commands
│   ├── upload
│   ├── ls
│   ├── download
│   ├── ci
│   └── bunker
└── Guides
    ├── Deployment
    ├── Security
    │   ├── Overview
    │   ├── Platform Details
    │   └── Troubleshooting
    ├── CI/CD
    └── Local Setup
```