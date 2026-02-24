# External Integrations

**Analysis Date:** 2026-02-24

## APIs & External Services

**Nostr Network:**
- Nostr Protocol (NIP-01 base, plus NIPs 05, 09, 19, 23, 46, 65, 89, 98)
  - SDK/Client: `applesauce-relay` for relay pool connections
  - Communication: WebSocket connections to Nostr relays
  - Purpose: Event distribution, profile data, file manifest storage

**Blossom Protocol (NIP-324):**
- Blossom File Storage Servers
  - Default servers: `https://blossom.primal.net`, `https://cdn.hzrd149.com`, `https://cdn.sovbit.host`, `https://cdn.nostrcheck.me`, `https://nostr.download`
  - Purpose: Distributed file hosting for website assets
  - Operations: Upload (POST), download (GET), verify (HEAD), delete (DELETE)
  - Auth: Nostr event signature (kind 24242 delete authorization)
  - Files read from: `src/lib/blossom.ts`, `src/lib/blossom-checker.ts`, `src/lib/upload.ts`

**NIP-05 HTTP Verification:**
- External HTTP requests to `/.well-known/nostr.json` on specified domains
  - Implementation: `src/lib/nip05.ts`
  - Purpose: Verify Nostr identity claims (NIP-05 internet identity)
  - Timeout: 5 seconds
  - Used by: `nsyte validate` command

## Data Storage

**File Storage:**
- Blossom servers (NIP-324) - distributed, decentralized file hosting
  - No centralized database required
  - Files identified by SHA-256 hash
  - Multi-server upload for redundancy

**Local Storage:**
- `.nsite/config.json` - Project configuration file
  - Location: `src/lib/config.ts` (configDir = ".nsite")
  - Format: JSON with validated schema
  - Validation: `src/lib/config-validator.ts` uses AJV JSON schema validation

**In-Memory Storage:**
- `EventStore` from applesauce-core
  - Caches Nostr events during CLI execution
  - Cleared between command executions
  - No persistence across CLI runs

**Encryption:**
- `.nsite/.secrets.enc` - Encrypted secrets file (fallback when keychain unavailable)
  - Implementation: `src/lib/secrets/encrypted-storage.ts`
  - Used for storing private keys and Nostr Connect secrets
  - Encryption method: OS-specific (libsodium or similar)

**Caching:**
- Local relay caching (optional)
  - URL: `ws://localhost:4869`
  - Implementation: `src/lib/nostr.ts` cacheRequest function
  - Purpose: Speed up event queries if local relay is available
  - Automatic timeout after 1 second if unavailable

## Authentication & Identity

**Auth Provider:**
- Nostr-based decentralized authentication
  - No centralized OAuth provider
  - Two methods supported:

**Method 1: Private Key (Direct)**
- Implementation: `src/lib/auth/signer-factory.ts`
- Storage: OS keychain (primary) or encrypted file (fallback)
- Format: Hex-encoded Ed25519 private key
- Scope: Full read/write access to all Nostr events

**Method 2: Nostr Connect (NIP-46 Remote Signing)**
- Implementation: `src/lib/nip46.ts`
- Purpose: Sign events using external signer app (e.g., Bunker, Amber, other NIP-46 providers)
- Protocol: Encrypted WebSocket communication with signer
- Required Permissions (from `PERMISSIONS` in `nip46.ts`):
  - kind 0: Metadata/profile
  - kind 10002: Relay list
  - kind 10063: Blossom server list
  - kind 24242: Blossom authorization
  - kind 31990: NIP-89 app handler
  - kind 15128/35128: Site manifests
  - kind 5: Event deletion
- QR Code: Generated for easy Nostr Connect setup (ASCII/Unicode rendering)

**Secrets Management:**
- Keychain integration: `src/lib/secrets/keychain.ts`
  - macOS: `security` command (Keychain)
  - Linux: `secret-tool` (Secret Service)
  - Windows: `cmdkey` (Credential Manager)
  - Override: `NSYTE_DISABLE_KEYCHAIN=true` environment variable disables keychain
- Fallback: Encrypted JSON file if keychain unavailable

