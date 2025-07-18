import { colors } from '@cliffy/ansi/colors'
import { BaseRenderer } from './base.ts'
import { UploadViewState } from '../state/types.ts'
import { FileSyncStatusManager } from '../logic/file-sync-status.ts'
import { NsiteContext, UploadFileStatus } from '../../../contexts/types.ts'
import { getDeployBadge, calculateColumnWidths } from '../utils.ts'
import { renderSyncLegend } from '../../../components/file-sync-indicators.ts'

export class SyncStatusRenderer extends BaseRenderer {
  private relayColorMap: Map<string, (str: string) => string>
  private serverColorMap: Map<string, (str: string) => string>
  
  constructor(
    getState: () => UploadViewState,
    private syncStatusManager: FileSyncStatusManager,
    private getNsiteContext: () => NsiteContext | null,
    private configRelays: string[],
    private configServers: string[]
  ) {
    super(getState)
    // Get color maps from sync status manager
    this.relayColorMap = (this.syncStatusManager as any).relayColorMap || new Map()
    this.serverColorMap = (this.syncStatusManager as any).serverColorMap || new Map()
  }
  
  renderSyncStatusView(startRow: number, width: number, height: number): void {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    // Show activity stream
    this.renderActivityStream(startRow, width, height)
  }
  
  private renderActivityStream(startRow: number, width: number, height: number): void {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    // Get sync summary for overview
    const summary = this.syncStatusManager.getSyncSummary(state.files, nsiteContext, state.isDeploying)
    const allSynced = summary.synced === state.files.length && state.files.length > 0
    
    // Show status badge
    const deployBadge = allSynced ? 
      colors.dim(`[ ${state.files.length} Files Already Deployed ]`) :
      getDeployBadge(state)
    const badgeCol = this.centerText(deployBadge, width)
    this.writeAt(startRow, badgeCol, deployBadge)
    
    let currentRow = startRow + 2
    
    // Show deployment statistics if active
    if (state.stats.totalFiles > 0 || state.stats.totalEvents > 0) {
      const statsParts = []
      
      // Always show blob stats
      statsParts.push(colors.dim('Blobs:'))
      statsParts.push(`${state.stats.uploadedFiles} deployed`)
      statsParts.push(colors.yellow(`${state.stats.skippedFiles} skipped`))
      statsParts.push(colors.red(`${state.stats.failedFiles} failed`))
      
      // Event stats
      if (state.stats.totalEvents > 0) {
        statsParts.push('•')
        statsParts.push(colors.dim('Events:'))
        statsParts.push(`${state.stats.publishedEvents} published`)
        statsParts.push(colors.red(`${state.stats.failedEvents} failed`))
      }
      
      const statsText = statsParts.join(' ')
      const statsCol = this.centerText(statsText, width)
      this.writeAt(currentRow, statsCol, statsText)
      currentRow += 2
    }
    
    if (state.files.length > 0) {
      // Calculate remaining height
      const remainingHeight = height - (currentRow - startRow)
      
      // Split screen: left for grid, right for endpoints
      const leftWidth = Math.floor(width * 0.5)
      const rightWidth = width - leftWidth - 2
      
      // Render square grid on the left
      const gridRows = this.renderSquareProgressGrid(currentRow, 1, leftWidth, remainingHeight)
      
      // Render endpoint status on the right
      this.renderEndpointOverview(currentRow, leftWidth + 2, rightWidth, gridRows + 2)
      
      currentRow += gridRows + 2
      
      // Show activity stream below in full width
      const streamHeight = height - (currentRow - startRow)
      if (streamHeight > 0) {
        this.renderFileActivityStream(currentRow, 1, width, streamHeight)
      }
    } else {
      // Show empty state
      const emptyMsg = colors.dim('No files loaded. Enter a directory path above.')
      const emptyCol = this.centerText(emptyMsg, width)
      this.writeAt(currentRow, emptyCol, emptyMsg)
    }
  }
  
