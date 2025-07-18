# Upload View - Refactored Architecture

The upload view has been refactored from a monolithic 2,179-line file into a modular architecture with clear separation of concerns.

## Directory Structure

```
upload/
├── state/               # State management
│   ├── types.ts        # State interfaces and types
│   └── manager.ts      # State management logic
├── logic/              # Business logic
│   └── file-sync-status.ts  # File sync status calculations
├── renderers/          # UI rendering modules
│   ├── base.ts         # Base renderer class
│   ├── path-input.ts   # Path input and session config rendering
│   ├── sync-status.ts  # Sync status overview rendering
│   └── file-tree.ts    # File tree with propagation indicators
├── utils.ts            # Utility functions
├── index.ts            # Module exports
└── README.md           # This file
```

## Key Benefits

1. **Separation of Concerns**: Each module has a single, clear responsibility
2. **Testability**: Individual components can be unit tested in isolation
3. **Maintainability**: Smaller files (~50-400 lines) are easier to navigate and modify
4. **Reusability**: Renderers and logic can be reused in other views
5. **Type Safety**: Clear interfaces between modules improve type checking

## Module Descriptions

### State Management (`state/`)
- **manager.ts**: Centralized state management with methods for updating state
- **types.ts**: All state-related type definitions

### Business Logic (`logic/`)
- **file-sync-status.ts**: Handles sync status calculations, color mappings, and connection status

### Renderers (`renderers/`)
- **base.ts**: Common rendering utilities (clearing areas, text positioning)
- **path-input.ts**: Renders path input and session configuration UI
- **sync-status.ts**: Renders sync status overview and endpoint propagation
- **file-tree.ts**: Renders file tree with colored propagation indicators

### Utilities (`utils.ts`)
- Progress bar creation
- File size formatting
- Duration formatting
- Deploy badge generation
- File tree building
- Column width calculations

## Usage Pattern

```typescript
// Main upload view creates instances of all modules
export class UploadView implements ConsoleView {
  private stateManager: UploadStateManager
  private syncStatusManager: FileSyncStatusManager
  private pathInputRenderer: PathInputRenderer
  private syncStatusRenderer: SyncStatusRenderer
  private fileTreeRenderer: FileTreeRenderer
  
  constructor(...) {
    // Initialize managers and renderers
  }
  
  render(): void {
    // Delegate to appropriate renderer based on state
    if (!state.pathConfirmed) {
      this.pathInputRenderer.render(...)
    } else if (!state.isDeploying) {
      this.syncStatusRenderer.renderSyncStatusView(...)
    }
    // etc.
  }
}
```

## Adding New Features

1. **New State**: Add to `state/types.ts` and update `state/manager.ts`
2. **New Logic**: Create a new file in `logic/` directory
3. **New UI Section**: Create a new renderer in `renderers/` extending `BaseRenderer`
4. **New Utilities**: Add to `utils.ts` and export from `index.ts`

## Future Improvements

1. Add deployment progress renderer
2. Add completion view renderer
3. Implement config override editor
4. Add more comprehensive error handling
5. Add unit tests for each module