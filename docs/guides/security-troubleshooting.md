---
title: Security Troubleshooting
description: Troubleshooting guide for credential storage issues
---

# Security Troubleshooting

This guide helps resolve common issues with nsyte's credential storage system.

## Quick Diagnostics

### Check Storage Backend

For a quick health check, list stored bunkers — if the backend is healthy, the command returns
without error:

```bash
nsyte bunker list
```

If you have a checkout of the nsyte source tree, you can also run the end-to-end secrets-management
test, which probes keychain availability, encrypted storage, and round-trip storage/retrieval:

```bash
# From the nsyte repo root
deno run --allow-read --allow-write --allow-env --allow-run tests/test-secrets.ts
```

### Check Configuration

```bash
# List stored bunkers to verify storage is working
nsyte bunker list

# Check if any legacy secrets exist
ls ~/.config/nsite/secrets.json      # Linux
ls ~/Library/Application\ Support/nsyte/secrets.json  # macOS
ls %APPDATA%\nsite\secrets.json      # Windows
```

## Common Issues

### 1. "Keychain Not Found" on macOS

::: danger Symptoms

- Error: "A keychain cannot be found to store..."
- Dialog prompts cancelled
- Falls back to encrypted storage :::

**Causes**:

- User cancelled keychain access prompt
- Keychain locked or corrupted
- Running in non-interactive environment

**Solutions**:

```bash
# Unlock keychain manually
security unlock-keychain ~/Library/Keychains/login.keychain-db

# Reset keychain if corrupted
security delete-keychain ~/Library/Keychains/login.keychain-db
security create-keychain ~/Library/Keychains/login.keychain-db

# Grant terminal/app access to keychain
# Go to System Preferences > Security & Privacy > Privacy > Full Disk Access
# Add Terminal or your app
```

::: tip Workaround nsyte will automatically fall back to encrypted file storage if keychain access
fails. :::

### 2. "secret-tool: command not found" on Linux

::: danger Symptoms

- Error about missing secret-tool
- Falls back to encrypted storage
- No native keychain integration :::

**Solutions**:

```bash
# Install libsecret-tools
# Ubuntu/Debian:
sudo apt update && sudo apt install libsecret-tools

# Fedora/RHEL:
sudo dnf install libsecret

# Arch Linux:
sudo pacman -S libsecret

# Verify installation:
which secret-tool
```

::: info Alternative If you don't want to install secret-tool, nsyte will use encrypted file storage
which is still secure. :::

### 3. "cmdkey: Access Denied" on Windows

::: danger Symptoms

- Error when storing credentials
- Access denied messages
- Falls back to encrypted storage :::

**Solutions**:

```cmd
# Run as administrator (if needed)
# Right-click Command Prompt > "Run as administrator"

# Check credential manager manually
control keymgr.dll

# Clear any conflicting entries
cmdkey /list | findstr nsyte
cmdkey /delete:nsyte:<pubkey>
```

### 4. Encrypted Storage Initialization Failed

::: danger Symptoms

- Error: "Failed to initialize encrypted storage"
- Falls back to plain JSON storage
- Security warnings shown :::

**Causes**:

- Permission issues with config directory
- Disk space issues
- Filesystem corruption

**Solutions**:

```bash
# Check permissions
ls -la ~/.config/nsite/                       # Linux
ls -la ~/Library/Application\ Support/nsyte/  # macOS
dir %APPDATA%\nsite\                          # Windows

# Fix permissions
chmod 700 ~/.config/nsite/                       # Linux
chmod 700 ~/Library/Application\ Support/nsyte/  # macOS

# Check disk space
df -h ~/.config/  # Linux/macOS
dir %APPDATA%\    # Windows

# Recreate config directory (Linux example)
rm -rf ~/.config/nsite/
nsyte bunker list  # Will recreate directory
```

### 5. Migration Issues

::: danger Symptoms

- Legacy secrets not migrated
- Duplicated entries
- Missing bunkers after update :::

**Diagnosis**:

```bash
# Check for legacy file (Linux path; see Storage Locations below for other platforms)
cat ~/.config/nsite/secrets.json

# Check migration logs
nsyte bunker list  # Should show migration messages

# Manually verify migration
nsyte bunker export <pubkey>
```

**Solutions**:

