import { ConsoleView } from '../types.ts'
import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../../lib/config.ts'
import { listRemoteFilesWithProgress } from '../../../commands/browse-loader.ts'
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
  render as renderBrowse,
  renderUpdate,
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
  private noCache: boolean
  private relays: string[] = []
  private files: any[] = []
  private relayColorMap = new Map<string, (str: string) => string>()
  private serverColorMap = new Map<string, (str: string) => string>()
  private ignoreRules: IgnoreRule[] = []

  constructor(auth: string, config: ProjectConfig, noCache: boolean = false) {
    this.auth = auth
    this.config = config
    this.noCache = noCache
  }

  async preload(): Promise<void> {
    // Resolve relays from config
    if (this.config.relays && this.config.relays.length > 0) {
      this.relays = this.config.relays
    } else {
      // Use discovery relays as fallback
      const { resolveRelays } = await import('../../../lib/resolver-utils.ts')
      this.relays = resolveRelays({}, null, true)
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

    // Resolve pubkey from auth
    const { resolvePubkey } = await import('../../../lib/resolver-utils.ts')
    let pubkey: string
    if (this.auth.startsWith('bunker://')) {
      // Parse bunker URL to get pubkey
      const url = new URL(this.auth)
      const hexPubkey = url.hostname || url.pathname.replace(/^\/+/, '')
      if (!hexPubkey || hexPubkey.length !== 64) {
        throw new Error('Invalid bunker URL')
      }
      pubkey = hexPubkey
    } else {
      // Use resolvePubkey for other auth types
      pubkey = await resolvePubkey({ privatekey: this.auth })
    }

    // Fetch files
    this.files = await listRemoteFilesWithProgress(this.relays, pubkey, true) // silent mode

    // Create color mappings
    const allRelays = new Set<string>()
    const allServers = new Set<string>()
    
    this.files.forEach(file => {
      file.foundOnRelays.forEach((relay: string) => allRelays.add(relay))
      file.availableOnServers.forEach((server: string) => allServers.add(server))
    })
    
    Array.from(allRelays).forEach((relay, index) => {
      this.relayColorMap.set(relay, RELAY_COLORS[index % RELAY_COLORS.length])
    })
    
    Array.from(allServers).forEach((server, index) => {
      this.serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length])
    })

    // Initialize state
    const { rows } = getTerminalSize()
    this.state = createInitialState(
      this.files,
      rows - 7, // Tab bar (2) + Path row (1) + Footer (2) + Header (2)
      this.relayColorMap,
      this.serverColorMap,
      this.ignoreRules,
      pubkey,
      undefined
    )
    
    // Store auth for delete operations
    this.state.authOptions = {
      bunker: this.auth.startsWith('bunker://') ? this.auth : undefined,
      privatekey: this.auth.startsWith('nsec') ? this.auth : undefined,
    }
  }

  render(): void {
    if (!this.state) {
      moveCursor(1, 3)
      console.log(colors.red('Browse view not initialized'))
      return
    }

    // Adjust for console layout (tab bar takes 2 lines)
    const { rows } = getTerminalSize()
    this.state.pageSize = rows - 7 // Tab bar (2) + Path row (1) + Footer (2) + Header (2)
    
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
    
    // For up/down navigation, do a partial render
    if (key === 'up' || key === 'down') {
      renderUpdate(this.state, 3) // Start at line 3 due to tab bar
      return true
    }
    
    return shouldContinue
  }

  isEditing(): boolean {
    return this.state?.filterMode === true || this.state?.confirmingDelete === true
  }
}