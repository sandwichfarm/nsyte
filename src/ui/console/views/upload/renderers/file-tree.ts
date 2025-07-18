import { colors } from '@cliffy/ansi/colors'
import { BaseRenderer } from './base.ts'
import { UploadViewState } from '../state/types.ts'
import { UploadFileStatus } from '../../../contexts/types.ts'
import { FileSyncStatusManager } from '../logic/file-sync-status.ts'
import { NsiteContext } from '../../../contexts/types.ts'
import { buildFileTree, getTreeConnector } from '../utils.ts'
import { RELAY_SYMBOL, SERVER_SYMBOL } from '../../../../../commands/ls.ts'

export class FileTreeRenderer extends BaseRenderer {
  constructor(
    getState: () => UploadViewState,
    private syncStatusManager: FileSyncStatusManager,
    private getNsiteContext: () => NsiteContext | null,
    private relayColorMap: Map<string, (str: string) => string>,
    private serverColorMap: Map<string, (str: string) => string>,
    private configRelays: string[],
    private configServers: string[]
  ) {
    super(getState)
  }
  
  renderFilePropagation(startRow: number, startCol: number, width: number, height: number): void {
    const state = this.getState()
    
    // Header
    this.writeAt(startRow, startCol, colors.bold('File Propagation'))
    
    // Calculate symbol column widths
    const maxRelayCount = Math.min(this.configRelays.length, 8)
    const maxServerCount = Math.min(this.configServers.length, 8)
    const symbolWidth = maxRelayCount + 3 + maxServerCount
    const nameWidth = Math.max(width - symbolWidth - 5, 20)
    
    // Render header with pagination info
    const totalPages = Math.ceil(state.files.length / state.propagationPageSize)
    const pageInfo = totalPages > 1 ? ` (${state.propagationPage + 1}/${totalPages})` : ''
    this.drawHorizontalLine(startRow + 1, startCol, Math.max(10, width - 2 - pageInfo.length))
    if (pageInfo) {
      this.writeAt(startRow + 1, startCol + width - 2 - pageInfo.length, colors.dim(pageInfo))
    }
    
    // Render legend
    this.renderLegend(startRow + 2, startCol, width, maxRelayCount, maxServerCount)
    
    // Build and render file tree
    const startIndex = state.propagationPage * state.propagationPageSize
    const endIndex = Math.min(startIndex + state.propagationPageSize, state.files.length)
    const pageFiles = state.files.slice(startIndex, endIndex)
    
    if (pageFiles.length === 0) {
      this.writeAt(startRow + 5, startCol, colors.dim('No files to display'))
      return
    }
    
    const fileTree = buildFileTree(pageFiles)
    const maxRows = height - 6 // Account for header, legend, etc.
    
    this.renderFileTree(
      fileTree,
      startRow + 5,
      startCol,
      nameWidth,
      symbolWidth,
      maxRows,
      '',
      maxRelayCount,
      maxServerCount,
      0
    )
  }
  
  private renderLegend(
    row: number,
    startCol: number,
    width: number,
    maxRelayCount: number,
    maxServerCount: number
  ): void {
    let currentCol = startCol
    
    // Show relays
    this.writeAt(row, currentCol, colors.dim('Relays: '))
    currentCol += 8
    
    this.configRelays.slice(0, maxRelayCount).forEach((relay, index) => {
      const colorFn = this.relayColorMap.get(relay) || colors.white
      const relayHost = relay.replace(/^wss?:\/\//, '').split('/')[0].split(':')[0]
      const truncatedHost = relayHost.length > 12 ? relayHost.slice(0, 10) + '..' : relayHost
      
      this.writeAt(row, currentCol, colorFn(RELAY_SYMBOL + ' ' + truncatedHost))
      currentCol += truncatedHost.length + 4
    })
    
    // Separator
    this.writeAt(row, currentCol, colors.gray(' │ '))
    currentCol += 3
    
    // Show servers
    this.writeAt(row, currentCol, colors.dim('Servers: '))
    currentCol += 9
    
    this.configServers.slice(0, maxServerCount).forEach((server, index) => {
      const colorFn = this.serverColorMap.get(server) || colors.white
      const serverHost = server.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
      const truncatedHost = serverHost.length > 12 ? serverHost.slice(0, 10) + '..' : serverHost
      
      this.writeAt(row, currentCol, colorFn(SERVER_SYMBOL + ' ' + truncatedHost))
      currentCol += truncatedHost.length + 4
    })
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
    currentRow: number
  ): number {
    const state = this.getState()
    const nsiteContext = this.getNsiteContext()
    const entries = Object.entries(tree).sort(([a], [b]) => a.localeCompare(b))
    
    entries.forEach(([name, value], index) => {
      if (currentRow >= maxRows) return
      
      const isLast = index === entries.length - 1
      const connector = getTreeConnector(isLast)
      const isFile = value && typeof value === 'object' && 'path' in value
      
      let displayName = name
      if (displayName.length > nameWidth - prefix.length - 4) {
        displayName = displayName.slice(0, nameWidth - prefix.length - 7) + '...'
      }
      
      if (isFile) {
        // Get file from state
        const file = state.files.find(f => f.path === value.path)
        if (!file) return
        
        // Get propagation symbols
        const symbols = this.syncStatusManager.getFilePropagationSymbols(
          file,
          maxRelayCount,
          maxServerCount,
          nsiteContext,
          state.isDeploying
        )
        
        const treePrefix = `${prefix}${connector}`
        const fileName = colors.white(displayName)
        
        this.writeAt(
          startRow + currentRow,
          startCol,
          `${symbols} ${colors.gray(treePrefix)}${fileName}`
        )
      } else {
        // Show directory
        const emptyIndicators = ' '.repeat(maxRelayCount) + ` ${colors.gray('|')} ` + ' '.repeat(maxServerCount)
        const treePrefix = `${prefix}${connector}`
        const dirName = colors.gray(displayName + '/')
        
        this.writeAt(
          startRow + currentRow,
          startCol,
          `${emptyIndicators} ${colors.gray(treePrefix)}${dirName}`
        )
      }
      
      currentRow++
      
      // Recurse into subdirectories
      if (!isFile && value && typeof value === 'object' && Object.keys(value).length > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ')
        currentRow = this.renderFileTree(
          value,
          startRow,
          startCol,
          nameWidth,
          symbolWidth,
          maxRows,
          newPrefix,
          maxRelayCount,
          maxServerCount,
          currentRow
        )
      }
    })
    
    return currentRow
  }
}