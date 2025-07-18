import { ConsoleView, Identity } from '../types.ts'
import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../../lib/config.ts'
import { ConsoleContextManager } from '../contexts/manager.ts'
import { UploadContext, OperationContext, NsiteContext } from '../contexts/types.ts'
import { colors } from '@cliffy/ansi/colors'
import { getTerminalSize, clearScreen } from '../../browse/renderer.ts'
import { createColorMaps } from '../components/file-sync-indicators.ts'
import { createLogger } from '../../../lib/logger.ts'

// Import modules
import { UploadStateManager } from './upload/state/manager.ts'
import { FileSyncStatusManager } from './upload/logic/file-sync-status.ts'
import { PathInputRenderer } from './upload/renderers/path-input.ts'
import { SyncStatusRenderer } from './upload/renderers/sync-status.ts'
import { FileTreeRenderer } from './upload/renderers/file-tree.ts'
import { DeploymentProgressRenderer } from './upload/renderers/deployment-progress.ts'
import { CompletionRenderer } from './upload/renderers/completion.ts'
import { 
  getFileSyncStatus,
  getSyncStatusSymbol,
  getSyncStatusColor
} from '../components/file-sync-indicators.ts'

const log = createLogger('upload-view')

type ViewStatus = { text: string; color?: (str: string) => string }

export class UploadView implements ConsoleView {
  name = 'Upload'
  private stateManager: UploadStateManager
  private syncStatusManager: FileSyncStatusManager
  private contextManager: ConsoleContextManager | null = null
  private uploadContext: UploadContext | null = null
  private operationContext: OperationContext | null = null
  private nsiteContext: NsiteContext | null = null
  private relayColorMap: Map<string, (str: string) => string> = new Map()
  private serverColorMap: Map<string, (str: string) => string> = new Map()
  
  // Renderers
  private pathInputRenderer: PathInputRenderer
  private syncStatusRenderer: SyncStatusRenderer
  private fileTreeRenderer: FileTreeRenderer
  private deploymentProgressRenderer: DeploymentProgressRenderer
  private completionRenderer: CompletionRenderer
  
  // View callback
  private viewSwitchCallback?: (viewName: string) => void
  
  constructor(
    private config: ProjectConfig,
    private identity: Identity,
    private projectPath: string
  ) {
    // Initialize state manager
    this.stateManager = new UploadStateManager(config, identity, {
      projectPath,
      concurrency: 4,
      propagationPageSize: 20
    })
    
    // Create color maps
    const relays = this.config.relays || []
    const servers = this.config.servers || []
    const { relayColorMap, serverColorMap } = createColorMaps(relays, servers)
    this.relayColorMap = relayColorMap
    this.serverColorMap = serverColorMap
    
    // Initialize sync status manager
    this.syncStatusManager = new FileSyncStatusManager(
      relayColorMap,
      serverColorMap,
      relays,
      servers
    )
    
    // Initialize renderers
    this.pathInputRenderer = new PathInputRenderer(
      () => this.stateManager.currentState,
      () => this.stateManager.getEffectiveConfig()
    )
    
    this.syncStatusRenderer = new SyncStatusRenderer(
      () => this.stateManager.currentState,
      this.syncStatusManager,
      () => this.nsiteContext,
      relays,
      servers
    )
    
    this.fileTreeRenderer = new FileTreeRenderer(
      () => this.stateManager.currentState,
      this.syncStatusManager,
      () => this.nsiteContext,
      relayColorMap,
      serverColorMap,
      relays,
      servers
    )
    
    this.deploymentProgressRenderer = new DeploymentProgressRenderer(
      () => this.stateManager.currentState,
      this.syncStatusManager,
      config
    )
    
    this.completionRenderer = new CompletionRenderer(
      () => this.stateManager.currentState,
      () => this.stateManager.getEffectiveConfig()
    )
  }
  
