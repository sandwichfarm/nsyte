# Architecture

**Analysis Date:** 2026-02-24

## Pattern Overview

**Overall:** Multi-layered CLI application using command-based architecture with separation of concerns between command registration, business logic, and UI rendering.

**Key Characteristics:**
- Command-driven CLI using Cliffy framework for command parsing and execution
- Layered architecture: commands → business logic → platform services
- Nostr protocol integration for content distribution and cryptographic signing
- Interactive UI layer with progress tracking and real-time status rendering
- Configuration-driven project setup with validation schema
- Secrets management with platform-specific backends (keychain, encrypted storage)

## Layers

**Command Layer:**
- Purpose: Parse CLI arguments, handle user input, coordinate command execution
- Location: `src/commands/`
- Contains: Individual command implementations (deploy, init, list, browse, etc.)
- Depends on: Business logic layer, UI layer, configuration
- Used by: CLI entry point (`src/cli.ts`)
- Pattern: Each command exports a `register{Name}Command()` function that adds itself to root cliffy command

**Business Logic Layer:**
- Purpose: Core application logic for Nostr operations, file handling, and deployments
- Location: `src/lib/`
- Contains: Config management, Nostr protocol handlers, file processing, upload orchestration
- Key modules:
  - `config.ts`: Project configuration loading/saving with validation
  - `nostr.ts`: Relay pool management, event publishing, manifest creation
  - `upload.ts`: File upload to Blossom servers with retry logic
  - `files.ts`: Local file scanning, ignore patterns, content hashing
  - `auth/`: Authentication and signing (private keys, NIP-46 bunkers)
  - `secrets/`: Secure credential storage (keychain-backed)
  - `metadata/`: Profile and event metadata publishing
