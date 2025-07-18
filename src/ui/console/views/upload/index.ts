// Re-export the refactored upload view as the main export
export { UploadView } from '../upload.refactored.ts'

// Export types
export type { 
  UploadViewState, 
  SessionConfigOverrides,
  UploadViewConfig 
} from './state/types.ts'

// Export state manager
export { UploadStateManager } from './state/manager.ts'

// Export logic modules
export { FileSyncStatusManager } from './logic/file-sync-status.ts'
export type { SyncStatus } from './logic/file-sync-status.ts'

// Export renderers
export { PathInputRenderer } from './renderers/path-input.ts'
export { SyncStatusRenderer } from './renderers/sync-status.ts'
export { FileTreeRenderer } from './renderers/file-tree.ts'

// Export utilities
export * from './utils.ts'