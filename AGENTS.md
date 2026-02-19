# AGENTS.md

## Project Overview

**nsyte** is a CLI tool for managing and browsing Nostr-based websites (nsites). It deploys static
sites to the Nostr network and Blossom blob storage servers for decentralized, censorship-resistant
hosting.

**Tech Stack**: TypeScript/Deno, Nostr protocol, Blossom storage, Cliffy CLI framework, Applesauce
Nostr libraries

## Build/Test/Lint Commands

### Running Tests

```bash
deno test                                    # Run all tests
deno test --allow-all --no-check             # Run with full permissions (standard)
deno task test                               # Run all tests (uses task config)
deno task test:unit                          # Run only unit tests
deno task test:integration                   # Run only integration tests

# Run a single test file
deno test --allow-all --no-check tests/unit/logger_test.ts

# Run tests matching a pattern
deno test --allow-all --no-check tests/unit/*_test.ts

# Run with coverage
deno task coverage
deno task coverage:report                    # Generate coverage badge
```

### Building

```bash
deno task compile                            # Compile for current platform
deno task compile:all                        # Compile for all platforms
deno task compile:linux                      # Compile for Linux
deno task compile:macos                      # Compile for macOS
deno task compile:windows                    # Compile for Windows
```

### Linting & Formatting

```bash
deno fmt                                     # Format all files
deno fmt --check                             # Check formatting without changes
deno lint                                    # Lint all TypeScript files
deno lint --rules                            # List available lint rules
```

### Running Locally

```bash
deno task dev                                # Run with standard permissions
deno run --allow-all src/cli.ts [command]    # Run with full control
```

## Code Style Guidelines

### Formatting

Use `deno fmt` for all formatting. Run `deno fmt` before committing.

- **Files**: kebab-case (`config-validator.ts`, `browse-loader.ts`)
- **Functions**: camelCase (`createLogger`, `getUserOutboxes`)
- **Types/Interfaces**: PascalCase (`ProjectConfig`, `FileEntry`)
- **Constants**: UPPER_SNAKE_CASE for true constants (`NSYTE_BROADCAST_RELAYS`)
- **Private module vars**: camelCase with descriptive names

### Error Handling

- **Network operations**: Use try/catch blocks
- **User-facing errors**: Provide clear, actionable messages
- **Error utilities**: Use `getErrorMessage()` from `error-utils.ts` for unknown errors
- **Logging**: Log debug info when `LOG_LEVEL=debug`

```typescript
try {
  await uploadFile(file);
} catch (error) {
  const message = getErrorMessage(error);
  log.error(`Upload failed: ${message}`);
  throw new Error(`Failed to upload ${file.path}: ${message}`);
}
```

### Async/Await

- Use async/await for all asynchronous operations (no raw promises/callbacks)
- Yield to event loop during long operations: `await new Promise((r) => setTimeout(r, 0))`
- Don't block the event loop in UI code

### Logging

- Create logger per module: `const log = createLogger("module-name");`
- Use appropriate levels: `log.debug()`, `log.info()`, `log.warn()`, `log.error()`
- Debug logs only appear when `LOG_LEVEL=debug`
- In progress mode, use `setProgressMode(true)` and `flushQueuedLogs()`

### Documentation

- **JSDoc comments** for exported functions and complex logic
- Mark deprecated functions with `@deprecated`

## Architecture Patterns

### Project Structure

```
src/
├── commands/       # CLI command implementations
├── lib/           # Core functionality (nostr, config, auth, files, etc.)
├── ui/            # Terminal UI components (progress, status, formatters)
└── types.ts       # Shared type definitions
tests/
├── unit/          # Unit tests
└── integration/   # Integration tests
```

### Key Patterns

- **Commands**: Export `registerXCommand(program: Command)` function
- **State management**: Module-level state with clear initialization
- **Signer factory**: Use `createSigner()` for authentication abstraction
- **Display manager**: Use `getDisplayManager()` for interactive/non-interactive modes
- **Secrets storage**: Use `SecretsManager` for secure credential storage (keychain on
  macOS/Windows, encrypted files on Linux)

### Security

- **Never log private keys or secrets**
- Use `truncateString()` when displaying pubkeys/hashes
- Store sensitive data in secure storage (SecretsManager)
- Clear sensitive data from memory when done

## Publishing & Compatibility

- Ensure `deno publish --dry-run` passes before releasing
- Support latest Deno 2.x
- Test cross-platform (Linux, macOS, Windows)
- No `deno.land/x` imports (breaks JSR)
