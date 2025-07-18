import { UploadViewState, SessionConfigOverrides, UploadViewConfig } from './types.ts'
import { UploadContext, OperationContext, NsiteContext } from '../../../contexts/types.ts'
import { ProjectConfig } from '../../../../../lib/config.ts'
import { Identity } from '../../../types.ts'

export class UploadStateManager {
  private state: UploadViewState
  private baseConfig: ProjectConfig
  
  constructor(
    config: ProjectConfig,
    identity: Identity,
    viewConfig: UploadViewConfig
  ) {
    this.baseConfig = config
    
    this.state = {
      isDeploying: false,
      isAuthenticated: true,  // All auth methods are valid for deployment
      files: [],
      timeline: [],
      stats: {
        totalFiles: 0,
        totalSize: 0,
        uploadedFiles: 0,
        uploadedSize: 0,
        failedFiles: 0,
        skippedFiles: 0,
        publishedEvents: 0,
        failedEvents: 0,
        profileEvents: 0,
        relayListEvents: 0,
        serverListEvents: 0,
        appHandlerEvents: 0,
        signedEvents: 0,
        totalEvents: 0
      },
      concurrency: viewConfig.concurrency || 4,
      selectedFile: 0,
      scrollOffset: 0,
      showInlineConfirm: false,
      isEditingPath: true,
      deployPath: viewConfig.projectPath,
      currentPath: Deno.realPathSync(viewConfig.projectPath),
      pathConfirmed: false,
      isLoadingFiles: false,
      propagationPage: 0,
      propagationPageSize: viewConfig.propagationPageSize || 20,
      sessionOverrides: {},
      showConfigOverrides: false,
      selectedOverride: 0,
      editingOverride: null,
      stage: 'idle'
    }
  }
  
  get currentState(): Readonly<UploadViewState> {
    return this.state
  }
  
  updateFromUploadContext(context: UploadContext | null): void {
    if (!context) return
    
    // ALWAYS update files from context - this ensures we get the latest files
    // after path changes
    this.state.files = context.files || []
    this.state.timeline = context.timeline
    this.state.stats = context.stats
    this.state.isDeploying = context.isActive
    
    // Clear loading state when context is loaded (regardless of file count)
    if (context.status === 'loaded' && this.state.isLoadingFiles) {
      this.state.isLoadingFiles = false
      
      // Show error if no files found
      if (context.files.length === 0) {
        this.setError('No files found in the specified directory')
      }
    }
    
    // Handle context loading errors
    if (context.status === 'error' && context.error) {
      this.state.isLoadingFiles = false
      this.setError(`Failed to load files: ${context.error}`)
    }
    
    // Map upload context stage to view state stage
    if (context.stage) {
      switch (context.stage) {
        case 'preparing':
          this.state.stage = 'preparing'
          break
        case 'signing':
          this.state.stage = 'signing'
          break
        case 'uploading':
          this.state.stage = 'uploading'
          break
        case 'publishing':
          this.state.stage = 'publishing'
          break
        case 'completed':
          this.state.stage = 'completed'
          break
        case 'failed':
          this.state.stage = 'failed'
          break
        default:
          this.state.stage = 'idle'
      }
    }
  }
  
  updateFromOperationContext(context: OperationContext | null): void {
    if (!context) return
    
    // Check if there's an active upload operation
    let hasActiveOperation = false
    for (const [id, operation] of context.activeOperations) {
      if (operation.type === 'upload') {
        this.state.currentOperationId = id
        this.state.isDeploying = true
        hasActiveOperation = true
        
        // Show any operation errors
        if (operation.error) {
          this.setError(operation.error)
        }
        break
      }
    }
    
    // Check failed operations for errors
    if (!hasActiveOperation) {
      this.state.currentOperationId = undefined
      
      // Look for recent failed upload operations
      const recentFailed = context.failedOperations
        .filter(op => op.type === 'upload')
        .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
        .slice(0, 1)
      
      if (recentFailed.length > 0 && recentFailed[0].error) {
        this.setError(recentFailed[0].error)
      }
    }
  }
  