## Monitoring & Observability

**Error Tracking:**
- None detected - No centralized error tracking service integrated
- Rate limiting detection in `src/cli.ts` (unhandledrejection listener catches Nostr rate limits)

**Logs:**
- Console-based logging via custom logger
  - Implementation: `src/lib/logger.ts`
  - Levels: debug, info, warn, error
  - Format: Prefixed by module name
  - Debug mode controlled by runtime (no debug flag currently)
  - Colored output via `@cliffy/ansi/colors`

**Relay Statistics:**
- Propagation stats tracking: `src/lib/propagation-stats.ts`
  - Monitors relay relay delivery confirmation
  - Tracks event publication success/failure per relay

## CI/CD & Deployment

**Hosting:**
- GitHub Releases - Binary distribution
  - Multi-platform builds triggered on version tags or manual dispatch
  - Files: `release.yml` workflow

**CI Pipeline:**
- GitHub Actions Workflows:
  - `release.yml` - Build binaries (Linux, macOS Intel/ARM, Windows) + publish to JSR + create release
  - `release-simple.yml` - Simpler release workflow
  - `test-release.yml` - Test release process
  - `docs.yml` - Build and deploy documentation

**Build Jobs:**
- Platform-specific compilation:
  - Linux: `deno compile --target x86_64-unknown-linux-gnu`
  - macOS Intel: `deno compile --target x86_64-apple-darwin`
  - macOS ARM: `deno compile --target aarch64-apple-darwin`
  - Windows: `deno compile --target x86_64-pc-windows-msvc`
- UPX compression: `upx --best --lzma` for size reduction
- JSR Publishing: `deno publish` (OIDC-authenticated)

**Version Management:**
- Semantic versioning maintained in `deno.json` and synced to other files via `scripts/sync-version.ts`
- Tagged releases: `v{major}.{minor}.{patch}` (GitHub tags)

## Environment Configuration

**Required Environment Variables:**
- `NSYTE_DISABLE_KEYCHAIN` (optional) - Set to "true" to disable OS keychain, use encrypted file fallback

**Secrets Location:**
- OS Keychain (platform-dependent):
  - Service name: "nsyte"
  - Account: public key (npub)
  - Password: Nostr Connect secret or private key
- Fallback: `.nsite/.secrets.enc` - Encrypted file in project directory

**Configuration Files:**
- `.nsite/config.json` - Per-project configuration (committed to git, not sensitive)
- `.env` - NOT used (all config via `.nsite/config.json` or interactive setup)

## Webhooks & Callbacks

**Incoming:**
- None detected - No webhook endpoints exposed

**Outgoing:**
- Event publishing to Nostr relays (one-way)
  - File manifests (kind 15128/35128)
  - Profile metadata (kind 0)
  - Relay lists (kind 10002)
  - Blossom server lists (kind 10063)
  - App handler announcements (kind 31990)
  - Event deletion requests (kind 5)

**Download Service Callbacks:**
- `src/lib/download.ts` - HTTP range requests for resumable downloads
- Update checking: Gateway server background updates (asynchronous polling)
  - No real-time webhooks; polling-based update detection

## Default Relay & Server Configuration

**Relay Discovery Relays** (used to find user's configured relays):
- `wss://purplepag.es`
- `wss://user.kindpag.es`
- `wss://nos.lol`
- `wss://relay.damus.io`
- `wss://relay.primal.net`

**Default Broadcast Relays** (fallback if user doesn't configure):
- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://nostr.wine`
- `wss://relay.snort.social`
- `wss://relay.nsite.lol`

**Popular Relays** (suggested during init):
- `wss://nostr.cercatrova.me`
- `wss://relay.primal.net`
- `wss://relay.wellorder.net`
- `wss://nos.lol`
- `wss://nostr-pub.wellorder.net`
- `wss://relay.damus.io`

**Popular Blossom Servers** (suggested during init):
- `https://cdn.hzrd149.com`
- `https://cdn.sovbit.host`
- `https://cdn.nostrcheck.me`
- `https://nostr.download`

---

*Integration audit: 2026-02-24*
