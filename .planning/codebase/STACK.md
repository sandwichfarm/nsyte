# Technology Stack

**Analysis Date:** 2026-02-24

## Languages

**Primary:**
- TypeScript - All source code uses `.ts` extension, compiled and executed via Deno

## Runtime

**Environment:**
- Deno v2.x - Modern JavaScript/TypeScript runtime with native ES modules, web APIs, and permissions model
- All tasks execute with `deno run` or compiled to standalone binaries with `deno compile`

**Package Manager:**
- JSR (JavaScript Registry) - Primary package manager for dependencies
- npm - Secondary compatibility layer for npm packages (via Deno npm:// imports)
- Lockfile: `deno.lock` present - Ensures deterministic dependency resolution

## Frameworks

**Core:**
- Cliffy v1.0.0-rc.8 - Terminal CLI and prompt framework
  - `@cliffy/command` - Command/subcommand parsing and execution
  - `@cliffy/prompt` - Interactive prompts (Input, Select, Secret)
  - `@cliffy/ansi` - ANSI color and styling
  - `@cliffy/keypress` - Keyboard input handling

**Nostr Ecosystem:**
- Applesauce v5.1.0 - Comprehensive Nostr protocol library suite
  - `applesauce-core` - Core Nostr event handling and helpers
  - `applesauce-relay` - Nostr relay connection pool management (`RelayPool`)
  - `applesauce-signers` - Event signing implementations (PrivateKeySigner, NostrConnectSigner)
  - `applesauce-loaders` - Event loading utilities and EventStore
  - `applesauce-common` - Shared types and helper functions

**Testing:**
- Deno std testing - Built-in test runner (no external test framework required)
  - Config: `deno.json` specifies test patterns in `tests/` directory
  - Run: `deno test --allow-all --no-check`

**Build/Dev:**
- Deno compile - Standalone binary compilation for Linux, macOS (Intel/ARM64), Windows
- UPX (Ultimate Packer for eXecutables) - Binary compression (--best --lzma)
- Brotli compression - Via `@nick/brotli@0.1.0` for file compression/decompression

## Key Dependencies

**Critical:**
- `applesauce-relay@5.1.0` - Maintains relay connections to Nostr network; core to all network operations
- `applesauce-signers@5.1.0` - Signs events and handles authentication via Nostr Connect (NIP-46) and private keys
- `@cliffy/command@1.0.0-rc.8` - CLI argument parsing and command routing
- `ajv@8.17.1` - JSON schema validation for configuration and manifests

**Cryptography:**
- `@noble/curves@1.9.7` - secp256k1 cryptographic curves for Nostr key operations
- `@noble/hashes@1.8.0` - SHA-256, SHA-512 hashing (used for blob verification)
- `@scure/bip39@1.6.0` - BIP-39 seed phrase generation/validation
- `@scure/bip32@1.7.0` - BIP-32 HD wallet derivation
- `@scure/base@1.2.6` - Base encoding/decoding utilities

**Utilities:**
- `rxjs@7.8.2` - Reactive Extensions for event streams and relay communication
- `@libs/qrcode@3.0.1` - QR code generation (for Nostr Connect setup)
- `ajv-formats@3.0.1` - Extended JSON schema format validation (dates, emails, URLs)

**Standard Library:**
- `@std/*` - Deno standard library modules (multiple v1.0.x versions)
  - `@std/fs` - File system operations (read, write, ensure directories)
  - `@std/path` - Path manipulation
  - `@std/encoding` - Base64, hex encoding/decoding
  - `@std/http` - HTTP server utilities
  - `@std/media-types` - MIME type detection
  - `@std/testing` - Test assertions and utilities
  - `@std/assert` - Assertion helpers

## Configuration

**Environment:**
- Configuration stored in `.nsite/config.json` (per-project)
  - Contains: relay URLs, Blossom server URLs, site metadata, Nostr Connect bunker reference
  - Generated via `nsyte init` interactive CLI
  - Never stored in `.env` files - uses local `.nsite/` directory

**Secrets Management:**
- OS Keychain backend (system credential storage) - primary storage
  - Falls back to OS-specific implementations (macOS Keyring, Linux Secret Service, Windows Credential Manager)
  - Disable with `NSYTE_DISABLE_KEYCHAIN=true` environment variable
- Encrypted file storage fallback at `.nsite/.secrets.enc` if keychain unavailable
- Stores Nostr private keys and Nostr Connect secrets securely

**Build:**
- Deno configuration: `deno.json`
  - Formatter settings: 2-space indentation, 100 character line width, semicolons enabled
  - Import aliases defined for JSR and npm packages
  - Test configuration: includes `tests/` directory pattern

## Platform Requirements

**Development:**
- Deno v2.x installed
- Source available on GitHub
- Test suite: `deno test` with full network/filesystem access

**Production:**
- Standalone compiled binaries for:
  - Linux x86_64 (GNU)
  - macOS x86_64 (Intel/Rosetta)
  - macOS aarch64 (Apple Silicon)
  - Windows x86_64 (MSVC)
- Binaries available in compressed (UPX) and standard formats
- Binary size: ~88MB (standard), ~30MB (compressed)
- Single-file executable (no runtime dependencies beyond OS)

**Supported Platforms:**
- Linux (all major distributions with GLIBC)
- macOS 10.7+ (both Intel and Apple Silicon)
- Windows 7+ (x86_64)

---

*Stack analysis: 2026-02-24*
