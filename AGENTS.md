# AGENTS.md

## Purpose

This file helps AI assistants understand the nsyte codebase and contribute effectively. It provides context about the project's architecture, conventions, and best practices.

## Project Overview

**nsyte** is a command-line tool for managing and browsing Nostr-based websites (nsites). It enables users to deploy static sites to the Nostr network, browse deployed sites, and manage their content using decentralized protocols.

### Core Technologies
- **Language**: TypeScript/Deno
- **Protocols**: Nostr (Notes and Other Stuff Transmitted by Relays), Blossom (blob storage)
- **Key Libraries**:
  - `nostr-tools` - Nostr protocol implementation
  - `@cliffy/command` - CLI framework
  - `applesauce-*` - Nostr utilities

## Architecture

### Directory Structure
```
src/
├── commands/       # CLI commands (deploy, browse, run, etc.)
├── lib/           # Shared utilities and core functionality
├── ui/            # Terminal UI components
└── types.ts       # TypeScript type definitions
```

### Key Components

#### Commands (`src/commands/`)
- **deploy.ts** - Deploy sites to Nostr network
- **browse.ts** - Interactive file browser for nsites
- **run.ts** - Local development server for nsites
- **ls.ts** - List files in an nsite
- **purge.ts** - Remove files from servers

#### Libraries (`src/lib/`)
- **nostr.ts** - Nostr protocol operations
- **download.ts** - Blossom server file operations
- **config.ts** - Configuration management
- **utils.ts** - Shared utility functions
- **nip46.ts** - Nostr Connect (bunker) implementation

## Conventions

### Code Style
- Use async/await for asynchronous operations
- Prefer functional approaches where appropriate
- Keep functions focused and composable
- Use descriptive variable names

### Error Handling
- Use try/catch blocks for network operations
- Provide helpful error messages to users
- Log debug information when LOG_LEVEL=debug

### Imports
- Use JSR packages (`jsr:`) when available
- Avoid `deno.land/x/` imports (breaks JSR publishing)
- Prefer npm packages as second choice
- Use absolute imports for internal modules

### Testing
- Run tests with `deno test`
- Mock external dependencies in tests
- Test files use `.test.ts` or `_test.ts` suffix

## Common Tasks

### Adding a New Command
1. Create new file in `src/commands/`
2. Export an async `command` function
3. Register in `src/cli.ts`
4. Add help text and options using Cliffy

### Working with Nostr
- Use connection pools from `src/lib/nostr.ts`
- Always clean up subscriptions
- Handle relay disconnections gracefully
- Cache relay lists and profiles when appropriate

### Working with Blossom Servers
- Check server availability before uploading
- Use the DownloadService for fetching files
- Respect server rate limits
- Cache responses when possible

## Key Patterns

### Authentication
The project supports multiple authentication methods:
- Private key (hex or nsec)
- Nostr Connect (bunker) with optional PIN
- Stored secrets via secrets manager

### File Discovery
1. Fetch user's relay list (Kind 10002)
2. Query relays for site manifest events (Kinds 15128 for root sites, 35128 for named sites)
3. Fetch server list (Kind 10063)
4. Check blossom servers for file availability

### Performance Considerations
- Throttle UI updates to prevent flickering
- Process keypresses immediately without queuing
- Check visible files first, background check others
- Yield to event loop during long operations

## Development Workflow

### Building
```bash
deno task compile      # Compile to binary
deno task build        # Full build with all platforms
```

### Testing
```bash
deno test             # Run all tests
deno task test        # Run tests with coverage
```

### Running Locally
```bash
deno run --allow-all src/cli.ts [command]
```

### Publishing
- Ensure `deno publish --dry-run` passes
- Version is managed in `deno.json`
- Releases are automated via GitHub Actions

## Important Notes

### Security
- Never log or expose private keys
- Validate all user inputs
- Use secure random for cryptographic operations
- Clear sensitive data from memory when done

### Compatibility
- Support latest Deno version
- Maintain backward compatibility for configs
- Test on Linux, macOS, and Windows
- Ensure JSR publishing requirements are met

### User Experience
- Provide clear, actionable error messages
- Show progress for long operations
- Support both interactive and non-interactive modes
- Respect user's terminal capabilities

## Common Pitfalls to Avoid

1. **Don't block the event loop** - Use async operations and yield periodically
2. **Don't queue keypresses** - Process immediately to prevent lag
3. **Don't import from deno.land/x/** - Breaks JSR publishing
4. **Don't assume relay availability** - Always handle connection failures
5. **Don't clear screen too frequently** - Causes flickering

## Getting Help

- Check existing code for patterns
- Read Nostr protocol specs (NIPs)
- Review Blossom protocol documentation
- Look at test files for usage examples

## Contributing

When making changes:
1. Follow existing code patterns
2. Add tests for new functionality
3. Update documentation if needed
4. Ensure all tests pass
5. Verify JSR publish compatibility
