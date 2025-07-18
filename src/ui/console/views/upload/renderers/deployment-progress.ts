import { colors } from '@cliffy/ansi/colors'
import { BaseRenderer } from './base.ts'
import { UploadViewState } from '../state/types.ts'
import { FileSyncStatusManager } from '../logic/file-sync-status.ts'
import { ProjectConfig } from '../../../../../lib/config.ts'
import { formatSize, formatDuration, createProgressBar, getColoredFileName } from '../utils.ts'

export class DeploymentProgressRenderer extends BaseRenderer {
  constructor(
    getState: () => UploadViewState,
    private syncStatusManager: FileSyncStatusManager,
    private config: ProjectConfig
  ) {
    super(getState)
  }
  
  render(startRow: number, width: number, height: number): void {
    const state = this.getState()
    
    // Show current stage prominently
    this.renderCurrentStage(startRow, width)
    
    // Calculate layout
    const timelineHeight = Math.min(state.concurrency + 3, 8)
    this.renderTimeline(startRow + 3, timelineHeight, width)
    
    const columnsStartRow = startRow + 3 + timelineHeight + 1
    const remainingHeight = height - timelineHeight - 4
    
    // Three-column layout
    const gapWidth = 2
    const totalGaps = gapWidth * 2
    const availableWidth = width - totalGaps
    
    const gridWidth = Math.floor(availableWidth * 0.25)
    const statusWidth = Math.floor(availableWidth * 0.35)
    const propagationWidth = availableWidth - gridWidth - statusWidth
    
    this.renderProgressGrid(columnsStartRow, 1, gridWidth, remainingHeight)
    this.renderFileStatus(columnsStartRow, 1 + gridWidth + gapWidth, statusWidth, remainingHeight)
    this.renderActiveConnections(columnsStartRow, 1 + gridWidth + statusWidth + gapWidth * 2, propagationWidth, remainingHeight)
  }
  
  private renderCurrentStage(startRow: number, width: number): void {
    const state = this.getState()
    
    let stageText = ''
    let stageColor = colors.yellow
    
    switch (state.stage) {
      case 'preparing':
        stageText = '📋 Preparing deployment...'
        break
      case 'signing':
        stageText = '🔐 Loading signer and preparing events...'
        break
      case 'uploading':
        stageText = '📤 Uploading files to servers...'
        break
      case 'publishing':
        stageText = '📡 Publishing events to relays...'
        break
      case 'completed':
        stageText = '✅ Deployment completed!'
        stageColor = colors.green
        break
      case 'failed':
        stageText = '❌ Deployment failed'
        stageColor = colors.red
        break
      default:
        stageText = '⏳ ' + state.stage
    }
    
    const col = this.centerText(stageText, width)
    this.writeAt(startRow, col, stageColor(stageText))
  }
  
  private renderTimeline(startRow: number, height: number, width: number): void {
    const state = this.getState()
    
    this.writeAt(startRow, 1, colors.bold('Activity Timeline'))
    
    // Render timeline entries
    const visibleEntries = state.timeline.slice(-(height - 2))
    
    if (state.timeline.length === 0) {
      // Show stage-specific messages when no timeline entries
      let message = ''
      switch (state.stage) {
        case 'signing':
          message = 'Connecting to signer...'
          break
        case 'preparing':
          message = 'Preparing files for upload...'
          break
        default:
          message = 'Waiting for activity...'
      }
      this.writeAt(startRow + 2, 1, colors.dim(message))
    } else {
      visibleEntries.forEach((entry, index) => {
        const row = startRow + index + 2
        const timestamp = new Date(entry.startTime).toLocaleTimeString()
        const icon = this.getTimelineIcon(entry.type)
        const message = this.formatTimelineMessage(entry)
        
        this.writeAt(row, 1, `${colors.dim(timestamp)} ${icon} ${message}`)
      })
    }
  }
  