  async initialize(contextManager: ConsoleContextManager): Promise<void> {
    this.contextManager = contextManager
    this.uploadContext = contextManager.getContext<UploadContext>('upload')
    this.operationContext = contextManager.getContext<OperationContext>('operations')
    this.nsiteContext = contextManager.getContext<NsiteContext>('nsite')
    
    // Update from existing contexts
    this.stateManager.updateFromUploadContext(this.uploadContext)
    this.stateManager.updateFromOperationContext(this.operationContext)
    
    // Subscribe to context updates
    contextManager.subscribe('upload', (context: any) => {
      this.uploadContext = context as UploadContext
      this.stateManager.updateFromUploadContext(this.uploadContext)
    })
    
    contextManager.subscribe('operations', (context: any) => {
      this.operationContext = context as OperationContext
      this.stateManager.updateFromOperationContext(this.operationContext)
    })
    
    contextManager.subscribe('nsite', (context: any) => {
      this.nsiteContext = context as NsiteContext
      // Trigger re-render when nsite context changes
      this.stateManager.updateFromUploadContext(this.uploadContext)
    })
  }
  
  render(): void {
    const { rows, cols } = getTerminalSize()
    const state = this.stateManager.currentState
    
    if (!state.pathConfirmed || state.isEditingPath) {
      // Show path input screen
      this.pathInputRenderer.render(3, cols, Math.min(15, rows - 5))
      
      if (state.isLoadingFiles) {
        this.renderLoadingState(12, cols)
      } else if (state.files.length > 0) {
        this.pathInputRenderer.renderDeploySection(rows - 12, cols)
      }
      return
    }
    
    // Show main upload interface
    const hasActiveDeployment = state.isDeploying
    const hasCompletedDeployment = !hasActiveDeployment && 
      state.stats.uploadedFiles > 0 && 
      state.stats.endTime
    
    if (!hasActiveDeployment && !hasCompletedDeployment) {
      // Show sync status view when not deploying
      // Split the screen: left column for sync status, right column for file tree
      const leftColWidth = Math.floor(cols * 0.5)
      const rightColWidth = cols - leftColWidth - 1
      
      // Left column: Sync status view
      this.syncStatusRenderer.renderSyncStatusView(3, leftColWidth, rows - 5)
      
      // Right column: File tree with propagation indicators
      this.fileTreeRenderer.renderFilePropagation(3, leftColWidth + 1, rightColWidth, rows - 5)
      return
    }
    
    // Show deployment progress or completion view
    if (hasActiveDeployment) {
      this.deploymentProgressRenderer.render(3, cols, rows - 5)
    } else if (hasCompletedDeployment) {
      this.completionRenderer.render(3, cols, rows - 5)
    }
  }
  
  async handleInput(event: KeyPressEvent): Promise<boolean> {
    const state = this.stateManager.currentState
    
    // Handle error display timeout
    if (state.errorMessage && event.key) {
      this.stateManager.clearError()
    }
    
    // Path editing mode
    if (state.isEditingPath) {
      return this.handlePathInput(event)
    }
    
    // Config override editing mode
    if (state.showConfigOverrides) {
      return this.handleConfigOverrideInput(event)
    }
    
    // Inline confirmation mode
    if (state.showInlineConfirm) {
      return this.handleInlineConfirm(event)
    }
    
    // Normal navigation
    switch (event.key) {
      case 'd':
        if (!state.isDeploying && state.files.length > 0) {
          await this.startDeployment()
          return true
        }
        break
        
      case 'c':
        // Cancel deployment
        if (state.isDeploying && state.currentOperationId) {
          await this.cancelDeployment()
          return true
        }
        break
        
      case 'p':
        if (!state.isDeploying) {
          this.stateManager.setEditingPath(true)
          this.stateManager.setPathConfirmed(false)
          return true
        }
        break
        
      case 'r':
        if (!state.isDeploying) {
          await this.confirmPathAndLoadFiles()
          return true
        }
        break
        
      case 'left':
        if (state.files.length > state.propagationPageSize) {
          this.stateManager.prevPropagationPage()
          return true
        }
        break
        
      case 'right':
        if (state.files.length > state.propagationPageSize) {
          this.stateManager.nextPropagationPage()
          return true
        }
        break
    }
    
    return false
  }
  
  private handlePathInput(event: KeyPressEvent): boolean {
    const state = this.stateManager.currentState
    
    switch (event.key) {
      case 'return':
        this.confirmPathAndLoadFiles()
        return true
        
      case 'escape':
        if (state.pathConfirmed) {
          this.stateManager.setEditingPath(false)
        }
        return true
        
      case 'tab':
        this.stateManager.setShowConfigOverrides(!state.showConfigOverrides)
        return true
        
      case 'backspace':
        if (state.deployPath.length > 0) {
          this.stateManager.setPath(state.deployPath.slice(0, -1))
        }
        return true
        
      default:
        if (event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          this.stateManager.setPath(state.deployPath + event.key)
          return true
        }
    }
    
    return false
  }
  