  getEffectiveConfig(): ProjectConfig {
    // Create effective config by merging base config with session overrides
    const effective = { ...this.baseConfig }
    
    if (this.state.sessionOverrides.servers) {
      effective.servers = this.state.sessionOverrides.servers
    }
    if (this.state.sessionOverrides.relays) {
      effective.relays = this.state.sessionOverrides.relays
    }
    if (this.state.sessionOverrides.publishProfile !== undefined) {
      effective.publishProfile = this.state.sessionOverrides.publishProfile
    }
    if (this.state.sessionOverrides.publishRelayList !== undefined) {
      effective.publishRelayList = this.state.sessionOverrides.publishRelayList
    }
    if (this.state.sessionOverrides.publishServerList !== undefined) {
      effective.publishServerList = this.state.sessionOverrides.publishServerList
    }
    if (this.state.sessionOverrides.publishAppHandler !== undefined) {
      effective.publishAppHandler = this.state.sessionOverrides.publishAppHandler
    }
    
    return effective
  }
  
  // State mutation methods
  setError(message: string, duration: number = 5000): void {
    this.state.errorMessage = message
    
    // Clear any existing timeout
    if (this.state.errorTimeoutId) {
      clearTimeout(this.state.errorTimeoutId)
    }
    
    // Set new timeout to clear error
    this.state.errorTimeoutId = setTimeout(() => {
      this.state.errorMessage = undefined
      this.state.errorTimeoutId = undefined
    }, duration)
  }
  
  clearError(): void {
    if (this.state.errorTimeoutId) {
      clearTimeout(this.state.errorTimeoutId)
    }
    this.state.errorMessage = undefined
    this.state.errorTimeoutId = undefined
  }
  
  setPath(path: string): void {
    this.state.deployPath = path
  }
  
  setCurrentPath(path: string): void {
    this.state.currentPath = path
  }
  
  setEditingPath(editing: boolean): void {
    this.state.isEditingPath = editing
  }
  
  setPathConfirmed(confirmed: boolean): void {
    this.state.pathConfirmed = confirmed
  }
  
  setLoadingFiles(loading: boolean): void {
    this.state.isLoadingFiles = loading
  }
  
  setShowConfigOverrides(show: boolean): void {
    this.state.showConfigOverrides = show
  }
  
  setSelectedOverride(index: number): void {
    this.state.selectedOverride = index
  }
  
  setEditingOverride(field: string | null): void {
    this.state.editingOverride = field
  }
  
  updateSessionOverride<K extends keyof SessionConfigOverrides>(
    key: K,
    value: SessionConfigOverrides[K]
  ): void {
    if (value === undefined) {
      delete this.state.sessionOverrides[key]
    } else {
      this.state.sessionOverrides[key] = value
    }
  }
  
  clearSessionOverrides(): void {
    this.state.sessionOverrides = {}
  }
  
  setShowInlineConfirm(show: boolean): void {
    this.state.showInlineConfirm = show
  }
  
  setSelectedFile(index: number): void {
    this.state.selectedFile = Math.max(0, Math.min(index, this.state.files.length - 1))
  }
  
  setScrollOffset(offset: number): void {
    this.state.scrollOffset = Math.max(0, offset)
  }
  
  setPropagationPage(page: number): void {
    const maxPage = Math.max(0, Math.ceil(this.state.files.length / this.state.propagationPageSize) - 1)
    this.state.propagationPage = Math.max(0, Math.min(page, maxPage))
  }
  
  nextPropagationPage(): void {
    this.setPropagationPage(this.state.propagationPage + 1)
  }
  
  prevPropagationPage(): void {
    this.setPropagationPage(this.state.propagationPage - 1)
  }
  
  setStage(stage: UploadViewState['stage']): void {
    this.state.stage = stage
  }
}