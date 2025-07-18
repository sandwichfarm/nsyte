import { Command } from '@cliffy/command'
import { keypress } from '@cliffy/keypress'
import { colors } from '@cliffy/ansi/colors'
import {
  clearScreen,
  enterAlternateScreen,
  exitAlternateScreen,
  hideCursor,
  showCursor,
  moveCursor,
  getTerminalSize,
} from '../ui/browse/renderer.ts'
import { ConsoleView, ConsoleState, Identity } from '../ui/console/types.ts'
import { ConsoleContextManager } from '../ui/console/contexts/manager.ts'
import { ContextType } from '../ui/console/contexts/types.ts'
import { DashboardView } from '../ui/console/views/dashboard.ts'
import { ConfigView } from '../ui/console/views/config.ts'
import { BrowseView } from '../ui/console/views/browse.ts'
import { UploadView } from '../ui/console/views/upload.ts'
import { renderTabBar } from '../ui/console/tab-bar.ts'
import { renderFooter } from '../ui/console/footer.ts'
import { initializeConsole } from '../ui/console/initializer.ts'
import { nip19 } from 'nostr-tools'

export const consoleCommand = new Command()
  .name('console')
  .description('Unified TUI interface for nsyte management')
  .option('-a, --auth <auth:string>', 'Authentication string (bunker URL or nsec)')
  .option('--bunker <bunker:string>', 'Name of bunker from secrets manager')
  .option('--no-cache', 'Disable cache usage')
  .action(async (options) => {
    let state: ConsoleState | null = null

    let renderTimer: number | undefined
    
    const cleanup = () => {
      showCursor()
      exitAlternateScreen()
      if (state?.keyboardHandler) {
        state.keyboardHandler.dispose()
      }
      if (renderTimer) {
        clearInterval(renderTimer)
      }
    }

    const handleResize = () => {
      if (state) {
        render(state)
      }
    }

    try {
      enterAlternateScreen()
      hideCursor()
      clearScreen()

      // Initialize console with unified loader
      const initialState = await initializeConsole(options)

      // Clear screen and show loading state
      clearScreen()
      const { rows, cols } = getTerminalSize()
      
      // Show console title
      const title = colors.bold.cyan('nsyte console')
      const titleRow = Math.floor(rows / 2) - 4
      moveCursor(titleRow, Math.floor((cols - 13) / 2)) // 13 is length of "nsyte console" without formatting
      console.log(title)
      
      // Show loading header
      const loadingHeader = colors.gray('Initializing unified TUI...')
      moveCursor(titleRow + 2, Math.floor((cols - 27) / 2)) // 27 is the text length
      console.log(loadingHeader)

      // Extract identity information
      let identity: Identity
      if (initialState.auth.startsWith('bunker://')) {
        const url = new URL(initialState.auth)
        const pubkey = url.hostname || url.pathname.replace(/^\/+/, '')
        identity = {
          pubkey,
          npub: nip19.npubEncode(pubkey),
          authMethod: 'bunker',
          bunkerUrl: initialState.auth,
          originalAuth: initialState.auth
        }
      } else if (initialState.auth.startsWith('nsec')) {
        const { getPublicKey, nip19 } = await import('nostr-tools')
        const decoded = nip19.decode(initialState.auth)
        if (decoded.type === 'nsec') {
          const pubkey = getPublicKey(decoded.data as Uint8Array)
          identity = {
            pubkey,
            npub: nip19.npubEncode(pubkey),
            authMethod: 'nsec',
            originalAuth: initialState.auth
          }
        } else {
          throw new Error('Invalid nsec')
        }
      } else {
        // It's a hex pubkey - check if it's from project bunker
        identity = {
          pubkey: initialState.auth,
          npub: nip19.npubEncode(initialState.auth),
          authMethod: initialState.isProjectBunker ? 'bunker' : 'hex',
          // Don't set originalAuth for project bunker - the signer will use the config
          originalAuth: initialState.isProjectBunker ? undefined : initialState.auth
        }
      }

      // Create context manager
      const contextManager = new ConsoleContextManager(identity, initialState.config, initialState.projectPath)

      // Create state with identity and context manager
      state = {
        ...initialState,
        identity,
        contextManager,
        status: 'Ready',
        statusColor: colors.green
      }

      // Set up views
      const views: Record<string, ConsoleView> = {
        dashboard: new DashboardView(state.identity, state.projectPath, state.config),
        config: new ConfigView(state.projectPath, state.config),
        browse: new BrowseView(state.auth, state.config, state.identity, !options.cache),
        upload: new UploadView(state.config, state.identity, state.projectPath),
      }

      // Show progress for each context with spinner
      const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
      let spinnerIndex = 0
      const contexts = ['identity', 'config', 'nsite', 'upload', 'operations'] as const
      const totalContexts = contexts.length
      let loadedCount = 0
      
      for (const contextType of contexts) {
        const displayName = contextType.charAt(0).toUpperCase() + contextType.slice(1)
        const statusRow = titleRow + 4 + loadedCount
        
        // Current status message
        let currentStatus = `Loading ${displayName} context...`
        
        // Show loading status with spinner
        const loadingInterval = setInterval(() => {
          const spinner = colors.cyan(spinnerFrames[spinnerIndex])
          const status = spinner + ' ' + currentStatus
          moveCursor(statusRow, Math.floor((cols - status.replace(/\x1b\[[0-9;]*m/g, '').length) / 2))
          Deno.stdout.writeSync(new TextEncoder().encode('\x1b[K' + status))
          spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length
        }, 100)
        
        // Create progress callback to update status
        const onProgress = (message: string) => {
          currentStatus = message
        }
        
        await contextManager.loadContext(contextType, onProgress)
        clearInterval(loadingInterval)
        
        // Show completed status
        const completed = colors.green('✓') + ' ' + displayName + ' context loaded'
        moveCursor(statusRow, Math.floor((cols - completed.replace(/\x1b\[[0-9;]*m/g, '').length) / 2))
        Deno.stdout.writeSync(new TextEncoder().encode('\x1b[K' + completed))
        
        loadedCount++
      }
      
      // Initialize views with context manager
      for (const [name, view] of Object.entries(views)) {
        await view.initialize(contextManager)
        // Set up view switch callback for views that need it
        if (view.setViewSwitchCallback) {
          view.setViewSwitchCallback((viewName: string) => {
            if (state && state.views[viewName]) {
              state.currentView = viewName
              render(state)
            }
          })
        }
      }
      
      // Show final status
      const finalStatus = colors.green('All contexts loaded successfully!')
      moveCursor(titleRow + 4 + totalContexts + 1, Math.floor((cols - 30) / 2))
      console.log(finalStatus)
      
      // Brief pause to show completion
      await new Promise(resolve => setTimeout(resolve, 500))

      state.views = views
      state.currentView = 'dashboard'

      // Set up resize handler
      Deno.addSignalListener('SIGWINCH', handleResize)

      // Clear screen once before starting
      clearScreen()
      
      // Initial render
      render(state)

      // Set up keyboard handler
      const keypressIterator = keypress()
      state.keyboardHandler = keypressIterator
      
      // Set up render timer for active operations
      renderTimer = setInterval(() => {
        if (state) {
          // Check if any view has active operations
          const currentView = state.views[state.currentView]
          if (currentView && typeof currentView.hasActiveUploadOperations === 'function' && currentView.hasActiveUploadOperations()) {
            render(state)
          }
        }
      }, RENDER_INTERVAL_MS) // Update every 500ms during active operations
      
      for await (const event of keypressIterator) {
        // Check if any view is currently typing (text input active)
        const isTyping = state && state.views[state.currentView].isTyping?.()
        
        // Global hotkeys (only when not typing)
        if (!isTyping && event.ctrlKey && event.key === 'c') {
          cleanup()
          Deno.exit(0)
        }

        if (!isTyping && event.key === 'q' && state) {
          cleanup()
          Deno.exit(0)
        }
        
        // Global identity switch (available from any view when not editing and not typing)
        if (!isTyping && event.key === 'i' && state && !state.views[state.currentView].isEditing?.()) {
          await handleIdentitySwitch(state)
          continue
        }

        // Tab switching with number keys (only when not typing)
        if (!isTyping && state) {
          const viewKeys = Object.keys(state.views)
          const keyNum = parseInt(event.key || '')
          if (!isNaN(keyNum) && keyNum > 0 && keyNum <= viewKeys.length) {
            const newView = viewKeys[keyNum - 1]
            if (newView !== state.currentView) {
              state.currentView = newView
              render(state)
              continue
            }
          }
        }

        // Always pass event to current view (for both typing and non-typing modes)
        if (state) {
          const handled = await state.views[state.currentView].handleInput(event)
          if (handled) {
            render(state)
          }
        }
      }
    } catch (error) {
      cleanup()
      console.error('Error in console:', error)
      Deno.exit(1)
    }
  });

async function handleIdentitySwitch(state: ConsoleState): Promise<void> {
  try {
    // Save current view before switching
    const currentViewName = state.currentView
    
    // Show loading message
    clearScreen()
    const { rows, cols } = getTerminalSize()
    const title = colors.bold.cyan('nsyte console')
    const titleRow = Math.floor(rows / 2) - 2
    moveCursor(titleRow, Math.floor((cols - 13) / 2))
    console.log(title)
    
    const status = colors.yellow('Switching identity...')
    moveCursor(titleRow + 2, Math.floor((cols - 20) / 2))
    console.log(status)
    
    // Initialize new identity (reuse existing initialization logic)
    let newInitialState
    try {
      newInitialState = await initializeConsole({ noCache: false })
    } catch (error) {
      // User cancelled or error occurred
      clearScreen()
      render(state)
      return
    }
    
    // Extract new identity
    let newIdentity: Identity
    if (newInitialState.auth.startsWith('bunker://')) {
      const url = new URL(newInitialState.auth)
      const pubkey = url.hostname || url.pathname.replace(/^\/+/, '')
      newIdentity = {
        pubkey,
        npub: nip19.npubEncode(pubkey),
        authMethod: 'bunker',
        bunkerUrl: newInitialState.auth
      }
    } else if (newInitialState.auth.startsWith('nsec')) {
      const { getPublicKey, nip19 } = await import('nostr-tools')
      const decoded = nip19.decode(newInitialState.auth)
      if (decoded.type === 'nsec') {
        const pubkey = getPublicKey(decoded.data as Uint8Array)
        newIdentity = {
          pubkey,
          npub: nip19.npubEncode(pubkey),
          authMethod: 'nsec',
          originalAuth: newInitialState.auth
        }
      } else {
        throw new Error('Invalid nsec')
      }
    } else {
      newIdentity = {
        pubkey: newInitialState.auth,
        npub: nip19.npubEncode(newInitialState.auth),
        authMethod: newInitialState.isProjectBunker ? 'bunker' : 'hex',
        // Don't set originalAuth for project bunker - the signer will use the config
        originalAuth: newInitialState.isProjectBunker ? undefined : newInitialState.auth
      }
    }
    
    // Update state
    state.identity = newIdentity
    state.auth = newInitialState.auth
    state.config = newInitialState.config
    state.projectPath = newInitialState.projectPath
    
    // Create new context manager with new identity
    const newContextManager = new ConsoleContextManager(newIdentity, newInitialState.config, newInitialState.projectPath)
    state.contextManager = newContextManager
    
    // Show context loading progress
    const contexts = ['identity', 'config', 'nsite', 'upload', 'operations'] as const
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    let spinnerIndex = 0
    
    for (let i = 0; i < contexts.length; i++) {
      const contextType = contexts[i]
      const displayName = contextType.charAt(0).toUpperCase() + contextType.slice(1)
      const statusRow = titleRow + 4 + i
      
      let currentStatus = `Loading ${displayName} context...`
      
      const loadingInterval = setInterval(() => {
        const spinner = colors.cyan(spinnerFrames[spinnerIndex])
        const loadingStatus = spinner + ' ' + currentStatus
        moveCursor(statusRow, Math.floor((cols - loadingStatus.replace(/\x1b\[[0-9;]*m/g, '').length) / 2))
        Deno.stdout.writeSync(new TextEncoder().encode('\x1b[K' + loadingStatus))
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length
      }, 100)
      
      const onProgress = (message: string) => {
        currentStatus = message
      }
      
      await newContextManager.loadContext(contextType, onProgress)
      clearInterval(loadingInterval)
      
      // Show completed status
      const completed = colors.green('✓') + ' ' + displayName + ' context loaded'
      moveCursor(statusRow, Math.floor((cols - completed.replace(/\x1b\[[0-9;]*m/g, '').length) / 2))
      Deno.stdout.writeSync(new TextEncoder().encode('\x1b[K' + completed))
    }
    
    // Reinitialize views with new context manager
    for (const [name, view] of Object.entries(state.views)) {
      await view.initialize(newContextManager)
    }
    
    // Show completion message
    const finalStatus = colors.green('Identity switched successfully!')
    moveCursor(titleRow + 4 + contexts.length + 1, Math.floor((cols - 30) / 2))
    console.log(finalStatus)
    
    // Brief pause to show completion
    await new Promise(resolve => setTimeout(resolve, 800))
    
    // Clear screen and resume normal operation
    clearScreen()
    render(state)
    
  } catch (error) {
    // Log error for debugging
    console.error('Identity switch error:', error)
    
    // Show user-friendly error message
    clearScreen()
    const { rows, cols } = getTerminalSize()
    const errorMsg = 'Failed to switch identity. Returning to console...'
    const errorRow = Math.floor(rows / 2)
    moveCursor(errorRow, Math.floor((cols - errorMsg.length) / 2))
    console.log(colors.red(errorMsg))
    
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Return to normal console view
    clearScreen()
    render(state)
  }
}

function render(state: ConsoleState) {
  // Clear screen first
  clearScreen()
  
  // Always render tab bar first at the top
  renderTabBar(state)
  
  // Move cursor to line 3 (after tab bar) before rendering view
  moveCursor(3, 1)
  
  // Render current view (starting from line 3 to leave room for tab bar)
  state.views[state.currentView].render()
  
  // Get status and hotkeys from current view
  const view = state.views[state.currentView]
  let status = state.status || ''
  let statusColor = state.statusColor
  
  // If view provides its own status, use that
  if (view.getStatus) {
    const viewStatus = view.getStatus()
    status = viewStatus.text
    statusColor = viewStatus.color
  }
  
  // Render footer with status
  renderFooter({
    status,
    statusColor,
    hotkeys: getViewHotkeys(state),
  })
}

function getViewHotkeys(state: ConsoleState): string[] {
  const view = state.views[state.currentView]
  
  // If view provides its own hotkeys, use those
  if (view.getHotkeys) {
    const viewHotkeys = view.getHotkeys()
    
    // For browse view, also add the common hotkeys when not editing
    if (state.currentView === 'browse' && !view.isEditing?.()) {
      viewHotkeys.push(colors.gray('i') + ' Switch Identity')
      viewHotkeys.push(colors.gray('q') + ' Quit')
    }
    
    return viewHotkeys
  }
  
  // Default hotkeys for other views
  const hotkeys: string[] = []
  
  // Add view-specific hotkeys
  if (state.currentView === 'dashboard') {
    // Dashboard has no special keys beyond the global ones
  } else if (state.currentView === 'config') {
    // Config view hotkeys - we need to check if it's editing
    const configView = view as any // We know it's ConfigView but TypeScript doesn't
    if (configView.state?.editingIndex !== null) {
      hotkeys.push(
        colors.gray('ESC') + ' Cancel',
        colors.gray('ENTER') + ' Save',
        colors.gray('BACKSPACE') + ' Delete'
      )
    } else {
      hotkeys.push(
        colors.gray('↑↓') + ' Navigate',
        colors.gray('ENTER') + ' Edit/Expand',
        colors.gray('s') + ' Save',
        colors.gray('r') + ' Reset'
      )
      if (configView.state?.expandedPaths?.size > 0) {
        hotkeys.push(colors.gray('ESC') + ' Collapse all')
      }
    }
  }
  
  // Add common hotkeys (only if not editing)
  if (!view.isEditing?.()) {
    // Identity switch is always available
    hotkeys.push(colors.gray('i') + ' Switch Identity')
    
    // Add number keys for tab switching
    const viewKeys = Object.keys(state.views)
    viewKeys.forEach((name, index) => {
      if (name !== state.currentView) {
        hotkeys.push(colors.gray((index + 1).toString()) + ' ' + name.charAt(0).toUpperCase() + name.slice(1))
      }
    })
    
    hotkeys.push(colors.gray('q') + ' Quit')
  }
  
  return hotkeys
}