  private renderFileActivityStream(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    // Create activity items from files
    const activityItems = this.createActivityItems(state.files, nsiteContext, state.isDeploying)
    
    // Sort by activity level (most active first)
    activityItems.sort((a, b) => {
      // Active items first
      if (a.isActive && !b.isActive) return -1
      if (!a.isActive && b.isActive) return 1
      
      // Then by priority (errors > partial > local > synced)
      const priorityOrder: Record<string, number> = { 'error': 4, 'partial': 3, 'local': 2, 'synced': 1 }
      const aPriority = priorityOrder[a.status] || 0
      const bPriority = priorityOrder[b.status] || 0
      
      if (aPriority !== bPriority) return bPriority - aPriority
      
      // Finally by file name
      return a.fileName.localeCompare(b.fileName)
    })
    
    // Render activity items
    const visibleItems = activityItems.slice(0, height)
    
    visibleItems.forEach((item, index) => {
      const row = startRow + index
      this.renderActivityItem(row, startCol, width, item)
    })
    
    // Show overflow indicator if needed
    if (activityItems.length > height) {
      const remaining = activityItems.length - height
      const overflowText = colors.dim(`+${remaining} more files`)
      this.writeAt(startRow + height - 1, startCol, overflowText)
    }
  }
  
  private createActivityItems(files: any[], nsiteContext: any, isDeploying: boolean): any[] {
    return files.map(file => {
      const syncStatus = this.syncStatusManager.getFileSyncStatus(file, nsiteContext, isDeploying)
      const isActive = this.isFileActive(file, syncStatus, isDeploying)
      
      return {
        fileName: file.path,
        status: syncStatus,
        isActive,
        file,
        progress: file.progress || 0,
        error: file.error
      }
    })
  }
  
  private isFileActive(file: any, syncStatus: string, isDeploying: boolean): boolean {
    // File is active if:
    // 1. Currently being deployed
    // 2. Has errors 
    // 3. Is partially synced
    // 4. Is uploading or in progress
    
    if (isDeploying && (file.status === 'uploading' || file.status === 'signing')) {
      return true
    }
    
    if (syncStatus === 'error' || file.error) {
      return true
    }
    
    if (syncStatus === 'partial') {
      return true
    }
    
    if (file.status === 'uploading' || file.status === 'signing' || file.status === 'publishing') {
      return true
    }
    
    return false
  }
  
  private renderActivityItem(row: number, startCol: number, width: number, item: any): void {
    const { fileName, status, isActive, progress, error } = item
    
    // Choose colors based on activity level
    let statusIcon = ' '
    let fileColor = colors.dim
    let statusColor = colors.dim
    
    if (isActive) {
      // High contrast for active items
      if (status === 'error' || error) {
        statusIcon = '✗'
        fileColor = colors.red
        statusColor = colors.red
      } else if (status === 'partial') {
        statusIcon = '◐'
        fileColor = colors.yellow
        statusColor = colors.yellow
      } else if (status === 'local') {
        statusIcon = '○'
        fileColor = colors.cyan
        statusColor = colors.cyan
      } else if (progress > 0 && progress < 100) {
        statusIcon = '↻'
        fileColor = colors.blue
        statusColor = colors.blue
      } else {
        // Default for other active items
        statusIcon = '◆'
        fileColor = colors.white
        statusColor = colors.white
      }
    } else {
      // Low contrast for inactive items
      if (status === 'synced') {
        statusIcon = '●'
        fileColor = colors.dim
        statusColor = colors.dim
      } else if (status === 'local') {
        statusIcon = '○'
        fileColor = colors.dim
        statusColor = colors.dim
      } else {
        statusIcon = '·'
        fileColor = colors.dim
        statusColor = colors.dim
      }
    }
    
    // Truncate filename to fit
    const maxFileLen = width - 6
    const displayName = fileName.length > maxFileLen ? 
      '...' + fileName.slice(-(maxFileLen - 3)) : fileName
    
    // Show progress for active uploading files
    let progressText = ''
    if (isActive && progress > 0 && progress < 100) {
      progressText = colors.dim(` ${progress}%`)
    }
    
    // Show error message for failed files
    let errorText = ''
    if (error && isActive) {
      const maxErrorLen = Math.max(10, width - displayName.length - 10)
      errorText = colors.red(` ${error.substring(0, maxErrorLen)}`)
    }
    
    const line = `${statusColor(statusIcon)} ${fileColor(displayName)}${progressText}${errorText}`
    this.writeAt(row, startCol, line)
  }
  
