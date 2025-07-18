import { ConsoleView, Identity } from '../types.ts'
import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../../lib/config.ts'
import { ConsoleContextManager } from '../contexts/manager.ts'
import { UploadContext, OperationContext, UploadFileStatus, TimelineEntry, UploadStats } from '../contexts/types.ts'
import { colors } from '@cliffy/ansi/colors'
import { moveCursor, getTerminalSize, clearScreen } from '../../browse/renderer.ts'
import { createLogger } from '../../../lib/logger.ts'
import { RELAY_SYMBOL, SERVER_SYMBOL, RELAY_COLORS, SERVER_COLORS } from '../../../commands/ls.ts'

const log = createLogger('upload-view')

export interface UploadViewState {
  isDeploying: boolean
  isAuthenticated: boolean
  files: UploadFileStatus[]
  timeline: TimelineEntry[]
  stats: UploadStats
  concurrency: number
  selectedFile: number
  scrollOffset: number
  showConfirmDialog: boolean
  errorMessage?: string
  currentOperationId?: string
  isEditingPath: boolean
  deployPath: string
  currentPath: string
  pathConfirmed: boolean
  isLoadingFiles: boolean
  propagationPage: number
  propagationPageSize: number
}

export class UploadView implements ConsoleView {
  name = 'Upload'
  private state: UploadViewState
  private contextManager: ConsoleContextManager | null = null
  private uploadContext: UploadContext | null = null
  private operationContext: OperationContext | null = null
  private config: ProjectConfig
  private identity: Identity
  private projectPath: string

  constructor(config: ProjectConfig, identity: Identity, projectPath: string) {
    this.config = config
    this.identity = identity
    this.projectPath = projectPath
    
    this.state = {
      isDeploying: false,
      isAuthenticated: this.identity.authMethod !== 'hex', // Read-only if hex
      files: [],
      timeline: [],
      stats: {
        totalFiles: 0,
        totalSize: 0,
        uploadedFiles: 0,
        uploadedSize: 0,
        failedFiles: 0,
        publishedEvents: 0,
        failedEvents: 0,
        signedEvents: 0,
        totalEvents: 0
      },
      concurrency: (this.config as any).concurrency || 4,
      selectedFile: 0,
      scrollOffset: 0,
      showConfirmDialog: false,
      isEditingPath: true, // Start in editing mode
      deployPath: projectPath,
      currentPath: Deno.realPathSync(projectPath),
      pathConfirmed: false,
      isLoadingFiles: false,
      propagationPage: 0,
      propagationPageSize: 20
    }
  }

  async initialize(contextManager: ConsoleContextManager): Promise<void> {
    this.contextManager = contextManager
    this.uploadContext = contextManager.getContext<UploadContext>('upload')
    this.operationContext = contextManager.getContext<OperationContext>('operations')
    
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
    
    // If path is not confirmed, show only path input
    if (!this.state.pathConfirmed) {
      this.renderPathInput(3, cols, rows - 5) // Start at row 3, leave room for footer
      return
    }
    
    // If loading files, show loading state
    if (this.state.isLoadingFiles) {
      this.renderLoadingState(3, cols, rows - 5)
      return
    }
    
    // Calculate layout - Timeline takes fixed height, columns take the rest
    const timelineHeight = this.state.isDeploying ? this.state.concurrency + 3 : 4
    const columnsStartRow = 3 + timelineHeight + 1 // After tab bar + timeline + separator
    const remainingHeight = rows - columnsStartRow - 2 // Leave room for footer
    
    // Calculate column widths - give propagation column space for symbols
    const maxSymbols = this.calculateMaxSymbols()
    const propagationWidth = Math.min(Math.floor(cols * 0.4), 50) // Max 40% of screen or 50 chars
    const remainingWidth = cols - propagationWidth
    const gridWidth = Math.floor(remainingWidth * 0.4)
    const statusWidth = remainingWidth - gridWidth
    
    // Render timeline at top (starting at row 3 after tab bar)
    this.renderTimeline(3, timelineHeight, cols)
    
    // Render three columns below timeline
    // Column 1: Upload progress grid
    this.renderProgressGrid(columnsStartRow, 1, gridWidth, remainingHeight)
    
    // Column 2: File status list  
    this.renderFileStatus(columnsStartRow, gridWidth + 1, statusWidth, remainingHeight)
    
    // Column 3: File structure propagation (tree-like)
    this.renderFilePropagation(columnsStartRow, gridWidth + statusWidth + 1, propagationWidth, remainingHeight)
    
    // Render confirm dialog if needed
    if (this.state.showConfirmDialog) {
      this.renderConfirmDialog()
    }
  }

