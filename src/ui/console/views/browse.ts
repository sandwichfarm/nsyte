import { ConsoleView, Identity } from '../types.ts'
import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../../lib/config.ts'
import { ConsoleContextManager } from '../contexts/manager.ts'
import { NsiteContext } from '../contexts/types.ts'
import { createInitialState, type BrowseState } from '../../browse/state.ts'
import { RELAY_COLORS, SERVER_COLORS } from '../../../commands/ls.ts'
import {
  DEFAULT_IGNORE_PATTERNS,
  type IgnoreRule,
  parseIgnorePatterns,
} from '../../../lib/files.ts'
import { join } from '@std/path'
import { existsSync } from '@std/fs/exists'
import { colors } from '@cliffy/ansi/colors'
import {
  clearScreen,
  moveCursor,
  getTerminalSize,
  renderForConsole as renderBrowse,
  renderUpdateForConsole as renderUpdate,
} from '../../browse/renderer.ts'
import {
  handleDeleteConfirmation,
  handleListModeKey,
  handleDetailModeKey,
  handleFilterMode,
} from '../../browse/handlers.ts'
import { createLogger } from '../../../lib/logger.ts'

const log = createLogger('browse-view')

export class BrowseView implements ConsoleView {
  name = 'Browse'
  private state: BrowseState | null = null
  private auth: string
  private config: ProjectConfig
  private identity: Identity
  private noCache: boolean
  private contextManager: ConsoleContextManager | null = null
  private nsiteContext: NsiteContext | null = null
  private relayColorMap = new Map<string, (str: string) => string>()
  private serverColorMap = new Map<string, (str: string) => string>()
  private ignoreRules: IgnoreRule[] = []

  constructor(auth: string, config: ProjectConfig, identity: Identity, noCache: boolean = false) {
    this.auth = auth
    this.config = config
    this.identity = identity
    this.noCache = noCache
  }

  async initialize(contextManager: ConsoleContextManager): Promise<void> {
    this.contextManager = contextManager
    this.nsiteContext = contextManager.getContext<NsiteContext>('nsite')
    
    if (!this.nsiteContext) {
      throw new Error('NsiteContext not available')
    }

    // Load ignore rules
    const cwd = Deno.cwd()
    const ignoreFilePath = join(cwd, '.nsite-ignore')
    this.ignoreRules = parseIgnorePatterns(DEFAULT_IGNORE_PATTERNS)
    
    if (existsSync(ignoreFilePath)) {
      try {
        const ignoreContent = await Deno.readTextFile(ignoreFilePath)
        const customPatterns = ignoreContent.split('\n').map((l) => l.trim()).filter((l) =>
          l && !l.startsWith('#')
        )
        this.ignoreRules = parseIgnorePatterns([...DEFAULT_IGNORE_PATTERNS, ...customPatterns])
      } catch (error) {
        log.warn(`Failed to read .nsite-ignore file: ${error}`)
      }
    }

    // Subscribe to context updates
    contextManager.subscribe('nsite', (context) => {
      this.nsiteContext = context as NsiteContext
      this.updateBrowseState()
    })

    // Initialize browse state
    this.updateBrowseState()
  }

