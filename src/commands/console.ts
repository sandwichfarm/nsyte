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

      // Set up views
      const views: Record<string, ConsoleView> = {
        config: new ConfigView(state.projectPath, state.config),
        browse: new BrowseView(state.auth, state.config, !options.cache),
      }

      // Preload all views
      moveCursor(1, 1)
      console.log('Loading views...')
      
      await Promise.all(
        Object.entries(views).map(async ([name, view]) => {
          await view.preload()
        })
      )

      state.views = views
      state.currentView = 'config'

      // Set up keyboard handler
      state.keyboardHandler = keypress()
      state.keyboardHandler.on('keypress', async (event: any) => {
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
          const keyNum = parseInt(event.key)
          if (!isNaN(keyNum) && keyNum > 0 && keyNum <= viewKeys.length) {
            const newView = viewKeys[keyNum - 1]
            if (newView !== state.currentView) {
              state.currentView = newView
              render(state)
              return
            }
          }

          // Pass event to current view
          const handled = await state.views[state.currentView].handleInput(event)
          if (handled) {
            render(state)
          }
        }
      })

      // Set up resize handler
      Deno.addSignalListener('SIGWINCH', handleResize)

      // Initial render
      render(state)

      // Keep the process running
      await new Promise(() => {})
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
  moveCursor(1, 3)
  state.views[state.currentView].render()
}