  private renderPathInput(startRow: number, width: number, height: number): void {
    const centerRow = startRow + Math.floor(height / 2)
    const centerCol = Math.floor(width / 2)
    
    // Title
    moveCursor(centerRow - 3, centerCol - 15)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.green('🌐 Static Website Files')))
    
    // Current path display
    moveCursor(centerRow - 1, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Current path: ') + colors.cyan(this.state.currentPath)))
    
    // Configuration info
    moveCursor(centerRow, 1)
    const servers = this.config.servers || []
    const relays = this.config.relays || []
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim(`Config: ${servers.length} servers, ${relays.length} relays`)))
    
    // Path input field
    moveCursor(centerRow + 2, 1)
    const pathLabel = colors.bold('Website files directory: ')
    const pathValue = this.state.deployPath
    const cursor = this.state.isEditingPath ? colors.yellow('█') : ''
    Deno.stdout.writeSync(new TextEncoder().encode(`${pathLabel}${colors.yellow(pathValue)}${cursor}`))
    
    // Instructions
    moveCursor(centerRow + 4, 1)
    if (this.state.isEditingPath) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Press [Enter] to scan directory, [Esc] to cancel')))
    } else {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Press [Enter] to edit path, [Ctrl+Enter] to use current path')))
    }
    
    // Error message if any
    if (this.state.errorMessage) {
      moveCursor(centerRow + 6, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.red('❌ ' + this.state.errorMessage)))
    }
    
    // Authentication warning if needed
    if (!this.state.isAuthenticated) {
      moveCursor(centerRow + 8, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.red('⚠️  Authentication required for deployment')))
      moveCursor(centerRow + 9, 1)
      Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('Switch to an authenticated identity to deploy')))
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

  private calculateMaxSymbols(): number {
    // Calculate max possible symbols from config
    const servers = (this.config as any).servers?.length || 0
    const relays = (this.config as any).relays?.length || 0
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
          Deno.stdout.writeSync(new TextEncoder().encode('─'.repeat(width - 2)))
        }
      }
    } else {
      // Show stats or deploy button
      if (this.state.stats.endTime) {
        this.renderCompletionStats(startRow, height, width)
      } else {
        this.renderDeployButton(startRow, height, width)
      }
    }
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
      // Show deploy status badge (centered)
      const deployBadge = this.getDeployBadge()
      const badgeText = deployBadge.replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes for length calculation
      const badgeCol = Math.max(1, Math.floor((width - badgeText.length) / 2))
      moveCursor(startRow, badgeCol)
      Deno.stdout.writeSync(new TextEncoder().encode(deployBadge))
      
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
          setTimeout(() => {
            this.state.errorMessage = undefined
          }, 5000)
        }
      }
    }
  }

  private renderCompletionStats(startRow: number, height: number, width: number): void {
    moveCursor(startRow, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.green('✅ Deployment Complete')))
    
    const duration = this.state.stats.endTime! - this.state.stats.startTime!
    const successRate = this.state.stats.totalFiles > 0 ? 
      (this.state.stats.uploadedFiles / this.state.stats.totalFiles * 100).toFixed(1) : '0'
    
    moveCursor(startRow + 1, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(`${this.state.stats.uploadedFiles}/${this.state.stats.totalFiles} files • ` +
                `${this.formatSize(this.state.stats.uploadedSize)} • ` +
                `${this.formatDuration(duration)} • ` +
                `${successRate}% success`))
    
    moveCursor(startRow + 2, 1)
    Deno.stdout.writeSync(new TextEncoder().encode(`Events: ${this.state.stats.publishedEvents} published, ${this.state.stats.failedEvents} failed`))
  }

  private renderProgressGrid(startRow: number, startCol: number, width: number, height: number): void {
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Upload Progress')))
    
    // Calculate grid dimensions
    const blocksPerRow = Math.floor(width / 2)
    const totalBlocks = this.state.files.length
    const gridRows = Math.ceil(totalBlocks / blocksPerRow)
    const maxGridRows = Math.max(1, Math.floor(height * 0.7)) // Use 70% of space for grid
    
    // Render file blocks
    for (let row = 0; row < Math.min(gridRows, maxGridRows); row++) {
      moveCursor(startRow + 2 + row, startCol)
      let line = ''
      
      for (let col = 0; col < blocksPerRow; col++) {
        const fileIndex = row * blocksPerRow + col
        if (fileIndex < this.state.files.length) {
          const file = this.state.files[fileIndex]
          const block = this.getFileBlock(file)
          line += block + ' '
        } else {
          line += '  '
        }
      }
      
      Deno.stdout.writeSync(new TextEncoder().encode(line))
    }
    
    // Add connection statuses below the grid
    const connectionRow = startRow + 2 + Math.min(gridRows, maxGridRows) + 1
    this.renderConnectionStatuses(connectionRow, startCol, width, height - (connectionRow - startRow))
  }

  private renderConnectionStatuses(startRow: number, startCol: number, width: number, height: number): void {
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Connections')))
    
    // Get servers and relays from identity context
    const servers = (this.config as any).servers || []
    const relays = (this.config as any).relays || []
    
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
    switch (file.status) {
      case 'pending': return colors.gray('□')
      case 'uploading': return colors.yellow('◐')
      case 'completed': return colors.green('■')
      case 'failed': return colors.red('✗')
      case 'publishing': return colors.blue('◑')
      case 'published': return colors.cyan('◆')
      default: return colors.gray('□')
    }
  }

  private renderFileStatus(startRow: number, startCol: number, width: number, height: number): void {
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('File Status')))
    
    // Sort files by priority: Success -> Failure -> Active -> Idle
    const sortedFiles = this.getSortedFiles()
    const visibleFiles = sortedFiles.slice(this.state.scrollOffset, this.state.scrollOffset + height - 2)
    
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
    moveCursor(startRow, startCol)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('File Propagation')))
    
    // Calculate symbol column widths (like browse view)
    const servers = this.config.servers || []
    const relays = this.config.relays || []
    const maxRelayCount = Math.max(relays.length, 3)
    const maxServerCount = Math.max(servers.length, 3)
    const symbolWidth = maxRelayCount + 3 + maxServerCount // relays + " | " + servers
    const nameWidth = width - symbolWidth - 3 // Leave space for tree characters
    
    // Render header with pagination info
    moveCursor(startRow + 1, startCol)
    const totalPages = Math.ceil(this.state.files.length / this.state.propagationPageSize)
    const pageInfo = totalPages > 1 ? ` (${this.state.propagationPage + 1}/${totalPages})` : ''
    Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('─'.repeat(width - 2 - pageInfo.length)) + pageInfo))
    
    // Calculate paginated file slice
    const startIndex = this.state.propagationPage * this.state.propagationPageSize
    const endIndex = Math.min(startIndex + this.state.propagationPageSize, this.state.files.length)
    const paginatedFiles = this.state.files.slice(startIndex, endIndex)
    
    // Group paginated files by directory for tree structure
    const fileTree = this.buildFileTree(paginatedFiles)
    
    let currentRow = startRow + 2
    const maxRows = height - 2
    
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
    const relays = this.config.relays || []
    const servers = this.config.servers || []
    
    // Build relay indicators with proper colors - only show symbols for propagated files
    let relayIndicators = ''
    relays.forEach((relay, index) => {
      if (index < maxRelayCount) {
        const relayStatus = file.relays?.[relay]
        const colorFn = RELAY_COLORS[index % RELAY_COLORS.length]
        
        if (relayStatus?.status === 'published') {
          relayIndicators += colorFn(RELAY_SYMBOL)
        } else if (relayStatus?.status === 'publishing') {
          relayIndicators += colors.yellow(RELAY_SYMBOL)
        } else if (relayStatus?.status === 'failed') {
          relayIndicators += colors.red(RELAY_SYMBOL)
        } else {
          // Pad with space for non-propagated
          relayIndicators += ' '
        }
      }
    })
    // Pad with spaces for remaining relay slots
    relayIndicators += ' '.repeat(maxRelayCount - relays.length)
    
    // Build server indicators with proper colors - only show symbols for propagated files
    let serverIndicators = ''
    servers.forEach((server, index) => {
      if (index < maxServerCount) {
        const serverStatus = file.servers?.[server]
        const colorFn = SERVER_COLORS[index % SERVER_COLORS.length]
        
        if (serverStatus?.status === 'completed') {
          serverIndicators += colorFn(SERVER_SYMBOL)
        } else if (serverStatus?.status === 'uploading') {
          serverIndicators += colors.yellow(SERVER_SYMBOL)
        } else if (serverStatus?.status === 'failed') {
          serverIndicators += colors.red(SERVER_SYMBOL)
        } else {
          // Pad with space for non-propagated
          serverIndicators += ' '
        }
      }
    })
    // Pad with spaces for remaining server slots
    serverIndicators += ' '.repeat(maxServerCount - servers.length)
    
    return `${relayIndicators} ${colors.gray('│')} ${serverIndicators}`
  }

  private renderConfirmDialog(): void {
    const { rows, cols } = getTerminalSize()
    const dialogWidth = 50
    const dialogHeight = 8
    const startRow = Math.floor(rows / 2) - Math.floor(dialogHeight / 2)
    const startCol = Math.floor(cols / 2) - Math.floor(dialogWidth / 2)
    
    // Draw dialog box
    for (let row = 0; row < dialogHeight; row++) {
      moveCursor(startRow + row, startCol)
      if (row === 0 || row === dialogHeight - 1) {
        Deno.stdout.writeSync(new TextEncoder().encode('┌' + '─'.repeat(dialogWidth - 2) + '┐'))
      } else {
        Deno.stdout.writeSync(new TextEncoder().encode('│' + ' '.repeat(dialogWidth - 2) + '│'))
      }
    }
    
    moveCursor(startRow + 2, startCol + 2)
    Deno.stdout.writeSync(new TextEncoder().encode(colors.bold('Confirm Deployment')))
    
    moveCursor(startRow + 4, startCol + 2)
    Deno.stdout.writeSync(new TextEncoder().encode(`Deploy ${this.state.files.length} files?`))
    
    moveCursor(startRow + 6, startCol + 2)
    Deno.stdout.writeSync(new TextEncoder().encode('[y] Yes  [n] No'))
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
    
    if (this.state.showConfirmDialog) {
      return this.handleConfirmDialog(event)
    }
    
    if (this.state.isEditingPath || !this.state.pathConfirmed) {
      return this.handlePathInput(event)
    }
    
    // Handle deploy hotkey
    if (key === 'd' || key === 'D') {
      if (!this.state.isDeploying && this.state.isAuthenticated && this.state.files.length > 0) {
        this.state.showConfirmDialog = true
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
    
    // Handle Enter key variants
    if (key === 'Enter' || key === 'return' || key === '\r' || key === '\n') {
      if (this.state.pathConfirmed) {
        // Already confirmed, proceed to deploy
        this.state.isEditingPath = false
        this.state.showConfirmDialog = true
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

  private async handleConfirmDialog(event: KeyPressEvent): Promise<boolean> {
    const key = event.key || ''
    
    switch (key) {
      case 'y':
      case 'Y':
      case 'Enter':
      case 'return':
      case '\r':
      case '\n':
        this.state.showConfirmDialog = false
        await this.startDeployment()
        return true
        
      case 'n':
      case 'N':
      case 'Escape':
      case 'escape':
        this.state.showConfirmDialog = false
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
    return this.state.showConfirmDialog || this.state.isEditingPath
  }

  hasActiveOperations(): boolean {
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
      return {
        text: `Deploying... ${this.state.stats.uploadedFiles}/${this.state.stats.totalFiles} files`,
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
    
    return {
      text: `${this.state.files.length} files ready for deployment`,
      color: colors.green
    }
  }

  getHotkeys(): string[] {
    const hotkeys: string[] = []
    
    if (this.state.showConfirmDialog) {
      hotkeys.push(
        colors.gray('y') + ' Confirm',
        colors.gray('n') + ' Cancel'
      )
    } else if (this.state.isEditingPath || !this.state.pathConfirmed) {
      hotkeys.push(
        colors.gray('Enter') + ' Confirm',
        colors.gray('Esc') + ' Cancel'
      )
    } else if (this.state.isDeploying) {
      hotkeys.push(
        colors.gray('↑↓') + ' Navigate'
      )
    } else {
      if (this.state.isAuthenticated && this.state.files.length > 0) {
        hotkeys.push(
          colors.gray('d') + ' Deploy',
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