# Coding Conventions

**Analysis Date:** 2026-02-24

## Naming Patterns

**Files:**
- Module files use kebab-case: `config-validator.ts`, `error-utils.ts`, `display-mode.ts`
- Command files in `src/commands/` match command names: `upload.ts`, `deploy.ts`, `init.ts`, `bunker.ts`
- Test files use suffix pattern: `{module}_test.ts` (e.g., `logger_test.ts`, `config_test.ts`)
- UI components in subdirectories: `src/ui/progress.ts`, `src/ui/header.ts`, `src/ui/browse/renderer.ts`
- Secrets modules: `src/lib/secrets/encrypted-storage.ts`, `src/lib/secrets/manager.ts`

**Functions:**
- camelCase for all functions: `createLogger()`, `readProjectFile()`, `publishEventsToRelays()`
- Exported factory functions prefixed with `create`: `createLogger()`, `createSigner()`, `createGroupedCommand()`
- Private/internal functions not exported or prefixed with underscore when internal state functions
- Async functions use async/await syntax, not callback-based

**Variables:**
- camelCase for all variables: `logOutput`, `originalConsoleLog`, `errorOutput`, `tempDir`
- Constants in SCREAMING_SNAKE_CASE when truly immutable: `DEFAULT_IGNORE_PATTERNS`, `SERVICE_NAME`, `TMPDIR`
- Module-level state variables like `inProgressMode`, `logFile`, `logFileHandle`
- Test setup/state variables prefixed with `original`: `originalConsoleLog`, `originalLogLevel`, `originalDisplayMode`

**Types:**
- PascalCase for interface names: `ProjectConfig`, `ProjectContext`, `FileEntry`, `TestEnvironment`
- Type aliases in PascalCase: `ByteArray` (type alias for Uint8Array)
- Interface properties use camelCase: `tempDir`, `configFile`, `cleanup`
- Generic type parameters use single uppercase letters: `<T>` for general types

**Classes:**
- PascalCase: `StatusDisplay`, `SecretsManager`, `EncryptedStorage`, `NostrConnectSigner`
- Methods follow camelCase: `setProgressMode()`, `flushQueuedLogs()`, `isInteractive()`

## Code Style

**Formatting:**
- Tool: Deno built-in formatter (configured in `deno.json`)
- Indent width: 2 spaces
- Line width: 100 characters (enforced)
- Semicolons: Required at end of statements
- Quotes: Double quotes (not single)
- Trailing commas: Used in multi-line structures

**Linting:**
- No explicit linter config found, relies on Deno's built-in linting
- Type checking: `--no-check` flag used in tests (performance optimization)
- Strict types: TypeScript strict mode implied by codebase patterns

## Import Organization

**Order:**
1. External standard library imports from `@std/` (sorted alphabetically)
2. External third-party packages (`@cliffy/`, npm packages, jsr packages)
3. Local relative imports (sorted by depth: `../` first, then `./`)
4. Type imports using `type` keyword when importing only types

**Path Aliases:**
- No path aliases configured
- Relative imports use relative paths: `../lib/`, `./`
- Module re-exports use barrel files: `src/lib/secrets/mod.ts` exports from sibling files

**Examples:**
```typescript
import { existsSync } from "@std/fs/exists";
import { join } from "@std/path";
import { colors } from "@cliffy/ansi/colors";
import { createLogger } from "../lib/logger.ts";
```

## Error Handling

**Patterns:**
- Use `error instanceof Error ? error.message : String(error)` for unknown error types
- Try/catch blocks with `unknown` type: `catch (error: unknown)`
- Error helper functions in `src/lib/error-utils.ts`:
  - `getErrorMessage(error: unknown): string` - Extract readable message
  - `logError(context, error, options)` - Log with context
  - `handleError(context, error, options)` - Log and optionally exit
  - `withErrorHandling<T>(context, fn, options)` - Wrap async function

**Error Logging:**
- Always include context string describing where error occurred
- Use logger instance pattern for contextual logging:
  ```typescript
  const log = createLogger("module-name");
  log.error(`Operation failed: ${errorMessage}`);
  ```

**Error Recovery:**
- Silent failures for cleanup operations (log file writes, directory changes)
- Provide fallback behavior when primary option fails
- Exit with code 1 for fatal errors, 0 for success

## Logging

**Framework:** Custom logger in `src/lib/logger.ts`

**Patterns:**
- Create logger per module: `const log = createLogger("namespace")`
- Log levels: `debug`, `info`, `warn`, `error`, `success`
- Log level controlled by `LOG_LEVEL` env var (default: "info")
- File logging to `$TMPDIR/nsyte.log` when `LOG_LEVEL=debug`

**When to log:**
- `debug`: Detailed diagnostic information (e.g., "Closing relays", "Config cleanup check failed")
- `info`: General informational messages about normal operation
- `warn`: Warning conditions that don't prevent operation
- `error`: Error conditions that affect functionality
- `success`: Operation completed successfully

**Progress mode:**
- `setProgressMode(true)` queues info/warn/error logs during progress display
- `flushQueuedLogs()` outputs queued logs after progress completes
- Debug and success logs always output immediately, even in progress mode

## Comments

**When to comment:**
- Comment complex algorithms or non-obvious logic
- Document workarounds or intentional shortcuts with `TODO:` or `FIXME:` prefix
- Explain "why" for non-obvious business logic, not just "what"
- Provide context for rate-limit handling or relay behavior

**JSDoc/TSDoc:**
- Use JSDoc blocks for public functions: `/** function description */`
- Include `@param` tags only when parameters need explanation
- Include `@returns` description for non-obvious return values
- Mark deprecated functions with `@deprecated` tag

**Example:**
```typescript
/**
 * Splits and filters a comma-separated string
 */
export function parseCommaSeparated(value: string | undefined): string[] {
```

## Function Design

**Size:**
- Most utility functions 10-50 lines
- Command handlers 100-300 lines (including UI logic)
- Keep pure logic functions under 30 lines

**Parameters:**
- Options objects preferred for functions with multiple optional parameters
- Type all parameters explicitly (no implicit `any`)
- Use destructuring in function parameters for object options

**Return Values:**
- Async functions return `Promise<T>` or `Promise<T | null>` for optional results
- Functions return early with `return null` when resource not found
- Factory functions return objects with methods/properties bundled together

**Example:**
```typescript
export function createLogger(namespace: string) {
  return {
    debug(message: string): void { ... },
    info(message: string): void { ... },
    warn(message: string): void { ... },
    error(message: string): void { ... },
    success(message: string): void { ... },
  };
}
```

## Module Design

**Exports:**
- Export named functions and types, not default exports
- Barrel files (mod.ts) re-export from sibling modules
- Keep modules focused on single responsibility

**Module Structure:**
- Constants and types at top of file
- Private utility functions before exported functions
- Exported functions grouped by functionality

**Example structure in `src/lib/logger.ts`:**
1. Imports
2. Module-level state (log file config)
3. File logging setup and utilities
4. Progress mode state
5. Exported functions (createLogger, flushQueuedLogs, etc.)
6. Exported log instance

---

*Convention analysis: 2026-02-24*