  private renderFileSyncOverview(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    this.writeAt(startRow, startCol, colors.bold('File Sync Status'))
    this.drawHorizontalLine(startRow + 1, startCol, width)
    
    // Legend
    this.writeAt(startRow + 2, startCol, 
      `${colors.dim('○')} Not synced  ${colors.yellow('◐')} Partial  ${colors.green('●')} Synced  ${colors.red('✗')} Error`
    )
    
    // File list with sync status
    const visibleFiles = state.files.slice(state.scrollOffset, state.scrollOffset + height - 4)
    
    visibleFiles.forEach((file, index) => {
      const row = startRow + 4 + index
      const syncStatus = this.syncStatusManager.getFileSyncStatus(file, nsiteContext, state.isDeploying)
      const statusIcon = this.syncStatusManager.getSyncStatusIcon(syncStatus)
      const fileName = file.path.length > width - 4 ? 
        '...' + file.path.slice(-(width - 7)) : file.path
      
      const isSelected = (state.scrollOffset + index) === state.selectedFile
      const line = `${statusIcon} ${fileName}`
      
      if (isSelected) {
        this.writeAt(row, startCol, colors.inverse(line))
      } else {
        this.writeAt(row, startCol, line)
      }
    })
  }
  
  private renderEndpointPropagation(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    
    this.writeAt(startRow, startCol, colors.bold('Endpoint Status'))
    this.drawHorizontalLine(startRow + 1, startCol, width)
    
    let currentRow = startRow + 3
    
    // Relay status
    if (this.configRelays.length > 0) {
      this.writeAt(currentRow, startCol, colors.dim('Relays:'))
      currentRow++
      
      this.configRelays.forEach((relay, index) => {
        if (currentRow - startRow >= height - 1) return
        
        const status = this.syncStatusManager.getConnectionStatus(relay, 'relay', state.files)
        const relayHost = relay.replace(/^wss?:\/\//, '').split('/')[0]
        const truncatedHost = relayHost.length > width - 15 ? 
          relayHost.slice(0, width - 18) + '...' : relayHost
        
        const colorFn = (this.syncStatusManager as any).relayColorMap.get(relay) || colors.white
        const statusText = this.formatConnectionStatus(status)
        
        this.writeAt(currentRow, startCol + 2, `${colorFn('●')} ${colorFn(truncatedHost)} ${statusText}`)
        currentRow++
      })
    }
    
    // Server status
    if (this.configServers.length > 0 && currentRow - startRow < height - 3) {
      currentRow++ // Add spacing
      this.writeAt(currentRow, startCol, colors.dim('Servers:'))
      currentRow++
      
      this.configServers.forEach((server, index) => {
        if (currentRow - startRow >= height - 1) return
        
        const status = this.syncStatusManager.getConnectionStatus(server, 'server', state.files)
        const serverHost = server.replace(/^https?:\/\//, '').split('/')[0]
        const truncatedHost = serverHost.length > width - 15 ? 
          serverHost.slice(0, width - 18) + '...' : serverHost
        
        const colorFn = (this.syncStatusManager as any).serverColorMap.get(server) || colors.white
        const statusText = this.formatConnectionStatus(status)
        
        this.writeAt(currentRow, startCol + 2, `${colorFn('■')} ${colorFn(truncatedHost)} ${statusText}`)
        currentRow++
      })
    }
  }
  
  private formatConnectionStatus(status: { active: number; completed: number; failed: number }): string {
    const parts = []
    if (status.completed > 0) parts.push(colors.green(`${status.completed}✓`))
    if (status.active > 0) parts.push(colors.yellow(`${status.active}↻`))
    if (status.failed > 0) parts.push(colors.red(`${status.failed}✗`))
    
    return parts.length > 0 ? parts.join(' ') : colors.dim('—')
  }
  
  private renderCompactFileList(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    // Simple file list without clutter
    const visibleFiles = state.files.slice(state.scrollOffset, state.scrollOffset + height)
    
    visibleFiles.forEach((file, index) => {
      const row = startRow + index
      const syncStatus = this.syncStatusManager.getFileSyncStatus(file, nsiteContext, state.isDeploying)
      
      // Use minimal status indicators
      let statusIcon = ' '
      if (syncStatus === 'error') {
        statusIcon = colors.red('✗')
      } else if (syncStatus === 'partial') {
        statusIcon = colors.yellow('◐')
      } else if (syncStatus === 'local') {
        statusIcon = colors.cyan('●')
      }
      
      // Truncate filename to fit
      const maxFileLen = width - 4
      const fileName = file.path.length > maxFileLen ? 
        '...' + file.path.slice(-(maxFileLen - 3)) : file.path
      
      const isSelected = (state.scrollOffset + index) === state.selectedFile
      
      if (isSelected) {
        // Highlight selected file
        const line = `${statusIcon} ${fileName}`.padEnd(width - 1)
        this.writeAt(row, startCol, colors.inverse(line))
      } else {
        // Normal file display
        const fileColor = syncStatus === 'synced' ? colors.dim : (str: string) => str
        this.writeAt(row, startCol, `${statusIcon} ${fileColor(fileName)}`)
      }
    })
    
    // Show scroll indicator if needed
    if (state.files.length > height) {
      const scrollPercent = Math.round((state.scrollOffset / (state.files.length - height)) * 100)
      const scrollIndicator = colors.dim(`[${scrollPercent}%]`)
      this.writeAt(startRow + height - 1, width - scrollIndicator.length - 1, scrollIndicator)
    }
  }
  
  private renderSelectedFileEndpoints(row: number, startCol: number, width: number, file: UploadFileStatus): void {
    const parts = []
    
    // Show relay status inline
    if (file.relays) {
      const relayStatuses = []
      for (const [relay, status] of Object.entries(file.relays)) {
        const colorFn = (this.syncStatusManager as any).relayColorMap.get(relay) || colors.white
        const relayStatus = status as any
        if (relayStatus.status === 'completed') {
          relayStatuses.push(colorFn('●'))
        } else if (relayStatus.status === 'publishing' || relayStatus.status === 'active') {
          relayStatuses.push(colors.yellow('◐'))
        } else {
          relayStatuses.push(colors.dim('○'))
        }
      }
      if (relayStatuses.length > 0) {
        parts.push(`R:${relayStatuses.join('')}`)
      }
    }
    
    // Show server status inline
    if (file.servers) {
      const serverStatuses = []
      for (const [server, status] of Object.entries(file.servers)) {
        const colorFn = (this.syncStatusManager as any).serverColorMap.get(server) || colors.white
        const serverStatus = status as any
        if (serverStatus.status === 'completed') {
          serverStatuses.push(colorFn('■'))
        } else if (serverStatus.status === 'uploading' || serverStatus.status === 'active') {
          serverStatuses.push(colors.yellow('◧'))
        } else {
          serverStatuses.push(colors.dim('□'))
        }
      }
      if (serverStatuses.length > 0) {
        parts.push(`S:${serverStatuses.join('')}`)
      }
    }
    
    const endpointStatus = parts.join(' ') || colors.dim('Not synced')
    this.writeAt(row, startCol, endpointStatus)
  }
  
  private renderSquareProgressGrid(startRow: number, startCol: number, maxWidth: number, availableHeight: number): number {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    if (state.files.length === 0) return 0
    
    // Calculate grid dimensions for square layout
    const blockSize = 2 // Each block is 2 chars wide
    const maxCols = Math.floor((maxWidth - 2) / blockSize)
    
    // Try to make it square first
    const idealSize = Math.ceil(Math.sqrt(state.files.length))
    let gridCols = Math.min(idealSize, maxCols)
    let gridRows = Math.ceil(state.files.length / gridCols)
    
    // Limit height to available space
    const maxRows = Math.min(availableHeight - 2, 20) // Leave room for overflow text
    if (gridRows > maxRows) {
      gridRows = maxRows
      gridCols = Math.min(Math.ceil(state.files.length / gridRows), maxCols)
    }
    
    // Center the grid
    const gridWidth = gridCols * blockSize
    const gridStartCol = startCol + Math.floor((maxWidth - gridWidth) / 2)
    
    let fileIndex = 0
    for (let row = 0; row < gridRows; row++) {
      let rowContent = ''
      
      for (let col = 0; col < gridCols; col++) {
        if (fileIndex >= state.files.length) break
        
        const file = state.files[fileIndex]
        const syncStatus = this.syncStatusManager.getFileSyncStatus(file, nsiteContext, state.isDeploying)
        
        // Choose block style and color based on status
        let block = '██'
        let colorFn = colors.dim
        
        if (syncStatus === 'synced') {
          block = '██'
          colorFn = colors.dim  // Subtle gray for synced files
        } else if (syncStatus === 'partial') {
          block = '▓▓'
          colorFn = colors.yellow
        } else if (syncStatus === 'local') {
          block = '▒▒'
          colorFn = colors.cyan
        } else if (syncStatus === 'error') {
          block = '××'
          colorFn = colors.red
        }
        
        rowContent += colorFn(block)
        fileIndex++
      }
      
      // Write the entire row at once
      this.writeAt(startRow + row, gridStartCol, rowContent)
    }
    
    // Show overflow indicator if we can't fit all files
    let usedRows = gridRows
    if (fileIndex < state.files.length) {
      const remaining = state.files.length - fileIndex
      const overflowText = colors.dim(`+${remaining} more`)
      this.writeAt(startRow + gridRows, gridStartCol, overflowText)
      usedRows += 1
    }
    
    return usedRows // Return number of rows used
  }
  
  private renderEndpointOverview(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    // Header
    this.writeAt(startRow, startCol, colors.bold('Endpoints'))
    this.drawHorizontalLine(startRow + 1, startCol, Math.min(width, 40))
    
    let currentRow = startRow + 3
    
    // Relay status with colored dots
    if (this.configRelays.length > 0 && currentRow - startRow < height) {
      this.writeAt(currentRow, startCol, colors.dim('Relays:'))
      currentRow++
      
      this.configRelays.slice(0, 5).forEach((relay) => { // Show max 5 relays
        if (currentRow - startRow >= height - 1) return
        
        const relayHost = relay.replace(/^wss?:\/\//, '').split('/')[0]
        // Reserve space for icon (2) + space (1) + dots (5) + spacing (4) = 12 chars
        const maxHostLen = Math.max(10, width - 12)
        const truncatedHost = relayHost.length > maxHostLen ? 
          relayHost.slice(0, maxHostLen - 3) + '...' : relayHost
        
        // Get sync status for this relay
        const colorFn = this.relayColorMap.get(relay) || colors.white
        
        // Count files synced to this relay
        const syncedCount = state.files.filter(file => {
          const status = file.relays?.[relay] as any
          return status?.status === 'published' || status?.status === 'completed'
        }).length
        
        // Create status dots
        const dots = this.createStatusDots(syncedCount, state.files.length)
        
        // Write relay name and dots on same line
        const relayLine = `${colorFn('○')} ${truncatedHost}`
        this.writeAt(currentRow, startCol + 2, relayLine)
        // Position dots to the right with proper spacing
        const dotsCol = Math.min(startCol + 2 + relayLine.length + 2, startCol + width - dots.length - 1)
        this.writeAt(currentRow, dotsCol, dots)
        currentRow++
      })
    }
    
    // Server status with colored squares
    if (this.configServers.length > 0 && currentRow - startRow < height - 2) {
      currentRow++ // spacing
      this.writeAt(currentRow, startCol, colors.dim('Servers:'))
      currentRow++
      
      this.configServers.slice(0, 3).forEach((server) => { // Show max 3 servers
        if (currentRow - startRow >= height - 1) return
        
        const serverHost = server.replace(/^https?:\/\//, '').split('/')[0]
        // Reserve space for icon (2) + space (1) + dots (5) + spacing (4) = 12 chars
        const maxHostLen = Math.max(10, width - 12)
        const truncatedHost = serverHost.length > maxHostLen ? 
          serverHost.slice(0, maxHostLen - 3) + '...' : serverHost
        
        // Get sync status for this server
        const colorFn = this.serverColorMap.get(server) || colors.white
        
        // Count files synced to this server
        const syncedCount = state.files.filter(file => {
          const status = file.servers?.[server]
          return status?.status === 'completed'
        }).length
        
        // Create status dots
        const dots = this.createStatusDots(syncedCount, state.files.length)
        
        // Write server name and dots on same line
        const serverLine = `${colorFn('□')} ${truncatedHost}`
        this.writeAt(currentRow, startCol + 2, serverLine)
        // Position dots to the right with proper spacing
        const dotsCol = Math.min(startCol + 2 + serverLine.length + 2, startCol + width - dots.length - 1)
        this.writeAt(currentRow, dotsCol, dots)
        currentRow++
      })
    }
  }
  
  private createStatusDots(synced: number, total: number): string {
    if (total === 0) return colors.dim('○○○○○')
    
    const percent = (synced / total) * 100
    const filledDots = Math.round((percent / 100) * 5)
    
    let dots = ''
    for (let i = 0; i < 5; i++) {
      if (i < filledDots) {
        if (percent === 100) {
          dots += colors.green('●')
        } else if (percent >= 80) {
          dots += colors.blue('●')
        } else if (percent >= 50) {
          dots += colors.yellow('●')
        } else {
          dots += colors.red('●')
        }
      } else {
        dots += colors.dim('○')
      }
    }
    
    return dots
  }
  
  private renderEndpointStatus(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    
    // Show endpoint status for selected file
    const selectedFile = state.files[state.selectedFile]
    if (!selectedFile) return
    
    // Header
    this.writeAt(startRow, startCol, colors.bold('Endpoints'))
    this.drawHorizontalLine(startRow + 1, startCol, Math.min(width, 20))
    
    let currentRow = startRow + 3
    
    // Show relay status
    if (this.configRelays.length > 0) {
      this.writeAt(currentRow, startCol, colors.dim('Relays:'))
      currentRow++
      
      this.configRelays.forEach((relay, index) => {
        if (currentRow - startRow >= height - 1) return
        
        const relayHost = relay.replace(/^wss?:\/\//, '').split('/')[0]
        const truncatedHost = relayHost.length > width - 5 ? 
          relayHost.slice(0, width - 8) + '...' : relayHost
        
        const colorFn = (this.syncStatusManager as any).relayColorMap.get(relay) || colors.white
        const status = selectedFile.relays?.[relay]
        
        let statusIcon = colors.dim('○')
        const relayStatus = status as any
        if (relayStatus?.status === 'published' || relayStatus?.status === 'completed') {
          statusIcon = colorFn('●')
        } else if (relayStatus?.status === 'publishing') {
          statusIcon = colors.yellow('◐')
        }
        
        this.writeAt(currentRow, startCol + 2, `${statusIcon} ${truncatedHost}`)
        currentRow++
      })
    }
    
    // Show server status
    if (this.configServers.length > 0 && currentRow - startRow < height - 3) {
      currentRow++ // spacing
      this.writeAt(currentRow, startCol, colors.dim('Servers:'))
      currentRow++
      
      this.configServers.forEach((server, index) => {
        if (currentRow - startRow >= height - 1) return
        
        const serverHost = server.replace(/^https?:\/\//, '').split('/')[0]
        const truncatedHost = serverHost.length > width - 5 ? 
          serverHost.slice(0, width - 8) + '...' : serverHost
        
        const colorFn = (this.syncStatusManager as any).serverColorMap.get(server) || colors.white
        const status = selectedFile.servers?.[server]
        
        let statusIcon = colors.dim('□')
        if (status?.status === 'completed') {
          statusIcon = colorFn('■')
        } else if (status?.status === 'uploading') {
          statusIcon = colors.yellow('◧')
        }
        
        this.writeAt(currentRow, startCol + 2, `${statusIcon} ${truncatedHost}`)
        currentRow++
      })
    }
  }
}