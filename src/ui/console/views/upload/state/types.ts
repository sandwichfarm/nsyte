import { UploadFileStatus, TimelineEntry, UploadStats } from '../../../contexts/types.ts'

export interface SessionConfigOverrides {
  force?: boolean
  purge?: boolean
  publishProfile?: boolean
  publishRelayList?: boolean
  publishServerList?: boolean
  publishAppHandler?: boolean
  servers?: string[]
  relays?: string[]
}

export interface UploadViewState {
  isDeploying: boolean
  isAuthenticated: boolean
  files: UploadFileStatus[]
  timeline: TimelineEntry[]
  stats: UploadStats
  concurrency: number
  selectedFile: number
  scrollOffset: number
  showInlineConfirm: boolean
  errorMessage?: string
  errorTimeoutId?: number
  currentOperationId?: string
  isEditingPath: boolean
  deployPath: string
  currentPath: string
  pathConfirmed: boolean
  isLoadingFiles: boolean
  propagationPage: number
  propagationPageSize: number
  // Session config overrides
  sessionOverrides: SessionConfigOverrides
  showConfigOverrides: boolean
  selectedOverride: number
  editingOverride: string | null
  // Deployment stage
  stage: 'idle' | 'preparing' | 'signing' | 'uploading' | 'publishing' | 'completed' | 'failed'
}

export interface UploadViewConfig {
  projectPath: string
  concurrency?: number
  propagationPageSize?: number
}