  private handleConfigOverrideInput(event: KeyPressEvent): boolean {
    const state = this.stateManager.currentState
    
    switch (event.key) {
      case 'tab':
      case 'escape':
        // Exit config override mode
        this.stateManager.setShowConfigOverrides(false)
        return true
        
      case 'up':
        // Navigate config options up
        if (state.selectedOverride > 0) {
          this.stateManager.setSelectedOverride(state.selectedOverride - 1)
        }
        return true
        
      case 'down':
        // Navigate config options down
        const maxOptions = 6 // servers, relays, publishProfile, publishRelayList, publishServerList, publishAppHandler
        if (state.selectedOverride < maxOptions - 1) {
          this.stateManager.setSelectedOverride(state.selectedOverride + 1)
        }
        return true
        
      case 'return':
        // For now, just show a message that this is not implemented
        this.stateManager.setError('Config override editing not yet implemented')
        return true
    }
    
    return false
  }
  
  private async handleInlineConfirm(event: KeyPressEvent): Promise<boolean> {
    if (event.key === 'y' || event.key === 'Y') {
      this.stateManager.setShowInlineConfirm(false)
      await this.persistConfigChanges()
      return true
    } else if (event.key === 'n' || event.key === 'N' || event.key === 'escape') {
      this.stateManager.setShowInlineConfirm(false)
      this.stateManager.clearSessionOverrides()
      return true
    }
    return false
  }
  
  
  private async confirmPathAndLoadFiles(): Promise<void> {
    const state = this.stateManager.currentState
    
    try {
      log.debug(`Starting file load for path: ${state.deployPath}`)
      
      // Validate path
      const resolvedPath = await Deno.realPath(state.deployPath)
      this.stateManager.setCurrentPath(resolvedPath)
      log.debug(`Resolved path: ${resolvedPath}`)
      
      // Check if path has changed - if so, we need fresh files
      if (state.currentPath && state.currentPath !== resolvedPath) {
        log.debug(`Path changed from ${state.currentPath} to ${resolvedPath}`)
      }
      
      // Need to load files for the new path
      this.stateManager.setLoadingFiles(true)
      
      // Update context manager's project path - this will load files
      if (this.contextManager && this.contextManager.updateProjectPath) {
        log.debug('Calling contextManager.updateProjectPath')
        
        // Add timeout to prevent indefinite hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('File loading timed out after 10 seconds')), 10000)
        })
        
        try {
          await Promise.race([
            this.contextManager.updateProjectPath(resolvedPath),
            timeoutPromise
          ])
          log.debug('contextManager.updateProjectPath completed')
        } catch (timeoutError) {
          throw timeoutError
        }
      } else {
        log.error('Context manager not available or updateProjectPath method missing')
        throw new Error('Context manager not initialized')
      }
      
      this.stateManager.setPathConfirmed(true)
      this.stateManager.setEditingPath(false)
      
      // Files should now be loaded via context update
      // The loading state will be cleared when we receive the context update
      