  private renderProgressGrid(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    
    this.writeAt(startRow, startCol, colors.bold('Progress'))
    this.drawHorizontalLine(startRow + 1, startCol, width)
    
    // Overall progress
    const overallProgress = this.calculateOverallProgress()
    this.writeAt(startRow + 3, startCol, 'Overall:')
    this.writeAt(startRow + 4, startCol, createProgressBar(overallProgress, width - 2))
    this.writeAt(startRow + 5, startCol, `${overallProgress}%`)
    
    // Upload progress
    const uploadProgress = state.stats.totalFiles > 0 
      ? Math.round((state.stats.uploadedFiles + state.stats.skippedFiles) / state.stats.totalFiles * 100)
      : 0
    this.writeAt(startRow + 7, startCol, 'Upload:')
    this.writeAt(startRow + 8, startCol, createProgressBar(uploadProgress, width - 2))
    this.writeAt(startRow + 9, startCol, `${state.stats.uploadedFiles}/${state.stats.totalFiles}`)
    
    // Events progress
    const eventProgress = state.stats.totalEvents > 0
      ? Math.round(state.stats.publishedEvents / state.stats.totalEvents * 100)
      : 0
    this.writeAt(startRow + 11, startCol, 'Events:')
    this.writeAt(startRow + 12, startCol, createProgressBar(eventProgress, width - 2))
    this.writeAt(startRow + 13, startCol, `${state.stats.publishedEvents}/${state.stats.totalEvents}`)
    
    // Stats - Files/Blobs
    this.writeAt(startRow + 15, startCol, colors.dim('Blobs:'))
    this.writeAt(startRow + 16, startCol, `  ✓ Uploaded: ${state.stats.uploadedFiles}`)
    this.writeAt(startRow + 17, startCol, `  ${colors.yellow('↻')} Skipped: ${colors.yellow(String(state.stats.skippedFiles))}`)
    this.writeAt(startRow + 18, startCol, `  ${colors.red('✗')} Failed: ${colors.red(String(state.stats.failedFiles))}`)
    
    // Stats - Events
    const eventRow = startRow + 20
    this.writeAt(eventRow, startCol, colors.dim('Events:'))
    this.writeAt(eventRow + 1, startCol, `  ✓ Published: ${state.stats.publishedEvents}`)
    this.writeAt(eventRow + 2, startCol, `  ${colors.red('✗')} Failed: ${colors.red(String(state.stats.failedEvents))}`)
  
    
    // Duration
    if (state.stats.startTime) {
      const duration = Date.now() - state.stats.startTime
      const timeRow = state.stats.failedEvents > 0 ? eventRow + 4 : eventRow + 3
      this.writeAt(timeRow, startCol, colors.dim('Time:'))
      this.writeAt(timeRow + 1, startCol, formatDuration(duration))
    }
  }
  
  private renderFileStatus(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    
    this.writeAt(startRow, startCol, colors.bold('File Activity'))
    this.drawHorizontalLine(startRow + 1, startCol, width)
    
    // Get active files (uploading, publishing, or recently completed)
    const activeFiles = this.getActiveFiles()
    const maxVisible = height - 3
    
    activeFiles.slice(0, maxVisible).forEach((file, index) => {
      const row = startRow + 2 + index
      this.renderFileStatusLine(row, startCol, width, file)
    })
    
    if (activeFiles.length === 0) {
      this.writeAt(startRow + 3, startCol, colors.dim('Waiting for activity...'))
    }
  }
  
