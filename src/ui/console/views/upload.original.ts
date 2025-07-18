import { ConsoleView, Identity } from '../types.ts'
import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../../lib/config.ts'
import { ConsoleContextManager } from '../contexts/manager.ts'
import { UploadContext, OperationContext, UploadFileStatus, TimelineEntry, UploadStats, NsiteContext } from '../contexts/types.ts'
import { colors } from '@cliffy/ansi/colors'
import { moveCursor, getTerminalSize, clearScreen } from '../../browse/renderer.ts'
import { createLogger } from '../../../lib/logger.ts'
import { RELAY_SYMBOL, SERVER_SYMBOL, RELAY_COLORS, SERVER_COLORS } from '../../../commands/ls.ts'
import { join } from '@std/path'
import { 
  createColorMaps, 
  renderSyncIndicators, 
  renderSyncLegend,
  getFileSyncStatus,
  getSyncStatusSymbol,
  getSyncStatusColor
} from '../components/file-sync-indicators.ts'

const log = createLogger('upload-view')

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
}

export class UploadView implements ConsoleView {
  name = 'Upload'
  private state: UploadViewState
  private contextManager: ConsoleContextManager | null = null
  private uploadContext: UploadContext | null = null
  private operationContext: OperationContext | null = null
  private nsiteContext: NsiteContext | null = null
  private config: ProjectConfig
  private identity: Identity
  private projectPath: string
  private viewSwitchCallback?: (viewName: string) => void
  private relayColorMap: Map<string, (str: string) => string> = new Map()
  private serverColorMap: Map<string, (str: string) => string> = new Map()

  constructor(config: ProjectConfig, identity: Identity, projectPath: string) {
    this.config = config
    this.identity = identity
    this.projectPath = projectPath
    
    this.state = {
      isDeploying: false,
      isAuthenticated: this.identity.authMethod !== 'hex', // Not read-only if authMethod is not 'hex'
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
              concurrency: 4, // Default concurrency, not configurable in ProjectConfig
      selectedFile: 0,
      scrollOffset: 0,
      showInlineConfirm: false,
      isEditingPath: true, // Start in editing mode
      deployPath: projectPath,
      currentPath: Deno.realPathSync(projectPath),
      pathConfirmed: false,
      isLoadingFiles: false,
      propagationPage: 0,
      propagationPageSize: 20,
      // Session config overrides
      sessionOverrides: {},
      showConfigOverrides: false,
      selectedOverride: 0,
      editingOverride: null
    }
  }

  private getEffectiveConfig(): ProjectConfig {
    return {
      ...this.config,
      ...this.state.sessionOverrides,
      servers: this.state.sessionOverrides.servers || this.config.servers,
      relays: this.state.sessionOverrides.relays || this.config.relays,
    }
  }

  setViewSwitchCallback(callback: (viewName: string) => void): void {
    this.viewSwitchCallback = callback
  }

  async initialize(contextManager: ConsoleContextManager): Promise<void> {
    this.contextManager = contextManager
    this.uploadContext = contextManager.getContext<UploadContext>('upload')
    this.operationContext = contextManager.getContext<OperationContext>('operations')
    this.nsiteContext = contextManager.getContext<NsiteContext>('nsite')
    
    // Create color maps for relays and servers
    const relays = this.config.relays || []
    const servers = this.config.servers || []
    const { relayColorMap, serverColorMap } = createColorMaps(relays, servers)
    this.relayColorMap = relayColorMap
    this.serverColorMap = serverColorMap
    
    // Update from existing contexts
    this.updateFromContext()
    
    // Subscribe to context updates
    contextManager.subscribe('upload', (context) => {
      this.uploadContext = context as UploadContext
      this.updateFromContext()
    })
    
    contextManager.subscribe('operations', (context) => {
      this.operationContext = context as OperationContext
      this.updateFromOperationContext()
    })
    
    contextManager.subscribe('nsite', (context) => {
      this.nsiteContext = context as NsiteContext
      // Update sync status when nsite context changes
      this.updateFromContext()
    })
  }

  private updateFromContext(): void {
    if (!this.uploadContext) return
    
    // Update file statuses from context
    this.state.files = this.uploadContext.files
    this.state.timeline = this.uploadContext.timeline
    this.state.stats = this.uploadContext.stats
    this.state.isDeploying = this.uploadContext.isActive
  }

  private updateFromOperationContext(): void {
    if (!this.operationContext) return
    
    // Check if there's an active upload operation
    let hasActiveOperation = false
    for (const [id, operation] of this.operationContext.activeOperations) {
      if (operation.type === 'upload') {
        this.state.currentOperationId = id
        this.state.isDeploying = true
        hasActiveOperation = true
        
        // Show any operation errors
        if (operation.error) {
          this.state.errorMessage = operation.error
        }
        break
      }
    }
    
    // Check failed operations for errors
    if (!hasActiveOperation) {
      const failedOperation = this.operationContext.failedOperations.find(op => 
        op.type === 'upload' && op.id === this.state.currentOperationId
      )
      
      if (failedOperation && failedOperation.error) {
        this.state.errorMessage = failedOperation.error
      }
      
      this.state.isDeploying = false
      this.state.currentOperationId = undefined
    }
  }

  render(): void {
    const { rows, cols } = getTerminalSize()
    
    // If path is not confirmed OR we're not deploying yet, show path input
    if (!this.state.pathConfirmed || (!this.state.isDeploying && !this.state.stats.endTime)) {
      this.renderPathInput(3, cols, rows - 5) // Start at row 3, leave room for footer
      return
    }
    
    // If loading files, show loading state
    if (this.state.isLoadingFiles) {
      this.renderLoadingState(3, cols, rows - 5)
      return
    }
    
    // Progressive disclosure: Show appropriate view based on state
    const hasActiveDeployment = this.state.isDeploying
    const hasCompletedDeployment = this.state.stats.endTime !== undefined
    const hasFiles = this.state.files.length > 0
    
    // If no deployment activity and files are loaded, show sync status view
    if (!hasActiveDeployment && !hasCompletedDeployment && hasFiles) {
      this.renderSyncStatusView(3, cols, rows - 5)
      return
    }
    
    // For active deployments, show full deployment UI
    if (hasActiveDeployment) {
      const timelineHeight = this.state.concurrency + 3
      this.renderTimeline(3, timelineHeight, cols)
      
      const columnsStartRow = 3 + timelineHeight + 1
      const remainingHeight = rows - columnsStartRow - 2
      
      // Show all three columns during active deployment
      const gapWidth = 2
      const totalGaps = gapWidth * 2
      const availableWidth = cols - totalGaps
      
      const gridWidth = Math.floor(availableWidth * 0.25)
      const statusWidth = Math.floor(availableWidth * 0.35)
      const propagationWidth = availableWidth - gridWidth - statusWidth
      
      this.renderProgressGrid(columnsStartRow, 1, gridWidth, remainingHeight)
      this.renderFileStatus(columnsStartRow, 1 + gridWidth + gapWidth, statusWidth, remainingHeight)
      this.renderFilePropagation(columnsStartRow, 1 + gridWidth + statusWidth + gapWidth * 2, propagationWidth, remainingHeight)
    }
    
    // For completed deployments, show results
    if (hasCompletedDeployment && !hasActiveDeployment) {
      this.renderCompletionView(3, cols, rows - 5)
    }
  }

  private renderPathInput(startRow: number, width: number, height: number): void {
    if (this.state.showConfigOverrides) {
      this.renderConfigOverrides(startRow, width, height)
      return
    }

    // Split screen: left side for path, right side for session config
    const leftWidth = Math.floor(width * 0.5)
    const rightWidth = width - leftWidth - 2 // 2 for gap
    
    // Left side: Path configuration
    moveCursor(startRow, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.green('📁 Website Files')))
    
    moveCursor(startRow + 2, 1)
    const pathLabel = colors.bold('Directory: ')
    const pathValue = this.state.deployPath
    const cursor = this.state.isEditingPath ? colors.yellow('█') : ''
    Deno.stdout.writeSync(new TextEncoder().encode(`${pathLabel}${colors.yellow(pathValue)}${cursor}`))
    