```bash
# Manual migration if automatic fails
# 1. Backup legacy file (Linux)
cp ~/.config/nsite/secrets.json ~/.config/nsite/secrets.json.backup

# 2. Import each bunker manually
nsyte bunker import <nbunksec-string>

# 3. Verify all bunkers migrated
nsyte bunker list

# 4. Remove legacy file (Linux)
rm ~/.config/nsite/secrets.json
```

### 6. CI/CD Authentication Issues

::: danger Symptoms

- nbunksec not working in CI/CD
- Authentication failures
- Missing environment variables :::

**Solutions**:

```bash
# Generate CI/CD credentials properly
nsyte ci  # Follow interactive prompts

# Verify nbunksec format
echo $NBUNK_SECRET | head -c 50  # Should start with "nbunksec1"

# Test locally first
nsyte deploy ./dist --sec $NBUNK_SECRET

# Check secret configuration in CI/CD platform
# GitHub Actions: Repository Settings > Secrets
# GitLab CI: Project Settings > CI/CD > Variables

# Common fixes:
# - Ensure no extra spaces or newlines in secret
# - Use proper secret syntax: ${{ secrets.NBUNK_SECRET }}
# - Check secret is available to the workflow/job
```

### 7. Permission Denied Errors

::: danger Symptoms

- Permission denied accessing keychain
- Can't write to config directory
- Access denied errors :::

**Solutions**:

```bash
# Linux: Fix directory permissions
chmod 700 ~/.config/nsite/
chmod 600 ~/.config/nsite/*

# macOS: Grant Full Disk Access
# System Preferences > Security & Privacy > Privacy > Full Disk Access
# Add Terminal or the application using nsyte

# Windows: Run as user (not administrator)
# Credential Manager requires user context, not admin
```

## Advanced Debugging

### Enable Debug Logging

```bash
# Set environment variable for detailed logs
export LOG_LEVEL=debug
nsyte bunker list

# Or for a single command
LOG_LEVEL=debug nsyte bunker import <nbunksec>
```

### Manual Backend Testing

```bash
# Test keychain access manually

# macOS:
security add-generic-password -a test -s nsyte-test -w testpass
security find-generic-password -a test -s nsyte-test -w
security delete-generic-password -a test -s nsyte-test

# Linux:
echo "testpass" | secret-tool store --label "test" service nsyte-test account test
secret-tool lookup service nsyte-test account test
secret-tool clear service nsyte-test account test

# Windows:
cmdkey /add:nsyte-test:test /user:test /pass:testpass
# (Retrieval requires PowerShell script)
cmdkey /delete:nsyte-test:test
```

### Storage Locations

```bash
# Check all possible storage locations

# macOS:
ls -la ~/Library/Application\ Support/nsyte/
security dump-keychain | grep nsyte

# Linux:
ls -la ~/.config/nsite/
secret-tool search service nsyte

# Windows:
dir %APPDATA%\nsite\
cmdkey /list | findstr nsyte
```

## Security Best Practices

### Regular Maintenance

1. **Audit Stored Credentials**:
   ```bash
   nsyte bunker list
   ```

2. **Rotate nbunksec Strings**:
   ```bash
   # Generate new connection
   nsyte bunker connect bunker://...

   # Remove old connection
   nsyte bunker remove <old-pubkey>
   ```

3. **Monitor Access Logs**:
   - Check system logs for keychain access
   - Review authentication attempts
   - Monitor for unexpected prompts

### Security Hardening

1. **Use Strong User Authentication**:
   - Enable 2FA on user accounts
   - Use strong passwords
   - Enable biometric authentication

2. **Keep Systems Updated**:
   - Apply OS security updates
   - Update nsyte regularly
   - Update keychain/credential manager software

3. **Backup Strategy**:
   - Export critical nbunksec strings securely
   - Document bunker configurations
   - Test restore procedures

## Getting Help

::: info Need More Help? If you're still experiencing issues:

1. **Check GitHub Issues**: [nsyte Issues](https://github.com/sandwichfarm/nsyte/issues)
2. **Create Bug Report**: Include debug logs and system information
3. **Security Issues**: Report privately to security@sandwichfarm.com :::

### Information to Include

When reporting issues, include:

- Operating system and version
- nsyte version (`nsyte --version`)
- Storage backend being used (from test output)
- Error messages and logs
- Steps to reproduce
- Whether issue affects existing installations or new setups
