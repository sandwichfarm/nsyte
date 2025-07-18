import { UploadFileStatus, NsiteContext } from '../../../contexts/types.ts'
import { colors } from '@cliffy/ansi/colors'
import { 
  getFileSyncStatus,
  getSyncStatusSymbol,
  getSyncStatusColor,
  renderSyncIndicators
} from '../../../components/file-sync-indicators.ts'

export type SyncStatus = 'synced' | 'local' | 'error' | 'partial'

export class FileSyncStatusManager {
  constructor(
    private relayColorMap: Map<string, (str: string) => string>,
    private serverColorMap: Map<string, (str: string) => string>,
    private configRelays: string[],
    private configServers: string[]
  ) {}
  
  /**
   * Get the sync status for a file, checking nsite context first if available
   */
  getFileSyncStatus(
    file: UploadFileStatus,
    nsiteContext: NsiteContext | null,
    isDeploying: boolean
  ): SyncStatus {
    // If we're not actively deploying and have nsite context, use actual sync data
    if (!isDeploying && nsiteContext?.files) {
      const nsiteFile = nsiteContext.files.find(f => f.path === file.path)
      if (nsiteFile) {
        return getFileSyncStatus(
          {
            foundOnRelays: nsiteFile.foundOnRelays || [],
            availableOnServers: nsiteFile.availableOnServers || []
          },
          this.configRelays,
          this.configServers
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
  
  /**
   * Get the colored icon for a sync status
   */
  getSyncStatusIcon(status: SyncStatus): string {
    const color = getSyncStatusColor(status)
    const symbol = getSyncStatusSymbol(status)
    return color(symbol)
  }
  
  /**
   * Get colored propagation symbols for a file
   */
  getFilePropagationSymbols(
    file: UploadFileStatus,
    maxRelayCount: number,
    maxServerCount: number,
    nsiteContext: NsiteContext | null,
    isDeploying: boolean
  ): string {
    // If we're not actively deploying and have nsite context, use the actual sync data
    if (!isDeploying && nsiteContext?.files) {
      const nsiteFile = nsiteContext.files.find(f => f.path === file.path)
      if (nsiteFile) {
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
    return this.buildUploadStatusIndicators(file, maxRelayCount, maxServerCount)
  }
  
  /**
   * Build indicators based on upload status (used during active deployment)
   */
  private buildUploadStatusIndicators(
    file: UploadFileStatus,
    maxRelayCount: number,
    maxServerCount: number
  ): string {
    const RELAY_SYMBOL = '●'
    const SERVER_SYMBOL = '■'
    
    // Build relay indicators
    let relayIndicators = ''
    this.configRelays.forEach((relay, index) => {
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
    relayIndicators += colors.gray('○'.repeat(Math.max(0, maxRelayCount - this.configRelays.length)))
    
    // Build server indicators
    let serverIndicators = ''
    this.configServers.forEach((server, index) => {
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
    serverIndicators += colors.gray('○'.repeat(Math.max(0, maxServerCount - this.configServers.length)))
    
    return `${relayIndicators} ${colors.gray('│')} ${serverIndicators}`
  }
  
  /**
   * Get connection status for a specific endpoint
   */
  getConnectionStatus(
    endpoint: string,
    type: 'server' | 'relay',
    files: UploadFileStatus[]
  ): { active: number; completed: number; failed: number } {
    let active = 0
    let completed = 0
    let failed = 0
    
    files.forEach(file => {
      const statusMap = type === 'server' ? file.servers : file.relays
      const status = statusMap?.[endpoint]
      
      if (status) {
        switch (status.status) {
          case 'uploading':
          case 'publishing':
            active++
            break
          case 'completed':
          case 'published':
            completed++
            break
          case 'failed':
            failed++
            break
        }
      }
    })
    
    return { active, completed, failed }
  }
  
  /**
   * Calculate sync summary statistics
   */
  getSyncSummary(
    files: UploadFileStatus[],
    nsiteContext: NsiteContext | null,
    isDeploying: boolean
  ): { synced: number; partial: number; local: number; error: number } {
    const summary = {
      synced: 0,
      partial: 0,
      local: 0,
      error: 0
    }
    
    files.forEach(file => {
      const status = this.getFileSyncStatus(file, nsiteContext, isDeploying)
      summary[status]++
    })
    
    return summary
  }
}