  private updateBrowseState(): void {
    if (!this.nsiteContext) return

    const files = this.nsiteContext.files

    // Create color mappings
    const allRelays = new Set<string>()
    const allServers = new Set<string>()
    
    files.forEach(file => {
      file.foundOnRelays.forEach((relay: string) => allRelays.add(relay))
      file.availableOnServers.forEach((server: string) => allServers.add(server))
    })

    // Create color mappings for relays
    Array.from(allRelays).forEach((relay, index) => {
      this.relayColorMap.set(relay, RELAY_COLORS[index % RELAY_COLORS.length])
    })

    // Create color mappings for servers
    Array.from(allServers).forEach((server, index) => {
      this.serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length])
    })

    // Update browse state
    const { rows } = getTerminalSize()
    this.state = createInitialState(
      files,
      rows - 7, // Tab bar (2) + Path row (1) + Footer (2) + Header (2)
      this.relayColorMap,
      this.serverColorMap,
      this.ignoreRules,
      this.identity.pubkey
    )
    
    // Store auth for delete operations
    this.state.authOptions = {
      bunker: this.auth.startsWith('bunker://') ? this.auth : undefined,
      privatekey: this.auth.startsWith('nsec') ? this.auth : undefined,
    }
  }

  render(): void {
    if (!this.state) {
      moveCursor(3, 1)
      console.log(colors.red('Browse view not initialized'))
      return
    }

    // Use the original browse renderer with adjusted state
    renderBrowse(this.state, 3) // Start at line 3 due to tab bar
  }

  async handleInput(event: KeyPressEvent): Promise<boolean> {
    if (!this.state) return false
    
    const key = event.key || ''
    const sequence = event.sequence || ''
    
    // Handle filter mode
    if (this.state.filterMode) {
      const shouldRender = handleFilterMode(this.state, key, sequence)
      return shouldRender
    }
    
    // Handle delete confirmation
    if (this.state.confirmingDelete) {
      const shouldRender = await handleDeleteConfirmation(this.state, key, sequence)
      if (shouldRender && !this.state.confirmingDelete) {
        // Refresh after deletion complete
        setTimeout(() => this.render(), 2000)
      }
      return shouldRender
    }
    
    // Handle detail mode
    if (this.state.viewMode === 'detail') {
      const shouldContinue = handleDetailModeKey(this.state)
      return shouldContinue
    }
    
    // Handle list mode - but intercept 'q' to prevent exit
    if (key === 'q') {
      // In console mode, 'q' is handled by the parent console
      return false
    }
    
    const shouldContinue = handleListModeKey(this.state, key)
    
    // Return true to trigger a full render through console
    return shouldContinue
  }

  isEditing(): boolean {
    return this.state?.filterMode === true || this.state?.confirmingDelete === true
  }

  isTyping(): boolean {
    return this.state?.filterMode === true
  }
  
  getStatus(): { text: string; color?: (str: string) => string } {
    if (!this.state) {
      return { text: 'Not initialized' }
    }
    
    // Use the same status logic from browse renderer
    const status = this.state.status || `${this.state.selectedItems.size} selected`
    const color = this.state.statusColor
    
    return { text: status, color }
  }
  
  getHotkeys(): string[] {
    if (!this.state) return []
    
    const hotkeys: string[] = []
    
    if (this.state.viewMode === 'list') {
      if (this.state.confirmingDelete) {
        hotkeys.push(
          `${colors.red("Type 'yes' to confirm")}`,
          `${colors.gray('ESC')} Cancel`
        )
        if (this.state.deleteConfirmText) {
          hotkeys.push(`${colors.yellow(`[${this.state.deleteConfirmText}]`)}`)
        }
      } else if (this.state.filterMode) {
        hotkeys.push(
          `${colors.gray('ENTER')} Apply`,
          `${colors.gray('ESC')} Cancel`
        )
      } else {
        hotkeys.push(
          `${colors.gray('↑↓')} Navigate`,
          `${colors.gray('←→')} Pages`,
          `${colors.gray('SPACE')} Select`,
          `${colors.gray('s')} ${this.state.showSelectedOnly ? 'View All' : 'View Selected'}${this.state.selectedItems.size > 0 ? ` [${this.state.selectedItems.size}]` : ''}`,
        )
        
        if (this.state.selectedItems.size > 0) {
          hotkeys.push(`${colors.gray('a')} Deselect all`)
        }
        
        hotkeys.push(
          `${colors.gray('ENTER')} Details`,
          `${colors.gray('/')} Filter`,
          `${colors.gray('DEL')} Delete`
        )
      }
    } else {
      hotkeys.push(`${colors.gray('Any key')} Back to list`)
    }
    
    return hotkeys
  }
}