    if (this.state.isEditingPath) {
      moveCursor(startRow + 3, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Press [Enter] to scan directory')))
    }
    
    moveCursor(startRow + 5, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Current: ') + colors.cyan(this.state.currentPath)))
    
    // Right side: Session config overrides
    const rightStartCol = leftWidth + 3
    moveCursor(startRow, rightStartCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.cyan('⚙️  Session Config')))
    
    const effectiveConfig = this.getEffectiveConfig()
    
    moveCursor(startRow + 2, rightStartCol)
    Deno.stdout.writeSync(new TextEncoder().encode(`Servers: ${colors.cyan(String(effectiveConfig.servers?.length || 0))}`))
    
    moveCursor(startRow + 3, rightStartCol)
    Deno.stdout.writeSync(new TextEncoder().encode(`Relays: ${colors.cyan(String(effectiveConfig.relays?.length || 0))}`))
    
    moveCursor(startRow + 5, rightStartCol)
    const forceText = (effectiveConfig as any).force ? colors.green('enabled') : colors.gray('disabled')
    Deno.stdout.writeSync(new TextEncoder().encode(`Force deploy: ${forceText}`))
    
    moveCursor(startRow + 6, rightStartCol)
    const purgeText = (effectiveConfig as any).purge ? colors.red('enabled') : colors.gray('disabled')
    Deno.stdout.writeSync(new TextEncoder().encode(`Purge: ${purgeText}`))
    
    moveCursor(startRow + 8, rightStartCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Meta Events:')))
    
    moveCursor(startRow + 9, rightStartCol)
    const profileText = effectiveConfig.publishProfile ? colors.green('✓') : colors.gray('✗')
    Deno.stdout.writeSync(new TextEncoder().encode(`${profileText} Profile`))
    
    moveCursor(startRow + 10, rightStartCol)
    const relayListText = effectiveConfig.publishRelayList ? colors.green('✓') : colors.gray('✗')
    Deno.stdout.writeSync(new TextEncoder().encode(`${relayListText} Relay List`))
    
    moveCursor(startRow + 11, rightStartCol)
    const serverListText = effectiveConfig.publishServerList ? colors.green('✓') : colors.gray('✗')
    Deno.stdout.writeSync(new TextEncoder().encode(`${serverListText} Server List`))
    
    moveCursor(startRow + 12, rightStartCol)
    const appHandlerText = effectiveConfig.publishAppHandler ? colors.green('✓') : colors.gray('✗')
    Deno.stdout.writeSync(new TextEncoder().encode(`${appHandlerText} App Handler`))
    
    // Show deploy section
    if (this.state.pathConfirmed && !this.state.isEditingPath) {
      this.renderDeploySection(startRow + height - 10, width)
    }
    
    // Bottom instructions
    moveCursor(startRow + height - 6, 1)
    if (this.state.pathConfirmed && !this.state.isEditingPath) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Press [c] to customize config, [d] to deploy, [p] to change path')))
    } else {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Press [c] to customize session config, [Enter] to confirm path')))
    }
    
    // Error message if any
    if (this.state.errorMessage) {
      moveCursor(startRow + height - 4, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.red('❌ ' + this.state.errorMessage)))
    }
    
