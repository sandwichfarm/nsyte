# Codebase Structure

**Analysis Date:** 2026-02-24

## Directory Layout

```
nsyte/
├── src/                           # TypeScript source code
│   ├── cli.ts                     # Entry point: registers commands and manages relay pool
│   ├── version.ts                 # Version constant
│   ├── commands/                  # CLI command implementations
│   │   ├── root.ts                # Root cliffy command definition
│   │   ├── init.ts                # Initialize new project
│   │   ├── deploy.ts              # Deploy site to Nostr + Blossom
│   │   ├── list.ts                # List remote files with source tracking
│   │   ├── browse.ts              # Interactive file browser
│   │   ├── download.ts            # Download files from Blossom
│   │   ├── sites.ts               # List all sites for a pubkey
│   │   ├── announce.ts            # Announce site metadata
│   │   ├── serve.ts               # Serve local files via HTTP
│   │   ├── run.ts                 # Run local/remote site
│   │   ├── ci.ts                  # CI workflow for deployments
│   │   ├── validate.ts            # Validate config file
│   │   ├── config.ts              # Config management utilities
│   │   ├── debug.ts               # Debug mode utilities
│   │   ├── purge.ts               # Delete old site versions
│   │   └── bunker.ts              # Bunker (NIP-46) management
│   ├── lib/                       # Business logic modules
│   │   ├── config.ts              # Project config loading/saving/validation
│   │   ├── config-validator.ts    # AJV schema validation
│   │   ├── config-cleanup.ts      # Config file corruption recovery
│   │   ├── types.ts               # Shared type definitions
│   │   ├── constants.ts           # Relay URLs and default values
│   │   ├── logger.ts              # Structured logging with file output
│   │   ├── error-utils.ts         # Error handling utilities
│   │   ├── display-mode.ts        # Interactive vs. non-interactive detection
│   │   ├── nostr.ts               # Relay pool, event publishing, manifests
│   │   ├── manifest.ts            # Site manifest event creation/parsing
│   │   ├── files.ts               # Local file scanning, hashing, ignore patterns
│   │   ├── files/                 # File processing submodule
│   │   │   └── processor.ts       # File processing utilities
│   │   ├── upload.ts              # Blossom server uploads with retry logic
│   │   ├── download.ts            # File download from Blossom
│   │   ├── blossom.ts             # Blossom server utilities
│   │   ├── blossom-checker.ts     # File availability checks on servers
│   │   ├── gateway.ts             # HTTP gateway utilities
│   │   ├── nip05.ts               # NIP-05 name resolution
│   │   ├── nip46.ts               # NIP-46 bunker/Nostr Connect support
│   │   ├── utils.ts               # General utilities (parsing, formatting)
│   │   ├── resolver-utils.ts      # Pubkey/relay resolution
│   │   ├── browse-loader.ts       # Load file data for browse command
│   │   ├── message-collector.ts   # Message aggregation and formatting
│   │   ├── propagation-stats.ts   # Calculate file propagation strength
│   │   ├── metadata/              # Metadata publishing submodule
│   │   │   └── publisher.ts       # Profile/relay/server list publishing
│   │   ├── auth/                  # Authentication submodule
│   │   │   ├── signer-factory.ts  # Create signers from secrets
│   │   │   └── secret-detector.ts # Detect secret format
│   │   ├── config/                # Configuration submodule
│   │   │   └── context-resolver.ts # Config context resolution
│   │   ├── secrets/               # Secrets management submodule
│   │   │   ├── mod.ts             # Secrets manager public API
│   │   │   ├── manager.ts         # Singleton secrets manager
│   │   │   ├── keychain.ts        # Platform keychain integration
│   │   │   ├── encrypted-storage.ts # Fallback encrypted file storage
│   │   │   └── utils.ts           # Secrets utilities
│   │   └── schemas/               # JSON schemas
│   │       └── config.schema.json # Project config schema (AJV validator)
│   └── ui/                        # User interface and output formatting
│       ├── header.ts              # Colorful header display
│       ├── formatters.ts          # Output formatting (lists, tables, results)
│       ├── output-helpers.ts      # General output utilities
│       ├── progress.ts            # Progress bar rendering for uploads
│       ├── status.ts              # Status message display
│       ├── time-formatter.ts      # Duration/time formatting
│       ├── json-highlighter.ts    # JSON syntax highlighting
│       └── browse/                # Interactive browse UI
│           ├── state.ts           # Browse state management and mutations
│           ├── renderer.ts        # Tree view and detail rendering
│           ├── handlers.ts        # Keyboard input handling
│           └── menu.ts            # Interactive menu rendering
├── tests/                         # Test suite
│   ├── setup.ts                   # Test setup and utilities
│   ├── mocks/                     # Mock implementations
│   │   ├── index.ts               # Mock utilities
│   │   └── secrets-manager.ts     # Mocked SecretsManager
│   ├── unit/                      # Unit tests (~40 test files)
│   │   └── *_test.ts              # Individual test files by module
│   └── integration/               # Integration tests
│       └── *_test.ts              # Integration scenarios
├── docs/                          # Documentation (generated)
├── website/                       # Website content
├── static/                        # Static assets
├── scripts/                       # Build and release scripts
├── .nsite/                        # Project config directory (local)
│   └── config.json                # Project configuration (runtime)
├── .planning/                     # GSD planning documents
│   └── codebase/                  # Generated architecture documentation
├── .packaging/                    # Binary packaging configuration
├── deno.json                      # Deno project manifest
├── deno.lock                      # Lock file for dependencies
├── deno.test.json                 # Test configuration
├── mkdocs.yml                     # Documentation config
├── README.md                      # Project overview
├── AGENTS.md                      # Contributing guidelines
├── nsite-nip.md                   # NIP specification document
└── opencode.json                  # Opencode project metadata
```

