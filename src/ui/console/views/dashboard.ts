import { ConsoleView, Identity } from '../types.ts'
import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../../lib/config.ts'
import { colors } from '@cliffy/ansi/colors'
import {
  moveCursor,
  getTerminalSize,
} from '../../browse/renderer.ts'
import { listRemoteFilesWithProgress } from '../../../commands/browse-loader.ts'

interface DashboardState {
  identity: Identity
  config: ProjectConfig
  projectPath: string
  fileCount: number
  totalSize: number
  relayCount: number
  serverCount: number
  lastUpdated?: Date
}

export class DashboardView implements ConsoleView {
  name = 'Dashboard'
  private state: DashboardState

  constructor(identity: Identity, projectPath: string, config: ProjectConfig) {
    this.state = {
      identity,
      config,
      projectPath,
      fileCount: 0,
      totalSize: 0,
      relayCount: config.relays?.length || 0,
      serverCount: config.servers?.length || 0,
    }
  }

  async initialize(contextManager: any): Promise<void> {
    // TODO: Implement context integration
  }

  async preload(onProgress?: (message: string) => void): Promise<void> {
    try {
      // Resolve relays from config
      const relays = this.state.config.relays || []
      if (relays.length === 0) {
        // Use discovery relays as fallback
        const { resolveRelays } = await import('../../../lib/resolver-utils.ts')
        relays.push(...resolveRelays({}, null, true))
      }

      // Fetch actual file stats
      const files = await listRemoteFilesWithProgress(relays, this.state.identity.pubkey, true)
      this.state.fileCount = files.length
      // Files don't have size property directly, so just use 0 for now
      this.state.totalSize = 0
      this.state.lastUpdated = new Date()
    } catch (error) {
      // Fallback to placeholder values if fetch fails
      this.state.fileCount = 0
      this.state.totalSize = 0
    }
  }

  render(): void {
    const { rows, cols } = getTerminalSize()
    
    // Clear content area (starting from line 3 because of tab bar)
    // Leave room for footer (2 lines)
    for (let i = 3; i <= rows - 2; i++) {
      moveCursor(i, 1)
      Deno.stdout.writeSync(new TextEncoder().encode('\x1b[K'))
    }
    
    let currentRow = 4
    
    // Title
    const title = colors.bold.cyan('nsyte Dashboard')
    moveCursor(currentRow, Math.floor((cols - 15) / 2))
    console.log(title)
    currentRow += 2
    
    // Identity Section
    moveCursor(currentRow++, 3)
    console.log(colors.bold.magenta('Identity'))
    
    moveCursor(currentRow++, 5)
    console.log(`Public Key: ${colors.green(this.formatPubkey(this.state.identity.npub))}`)
    
    moveCursor(currentRow++, 5)
    const authLabel = this.state.identity.authMethod === 'bunker' ? 'Bunker' : 
                     this.state.identity.authMethod === 'nsec' ? 'Private Key' : 'Read Only'
    console.log(`Auth Method: ${colors.yellow(authLabel)}`)
    
    if (this.state.identity.bunkerUrl) {
      moveCursor(currentRow++, 5)
      const bunkerUrl = new URL(this.state.identity.bunkerUrl)
      const relayUrl = bunkerUrl.searchParams.get('relay') || 'Unknown'
      console.log(`Bunker Relay: ${colors.dim(relayUrl)}`)
    }
    
    currentRow++
    
    // Project Stats Section
    moveCursor(currentRow++, 3)
    console.log(colors.bold.magenta('Project Stats'))
    
    moveCursor(currentRow++, 5)
    console.log(`Project Path: ${colors.cyan(this.state.projectPath)}`)
    
    moveCursor(currentRow++, 5)
    console.log(`Files: ${colors.yellow(this.state.fileCount.toString())}`)
    
    moveCursor(currentRow++, 5)
    console.log(`Total Size: ${colors.yellow(this.formatSize(this.state.totalSize))}`)
    
    if (this.state.lastUpdated) {
      moveCursor(currentRow++, 5)
      console.log(`Last Updated: ${colors.dim(this.formatTime(this.state.lastUpdated))}`)
    }
    
    currentRow++
    
    // Network Section
    moveCursor(currentRow++, 3)
    console.log(colors.bold.magenta('Network Configuration'))
    
    moveCursor(currentRow++, 5)
    console.log(`Relays: ${colors.cyan(this.state.relayCount.toString())} configured`)
    
    if (this.state.config.relays && this.state.config.relays.length > 0) {
      this.state.config.relays.slice(0, 3).forEach(relay => {
        moveCursor(currentRow++, 7)
        console.log(colors.dim(`• ${relay}`))
      })
      if (this.state.config.relays.length > 3) {
        moveCursor(currentRow++, 7)
        console.log(colors.dim(`• ... and ${this.state.config.relays.length - 3} more`))
      }
    }
    
    currentRow++
    
    moveCursor(currentRow++, 5)
    console.log(`Blossom Servers: ${colors.cyan(this.state.serverCount.toString())} configured`)
    
    if (this.state.config.servers && this.state.config.servers.length > 0) {
      this.state.config.servers.slice(0, 3).forEach(server => {
        moveCursor(currentRow++, 7)
        console.log(colors.dim(`• ${server}`))
      })
      if (this.state.config.servers.length > 3) {
        moveCursor(currentRow++, 7)
        console.log(colors.dim(`• ... and ${this.state.config.servers.length - 3} more`))
      }
    }
    
    // Footer is now handled by the parent console
  }

  async handleInput(event: KeyPressEvent): Promise<boolean> {
    // Dashboard is read-only, no special input handling
    return false
  }

  isEditing(): boolean {
    return false
  }

  private formatPubkey(npub: string): string {
    return `${npub.substring(0, 16)}...${npub.substring(npub.length - 8)}`
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  
  private formatTime(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
    return `${Math.floor(seconds / 86400)} days ago`
  }
}