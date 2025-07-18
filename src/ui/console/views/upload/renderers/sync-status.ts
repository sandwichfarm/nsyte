import { colors } from '@cliffy/ansi/colors'
import { BaseRenderer } from './base.ts'
import { UploadViewState } from '../state/types.ts'
import { FileSyncStatusManager } from '../logic/file-sync-status.ts'
import { NsiteContext, UploadFileStatus } from '../../../contexts/types.ts'
import { getDeployBadge, calculateColumnWidths } from '../utils.ts'
import { renderSyncLegend } from '../../../components/file-sync-indicators.ts'

export class SyncStatusRenderer extends BaseRenderer {
  constructor(
    getState: () => UploadViewState,
    private syncStatusManager: FileSyncStatusManager,
    private getNsiteContext: () => NsiteContext | null,
    private configRelays: string[],
    private configServers: string[]
  ) {
    super(getState)
  }
  
  renderSyncStatusView(startRow: number, width: number, height: number): void {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    // Get sync summary
    const summary = this.syncStatusManager.getSyncSummary(state.files, nsiteContext, state.isDeploying)
    const allSynced = summary.synced === state.files.length && state.files.length > 0
    
    // Show status badge
    const deployBadge = allSynced ? 
      colors.dim(`[ ${state.files.length} Files Already Deployed ]`) :
      getDeployBadge(state)
    const badgeCol = this.centerText(deployBadge, width)
    this.writeAt(startRow, badgeCol, deployBadge)
    
    // Show deployment statistics
    if (state.stats.totalFiles > 0 || state.stats.totalEvents > 0) {
      const statsRow = startRow + 1
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
      this.writeAt(statsRow, statsCol, statsText)
    }
    
    
    // Show progress grid if files exist
    if (state.files.length > 0) {
      let gridStartRow = startRow + 2
      if (state.stats.totalFiles > 0 || state.stats.totalEvents > 0) {
        gridStartRow += 1
      }
      if (!allSynced) {
        gridStartRow += 1
      }
      this.renderProgressGrid(gridStartRow, 1, width)
      
      // Show file list below grid with endpoint status
      const listStartRow = gridStartRow + 5
      const listHeight = height - (listStartRow - startRow)
      if (listHeight > 0) {
        // Split the width for file list and endpoint status
        const fileListWidth = Math.floor(width * 0.6)
        const endpointWidth = width - fileListWidth - 2
        
        this.renderCompactFileList(listStartRow, 1, fileListWidth, listHeight)
        this.renderEndpointStatus(listStartRow, fileListWidth + 2, endpointWidth, listHeight)
      }
    } else {
      // Show empty state
      const emptyMsg = colors.dim('No files loaded. Enter a directory path above.')
      const emptyCol = this.centerText(emptyMsg, width)
      this.writeAt(startRow + 3, emptyCol, emptyMsg)
    }
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
  
  private renderProgressGrid(startRow: number, startCol: number, width: number): void {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    
    // Calculate grid dimensions to show ALL files
    const gridWidth = Math.min(width - 2, 80)
    const gridCols = Math.min(20, Math.floor(gridWidth / 4)) // Larger blocks (4 chars wide)
    const gridRows = Math.ceil(state.files.length / gridCols)
    const maxRows = Math.min(gridRows, 8) // Show more rows to fit all files
    
    // Center the grid
    const gridStartCol = startCol + Math.floor((width - (gridCols * 4)) / 2)
    
    let fileIndex = 0
    for (let row = 0; row < maxRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        if (fileIndex >= state.files.length) break
        
        const file = state.files[fileIndex]
        const syncStatus = this.syncStatusManager.getFileSyncStatus(file, nsiteContext, state.isDeploying)
        
        // Use large blocks with subtle colors
        let symbol = '██'
        let color = colors.dim
        
        if (syncStatus === 'synced') {
          symbol = '██'
          color = colors.dim  // Subtle gray for synced files
        } else if (syncStatus === 'partial') {
          symbol = '▓▓'
          color = colors.yellow
        } else if (syncStatus === 'local') {
          symbol = '▒▒'
          color = colors.cyan
        } else if (syncStatus === 'error') {
          symbol = '××'
          color = colors.red
        }
        
        this.writeAt(startRow + row, gridStartCol + (col * 4), color(symbol))
        fileIndex++
      }
    }
    
    // Only show overflow if we truly can't fit all files
    if (fileIndex < state.files.length) {
      const remaining = state.files.length - fileIndex
      const overflowText = colors.dim(`+${remaining} more`)
      this.writeAt(startRow + maxRows, gridStartCol, overflowText)
    }
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