## Directory Purposes

**src/commands/:**
- Purpose: CLI command implementations using Cliffy framework
- Contains: One file per command, each exports registerXCommand() function
- Key files: `root.ts` (base command), `deploy.ts` (main feature)

**src/lib/:**
- Purpose: Core business logic and reusable services
- Contains: Configuration, Nostr protocol, file operations, authentication
- Subdirectories: auth, config, secrets, metadata (organize related concerns)

**src/lib/secrets/:**
- Purpose: Secure credential storage with platform support
- Contains: Manager singleton, keychain backend, encrypted file fallback
- Key file: `manager.ts` (SecretsManager class with single instance)

**src/lib/auth/:**
- Purpose: Authentication and signing utilities
- Contains: Signer factory, secret format detection
- Key file: `signer-factory.ts` (createSigner function with priority chain)

**src/ui/:**
- Purpose: User-facing output and interactive components
- Contains: Formatters, progress rendering, color utilities
- Subdirectory: browse/ (interactive file browser state + UI)

**src/ui/browse/:**
- Purpose: Interactive file browser for viewing/deleting remote files
- Contains: State management (buildTreeItems, navigation functions), rendering, input handling
- Key file: `state.ts` (BrowseState type, tree building, mutations)

**tests/:**
- Purpose: Test suite for unit and integration testing
- Unit tests: Mock individual modules, validate business logic
- Integration tests: Test real Nostr protocol interactions with mock relays
- Mocks: Custom test doubles (SecretsManager, display mode)

**.nsite/:**
- Purpose: Project configuration directory (project-specific, not committed)
- Contains: config.json with relays, servers, authentication, site metadata
- Note: Critical - contains deployment config (bunkerPubkey, relay/server URLs)

## Key File Locations

**Entry Points:**
- `src/cli.ts`: Main entry point (deno run src/cli.ts or compiled binary)
- `src/commands/root.ts`: Root Cliffy command with global options
- `src/commands/*.ts`: Individual command registration (deploy, list, browse, etc.)

**Configuration:**
- `src/lib/config.ts`: Load/save project config from `.nsite/config.json`
- `src/schemas/config.schema.json`: AJV schema for config validation
- `.nsite/config.json`: Runtime project configuration (local, not committed)
- `deno.json`: Deno runtime manifest with dependencies and tasks

**Core Logic:**
- `src/lib/nostr.ts`: Relay pool, event publishing, manifest operations
- `src/lib/upload.ts`: Blossom server uploads with concurrent retry logic
- `src/lib/files.ts`: Local file scanning, hashing, ignore pattern matching
- `src/lib/manifest.ts`: Manifest event creation and parsing (NIP-based)

