import { Command } from '@cliffy/command'
import { keypress } from '@cliffy/keypress'
import {
  clearScreen,
  enterAlternateScreen,
  exitAlternateScreen,
  hideCursor,
  showCursor,
  moveCursor,
  getTerminalSize,
} from '../ui/browse/renderer.ts'
import { ConsoleView, ConsoleState } from '../ui/console/types.ts'
import { ConfigView } from '../ui/console/views/config.ts'
import { BrowseView } from '../ui/console/views/browse.ts'
import { renderTabBar } from '../ui/console/tab-bar.ts'
import { initializeConsole } from '../ui/console/initializer.ts'

export const consoleCommand = new Command()
  .name('console')
  .description('Unified TUI interface for nsyte management')
  .option('-a, --auth <auth:string>', 'Authentication string (bunker URL or nsec)')
  .option('--bunker <bunker:string>', 'Name of bunker from secrets manager')
  .option('--no-cache', 'Disable cache usage')
  .action(async (options) => {
    let state: ConsoleState | null = null

    const cleanup = () => {
      showCursor()
      exitAlternateScreen()
      if (state?.keyboardHandler) {
        state.keyboardHandler.dispose()
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
      state = await initializeConsole(options)

      // Clear screen and show loading state
      clearScreen()
      const { rows, cols } = getTerminalSize()
      
      // Show loading message
      const loadingMsg = 'Loading console views...'
      moveCursor(Math.floor(rows / 2), Math.floor((cols - loadingMsg.length) / 2))
      console.log(loadingMsg)

      // Set up views
      const views: Record<string, ConsoleView> = {
        config: new ConfigView(state.projectPath, state.config),
        browse: new BrowseView(state.auth, state.config, !options.cache),
      }

      // Show progress for each view
      let loadedCount = 0
      const totalViews = Object.keys(views).length
      
      for (const [name, view] of Object.entries(views)) {
        const progressMsg = `Loading ${name}... (${loadedCount + 1}/${totalViews})`
        moveCursor(Math.floor(rows / 2) + 2, Math.floor((cols - progressMsg.length) / 2))
        console.log(progressMsg)
        
        await view.preload()
        loadedCount++
      }

      state.views = views
      state.currentView = 'config'

      // Set up resize handler
      Deno.addSignalListener('SIGWINCH', handleResize)

      // Initial render
      render(state)

      // Set up keyboard handler
      const keypressIterator = keypress()
      state.keyboardHandler = keypressIterator
      
      for await (const event of keypressIterator) {
        // Global hotkeys
        if (event.ctrlKey && event.key === 'c') {
          cleanup()
          Deno.exit(0)
        }

        if (event.key === 'q' && state && !state.views[state.currentView].isEditing?.()) {
          cleanup()
          Deno.exit(0)
        }

        // Tab switching with number keys
        if (state) {
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

          // Pass event to current view
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
  })

function render(state: ConsoleState) {
  clearScreen()
  
  // Render tab bar
  renderTabBar(state)
  
  // Render current view (starting from line 3 to leave room for tab bar)
  state.views[state.currentView].render()
}