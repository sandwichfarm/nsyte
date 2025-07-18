import { colors } from '@cliffy/ansi/colors'
import { BaseRenderer } from './base.ts'
import { UploadViewState } from '../state/types.ts'
import { formatSize, formatDuration } from '../utils.ts'
import { ProjectConfig } from '../../../../../lib/config.ts'

export class CompletionRenderer extends BaseRenderer {
  constructor(
    getState: () => UploadViewState,
    private getEffectiveConfig: () => ProjectConfig
  ) {
    super(getState)
  }
  render(startRow: number, width: number, height: number): void {
    const state = this.getState()
    
    // Success banner
    const banner = this.getCompletionBanner()
    const bannerCol = this.centerText(banner, width)
    this.writeAt(startRow + 1, bannerCol, banner)
    
    // Summary stats
    this.renderSummaryStats(startRow + 3, width)
    
    // Deployment details
    this.renderDeploymentDetails(startRow + 10, width)
    
    // Next steps
    this.renderNextSteps(startRow + 18, width)
  }
  
  private getCompletionBanner(): string {
    const state = this.getState()
    
    if (state.stats.failedFiles > 0 || state.stats.failedEvents > 0) {
      return colors.yellow('⚠️  Deployment completed with errors')
    } else {
      return '🎉 Deployment successful!'
    }
  }
  
  private renderSummaryStats(startRow: number, width: number): void {
    const state = this.getState()
    
    // Calculate totals
    const totalSize = state.files.reduce((sum, f) => sum + f.size, 0)
    const duration = state.stats.endTime && state.stats.startTime 
      ? state.stats.endTime - state.stats.startTime 
      : 0
    
    // Create summary box
    const boxWidth = Math.min(60, width - 4)
    const boxStartCol = Math.floor((width - boxWidth) / 2)
    
    // Box top
    this.writeAt(startRow, boxStartCol, colors.gray('┌' + '─'.repeat(boxWidth - 2) + '┐'))
    
    // Stats
    const stats = []
    
    // Blob stats header
    stats.push(colors.bold('Blobs:'))
    stats.push(`  Uploaded: ${state.stats.uploadedFiles}`)
    stats.push(`  Skipped: ${colors.yellow(String(state.stats.skippedFiles))}`)
    stats.push(`  Failed: ${colors.red(String(state.stats.failedFiles))}`)
    
    // Separator
    stats.push('')
    
    // Event stats header
    stats.push(colors.bold('Events:'))
    stats.push(`  Published: ${state.stats.publishedEvents}`)
    stats.push(`  Failed: ${colors.red(String(state.stats.failedEvents))}`)
    
    // Separator
    stats.push('')
    
    // Summary info
    stats.push(`Total size: ${colors.cyan(formatSize(totalSize))}`)
    stats.push(`Duration: ${colors.cyan(formatDuration(duration))}`)
    
    stats.forEach((stat, index) => {
      if (stat) {
        const row = startRow + 1 + index
        this.writeAt(row, boxStartCol, colors.gray('│'))
        this.writeAt(row, boxStartCol + 2, stat)
        this.writeAt(row, boxStartCol + boxWidth - 1, colors.gray('│'))
      }
    })
    
    // Box bottom
    this.writeAt(startRow + stats.length + 1, boxStartCol, 
      colors.gray('└' + '─'.repeat(boxWidth - 2) + '┘')
    )
  }
  
  private renderDeploymentDetails(startRow: number, width: number): void {
    const state = this.getState()
    
    this.writeAt(startRow, 2, colors.bold('Deployment URLs:'))
    
    // Get first server URL as primary
    const config = this.getEffectiveConfig()
    const servers = config.servers || []
    if (servers.length > 0) {
      const primaryUrl = servers[0]
      const displayUrl = primaryUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      this.writeAt(startRow + 2, 4, `🌐 ${colors.cyan.underline(displayUrl)}`)
    }
    
    // Show relay count
    const relays = config.relays || []
    if (relays.length > 0) {
      this.writeAt(startRow + 3, 4, `📡 Published to ${relays.length} relays`)
    }
  }
  
  private renderNextSteps(startRow: number, width: number): void {
    const state = this.getState()
    
    this.writeAt(startRow, 2, colors.bold('Next steps:'))
    
    const steps = [
      `Press ${colors.gray('r')} to refresh and check sync status`,
      `Press ${colors.gray('3')} to browse your deployed files`,
      `Press ${colors.gray('d')} to deploy again with changes`,
      `Press ${colors.gray('p')} to deploy a different directory`,
    ]
    
    steps.forEach((step, index) => {
      this.writeAt(startRow + 2 + index, 4, step)
    })
    
    // Add warning if there were failures
    if (state.stats.failedFiles > 0 || state.stats.failedEvents > 0) {
      this.writeAt(startRow + 7, 2, 
        colors.yellow('⚠️  Some files or events failed. Check the timeline for details.')
      )
    }
  }
}