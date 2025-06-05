---
title: Platform-Specific Security
description: Detailed security implementation for each supported platform
---

# Platform-Specific Security

This document provides detailed information about how nsyte's credential storage works on each supported platform.

## Overview

nsyte automatically selects the most secure storage method available on your platform:

1. **Native Keychain** (preferred) - OS-managed encryption
2. **Encrypted File Storage** (fallback) - AES-256-GCM encryption
3. **Plain JSON** (emergency fallback) - Legacy compatibility with warnings

## macOS

### Native Keychain (Tier 1)

**Implementation**: macOS Keychain Services via `security` command  
**Location**: User's login keychain (`~/Library/Keychains/login.keychain-db`)  
**Encryption**: Apple's hardware-backed encryption with Secure Enclave when available

!!! info "Requirements"
    - `security` command (included with macOS)
    - User keychain access (may prompt for password/Touch ID)

**Security Benefits**:
- Hardware-backed encryption on modern Macs
- Integration with Touch ID/Face ID authentication
- Protected by user's login keychain password
- Automatic encryption key management

### Encrypted Storage (Tier 2)

**Location**: `~/Library/Application Support/nsyte/secrets.enc`  
**Encryption**: AES-256-GCM with PBKDF2 key derivation

**Key Derivation Input**:
- System hostname
- Operating system (darwin)
- Architecture (arm64/x86_64)  
- Username

### Legacy Fallback (Tier 3)

**Location**: `~/Library/Application Support/nsyte/secrets.json`  
**Security**: Plain text with warnings

---

## Windows

### Native Keychain (Tier 1)

**Implementation**: Windows Credential Manager via `cmdkey` and PowerShell  
**Location**: User's credential store (`%LOCALAPPDATA%\Microsoft\Credentials\`)  
**Encryption**: Windows Data Protection API (DPAPI)

!!! info "Requirements"
    - `cmdkey` command (included with Windows)
    - PowerShell for credential retrieval
    - User account access

**Security Benefits**:
- Protected by Windows DPAPI
- Tied to user account and machine
- Automatic encryption key management
- Integration with Windows Hello when available

### Encrypted Storage (Tier 2)

**Location**: `%APPDATA%\nsyte\secrets.enc`  
**Encryption**: AES-256-GCM with PBKDF2 key derivation

**Key Derivation Input**:
- System hostname
- Operating system (windows)
- Architecture (x86_64/arm64)
- Username (%USERNAME%)

### Legacy Fallback (Tier 3)

**Location**: `%APPDATA%\nsyte\secrets.json`  
**Security**: Plain text with warnings

---

## Linux

### Native Keychain (Tier 1)

**Implementation**: Secret Service API via `secret-tool` (libsecret)  
**Location**: D-Bus secret service (usually GNOME Keyring or KDE Wallet)  
**Encryption**: Service-specific encryption

!!! info "Requirements"
    - `secret-tool` command installed
    - Secret service running (GNOME Keyring, KDE Wallet, etc.)
    - D-Bus session

**Installation**:
```bash
# Ubuntu/Debian
sudo apt install libsecret-tools

# Fedora/RHEL
sudo dnf install libsecret

# Arch Linux
sudo pacman -S libsecret
```

**Security Benefits**:
- Integration with desktop keyring services
- Protected by user session authentication
- Service-specific encryption (varies by implementation)

### Encrypted Storage (Tier 2)

**Location**: `~/.config/nsyte/secrets.enc` (or `$XDG_CONFIG_HOME/nsyte/secrets.enc`)  
**Encryption**: AES-256-GCM with PBKDF2 key derivation

**Key Derivation Input**:
- System hostname
- Operating system (linux)
- Architecture (x86_64/arm64/etc.)
- Username ($USER)

### Legacy Fallback (Tier 3)

**Location**: `~/.config/nsyte/secrets.json`  
**Security**: Plain text with warnings

---

## Other Platforms

For unsupported platforms, nsyte automatically falls back to encrypted file storage using the same AES-256-GCM encryption with platform-specific key derivation.

---

## Security Considerations

### Best Practices

1. **Use Native Keychain**: Always prefer native keychain when available
2. **Keep Systems Updated**: Ensure OS security updates are applied
3. **Protect System Access**: Use strong user account passwords/authentication
4. **Monitor Access**: Check for unexpected keychain access prompts
5. **Rotate Credentials**: Periodically rotate nbunksec strings

### Threat Model

**Protected Against**:
- Casual file system access
- Basic malware file scanning
- Accidental credential exposure in backups

!!! warning "Not Protected Against"
    - Malware with keychain/credential manager access
    - Physical access with user credentials
    - Advanced persistent threats with system-level access
    - Side-channel attacks on encryption

### Migration Security

When migrating from legacy plain-text storage:

1. Secrets are read from JSON file
2. Stored using secure backend
3. Original file deleted only after successful migration
4. Process is logged for audit purposes