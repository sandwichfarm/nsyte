import { readProjectFile, ProjectConfig } from '../../lib/config.ts'
import { resolvePubkey, createSigner } from '../../lib/resolver-utils.ts'
import { showBrowseMenu } from '../browse/menu.ts'
import {
  clearScreen,
  moveCursor,
  getTerminalSize,
} from '../browse/renderer.ts'
import { header } from '../header.ts'
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface InitOptions {
  auth?: string
  bunker?: string
  noCache?: boolean
}

interface InitialConsoleState {
  projectPath: string
  config: ProjectConfig
  auth: string
  currentView: string
  views: {}
  isProjectBunker?: boolean
}

export async function initializeConsole(options: InitOptions): Promise<InitialConsoleState> {
  clearScreen()
  const { rows, cols } = getTerminalSize()
  
  // Show loading screen
  const headerLines = header.trim().split('\n')
  const headerStartY = Math.floor((rows - headerLines.length) / 2) - 3
  headerLines.forEach((line, i) => {
    moveCursor(headerStartY + i, Math.floor((cols - line.length) / 2))
    console.log(line)
  })
  const loaderY = Math.floor(rows / 2)
  moveCursor(Math.floor(cols / 2) - 10, loaderY)
  console.log('Initializing console...')

  let spinnerIndex = 0
  const spinnerInterval = setInterval(() => {
    moveCursor(Math.floor(cols / 2) - 15, loaderY + 2)
    console.log(`${spinnerFrames[spinnerIndex]} Loading...`)
    spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length
  }, 100)

  try {
    // Get project config
    const config = readProjectFile()
    if (!config) {
      throw new Error('Not in an nsyte project directory. Run nsyte init first.')
    }

    moveCursor(Math.floor(cols / 2) - 15, loaderY + 2)
    console.log('✓ Found project configuration')

    const projectPath = Deno.cwd()

    // Resolve authentication
    let auth = options.auth
    let isProjectBunker = false
    
    if (!auth) {
      // Try to resolve from project config using resolvePubkey
      try {
        const pubkey = await resolvePubkey({}, config, false) // non-interactive
        auth = pubkey
        // Check if this came from project bunker
        isProjectBunker = config.bunkerPubkey === pubkey
      } catch {
        // No project auth available, show menu
        clearInterval(spinnerInterval)
        clearScreen()
        const result = await showBrowseMenu()
        auth = result.value
      }
    }
    
    if (!auth) {
      throw new Error('No authentication method selected')
    }

    // Extract pubkey from auth
    let pubkey: string
    if (auth.startsWith('bunker://')) {
      // Parse bunker URL to get pubkey
      const url = new URL(auth)
      const hexPubkey = url.hostname || url.pathname.replace(/^\/+/, '')
      if (!hexPubkey || hexPubkey.length !== 64) {
        throw new Error('Invalid bunker URL')
      }
      pubkey = hexPubkey
    } else {
      // Use resolvePubkey for other auth types
      pubkey = await resolvePubkey({ privatekey: auth })
    }

    moveCursor(Math.floor(cols / 2) - 15, loaderY + 3)
    console.log('✓ Authentication configured')

    clearInterval(spinnerInterval)

    return {
      projectPath,
      config,
      auth,
      currentView: 'config',
      views: {},
      isProjectBunker
    }
  } catch (error) {
    clearInterval(spinnerInterval)
    throw error
  }
}