  private renderActiveConnections(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    
    this.writeAt(startRow, startCol, colors.bold('Active Connections'))
    this.drawHorizontalLine(startRow + 1, startCol, width)
    
    let currentRow = startRow + 3
    
    // Servers
    const servers = this.config.servers || []
    if (servers.length > 0) {
      this.writeAt(currentRow, startCol, colors.dim('Servers:'))
      currentRow++
      
      servers.forEach(server => {
        if (currentRow - startRow >= height - 1) return
        
        const status = this.syncStatusManager.getConnectionStatus(server, 'server', state.files)
        const serverHost = server.replace(/^https?:\/\//, '').split('/')[0]
        const truncatedHost = serverHost.length > width - 20 
          ? serverHost.slice(0, width - 23) + '...' 
          : serverHost
        
        const statusText = this.formatConnectionStatus(status)
        this.writeAt(currentRow, startCol + 2, `${colors.blue('■')} ${truncatedHost} ${statusText}`)
        currentRow++
      })
    }
    
    // Relays
    const relays = this.config.relays || []
    if (relays.length > 0 && currentRow - startRow < height - 3) {
      currentRow++ // spacing
      this.writeAt(currentRow, startCol, colors.dim('Relays:'))
      currentRow++
      
      relays.forEach(relay => {
        if (currentRow - startRow >= height - 1) return
        
        const status = this.syncStatusManager.getConnectionStatus(relay, 'relay', state.files)
        const relayHost = relay.replace(/^wss?:\/\//, '').split('/')[0]
        const truncatedHost = relayHost.length > width - 20 
          ? relayHost.slice(0, width - 23) + '...' 
          : relayHost
        
        const statusText = this.formatConnectionStatus(status)
        this.writeAt(currentRow, startCol + 2, `${colors.magenta('●')} ${truncatedHost} ${statusText}`)
        currentRow++
      })
    }
  }
  
  private getActiveFiles(): any[] {
    const state = this.getState()
    
    return state.files
      .filter(f => {
        // Active if uploading, publishing, or recently completed
        const isActive = f.status === 'uploading' || 
          (f.relays && Object.values(f.relays).some(r => r.status === 'publishing')) ||
          (f.uploadEndTime && Date.now() - f.uploadEndTime < 5000)
        return isActive
      })
      .sort((a, b) => {
        // Sort by activity: uploading first, then publishing, then recently completed
        if (a.status === 'uploading' && b.status !== 'uploading') return -1
        if (b.status === 'uploading' && a.status !== 'uploading') return 1
        return 0
      })
  }
  
  private renderFileStatusLine(row: number, col: number, width: number, file: any): void {
    const fileName = file.path.split('/').pop() || file.path
    const truncatedName = fileName.length > width - 25 
      ? '...' + fileName.slice(-(width - 28))
      : fileName
    
    let statusIcon = ''
    let statusText = ''
    let progress = 0
    
    if (file.status === 'uploading') {
      statusIcon = colors.yellow('↻')
      statusText = colors.yellow('Uploading')
      // Calculate upload progress
      const activeServers = Object.values(file.servers || {})
        .filter((s: any) => s.status === 'uploading')
      if (activeServers.length > 0) {
        progress = Math.max(...activeServers.map((s: any) => s.progress || 0))
      }
    } else if (file.relays && Object.values(file.relays).some((r: any) => r.status === 'publishing')) {
      statusIcon = colors.cyan('⚡')
      statusText = colors.cyan('Publishing')
      progress = 100 // Files are uploaded, now publishing events
    } else if (file.status === 'completed') {
      statusIcon = colors.green('✓')
      statusText = colors.green('Complete')
      progress = 100
    } else if (file.status === 'failed') {
      statusIcon = colors.red('✗')
      statusText = colors.red('Failed')
      progress = 0
    }
    
    // Build the status line
    const progressBar = createProgressBar(progress, 10)
    const sizeText = colors.dim(formatSize(file.size))
    
    this.writeAt(row, col, 
      `${statusIcon} ${getColoredFileName(truncatedName, file.status)} ${progressBar} ${statusText} ${sizeText}`
    )
  }
  
  private calculateOverallProgress(): number {
    const state = this.getState()
    
    // Weight: 80% for file upload, 20% for event publishing
    const uploadWeight = 0.8
    const publishWeight = 0.2
    
    const uploadProgress = state.stats.totalFiles > 0
      ? (state.stats.uploadedFiles + state.stats.skippedFiles) / state.stats.totalFiles
      : 0
      
    const publishProgress = state.stats.totalEvents > 0
      ? state.stats.publishedEvents / state.stats.totalEvents
      : 0
    
    return Math.round((uploadProgress * uploadWeight + publishProgress * publishWeight) * 100)
  }
  
  private getTimelineIcon(type: string): string {
    switch (type) {
      case 'upload': return colors.yellow('📄')
      case 'publish': return colors.cyan('📡')
      case 'sign': return colors.blue('✍')
      default: return colors.gray('•')
    }
  }
  
  private formatTimelineMessage(entry: any): string {
    const fileName = entry.fileName || 'file'
    
    switch (entry.type) {
      case 'upload':
        if (entry.status === 'active') {
          return `Uploading ${colors.white(fileName)}`
        } else if (entry.status === 'completed') {
          return `Uploaded ${colors.green(fileName)}`
        } else {
          return `Failed ${colors.red(fileName)}`
        }
      case 'publish':
        if (entry.status === 'active') {
          return `Publishing to ${colors.cyan(entry.relay || 'relay')}`
        } else if (entry.status === 'completed') {
          return `Published to ${colors.green(entry.relay || 'relay')}`
        } else {
          return `Failed publishing to ${colors.red(entry.relay || 'relay')}`
        }
      case 'sign':
        if (entry.status === 'completed') {
          return `Signed events for ${colors.white(fileName)}`
        } else {
          return `Signing events for ${colors.white(fileName)}`
        }
      default:
        return 'Unknown event'
    }
  }
  
  private formatConnectionStatus(status: { active: number; completed: number; failed: number }): string {
    const parts = []
    if (status.active > 0) parts.push(colors.yellow(`${status.active}↻`))
    if (status.completed > 0) parts.push(colors.green(`${status.completed}✓`))
    if (status.failed > 0) parts.push(colors.red(`${status.failed}✗`))
    
    return parts.length > 0 ? parts.join(' ') : colors.dim('idle')
  }
}