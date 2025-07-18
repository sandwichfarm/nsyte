import { colors } from '@cliffy/ansi/colors'
import { BaseRenderer } from './base.ts'
import { UploadViewState } from '../state/types.ts'
import { ProjectConfig } from '../../../../../lib/config.ts'

export class PathInputRenderer extends BaseRenderer {
  constructor(
    getState: () => UploadViewState,
    private getEffectiveConfig: () => ProjectConfig
  ) {
    super(getState)
  }
  
  render(startRow: number, width: number, height: number): void {
    const state = this.getState()
    
    if (state.showConfigOverrides) {
      // Delegate to config overrides renderer when in override mode
      return
    }
    
    // Split screen: left side for path, right side for session config
    const leftWidth = Math.floor(width * 0.5)
    const rightWidth = width - leftWidth - 2 // 2 for gap
    
    this.renderPathSection(startRow, 1, leftWidth)
    this.renderSessionConfigSection(startRow, leftWidth + 3, rightWidth)
  }
  
  private renderPathSection(startRow: number, startCol: number, width: number): void {
    const state = this.getState()
    
    // Header
    this.writeAt(startRow, startCol, colors.bold.green('📁 Website Files'))
    
    // Path input
    this.writeAt(startRow + 2, startCol, colors.bold('Directory: '))
    const pathLabel = colors.bold('Directory: ')
    const pathValue = state.deployPath
    const cursor = state.isEditingPath ? colors.yellow('█') : ''
    this.writeAt(startRow + 2, startCol, `${pathLabel}${colors.yellow(pathValue)}${cursor}`)
    
    if (state.isEditingPath) {
      this.writeAt(startRow + 3, startCol, colors.dim('Press [Enter] to scan directory'))
    }
    
    // Current path
    this.writeAt(startRow + 5, startCol, colors.dim('Current: ') + colors.cyan(state.currentPath))
  }
  
  private renderSessionConfigSection(startRow: number, startCol: number, width: number): void {
    const effectiveConfig = this.getEffectiveConfig()
    
    // Header
    this.writeAt(startRow, startCol, colors.bold.cyan('⚙️  Session Config'))
    
    // Config summary
    this.writeAt(startRow + 2, startCol, `Servers: ${colors.cyan(String(effectiveConfig.servers?.length || 0))}`)
    this.writeAt(startRow + 3, startCol, `Relays: ${colors.cyan(String(effectiveConfig.relays?.length || 0))}`)
    
    // Instructions
    this.writeAt(startRow + 5, startCol, colors.dim('Press [TAB] to edit'))
  }
  
  renderDeploySection(startRow: number, width: number): void {
    const state = this.getState()
    const effectiveConfig = this.getEffectiveConfig()
    
    // Deploy button styling
    const isAuthenticated = state.isAuthenticated
    const hasFiles = state.files.length > 0
    const canDeploy = isAuthenticated && hasFiles && !state.isDeploying
    
    let deployButton: string
    let deployHint: string
    
    if (!isAuthenticated) {
      deployButton = colors.gray('┌─────────────────────┐\n') +
                     colors.gray('│  🔐 Auth Required   │\n') +
                     colors.gray('└─────────────────────┘')
      deployHint = colors.red('Read-only mode: Authentication required for deployment')
    } else if (state.isDeploying) {
      deployButton = colors.yellow('┌─────────────────────┐\n') +
                     colors.yellow('│  ⚡ Deploying...    │\n') +
                     colors.yellow('└─────────────────────┘')
      deployHint = colors.yellow('Deployment in progress...')
    } else if (!hasFiles) {
      deployButton = colors.gray('┌─────────────────────┐\n') +
                     colors.gray('│  📁 No Files        │\n') +
                     colors.gray('└─────────────────────┘')
      deployHint = colors.gray('No files to deploy')
    } else {
      // Check if all files are already synced
      const syncedFiles = state.files.filter(f => f.status === 'completed').length
      const needsDeployment = syncedFiles < state.files.length
      
      if (needsDeployment) {
        deployButton = colors.green('┌─────────────────────┐\n') +
                       colors.green('│  🚀 Deploy to nsyte │\n') +
                       colors.green('└─────────────────────┘')
        deployHint = colors.green('Press [d] to start deployment')
      } else {
        deployButton = colors.blue('┌─────────────────────┐\n') +
                       colors.blue('│  ✓ All Deployed    │\n') +
                       colors.blue('└─────────────────────┘')
        deployHint = colors.blue('All files are already deployed. Press [d] to force re-deployment')
      }
    }
    
    // Center the button
    const buttonLines = deployButton.split('\n')
    buttonLines.forEach((line, index) => {
      if (line.trim()) {
        const col = this.centerText(line, width)
        this.writeAt(startRow + index, col, line)
      }
    })
    
    // Show hint below button
    const hintCol = this.centerText(deployHint, width)
    this.writeAt(startRow + 4, hintCol, deployHint)
    
    // Show file summary
    if (hasFiles) {
      const totalSize = state.files.reduce((sum, f) => sum + f.size, 0)
      const sizeStr = this.formatFileSize(totalSize)
      const fileSummary = `${state.files.length} files (${sizeStr})`
      const summaryCol = this.centerText(fileSummary, width)
      this.writeAt(startRow + 6, summaryCol, colors.dim(fileSummary))
    }
  }
  
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }
}