      // Set a fallback timeout to clear loading state if context doesn't update
      setTimeout(() => {
        if (this.stateManager.currentState.isLoadingFiles) {
          log.warn('Loading state still active after 5 seconds, clearing it')
          this.stateManager.setLoadingFiles(false)
          if (this.stateManager.currentState.files.length === 0) {
            this.stateManager.setError('No files loaded - check if the directory contains files')
          }
        }
      }, 5000)
    } catch (error) {
      log.error(`Error loading files: ${error}`)
      this.stateManager.setError(`Invalid path: ${error instanceof Error ? error.message : String(error)}`)
      this.stateManager.setLoadingFiles(false)
    }
  }
  
  private async startDeployment(): Promise<void> {
    if (!this.contextManager) {
      this.stateManager.setError('Context manager not initialized')
      return
    }
    
    try {
      const operationId = await this.contextManager.startUpload()
      log.info(`Started upload operation: ${operationId}`)
    } catch (error) {
      this.stateManager.setError(`Failed to start deployment: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  private async cancelDeployment(): Promise<void> {
    if (!this.contextManager || !this.stateManager.currentState.currentOperationId) {
      return
    }
    
    try {
      await this.contextManager.cancelOperation(this.stateManager.currentState.currentOperationId)
      log.info('Deployment cancelled')
    } catch (error) {
      this.stateManager.setError(`Failed to cancel deployment: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  private async persistConfigChanges(): Promise<void> {
    // TODO: Implement config persistence
    log.info('Persisting config changes...')
  }
  
  // Temporary render method for loading state
  private renderLoadingState(startRow: number, width: number): void {
    const loadingText = colors.yellow('⚡ Loading files...')
    const col = Math.floor((width - 18) / 2)
    const encoder = new TextEncoder()
    
    // Use console.log with cursor positioning
    console.log(`\x1b[${startRow};${col}H${loadingText}`)
  }
  
  // View interface methods
  getStatus(): ViewStatus {
    const state = this.stateManager.currentState
    
    if (state.errorMessage) {
      return {
        text: `Error: ${state.errorMessage}`,
        color: colors.red
      }
    }
    
    if (state.isDeploying) {
      const uploadedText = state.stats.uploadedFiles > 0 ? `${state.stats.uploadedFiles} uploaded` : ''
      const skippedText = state.stats.skippedFiles > 0 ? `${state.stats.skippedFiles} skipped` : ''
      const parts = [uploadedText, skippedText].filter(Boolean)
      const progress = parts.length > 0 ? ` (${parts.join(', ')})` : ''
      
      return {
        text: `Deploying ${state.stats.totalFiles} files${progress}`,
        color: colors.yellow
      }
    }
    
    // Check sync status from nsite context
    if (this.nsiteContext?.files) {
      const summary = this.syncStatusManager.getSyncSummary(
        state.files,
        this.nsiteContext,
        state.isDeploying
      )
      
      if (summary.synced === state.files.length) {
        return {
          text: `All ${state.files.length} files already deployed`,
          color: colors.blue
        }
      } else if (summary.synced > 0 || summary.partial > 0) {
        const parts = []
        if (summary.synced > 0) parts.push(`${summary.synced} synced`)
        // Remove confusing "partial" summary - show in grid instead
        return {
          text: parts.length > 0 ? `${state.files.length} files (${parts.join(', ')})` : `${state.files.length} files ready`,
          color: colors.cyan
        }
      }
    }
    
    return {
      text: state.files.length > 0 
        ? `${state.files.length} files ready for deployment`
        : 'No files to deploy',
      color: state.files.length > 0 ? colors.green : colors.gray
    }
  }
  
  getHotkeys(): string[] {
    const state = this.stateManager.currentState
    const hotkeys: string[] = []
    
    if (state.isEditingPath) {
      hotkeys.push(
        colors.gray('ENTER') + ' Confirm path',
        colors.gray('TAB') + ' Session config',
        colors.gray('ESC') + ' Cancel'
      )
    } else if (state.showConfigOverrides) {
      hotkeys.push(
        colors.gray('↑↓') + ' Navigate',
        colors.gray('ENTER') + ' Edit',
        colors.gray('TAB') + ' Back',
        colors.gray('ESC') + ' Cancel'
      )
    } else if (!state.pathConfirmed) {
      hotkeys.push(
        colors.gray('Type') + ' Enter path',
        colors.gray('TAB') + ' Session config'
      )
    } else {
      if (state.isDeploying) {
        hotkeys.push(colors.gray('c') + ' Cancel deployment')
      } else if (state.files.length > 0) {
        hotkeys.push(colors.gray('d') + ' Deploy')
      }
      
      if (!state.isDeploying) {
        hotkeys.push(
          colors.gray('p') + ' Change path',
          colors.gray('r') + ' Refresh files'
        )
      }
    }
    
    return hotkeys
  }
  
  isEditing(): boolean {
    const state = this.stateManager.currentState
    return state.isEditingPath || state.showConfigOverrides || state.editingOverride !== null
  }
  
  isTyping(): boolean {
    const state = this.stateManager.currentState
    return state.isEditingPath || state.editingOverride !== null
  }
  
  hasActiveUploadOperations(): boolean {
    return this.stateManager.currentState.isDeploying
  }
  
  setViewSwitchCallback(callback: (viewName: string) => void): void {
    this.viewSwitchCallback = callback
  }
}