- Depends on: External libraries (applesauce-*, @noble/*, @std/*), types
- Used by: Commands and UI components

**UI/Presentation Layer:**
- Purpose: Output formatting, progress rendering, interactive browsing
- Location: `src/ui/`
- Contains: Output helpers, progress bars, status displays, color formatting
- Key modules:
  - `browse/`: Interactive file browser with state management
  - `formatters.ts`: Consistent output formatting for lists and results
  - `progress.ts`: Progress bar rendering with file upload tracking
  - `status.ts`: Status message display and updates
- Depends on: Logger, business logic results
- Used by: Commands for user-facing output

**Platform/Infrastructure Layer:**
- Purpose: Low-level system operations and external service communication
- Location: `src/lib/`
- Contains: Logger, Relay pool (Nostr), HTTP client abstractions, file system operations
- Key modules:
  - `logger.ts`: Structured logging with file output in debug mode
  - `nostr.ts` (pool/store): Relay pool management via applesauce-relay
  - Display mode detection for interactive vs. non-interactive output

## Data Flow

**Deployment Flow (deploy command):**

1. User invokes `nsyte deploy` with options (relays, servers, secret, config path)
2. Command loads project configuration from `.nsite/config.json`
3. Authenticate using provided secret or stored bunker (signer-factory)
4. Load local files and compute SHA256 hashes (files.ts)
5. Fetch remote manifest event from relays using current pubkey
6. Compare local vs. remote files to determine uploads needed
7. Upload changed files to Blossom servers concurrently (upload.ts)
8. Create/publish updated manifest event to relays (createSiteManifestEvent)
9. Render progress and collect messages for final summary
10. Output success/failure results with file hashes and event IDs

**File Listing Flow (list command):**

1. Resolve pubkey (accepts npub, hex, NIP-05 address)
2. Fetch manifest event from relays for given identifier (named or root site)
3. Extract files and source relay information from manifest
4. For each relay+file pair, check availability on Blossom servers
5. Format output with source relay/server colors and symbols
6. Render file tree with propagation statistics

**Browse/Delete Flow (browse command):**

1. Load site files and build interactive state tree
2. Accept user keyboard input (vim-style navigation, selection)
3. On selection, render detail view or enable delete mode
4. For deletes: authenticate if needed, create signed delete event
5. Publish delete event to relays
6. Re-fetch manifest to confirm deletion
7. Update display with deletion status

**State Management:**
- Browse command maintains BrowseState containing:
  - Current tree items (files + directory structure)
  - Selection state (selected indices, sets of paths)
  - Navigation state (page, view mode)
  - Authentication state (chosen method, credentials)
  - Source information (relay/server color maps)
- State mutations happen via explicit update functions (navigateUp, toggleSelection, etc.)
- UI re-renders on state changes

## Key Abstractions

**ISigner (from applesauce-signers):**
- Purpose: Unified interface for signing events (private keys, NIP-46 bunkers, etc.)
- Examples: `PrivateKeySigner`, `NostrConnectSigner`
- Pattern: Implementations accept secret format and return pubkey + sign method

**ProjectConfig/ProjectContext:**
- Purpose: Configuration schema for a site project
- Location: `src/lib/config.ts`
- Contains: Relay URLs, Blossom server URLs, site identifier, metadata, app handler config
- Validation: JSON Schema (AJV validator in config-validator.ts)

**MessageCollector:**
- Purpose: Aggregate and format messages from operations (errors, successes, warnings)
- Location: `src/lib/message-collector.ts`
- Pattern: Add messages by type/category, deduplicate by content, format for output

**FileEntry/FileEntryWithSources:**
- Purpose: Represent a file in manifest with path and SHA256
- Location: `src/lib/nostr.ts`
- WithSources variant adds relay/server source tracking for propagation

**EventTemplate (from applesauce-core):**
- Purpose: Unsigned Nostr event representation before signing
- Used for: Site manifest events, profile metadata, relay lists

## Entry Points

**CLI Entry Point:**
- Location: `src/cli.ts`
- Triggers: `deno run src/cli.ts [args]` or `nsyte [command]` (compiled binary)
- Responsibilities:
  - Register all available commands with Cliffy
  - Parse Deno.args
  - Handle unhandledrejection for rate-limit errors
  - Close relay connections after command execution
  - Exit process cleanly

**Root Command:**
- Location: `src/commands/root.ts`
- Purpose: Define base CLI metadata and show help when no command provided
- Sets global `--config` option for config file path override

**Individual Commands:**
- Pattern: Each command in `src/commands/` registers via exported function
- Invoked by: Command parser when matching command name
- Responsibilities: Parse subcommand options, call business logic, handle results

## Error Handling

**Strategy:** Hierarchical error handling with context-aware logging

**Patterns:**
- Try-catch in commands with fallback to handleError() utility
- getErrorMessage() normalizes unknown error types to strings
- withErrorHandling() wraps async operations with optional exit behavior
- Config validation errors trigger user prompts for reinitialization
- Network errors (timeouts, connection failures) are caught and logged with retry attempts
- Rate-limit errors prevented from crashing via unhandledrejection handler
- Secrets manager errors don't propagate but show appropriate fallback messages

## Cross-Cutting Concerns

**Logging:**
- Approach: Namespace-based logger via createLogger(namespace)
- Levels: debug, info, warn, error, success
- Behavior: File logging in /tmp/nsyte.log when LOG_LEVEL=debug, console output controlled by display mode
- Progress mode: Queued logs until command completes, then flushed

**Validation:**
- Config validation: AJV JSON schema validator in config-validator.ts
- Custom rules: Root site app handlers must have id, named sites require identifier
- Secret format detection: detectSecretFormat() checks nsec/nbunksec/bunker URL/hex
- File ignore patterns: Glob-based exclude lists with .nsyte-ignore support

**Authentication:**
- Priority order: --sec param > stored bunker from config
- Secret formats: nsec (bech32), nbunksec, bunker:// URLs, 64-char hex
- Storage: SecretsManager with keychain backend (macOS/Linux) or encrypted file backup
- NIP-46 support: createNip46ClientFromUrl() for remote signing via bunker protocol

**Display Modes:**
- Interactive: Progress bars, real-time status (TTY detection)
- Non-interactive: Batch logging, deferred output
- Debug: Detailed logging to file + console
- Progress mode: Suppress info logs during long operations

---

*Architecture analysis: 2026-02-24*