    // Authentication warning if needed
    if (!this.state.isAuthenticated) {
      moveCursor(startRow + height - 2, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.red('⚠️  Authentication required for deployment')))
    }
  }

  private renderDeploySection(startRow: number, width: number): void {
    if (this.state.showInlineConfirm) {
      // Show inline confirmation
      moveCursor(startRow, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bgYellow.black(' Confirm Deployment? ')))
      
      moveCursor(startRow + 1, 1)
      const effectiveConfig = this.getEffectiveConfig()
      Deno.stdout.writeSync(new TextEncoder().encode(`Deploy ${this.state.files.length} files with current settings?`))
      
      moveCursor(startRow + 2, 1)
      const configSummary = []
      if ((effectiveConfig as any).force) configSummary.push('force')
      if ((effectiveConfig as any).purge) configSummary.push('purge')
      if (effectiveConfig.publishProfile) configSummary.push('profile')
      if (effectiveConfig.publishRelayList) configSummary.push('relay-list')
      if (effectiveConfig.publishServerList) configSummary.push('server-list')
      if (effectiveConfig.publishAppHandler) configSummary.push('app-handler')
      
      const configText = configSummary.length > 0 ? `(${configSummary.join(', ')})` : '(default settings)'
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim(configText)))
      
      moveCursor(startRow + 4, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.green('[y] Yes') + '  ' + colors.red('[n] No')))
    } else {
      // Show deploy button
      const deployBadge = this.getDeployBadge()
      const badgeText = deployBadge.replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes for length calculation
      const badgeCol = Math.max(1, Math.floor((width - badgeText.length) / 2))
      moveCursor(startRow, badgeCol)
      Deno.stdout.writeSync(new TextEncoder().encode(deployBadge))
      
      moveCursor(startRow + 2, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(`${this.state.files.length} files ready • ${this.formatSize(this.state.stats.totalSize)}`))
    }
  }

  private renderConfigOverrides(startRow: number, width: number, height: number): void {
    moveCursor(startRow, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.cyan('⚙️  Session Configuration Overrides')))
    
    const overrideOptions = [
      { key: 'force', label: 'Force Deploy', type: 'boolean', value: this.state.sessionOverrides.force ?? (this.config as any).force },
      { key: 'purge', label: 'Purge Remote Files', type: 'boolean', value: this.state.sessionOverrides.purge ?? false },
      { key: 'publishProfile', label: 'Publish Profile', type: 'boolean', value: this.state.sessionOverrides.publishProfile ?? this.config.publishProfile },
      { key: 'publishRelayList', label: 'Publish Relay List', type: 'boolean', value: this.state.sessionOverrides.publishRelayList ?? this.config.publishRelayList },
      { key: 'publishServerList', label: 'Publish Server List', type: 'boolean', value: this.state.sessionOverrides.publishServerList ?? this.config.publishServerList },
      { key: 'publishAppHandler', label: 'Publish App Handler', type: 'boolean', value: this.state.sessionOverrides.publishAppHandler ?? this.config.publishAppHandler },
      { key: 'SEPARATOR', label: '─────────────────────', type: 'separator', value: false },
      { key: 'persistToProject', label: 'Save Changes to Project Config', type: 'action', value: false },
    ]
    
    moveCursor(startRow + 2, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Use ↑↓ to navigate, Space to toggle, Enter to apply, S to save to config, Esc to cancel')))
    
    overrideOptions.forEach((option, index) => {
      const row = startRow + 4 + index
      moveCursor(row, 1)
      
      const isSelected = index === this.state.selectedOverride
      const prefix = isSelected ? colors.cyan('→ ') : '  '
      
      let line = ''
      if (option.type === 'separator') {
        line = colors.dim(option.label)
      } else if (option.type === 'action') {
        line = `${prefix}${colors.bold.yellow(option.label)}`
      } else {
        const valueText = option.value ? colors.green('✓ enabled') : colors.gray('✗ disabled')
        line = `${prefix}${option.label}: ${valueText}`
      }
      
      if (isSelected && option.type !== 'separator') {
        Deno.stdout.writeSync(new TextEncoder().encode(colors.inverse(line)))
      } else {
        Deno.stdout.writeSync(new TextEncoder().encode(line))
      }
    })
    
    // Show current servers and relays
    moveCursor(startRow + 12, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Current Configuration:')))
    
    const effectiveConfig = this.getEffectiveConfig()
    moveCursor(startRow + 13, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(`Servers (${effectiveConfig.servers?.length || 0}): ${(effectiveConfig.servers || []).join(', ')}`))
    
    moveCursor(startRow + 14, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(`Relays (${effectiveConfig.relays?.length || 0}): ${(effectiveConfig.relays || []).join(', ')}`))
    
    // Instructions
    moveCursor(startRow + height - 4, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Note: Server/relay management coming soon.')))
    
    moveCursor(startRow + height - 2, 1)
    if (Object.keys(this.state.sessionOverrides).length > 0) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.yellow('⚠ Session overrides active - press S to save to project config')))
    } else {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('These settings affect this deployment only unless saved to project config.')))
    }
  }
  
  private renderLoadingState(startRow: number, width: number, height: number): void {
    const centerRow = startRow + Math.floor(height / 2)
    const centerCol = Math.floor(width / 2)
    
    moveCursor(centerRow - 1, centerCol - 10)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.cyan('Scanning website files...')))
    
    moveCursor(centerRow + 1, centerCol - 10)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Directory: ') + colors.yellow(this.state.deployPath)))
  }

  private renderSyncStatusView(startRow: number, width: number, height: number): void {
    // Show sync status overview with colored indicators
    const deployBadge = this.getDeployBadge()
    const badgeText = deployBadge.replace(/\x1b\[[0-9;]*m/g, '')
    const badgeCol = Math.max(1, Math.floor((width - badgeText.length) / 2))
    
    moveCursor(startRow + 1, badgeCol)
    Deno.stdout.writeSync(new TextEncoder().encode(deployBadge))
    
    // File sync summary
    const syncedFiles = this.state.files.filter(f => 
      f.servers && Object.values(f.servers).some(s => s.status === 'completed')
    ).length
    const localOnlyFiles = this.state.files.filter(f => 
      !f.servers || Object.values(f.servers).every(s => s.status !== 'completed')
    ).length
    
    moveCursor(startRow + 3, 1)
    const summaryParts = []
    if (syncedFiles > 0) summaryParts.push(colors.green(`${syncedFiles} synced`))
    if (localOnlyFiles > 0) summaryParts.push(colors.yellow(`${localOnlyFiles} local`))
    const summary = summaryParts.join(' • ') || colors.dim('No files')
    const summaryCol = Math.max(1, Math.floor((width - summary.replace(/\x1b\[[0-9;]*m/g, '').length) / 2))
    moveCursor(startRow + 3, summaryCol)
    Deno.stdout.writeSync(new TextEncoder().encode(summary))
    
    // Layout columns for sync status
    const gapWidth = 2
    const totalGaps = gapWidth
    const availableWidth = width - totalGaps
    
    const leftWidth = Math.floor(availableWidth * 0.4)
    const rightWidth = availableWidth - leftWidth
    
    const statusStartRow = startRow + 6
    const statusHeight = height - 8
    
    // Left: File sync overview
    this.renderFileSyncOverview(statusStartRow, 1, leftWidth, statusHeight)
    
    // Right: Endpoint propagation status
    this.renderEndpointPropagation(statusStartRow, 1 + leftWidth + gapWidth, rightWidth, statusHeight)
    
    // Show inline confirmation if active
    if (this.state.showInlineConfirm) {
      const dialogRow = startRow + Math.floor(height / 2)
      this.renderInlineConfirmDialog(dialogRow, width)
    }
  }

  private renderFileSyncOverview(startRow: number, startCol: number, width: number, height: number): void {
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('File Sync Status')))
    
    moveCursor(startRow + 1, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode('─'.repeat(width)))
    
    // Legend with better status indicators
    moveCursor(startRow + 2, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(
      `${colors.dim('○')} Not synced  ${colors.cyan('◐')} Partial  ${colors.white('●')} Synced  ${colors.red('✗')} Error`
    ))
    
    // File list with sync status
    const visibleFiles = this.state.files.slice(this.state.scrollOffset, this.state.scrollOffset + height - 4)
    
    visibleFiles.forEach((file, index) => {
      const row = startRow + 4 + index
      moveCursor(row, startCol)
      
      const syncStatus = this.getFileSyncStatus(file)
      const statusIcon = this.getSyncStatusIcon(syncStatus)
      const fileName = file.path.length > width - 4 ? 
        '...' + file.path.slice(-(width - 7)) : file.path
      
      const isSelected = (this.state.scrollOffset + index) === this.state.selectedFile
      const line = `${statusIcon} ${fileName}`
      
      if (isSelected) {
        Deno.stdout.writeSync(new TextEncoder().encode(colors.inverse(line)))
      } else {
        Deno.stdout.writeSync(new TextEncoder().encode(line))
      }
    })
  }

  private renderEndpointPropagation(startRow: number, startCol: number, width: number, height: number): void {
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Endpoint Status')))
    
    moveCursor(startRow + 1, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode('─'.repeat(width)))
    
    const servers = this.config.servers || []
    const relays = this.config.relays || []
    
    let currentRow = startRow + 3
    
    // Show servers
    if (servers.length > 0) {
      moveCursor(currentRow, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Servers:')))
      currentRow++
      
      servers.forEach(server => {
        if (currentRow >= startRow + height) return
        
        moveCursor(currentRow, startCol)
        const syncedCount = this.state.files.filter(f => 
          f.servers?.[server]?.status === 'completed'
        ).length
        
        const statusIcon = syncedCount === this.state.files.length ? colors.green('●') :
                          syncedCount > 0 ? colors.yellow('◐') : colors.gray('○')
        
        const serverName = server.length > width - 15 ? 
          server.slice(0, width - 18) + '...' : server
        
        Deno.stdout.writeSync(new TextEncoder().encode(
          `${statusIcon} ${serverName} ${colors.dim(`(${syncedCount}/${this.state.files.length})`)}`
        ))
        currentRow++
      })
    }
    
    // Show relays
    if (relays.length > 0 && currentRow < startRow + height - 2) {
      currentRow++ // Add spacing
      moveCursor(currentRow, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Relays:')))
      currentRow++
      
      relays.forEach(relay => {
        if (currentRow >= startRow + height) return
        
        moveCursor(currentRow, startCol)
        const publishedCount = this.state.files.filter(f => 
          f.relays?.[relay]?.status === 'published'
        ).length
        
        const statusIcon = publishedCount === this.state.files.length ? colors.green('●') :
                          publishedCount > 0 ? colors.yellow('◐') : colors.gray('○')
        
        const relayName = relay.length > width - 15 ? 
          relay.slice(0, width - 18) + '...' : relay
        
        Deno.stdout.writeSync(new TextEncoder().encode(
          `${statusIcon} ${relayName} ${colors.dim(`(${publishedCount}/${this.state.files.length})`)}`
        ))
        currentRow++
      })
    }
  }

  private getFileSyncStatus(file: UploadFileStatus): 'synced' | 'local' | 'error' | 'partial' {
    // If we're not actively deploying and have nsite context, use actual sync data
    if (!this.state.isDeploying && this.nsiteContext?.files) {
      const nsiteFile = this.nsiteContext.files.find(f => f.path === file.path)
      if (nsiteFile) {
        return getFileSyncStatus(
          {
            foundOnRelays: nsiteFile.foundOnRelays || [],
            availableOnServers: nsiteFile.availableOnServers || []
          },
          this.config.relays || [],
          this.config.servers || []
        )
      }
    }
    
    // Fall back to upload status during deployment
    const hasServerSync = file.servers && Object.values(file.servers).some(s => s.status === 'completed')
    const hasRelaySync = file.relays && Object.values(file.relays).some(r => r.status === 'published')
    const hasErrors = (file.servers && Object.values(file.servers).some(s => s.status === 'failed')) ||
                     (file.relays && Object.values(file.relays).some(r => r.status === 'failed'))
    
    if (hasErrors) return 'error'
    if (hasServerSync && hasRelaySync) return 'synced'
    if (hasServerSync || hasRelaySync) return 'partial'
    return 'local'
  }

  private getSyncStatusIcon(status: 'synced' | 'local' | 'error' | 'partial'): string {
    const color = getSyncStatusColor(status)
    const symbol = getSyncStatusSymbol(status)
    return color(symbol)
  }

  private renderInlineConfirmDialog(startRow: number, width: number): void {
    // Clear a few lines for the dialog
    for (let i = 0; i < 6; i++) {
      moveCursor(startRow + i, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(' '.repeat(width - 2)))
    }
    
    // Dialog box
    const boxWidth = Math.min(60, width - 10)
    const boxStartCol = Math.max(1, Math.floor((width - boxWidth) / 2))
    
    // Top border
    moveCursor(startRow, boxStartCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.yellow('┌' + '─'.repeat(boxWidth - 2) + '┐')))
    
    // Title
    moveCursor(startRow + 1, boxStartCol)
    const title = '│ ' + colors.bold('Confirm Deployment?') + ' '.repeat(boxWidth - 22) + '│'
    Deno.stdout.writeSync(new TextEncoder().encode(colors.yellow(title)))
    
    // Summary
    moveCursor(startRow + 2, boxStartCol)
    const summary = `│ Deploy ${this.state.files.length} files to ${(this.config.servers?.length || 0) + (this.config.relays?.length || 0)} endpoints`
    const summaryPadding = ' '.repeat(boxWidth - summary.replace(/\x1b\[[0-9;]*m/g, '').length - 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.yellow(summary + summaryPadding + '│')))
    
    // Options
    moveCursor(startRow + 3, boxStartCol)
    const effectiveConfig = this.getEffectiveConfig()
    const options = []
    if ((effectiveConfig as any).force) options.push('force')
    if ((effectiveConfig as any).purge) options.push('purge')
    const optionText = options.length > 0 ? `with ${options.join(', ')}` : 'with default settings'
    const optionLine = `│ ${colors.dim(optionText)}`
    const optionPadding = ' '.repeat(boxWidth - optionLine.replace(/\x1b\[[0-9;]*m/g, '').length - 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.yellow(optionLine + optionPadding + '│')))
    
    // Actions
    moveCursor(startRow + 4, boxStartCol)
    const actions = '│ ' + colors.green.bold('[Y]es') + '    ' + colors.red.bold('[N]o') + ' '.repeat(boxWidth - 16) + '│'
    Deno.stdout.writeSync(new TextEncoder().encode(colors.yellow(actions)))
    
    // Bottom border
    moveCursor(startRow + 5, boxStartCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.yellow('└' + '─'.repeat(boxWidth - 2) + '┘')))
  }

  private renderCompletionView(startRow: number, width: number, height: number): void {
    // Show completion summary with sync status
    const duration = this.state.stats.endTime! - this.state.stats.startTime!
    
    // Determine deployment outcome
    const hasUploads = this.state.stats.uploadedFiles > 0
    const hasFailures = this.state.stats.failedFiles > 0
    const onlySkipped = this.state.stats.skippedFiles > 0 && !hasUploads && !hasFailures
    
    // Title based on outcome
    moveCursor(startRow + 1, 1)
    const titleText = hasFailures ? colors.bold.red('❌ Deployment Failed') :
                     hasUploads ? colors.bold.green('✅ Deployment Complete') :
                     onlySkipped ? colors.bold.blue('ℹ️  All Files Up to Date') :
                     colors.bold.yellow('⚠️  No Changes')
    const titleCol = Math.max(1, Math.floor((width - titleText.replace(/\x1b\[[0-9;]*m/g, '').length) / 2))
    moveCursor(startRow + 1, titleCol)
    Deno.stdout.writeSync(new TextEncoder().encode(titleText))
    
    // Summary stats
    moveCursor(startRow + 3, 1)
    const statsParts = []
    if (this.state.stats.uploadedFiles > 0) {
      statsParts.push(colors.green(`${this.state.stats.uploadedFiles} deployed`))
    }
    if (this.state.stats.failedFiles > 0) {
      statsParts.push(colors.red(`${this.state.stats.failedFiles} failed`))
    }
    if (this.state.stats.skippedFiles > 0) {
      statsParts.push(colors.yellow(`${this.state.stats.skippedFiles} skipped`))
    }
    
    const statsText = statsParts.join(' • ') + ` • ${colors.blue(this.formatDuration(duration))}`
    const statsCol = Math.max(1, Math.floor((width - statsText.replace(/\x1b\[[0-9;]*m/g, '').length) / 2))
    moveCursor(startRow + 3, statsCol)
    Deno.stdout.writeSync(new TextEncoder().encode(statsText))
    
    // Show the same sync status view as before but with completion context
    const statusStartRow = startRow + 6
    const statusHeight = height - 8
    
    // Layout columns
    const gapWidth = 2
    const availableWidth = width - gapWidth
    const leftWidth = Math.floor(availableWidth * 0.4)
    const rightWidth = availableWidth - leftWidth
    
    // Left: File sync overview
    this.renderFileSyncOverview(statusStartRow, 1, leftWidth, statusHeight)
    
    // Right: Endpoint propagation status
    this.renderEndpointPropagation(statusStartRow, 1 + leftWidth + gapWidth, rightWidth, statusHeight)
  }

  private calculateMaxSymbols(): number {
    // Calculate max possible symbols from config
    const servers = this.config.servers?.length || 0
    const relays = this.config.relays?.length || 0
    return servers + relays
  }

  private renderTimeline(startRow: number, height: number, width: number): void {
    moveCursor(startRow, 1)
    
    if (this.state.isDeploying) {
      // Show active timeline
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Deploy Timeline')))
      moveCursor(startRow + 1, 1)
      Deno.stdout.writeSync(new TextEncoder().encode('─'.repeat(width - 2)))
      
      // Render timeline entries
      for (let i = 0; i < this.state.concurrency; i++) {
        const row = startRow + 2 + i
        moveCursor(row, 1)
        
        const entry = this.state.timeline[i]
        if (entry) {
          const progressBar = this.createProgressBar(entry.progress, 40)
          const statusColor = entry.status === 'completed' ? colors.green : 
                             entry.status === 'failed' ? colors.red : colors.yellow
          const typeIcon = entry.type === 'upload' ? '📤' : '📡'
          
          Deno.stdout.writeSync(new TextEncoder().encode(`${typeIcon} ${statusColor(entry.fileName)} ${progressBar}`))
        } else {
          Deno.stdout.writeSync(new TextEncoder().encode(' '.repeat(width - 2)))
        }
      }
    } else if (this.state.stats.endTime) {
      // Show completion stats only
      this.renderCompletionStats(startRow, height, width)
    }
    // Don't show deploy button here - it's shown in renderReadyToDeploy
  }

  private renderDeployButton(startRow: number, height: number, width: number): void {
    moveCursor(startRow, 1)
    
    if (!this.state.isAuthenticated) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.red('❌ Deploy unavailable: Authentication required')))
      moveCursor(startRow + 1, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Switch to an authenticated identity to deploy')))
    } else if (this.state.files.length === 0) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.yellow('⚠️  No files to deploy')))
    } else {
      if (this.state.showInlineConfirm) {
        // Show inline confirmation
        moveCursor(startRow, 1)
        Deno.stdout.writeSync(new TextEncoder().encode(colors.bgYellow.black(' Confirm Deployment? ')))
        
        moveCursor(startRow + 1, 1)
        const effectiveConfig = this.getEffectiveConfig()
        Deno.stdout.writeSync(new TextEncoder().encode(`Deploy ${this.state.files.length} files with current settings?`))
        
        moveCursor(startRow + 2, 1)
        const configSummary = []
        if ((effectiveConfig as any).force) configSummary.push('force')
        if ((effectiveConfig as any).purge) configSummary.push('purge')
        if (effectiveConfig.publishProfile) configSummary.push('profile')
        if (effectiveConfig.publishRelayList) configSummary.push('relay-list')
        if (effectiveConfig.publishServerList) configSummary.push('server-list')
        if (effectiveConfig.publishAppHandler) configSummary.push('app-handler')
        
        const configText = configSummary.length > 0 ? `(${configSummary.join(', ')})` : '(default settings)'
        Deno.stdout.writeSync(new TextEncoder().encode(colors.dim(configText)))
        
        moveCursor(startRow + 4, 1)
        Deno.stdout.writeSync(new TextEncoder().encode(colors.green('[y] Yes') + '  ' + colors.red('[n] No')))
      } else {
        // Show deploy status badge (centered)
        const deployBadge = this.getDeployBadge()
        const badgeText = deployBadge.replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes for length calculation
        const badgeCol = Math.max(1, Math.floor((width - badgeText.length) / 2))
        moveCursor(startRow, badgeCol)
        Deno.stdout.writeSync(new TextEncoder().encode(deployBadge))
      }
      
      moveCursor(startRow + 2, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(`${this.state.files.length} files • ${this.formatSize(this.state.stats.totalSize)}`))
      
      // Show current path
      moveCursor(startRow + 4, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Current path: ') + colors.cyan(this.state.currentPath)))
      
      // Show configuration info
      moveCursor(startRow + 5, 1)
      const servers = this.config.servers || []
      const relays = this.config.relays || []
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim(`Config: ${servers.length} servers, ${relays.length} relays`)))
      
      // Show error message if there is one
      if (this.state.errorMessage) {
        moveCursor(startRow + 7, 1)
        const errorText = colors.red('⚠ ' + this.state.errorMessage)
        const errorCol = Math.max(1, Math.floor((width - errorText.replace(/\x1b\[[0-9;]*m/g, '').length) / 2))
        moveCursor(startRow + 7, errorCol)
        Deno.stdout.writeSync(new TextEncoder().encode(errorText))
        
        // Clear error after 5 seconds
        if (!this.state.isDeploying) {
          // Clear any existing error timeout
          if (this.state.errorTimeoutId) {
            clearTimeout(this.state.errorTimeoutId)
          }
          
          this.state.errorTimeoutId = setTimeout(() => {
            this.state.errorMessage = undefined
            this.state.errorTimeoutId = undefined
          }, 5000)
        }
      }
    }
  }

  private renderCompletionStats(startRow: number, height: number, width: number): void {
    const duration = this.state.stats.endTime! - this.state.stats.startTime!
    
    // Determine deployment outcome
    const hasUploads = this.state.stats.uploadedFiles > 0
    const hasFailures = this.state.stats.failedFiles > 0
    const onlySkipped = this.state.stats.skippedFiles > 0 && !hasUploads && !hasFailures
    
    // Title based on outcome
    moveCursor(startRow, 1)
    if (hasFailures) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.red('❌ Deployment Failed')))
    } else if (hasUploads) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.green('✅ Deployment Complete')))
    } else if (onlySkipped) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.blue('ℹ️  All Files Up to Date')))
    } else {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.yellow('⚠️  No Changes')))
    }
    
    // File deployment stats: Deployed / Failed / Skipped
    moveCursor(startRow + 1, 1)
    const statsParts = []
    if (this.state.stats.uploadedFiles > 0) {
      statsParts.push(colors.green(`${this.state.stats.uploadedFiles} deployed`))
    }
    if (this.state.stats.failedFiles > 0) {
      statsParts.push(colors.red(`${this.state.stats.failedFiles} failed`))
    }
    if (this.state.stats.skippedFiles > 0) {
      statsParts.push(colors.yellow(`${this.state.stats.skippedFiles} skipped`))
    }
    
    const filesText = statsParts.length > 0 ? `Files: ${statsParts.join(' • ')}` : 'Files: none processed'
    Deno.stdout.writeSync(new TextEncoder().encode(`${filesText} • ${colors.blue(this.formatDuration(duration))}`))
    
    // Meta events stats (only show if there were events published)
    const metaEventParts = []
    if (this.state.stats.profileEvents > 0) metaEventParts.push(`${this.state.stats.profileEvents} profile`)
    if (this.state.stats.relayListEvents > 0) metaEventParts.push(`${this.state.stats.relayListEvents} relay list`)
    if (this.state.stats.serverListEvents > 0) metaEventParts.push(`${this.state.stats.serverListEvents} server list`)
    if (this.state.stats.appHandlerEvents > 0) metaEventParts.push(`${this.state.stats.appHandlerEvents} app handler`)
    
    if (metaEventParts.length > 0) {
      moveCursor(startRow + 2, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(`Meta events: ${colors.green(metaEventParts.join(', '))}`))
    }
  }

  private renderProgressGrid(startRow: number, startCol: number, width: number, height: number): void {
    // Only show upload progress grid if files are being processed
    const activeFiles = this.state.files.filter(f => 
      f.status !== 'pending'
    )
    
    if (activeFiles.length > 0) {
      moveCursor(startRow, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Upload Progress')))
      
      // Calculate grid dimensions
      const blocksPerRow = Math.floor(width / 2)
      const totalBlocks = activeFiles.length
      const gridRows = Math.ceil(totalBlocks / blocksPerRow)
      const maxGridRows = Math.max(1, Math.floor(height * 0.7)) // Use 70% of space for grid
      
      // Render file blocks for active files only
      for (let row = 0; row < Math.min(gridRows, maxGridRows); row++) {
        moveCursor(startRow + 2 + row, startCol)
        let line = ''
        
        for (let col = 0; col < blocksPerRow; col++) {
          const fileIndex = row * blocksPerRow + col
          if (fileIndex < activeFiles.length) {
            const file = activeFiles[fileIndex]
            const block = this.getFileBlock(file)
            line += block + ' '
          } else {
            line += '  '
          }
        }
        
        Deno.stdout.writeSync(new TextEncoder().encode(line))
      }
      
      // Show active connections if deploying
      if (this.state.isDeploying) {
        const connectionRow = startRow + 2 + Math.min(gridRows, maxGridRows) + 1
        this.renderActiveConnections(connectionRow, startCol, width, height - (connectionRow - startRow))
      }
    } else if (this.state.stats.endTime) {
      // Show completion summary for completed deployments
      this.renderCompletionSummary(startRow, startCol, width, height)
    }
  }

  private renderActiveConnections(startRow: number, startCol: number, width: number, height: number): void {
    // Only show connections that are actually active
    const servers = this.config.servers || []
    const relays = this.config.relays || []
    
    const activeServers = servers.filter(server => 
      this.getConnectionStatus(server, 'server') !== 'inactive'
    )
    const activeRelays = relays.filter(relay => 
      this.getConnectionStatus(relay, 'relay') !== 'inactive'
    )
    
    if (activeServers.length === 0 && activeRelays.length === 0) return
    
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Active Connections')))
    
    let currentRow = startRow + 1
    
    // Show active servers
    if (activeServers.length > 0 && currentRow < startRow + height - 1) {
      moveCursor(currentRow, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Servers:')))
      currentRow++
      
      for (const server of activeServers.slice(0, Math.min(activeServers.length, height - 3))) {
        if (currentRow >= startRow + height) break
        moveCursor(currentRow, startCol)
        
        const status = this.getConnectionStatus(server, 'server')
        const statusColor = this.getConnectionColor(status)
        const statusIcon = this.getConnectionIcon(status)
        
        Deno.stdout.writeSync(new TextEncoder().encode(`${statusIcon} ${statusColor(server.slice(0, width - 4))}`))
        currentRow++
      }
    }
    
    // Show active relays
    if (activeRelays.length > 0 && currentRow < startRow + height - 1) {
      if (activeServers.length > 0) currentRow++ // Add spacing
      
      moveCursor(currentRow, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Relays:')))
      currentRow++
      
      for (const relay of activeRelays.slice(0, Math.min(activeRelays.length, height - (currentRow - startRow)))) {
        if (currentRow >= startRow + height) break
        moveCursor(currentRow, startCol)
        
        const status = this.getConnectionStatus(relay, 'relay')
        const statusColor = this.getConnectionColor(status)
        const statusIcon = this.getConnectionIcon(status)
        
        Deno.stdout.writeSync(new TextEncoder().encode(`${statusIcon} ${statusColor(relay.slice(0, width - 4))}`))
        currentRow++
      }
    }
  }

  private renderCompletionSummary(startRow: number, startCol: number, width: number, height: number): void {
    // Check what actually happened
    const hasUploads = this.state.stats.uploadedFiles > 0
    const hasSkips = this.state.stats.skippedFiles > 0
    const hasFailures = this.state.stats.failedFiles > 0
    const hasMetaEvents = this.state.stats.profileEvents > 0 || 
                         this.state.stats.relayListEvents > 0 || 
                         this.state.stats.serverListEvents > 0 || 
                         this.state.stats.appHandlerEvents > 0
    
    if (!hasUploads && !hasSkips && !hasFailures && !hasMetaEvents) {
      // Nothing happened at all
      return
    }
    
    moveCursor(startRow, startCol)
    if (hasUploads) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.green('✅ Upload Complete')))
    } else if (hasSkips && !hasFailures) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.blue('ℹ️  Already Deployed')))
    } else if (hasFailures) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.red('❌ Upload Failed')))
    }
    
    // Show compact stats
    const stats = []
    if (hasUploads) stats.push(colors.green(`${this.state.stats.uploadedFiles} uploaded`))
    if (hasSkips) stats.push(colors.yellow(`${this.state.stats.skippedFiles} skipped`))
    if (hasFailures) stats.push(colors.red(`${this.state.stats.failedFiles} failed`))
    
    if (stats.length > 0) {
      moveCursor(startRow + 2, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(stats.join(' • ')))
    }
    
    // Show size if we have it
    if (this.state.stats.totalSize > 0) {
      moveCursor(startRow + 3, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim(`${this.formatSize(this.state.stats.totalSize)} total`)))
    }
    
    // Show duration if completed
    if (this.state.stats.endTime && this.state.stats.startTime) {
      const duration = this.state.stats.endTime - this.state.stats.startTime
      moveCursor(startRow + 4, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim(`${this.formatDuration(duration)}`)))
    }
  }

  private renderConnectionStatuses(startRow: number, startCol: number, width: number, height: number): void {
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Connections')))
    
    // Get servers and relays from identity context
    const servers = this.config.servers || []
    const relays = this.config.relays || []
    
    let currentRow = startRow + 1
    
    // Render server connections
    if (servers.length > 0) {
      moveCursor(currentRow, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Servers:')))
      currentRow++
      
      for (const server of servers.slice(0, Math.min(servers.length, height - 3))) {
        moveCursor(currentRow, startCol)
        const status = this.getConnectionStatus(server, 'server')
        const statusColor = this.getConnectionColor(status)
        const statusIcon = this.getConnectionIcon(status)
        
        Deno.stdout.writeSync(new TextEncoder().encode(`${statusIcon} ${statusColor(server.slice(0, width - 4))}`))
        currentRow++
      }
    }
    
    // Render relay connections
    if (relays.length > 0 && currentRow < startRow + height - 1) {
      moveCursor(currentRow, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Relays:')))
      currentRow++
      
      for (const relay of relays.slice(0, Math.min(relays.length, height - (currentRow - startRow)))) {
        if (currentRow >= startRow + height) break
        moveCursor(currentRow, startCol)
        
        const status = this.getConnectionStatus(relay, 'relay')
        const statusColor = this.getConnectionColor(status)
        const statusIcon = this.getConnectionIcon(status)
        
        Deno.stdout.writeSync(new TextEncoder().encode(`${statusIcon} ${statusColor(relay.slice(0, width - 4))}`))
        currentRow++
      }
    }
  }

  private getConnectionStatus(endpoint: string, type: 'server' | 'relay'): 'inactive' | 'connecting' | 'connected' | 'error' {
    // When not deploying, all connections are inactive
    if (!this.state.isDeploying) {
      return 'inactive'
    }
    
    // During deployment, check if any files are being uploaded to this endpoint
    const hasActiveFiles = this.state.files.some(file => {
      if (type === 'server') {
        const serverStatus = file.servers?.[endpoint]
        return serverStatus?.status === 'uploading' || serverStatus?.status === 'completed'
      } else {
        const relayStatus = file.relays?.[endpoint]
        return relayStatus?.status === 'publishing' || relayStatus?.status === 'published'
      }
    })
    
    if (hasActiveFiles) {
      // Check if currently active
      const isCurrentlyActive = this.state.files.some(file => {
        if (type === 'server') {
          return file.servers?.[endpoint]?.status === 'uploading'
        } else {
          return file.relays?.[endpoint]?.status === 'publishing'
        }
      })
      
      return isCurrentlyActive ? 'connecting' : 'connected'
    }
    
    return 'inactive'
  }

  private getConnectionColor(status: string): (str: string) => string {
    switch (status) {
      case 'connected': return colors.green
      case 'connecting': return colors.yellow
      case 'error': return colors.red
      case 'inactive':
      default: return colors.gray
    }
  }

  private getConnectionIcon(status: string): string {
    switch (status) {
      case 'connected': return '●'
      case 'connecting': return '○'
      case 'error': return '✗'
      case 'inactive':
      default: return '○'
    }
  }

  private getFileBlock(file: UploadFileStatus): string {
    // Check if file is synced to any endpoint
    const hasServerSync = file.servers && Object.values(file.servers).some(s => s.status === 'completed')
    const hasRelaySync = file.relays && Object.values(file.relays).some(r => r.status === 'published')
    
    if (file.status === 'uploading') return colors.yellow('◐')
    if (file.status === 'publishing') return colors.blue('◑')
    if (file.status === 'failed') return colors.red('✗')
    
    // Show sync state instead of just "completed"
    if (hasServerSync && hasRelaySync) {
      return colors.white('■')  // Fully synced
    } else if (hasServerSync || hasRelaySync) {
      return colors.cyan('◧')   // Partially synced
    } else {
      return colors.gray('□')   // Not synced
    }
  }

  private renderFileStatus(startRow: number, startCol: number, width: number, height: number): void {
    // Only show files that are active or recently completed
    const activeFiles = this.state.files.filter(f => 
      f.status !== 'pending' || this.state.isDeploying
    )
    
    if (activeFiles.length === 0) return
    
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('File Activity')))
    
    // Sort files by priority: Active -> Recent Success -> Recent Failure
    const sortedFiles = this.getSortedActiveFiles(activeFiles)
    const visibleFiles = sortedFiles.slice(this.state.scrollOffset, this.state.scrollOffset + height - 2)
    
    if (visibleFiles.length === 0) {
      moveCursor(startRow + 2, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('No active files')))
      return
    }
    
    visibleFiles.forEach((file, index) => {
      const row = startRow + 2 + index
      moveCursor(row, startCol)
      
      const isSelected = (this.state.scrollOffset + index) === this.state.selectedFile
      const fileName = file.path.length > width - 20 ? 
        '...' + file.path.slice(-(width - 23)) : file.path
      
      const statusIcon = this.getFileBlock(file)
      const progressBar = this.createProgressBar(file.progress, 8)
      
      let line = `${statusIcon} ${this.getColoredFileName(fileName, file.status)}`
      if (file.status === 'uploading' || file.status === 'publishing') {
        line += ` ${progressBar}`
      }
      
      if (isSelected) {
        Deno.stdout.writeSync(new TextEncoder().encode(colors.inverse(line)))
      } else {
        Deno.stdout.writeSync(new TextEncoder().encode(line))
      }
    })
  }

  private getSortedActiveFiles(files: UploadFileStatus[]): UploadFileStatus[] {
    const now = Date.now()
    
    return files.sort((a, b) => {
      // Active files first
      if ((a.status === 'uploading' || a.status === 'publishing') && 
          !(b.status === 'uploading' || b.status === 'publishing')) {
        return -1
      }
      if (!(a.status === 'uploading' || a.status === 'publishing') && 
          (b.status === 'uploading' || b.status === 'publishing')) {
        return 1
      }
      
      // Then by most recent activity
      const aTime = a.uploadEndTime || a.uploadStartTime || 0
      const bTime = b.uploadEndTime || b.uploadStartTime || 0
      if (aTime !== bTime) {
        return bTime - aTime
      }
      
      // Finally by path
      return a.path.localeCompare(b.path)
    })
  }

  private getSortedFiles(): UploadFileStatus[] {
    const now = Date.now()
    
    // Filter out success/failure items that should disappear after 1 second
    const visibleFiles = this.state.files.filter(file => {
      if (file.status === 'completed' || file.status === 'published') {
        return !file.uploadEndTime || (now - file.uploadEndTime) < 1000
      }
      if (file.status === 'failed') {
        return !file.uploadEndTime || (now - file.uploadEndTime) < 1000
      }
      return true
    })
    
    // Sort by priority: Success -> Failure -> Active -> Idle
    return visibleFiles.sort((a, b) => {
      const priorityA = this.getFilePriority(a)
      const priorityB = this.getFilePriority(b)
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }
      
      // Within same priority, sort by path
      return a.path.localeCompare(b.path)
    })
  }

  private getFilePriority(file: UploadFileStatus): number {
    switch (file.status) {
      case 'completed':
      case 'published':
        return 1 // Success (highest priority)
      case 'failed':
        return 2 // Failure
      case 'uploading':
      case 'publishing':
        return 3 // Active
      case 'pending':
      default:
        return 4 // Idle (lowest priority)
    }
  }

  private getColoredFileName(fileName: string, status: UploadFileStatus['status']): string {
    switch (status) {
      case 'completed':
      case 'published':
        return colors.green(fileName)
      case 'failed':
        return colors.red(fileName)
      case 'uploading':
      case 'publishing':
        return colors.cyan(fileName)
      case 'pending':
      default:
        return colors.dim(fileName)
    }
  }

  private renderFilePropagation(startRow: number, startCol: number, width: number, height: number): void {
    // Show all files with their propagation status
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('File Propagation')))
    
    // Calculate symbol column widths (like browse view)
    const servers = this.config.servers || []
    const relays = this.config.relays || []
    const maxRelayCount = Math.min(relays.length, 8) // Cap at 8 to save space
    const maxServerCount = Math.min(servers.length, 8) // Cap at 8 to save space
    const symbolWidth = maxRelayCount + 3 + maxServerCount // relays + " | " + servers
    const nameWidth = Math.max(width - symbolWidth - 5, 20) // Ensure minimum name width
    
    // Render header with pagination info
    moveCursor(startRow + 1, startCol)
    const totalPages = Math.ceil(this.state.files.length / this.state.propagationPageSize)
    const pageInfo = totalPages > 1 ? ` (${this.state.propagationPage + 1}/${totalPages})` : ''
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('─'.repeat(Math.max(10, width - 2 - pageInfo.length)) + pageInfo)))
    
    // Use shared component to render legend
    const legendLines = renderSyncLegend(
      relays.slice(0, maxRelayCount),
      servers.slice(0, maxServerCount),
      this.relayColorMap,
      this.serverColorMap
    )
    
    // Display legend inline (relays and servers on same line to save space)
    let currentCol = startCol
    let legendRow = startRow + 2
    
    // Show relays
    moveCursor(legendRow, currentCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Relays: ')))
    currentCol += 8
    
    relays.slice(0, maxRelayCount).forEach((relay, index) => {
      const colorFn = this.relayColorMap.get(relay) || colors.white
      const relayHost = relay.replace(/^wss?:\/\//, '').split('/')[0].split(':')[0]
      const truncatedHost = relayHost.length > 12 ? relayHost.slice(0, 10) + '..' : relayHost
      
      moveCursor(legendRow, currentCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colorFn(RELAY_SYMBOL + ' ' + truncatedHost)))
      currentCol += truncatedHost.length + 4
    })
    
    // Separator
    moveCursor(legendRow, currentCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.gray(' │ ')))
    currentCol += 3
    
    // Show servers
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Servers: ')))
    currentCol += 9
    
    servers.slice(0, maxServerCount).forEach((server, index) => {
      const colorFn = this.serverColorMap.get(server) || colors.white
      const serverHost = server.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
      const truncatedHost = serverHost.length > 12 ? serverHost.slice(0, 10) + '..' : serverHost
      
      moveCursor(legendRow, currentCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colorFn(SERVER_SYMBOL + ' ' + truncatedHost)))
      currentCol += truncatedHost.length + 4
    })
    
    // Calculate paginated file slice
    const startIndex = this.state.propagationPage * this.state.propagationPageSize
    const endIndex = Math.min(startIndex + this.state.propagationPageSize, this.state.files.length)
    const paginatedFiles = this.state.files.slice(startIndex, endIndex)
    
    if (paginatedFiles.length === 0) {
      moveCursor(startRow + 4, startCol)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('No files to display')))
      return
    }
    
    // Group paginated files by directory for tree structure
    const fileTree = this.buildFileTree(paginatedFiles)
    
    let currentRow = startRow + 4
    const maxRows = height - 4
    
    this.renderFileTree(fileTree, currentRow, startCol, nameWidth, symbolWidth, maxRows, '', maxRelayCount, maxServerCount)
  }

  private buildFileTree(files: UploadFileStatus[]): Record<string, any> {
    const tree: Record<string, any> = {}
    
    files.forEach(file => {
      const parts = file.path.split('/')
      let current = tree
      
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = index === parts.length - 1 ? { __file: file } : {}
        }
        current = current[part]
      })
    })
    
    return tree
  }

  private renderFileTree(
    tree: Record<string, any>, 
    startRow: number, 
    startCol: number, 
    nameWidth: number, 
    symbolWidth: number, 
    maxRows: number, 
    prefix: string,
    maxRelayCount: number,
    maxServerCount: number,
    currentRow: number = startRow
  ): number {
    const entries = Object.entries(tree)
    
    entries.forEach(([name, subtree], index) => {
      if (currentRow >= startRow + maxRows) return currentRow
      
      const isLast = index === entries.length - 1
      const isFile = subtree && typeof subtree === 'object' && subtree.__file
      
      moveCursor(currentRow, startCol)
      
      // Tree structure characters
      const connector = isLast ? '└─ ' : '├─ '
      const displayName = name.length > nameWidth - prefix.length - 4 
        ? name.slice(0, nameWidth - prefix.length - 7) + '...'
        : name
      
      if (isFile) {
        // Show file with propagation symbols (like browse view)
        const file = subtree.__file as UploadFileStatus
        const symbols = this.getFilePropagationSymbols(file, maxRelayCount, maxServerCount)
        const treePrefix = `${prefix}${connector}`
        const fileName = colors.white(displayName)
        
        Deno.stdout.writeSync(new TextEncoder().encode(`${symbols} ${colors.gray(treePrefix)}${fileName}`))
      } else {
        // Show directory
        const emptyIndicators = ' '.repeat(maxRelayCount) + ` ${colors.gray('|')} ` + ' '.repeat(maxServerCount)
        const treePrefix = `${prefix}${connector}`
        const dirName = colors.gray(displayName + '/')
        
        Deno.stdout.writeSync(new TextEncoder().encode(`${emptyIndicators} ${colors.gray(treePrefix)}${dirName}`))
      }
      
      currentRow++
      
      // Recurse into subdirectories
      if (!isFile && subtree && typeof subtree === 'object' && Object.keys(subtree).length > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ')
        currentRow = this.renderFileTree(subtree, startRow, startCol, nameWidth, symbolWidth, maxRows, newPrefix, maxRelayCount, maxServerCount, currentRow)
      }
    })
    
    return currentRow
  }

  private getFilePropagationSymbols(file: UploadFileStatus, maxRelayCount: number, maxServerCount: number): string {
    // If we're not actively deploying and have nsite context, use the actual sync data
    if (!this.state.isDeploying && this.nsiteContext?.files) {
      // Find the corresponding file in nsite context
      const nsiteFile = this.nsiteContext.files.find(f => f.path === file.path)
      if (nsiteFile) {
        // Use the shared component to render indicators based on actual sync status
        return renderSyncIndicators(
          {
            foundOnRelays: nsiteFile.foundOnRelays || [],
            availableOnServers: nsiteFile.availableOnServers || []
          },
          {
            relayColorMap: this.relayColorMap,
            serverColorMap: this.serverColorMap,
            maxRelayCount,
            maxServerCount,
            separator: ` ${colors.gray('│')} `
          }
        )
      }
    }
    
    // Fall back to upload status indicators during active deployment
    const relays = this.config.relays || []
    const servers = this.config.servers || []
    
    // Build relay indicators
    let relayIndicators = ''
    relays.forEach((relay, index) => {
      if (index < maxRelayCount) {
        const relayStatus = file.relays?.[relay]
        const colorFn = this.relayColorMap.get(relay) || colors.white
        
        if (relayStatus?.status === 'published') {
          relayIndicators += colorFn(RELAY_SYMBOL)
        } else if (relayStatus?.status === 'publishing') {
          relayIndicators += colors.yellow(RELAY_SYMBOL)
        } else if (relayStatus?.status === 'failed') {
          relayIndicators += colors.red('✗')
        } else {
          relayIndicators += colors.gray('○')
        }
      }
    })
    relayIndicators += colors.gray('○'.repeat(Math.max(0, maxRelayCount - relays.length)))
    
    // Build server indicators
    let serverIndicators = ''
    servers.forEach((server, index) => {
      if (index < maxServerCount) {
        const serverStatus = file.servers?.[server]
        const colorFn = this.serverColorMap.get(server) || colors.white
        
        if (serverStatus?.status === 'completed') {
          serverIndicators += colorFn(SERVER_SYMBOL)
        } else if (serverStatus?.status === 'uploading') {
          serverIndicators += colors.yellow(SERVER_SYMBOL)
        } else if (serverStatus?.status === 'failed') {
          serverIndicators += colors.red('✗')
        } else {
          serverIndicators += colors.gray('○')
        }
      }
    })
    serverIndicators += colors.gray('○'.repeat(Math.max(0, maxServerCount - servers.length)))
    
    return `${relayIndicators} ${colors.gray('│')} ${serverIndicators}`
  }


  private createProgressBar(progress: number, width: number): string {
    const filled = Math.floor(progress / 100 * width)
    const empty = width - filled
    return colors.green('█'.repeat(filled)) + colors.gray('░'.repeat(empty))
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  private getDeployBadge(): string {
    if (this.state.errorMessage) {
      // Red background for error state
      return colors.bgRed.white(' ✗ ') + colors.bgRed.white.underline('D') + colors.bgRed.white('eploy Error ')
    } else if (this.state.isDeploying) {
      // Yellow background for active deployment
      return colors.bgYellow.black(' ▶ ') + colors.bgYellow.black.underline('D') + colors.bgYellow.black('eploying... ')
    } else if (this.state.stats.endTime) {
      const successRate = this.state.stats.totalFiles > 0 ? 
        (this.state.stats.uploadedFiles / this.state.stats.totalFiles) : 0
      if (successRate >= 0.9) {
        // Green background for successful deployment
        return colors.bgGreen.black(' ✓ ') + colors.bgGreen.black.underline('D') + colors.bgGreen.black('eployed ')
      } else if (successRate > 0) {
        // Yellow background for partial deployment
        return colors.bgYellow.black(' ⚠ ') + colors.bgYellow.black.underline('D') + colors.bgYellow.black('eployed (partial) ')
      } else {
        // Red background for failed deployment
        return colors.bgRed.white(' ✗ ') + colors.bgRed.white.underline('D') + colors.bgRed.white('eploy failed ')
      }
    } else {
      // Cyan background for ready to deploy
      return colors.bgCyan.black(' 🚀 ') + colors.bgCyan.black.underline('D') + colors.bgCyan.black('eploy ')
    }
  }

  async handleInput(event: KeyPressEvent): Promise<boolean> {
    const key = event.key || ''
    
    // Don't handle reserved global keys
    if (key === 'q' || (key >= '1' && key <= '4') || (event.ctrlKey && key === 'c')) {
      return false
    }
    
    // Don't handle identity switch key when not editing (let global handler take it)
    if (key === 'i' && !this.isEditing()) {
      return false
    }
    
    if (this.state.showInlineConfirm) {
      return this.handleInlineConfirm(event)
    }
    
    if (this.state.showConfigOverrides) {
      return this.handleConfigOverrideInput(event)
    }
    
    if (this.state.isEditingPath || !this.state.pathConfirmed) {
      return this.handlePathInput(event)
    }
    
    // Handle deploy hotkey
    if (key === 'd' || key === 'D') {
      if (!this.state.isDeploying && this.state.isAuthenticated && this.state.files.length > 0) {
        this.state.showInlineConfirm = true
        return true
      }
    }
    
    // Handle path change hotkey
    if (key === 'p' || key === 'P') {
      if (!this.state.isDeploying) {
        // Return to primary path selection screen
        this.state.pathConfirmed = false
        this.state.isEditingPath = true
        this.state.files = []
        this.state.deployPath = this.projectPath // Reset to original
        return true
      }
    }
    
    // Handle config override hotkey
    if (key === 'c' || key === 'C') {
      if (!this.state.isDeploying) {
        this.state.showConfigOverrides = true
        this.state.selectedOverride = 0 // Start on first boolean option
        return true
      }
    }
    
    switch (key) {
      case 'ArrowUp':
        if (this.state.selectedFile > 0) {
          this.state.selectedFile--
          if (this.state.selectedFile < this.state.scrollOffset) {
            this.state.scrollOffset--
          }
          return true
        }
        break
        
      case 'ArrowDown':
        if (this.state.selectedFile < this.state.files.length - 1) {
          this.state.selectedFile++
          const maxVisible = Math.floor(getTerminalSize().rows / 3) - 2
          if (this.state.selectedFile >= this.state.scrollOffset + maxVisible) {
            this.state.scrollOffset++
          }
          return true
        }
        break
        
      case 'ArrowLeft':
        // Previous page in propagation column
        if (this.state.propagationPage > 0) {
          this.state.propagationPage--
          return true
        }
        break
        
      case 'ArrowRight':
        // Next page in propagation column
        const maxPage = Math.ceil(this.state.files.length / this.state.propagationPageSize) - 1
        if (this.state.propagationPage < maxPage) {
          this.state.propagationPage++
          return true
        }
        break
        
      case 'r':
        if (!this.state.isDeploying && this.contextManager) {
          await this.contextManager.loadContext('upload')
          return true
        }
        break
    }
    
    return false
  }

  private async handlePathInput(event: KeyPressEvent): Promise<boolean> {
    const key = event.key || ''
    
    // Don't handle reserved global keys
    if (key === 'q' || (key >= '1' && key <= '4') || (event.ctrlKey && key === 'c')) {
      return false
    }
    
    // Handle config overrides mode
    if (this.state.showConfigOverrides) {
      return this.handleConfigOverrideInput(event)
    }
    
    // Handle 'c' key to show config overrides
    if (key === 'c' || key === 'C') {
      this.state.showConfigOverrides = true
      this.state.selectedOverride = 0 // Start on first boolean option
      return true
    }
    
    // Handle 'd' key to deploy (only when path is confirmed and not editing)
    if (key === 'd' || key === 'D') {
      if (this.state.pathConfirmed && !this.state.isEditingPath && this.state.isAuthenticated && this.state.files.length > 0) {
        this.state.showInlineConfirm = true
        return true
      }
    }
    
    // Handle Enter key variants
    if (key === 'Enter' || key === 'return' || key === '\r' || key === '\n') {
      if (this.state.pathConfirmed) {
        // Already confirmed, proceed to deploy
        this.state.isEditingPath = false
        await this.confirmPathAndLoadFiles()
        return true
      } else {
        // Confirm path and load files
        this.state.isEditingPath = false
        await this.confirmPathAndLoadFiles()
        return true
      }
    }
    
    // Handle Escape key
    if (key === 'Escape' || key === 'escape') {
      if (this.state.pathConfirmed) {
        // Already have files loaded, just stop editing
        this.state.isEditingPath = false
      } else {
        // Cancel and reset
        this.state.isEditingPath = false
        this.state.deployPath = this.projectPath // Reset to original
      }
      return true
    }
    
    // Only handle path editing when actually editing path
    if (!this.state.isEditingPath) {
      return false
    }
    
    // Handle Backspace key
    if (key === 'Backspace' || key === 'backspace') {
      if (this.state.deployPath.length > 0) {
        this.state.deployPath = this.state.deployPath.slice(0, -1)
        return true
      }
      return true
    }
    
    // Add character to path
    if (key.length === 1 && key !== '\r' && key !== '\n' && key !== '\t') {
      this.state.deployPath += key
      return true
    }
    
    return false
  }

  private handleConfigOverrideInput(event: KeyPressEvent): boolean {
    const key = event.key || ''
    
    // Don't handle reserved global keys
    if (key === 'q' || (key >= '1' && key <= '4') || (event.ctrlKey && key === 'c')) {
      return false
    }
    
    const overrideOptions = [
      { key: 'force', label: 'Force Deploy', type: 'boolean' },
      { key: 'purge', label: 'Purge Remote Files', type: 'boolean' },
      { key: 'publishProfile', label: 'Publish Profile', type: 'boolean' },
      { key: 'publishRelayList', label: 'Publish Relay List', type: 'boolean' },
      { key: 'publishServerList', label: 'Publish Server List', type: 'boolean' },
      { key: 'publishAppHandler', label: 'Publish App Handler', type: 'boolean' },
      { key: 'SEPARATOR', label: '─────────────────────', type: 'separator' },
      { key: 'persistToProject', label: 'Save Changes to Project Config', type: 'action' },
    ]
    
    switch (key) {
      case 'ArrowUp':
      case 'Up':
        if (this.state.selectedOverride > 0) {
          this.state.selectedOverride--
          // Skip separators
          while (this.state.selectedOverride > 0 && overrideOptions[this.state.selectedOverride]?.type === 'separator') {
            this.state.selectedOverride--
          }
        } else {
          // Wrap to bottom, find last non-separator
          this.state.selectedOverride = overrideOptions.length - 1
          while (this.state.selectedOverride > 0 && overrideOptions[this.state.selectedOverride]?.type === 'separator') {
            this.state.selectedOverride--
          }
        }
        return true
        
      case 'ArrowDown':
      case 'Down':
        if (this.state.selectedOverride < overrideOptions.length - 1) {
          this.state.selectedOverride++
          // Skip separators
          while (this.state.selectedOverride < overrideOptions.length - 1 && overrideOptions[this.state.selectedOverride]?.type === 'separator') {
            this.state.selectedOverride++
          }
        } else {
          // Wrap to top, find first non-separator
          this.state.selectedOverride = 0
          while (this.state.selectedOverride < overrideOptions.length - 1 && overrideOptions[this.state.selectedOverride]?.type === 'separator') {
            this.state.selectedOverride++
          }
        }
        return true
        
      case ' ': // Space key to toggle
        const selectedOption = overrideOptions[this.state.selectedOverride]
        if (selectedOption && selectedOption.type === 'boolean') {
          const currentValue = (this.state.sessionOverrides as any)[selectedOption.key] ?? 
                             (this.config as any)[selectedOption.key] ?? false
          ;(this.state.sessionOverrides as any)[selectedOption.key] = !currentValue
        } else if (selectedOption && selectedOption.type === 'action') {
          // Trigger persist action
          this.persistConfigChanges()
        }
        return true
        
      case 's':
      case 'S':
        // Quick save shortcut
        this.persistConfigChanges()
        return true
        
      case 'Enter':
      case 'return':
      case '\r':
      case '\n':
        const selectedOpt = overrideOptions[this.state.selectedOverride]
        if (selectedOpt.type === 'action') {
          // Trigger persist action
          this.persistConfigChanges()
        } else {
          // Apply and exit config overrides
          this.state.showConfigOverrides = false
        }
        return true
        
      case 'Escape':
      case 'escape':
        // Cancel config overrides
        this.state.showConfigOverrides = false
        return true
    }
    
    return false
  }

  private async persistConfigChanges(): Promise<void> {
    try {
      // Create updated config with session overrides
      const updatedConfig = { ...this.config }
      
      // Apply session overrides to the config
      Object.entries(this.state.sessionOverrides).forEach(([key, value]) => {
        if (value !== undefined) {
          (updatedConfig as any)[key] = value
        }
      })
      
      // Write the updated config to nsite.json
      const configPath = join(this.projectPath, 'nsite.json')
      const configJson = JSON.stringify(updatedConfig, null, 2)
      await Deno.writeTextFile(configPath, configJson)
      
      // Update the current config reference
      this.config = updatedConfig
      
      // Clear session overrides since they're now persisted
      this.state.sessionOverrides = {}
      
      // Show success message briefly
      this.state.errorMessage = 'Configuration saved to nsite.json'
      setTimeout(() => {
        if (this.state.errorMessage === 'Configuration saved to nsite.json') {
          this.state.errorMessage = undefined
        }
      }, 3000)
      
    } catch (error) {
      this.state.errorMessage = 'Failed to save config: ' + (error instanceof Error ? error.message : 'Unknown error')
      setTimeout(() => {
        this.state.errorMessage = undefined
      }, 5000)
    }
  }
  
  private async confirmPathAndLoadFiles(): Promise<void> {
    try {
      // Validate path exists
      const pathExists = await Deno.stat(this.state.deployPath).then(() => true).catch(() => false)
      
      if (!pathExists) {
        this.state.errorMessage = 'Path does not exist'
        return
      }
      
      this.state.isLoadingFiles = true
      this.state.errorMessage = undefined
      
      // Load files from the specified path
      if (this.contextManager) {
        // Update the project path in context manager
        this.projectPath = this.state.deployPath
        await this.contextManager.updateProjectPath(this.state.deployPath)
        
        // Update current path to absolute path
        this.state.currentPath = Deno.realPathSync(this.state.deployPath)
        this.state.pathConfirmed = true
      }
      
      this.state.isLoadingFiles = false
      
    } catch (error) {
      this.state.isLoadingFiles = false
      this.state.errorMessage = error instanceof Error ? error.message : 'Failed to load files'
      log.error('Failed to load files from path: ' + error)
    }
  }

  private async handleInlineConfirm(event: KeyPressEvent): Promise<boolean> {
    const key = event.key || ''
    
    // Don't handle reserved global keys
    if (key === 'q' || (key >= '1' && key <= '4') || (event.ctrlKey && key === 'c')) {
      return false
    }
    
    switch (key) {
      case 'y':
      case 'Y':
        this.state.showInlineConfirm = false
        await this.startDeployment()
        return true
        
      case 'n':
      case 'N':
      case 'Escape':
      case 'escape':
        this.state.showInlineConfirm = false
        return true
    }
    
    return false
  }

  private async startDeployment(): Promise<void> {
    if (!this.contextManager) {
      this.state.errorMessage = 'Context manager not available'
      return
    }
    
    try {
      // Set deploying state immediately
      this.state.isDeploying = true
      this.state.errorMessage = undefined
      
      // Ensure upload context is loaded
      await this.contextManager.loadContext('upload')
      
      // Start upload operation through context manager
      const operationId = await this.contextManager.startUpload()
      this.state.currentOperationId = operationId
      
    } catch (error) {
      this.state.errorMessage = 'Failed to start deployment: ' + (error instanceof Error ? error.message : 'Unknown error')
      this.state.isDeploying = false
    }
  }
  
  private updateDeployProgress(progress: any): void {
    // Update timeline and stats based on progress
    // This would update the visual progress indicators
  }

  isEditing(): boolean {
    return this.state.showInlineConfirm || this.state.showConfigOverrides || this.state.isEditingPath
  }

  isTyping(): boolean {
    return this.state.isEditingPath
  }

  hasActiveUploadOperations(): boolean {
    return this.state.isDeploying || this.state.isLoadingFiles
  }

  getStatus(): { text: string; color?: (str: string) => string } {
    if (this.state.errorMessage) {
      return {
        text: `Error: ${this.state.errorMessage}`,
        color: colors.red
      }
    }
    
    if (this.state.isDeploying) {
      const uploadedText = this.state.stats.uploadedFiles > 0 ? `${this.state.stats.uploadedFiles} uploaded` : ''
      const skippedText = this.state.stats.skippedFiles > 0 ? `${this.state.stats.skippedFiles} skipped` : ''
      const parts = [uploadedText, skippedText].filter(Boolean)
      const progress = parts.length > 0 ? ` (${parts.join(', ')})` : ''
      
      return {
        text: `Deploying ${this.state.stats.totalFiles} files${progress}`,
        color: colors.yellow
      }
    }
    
    if (!this.state.isAuthenticated) {
      return {
        text: 'Authentication required for deployment',
        color: colors.red
      }
    }
    
    if (this.state.files.length === 0) {
      return {
        text: 'No files to deploy',
        color: colors.gray
      }
    }
    
    // Check sync status from nsite context if available
    let syncedCount = 0
    let partialCount = 0
    
    if (this.nsiteContext?.files) {
      // Use actual sync data from nsite context
      this.state.files.forEach(file => {
        const nsiteFile = this.nsiteContext!.files.find(f => f.path === file.path)
        if (nsiteFile) {
          const syncStatus = getFileSyncStatus(
            {
              foundOnRelays: nsiteFile.foundOnRelays || [],
              availableOnServers: nsiteFile.availableOnServers || []
            },
            this.config.relays || [],
            this.config.servers || []
          )
          if (syncStatus === 'synced') syncedCount++
          else if (syncStatus === 'partial') partialCount++
        }
      })
    } else {
      // Fall back to upload status
      syncedCount = this.state.files.filter(f => f.status === 'completed').length
      partialCount = this.state.files.filter(f => 
        f.servers && Object.values(f.servers).some(s => s.status === 'completed') &&
        (!f.relays || !Object.values(f.relays).some(r => r.status === 'published'))
      ).length
    }
    
    if (syncedCount === this.state.files.length) {
      return {
        text: `All ${this.state.files.length} files already deployed`,
        color: colors.blue
      }
    } else if (syncedCount > 0 || partialCount > 0) {
      const parts = []
      if (syncedCount > 0) parts.push(`${syncedCount} synced`)
      if (partialCount > 0) parts.push(`${partialCount} partial`)
      return {
        text: `${this.state.files.length} files (${parts.join(', ')})`,
        color: colors.cyan
      }
    }
    
    return {
      text: `${this.state.files.length} files ready for deployment`,
      color: colors.green
    }
  }

  getHotkeys(): string[] {
    const hotkeys: string[] = []
    
    if (this.state.showInlineConfirm) {
      hotkeys.push(
        colors.gray('y') + ' Confirm',
        colors.gray('n') + ' Cancel'
      )
    } else if (this.state.showConfigOverrides) {
      hotkeys.push(
        colors.gray('↑↓') + ' Navigate',
        colors.gray('Space') + ' Toggle',
        colors.gray('s') + ' Save',
        colors.gray('Enter') + ' Apply',
        colors.gray('Esc') + ' Cancel'
      )
    } else if (this.state.isEditingPath || !this.state.pathConfirmed) {
      hotkeys.push(
        colors.gray('Enter') + ' Confirm',
        colors.gray('c') + ' Config',
        colors.gray('Esc') + ' Cancel'
      )
    } else if (!this.state.isDeploying && !this.state.stats.endTime) {
      // Path confirmed but not deploying - show deploy options
      hotkeys.push(
        colors.gray('d') + ' Deploy',
        colors.gray('c') + ' Config',
        colors.gray('p') + ' Change Path'
      )
    } else if (this.state.isDeploying) {
      hotkeys.push(
        colors.gray('↑↓') + ' Navigate'
      )
    } else {
      if (this.state.isAuthenticated && this.state.files.length > 0) {
        hotkeys.push(
          colors.gray('d') + ' Deploy',
          colors.gray('c') + ' Config',
          colors.gray('p') + ' Change Path'
        )
      } else {
        hotkeys.push(
          colors.gray('c') + ' Config',
          colors.gray('p') + ' Change Path'
        )
      }
      hotkeys.push(
        colors.gray('↑↓') + ' Navigate',
        colors.gray('r') + ' Refresh'
      )
    }
    
    return hotkeys
  }
}