**Testing:**
- `tests/unit/`: Individual module tests with mocks
- `tests/setup.ts`: Test utilities and helpers
- `deno.test.json`: Test runner configuration
- `deno.json` tasks: test, test:unit, test:integration, coverage

## Naming Conventions

**Files:**
- Commands: `{name}.ts` in src/commands/ (lowercase, no suffix)
- Tests: `{module}_test.ts` alongside code or in tests/
- Types: Defined in same file as usage, complex types in `types.ts`
- Modules: Lowercase with hyphens for multi-word names (e.g., `config-validator.ts`)

**Directories:**
- Feature modules: lowercase (auth, secrets, metadata)
- UI components: ui/feature/ for grouped related views (browse/)
- Schemas: schemas/ for JSON schema files

**Functions:**
- Public: camelCase (createSigner, registerDeployCommand, getLocalFiles)
- Private: prefixed with underscore in some modules, camelCase (\_formatLog)
- Exported interfaces: PascalCase (ProjectConfig, BrowseState)

**Types/Interfaces:**
- PascalCase (ProjectConfig, ISigner, FileEntry, BrowseState)
- Suffix -Options for function parameters, -Result for return types
- Enum names: PascalCase (MessageCategory enum with UPPERCASE variants)

## Where to Add New Code

**New Feature (deploy-like command):**
- Create: `src/commands/feature-name.ts`
- Pattern: Export registerFeatureNameCommand() function that adds command to root
- Imports: Use business logic from src/lib/, UI from src/ui/
- Structure: Handle options parsing, call lib functions, render results via UI
- Tests: Create `tests/unit/feature_name_command_test.ts`

**New Command Subfeature (like --option for deploy):**
- Location: Add to existing command file `src/commands/command-name.ts`
- Pattern: Add .option() call in registerXCommand(), handle in action()
- Tests: Add test cases to existing command test file

**New Business Logic Module:**
- Location: `src/lib/new-feature.ts` (or `src/lib/category/feature.ts` if related)
- Pattern: Export functions (not class-based except SecretsManager singleton)
- Dependencies: Import from other lib/ modules as needed
- Logger: Use createLogger("module-name") at top
- Tests: Create `tests/unit/new_feature_test.ts`

**New Secrets/Auth Method:**
- Location: `src/lib/secrets/new-backend.ts` (implement StorageBackend interface)
- OR: `src/lib/auth/new-signer.ts` (implement ISigner interface)
- Integration: Add to SecretsManager backends or signer-factory priority order
- Tests: Add test cases to secrets_manager_test.ts or bunker_command_test.ts

**New UI Component:**
- Location: `src/ui/feature-name.ts` or `src/ui/category/component.ts`
- Pattern: Export functions that return formatted strings or render to console
- Dependencies: Use createLogger() for logging, colors from @cliffy/ansi/colors
- Tests: Create `tests/unit/ui_feature_name_test.ts` with console mocking

**Utilities and Helpers:**
- Shared helpers: `src/lib/utils.ts` (parsing, string operations)
- Domain-specific: Create focused module (e.g., `resolver-utils.ts` for pubkey resolution)
- Path helpers: `src/lib/utils.ts` has parseRelayInput, truncateString, etc.

## Special Directories

**src/schemas/:**
- Purpose: JSON Schema definitions for validation
- Generated: No (manually authored)
- Committed: Yes
- Usage: Imported by config-validator.ts for AJV compilation

**.nsite/:**
- Purpose: Project-local configuration directory
- Generated: Yes (created on init)
- Committed: No (.gitignore'd)
- Critical: Never overwrite with test data; use temp directories for testing

**dist/:**
- Purpose: Compiled binary output
- Generated: Yes (deno compile output)
- Committed: No
- Contents: nsyte binary (and platform-specific variants for builds)

**docs/:**
- Purpose: Generated MkDocs documentation
- Generated: Yes (mkdocs build)
- Committed: No
- Source: Markdown files in website/ and generated docs/

**.planning/codebase/:**
- Purpose: GSD-generated architecture documentation
- Generated: Yes (by gsd:map-codebase)
- Committed: Yes (for codebase context in future phases)
- Files: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

---

*Structure analysis: 2026-02-24*
