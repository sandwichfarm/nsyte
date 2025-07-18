import { ConsoleState } from './types.ts'
import { moveCursor, getTerminalSize } from '../browse/renderer.ts'
import { colors } from '@cliffy/ansi/colors'

export function renderTabBar(state: ConsoleState) {
  const { cols } = getTerminalSize()
  const viewNames = Object.keys(state.views)
  
  // Save cursor position
  Deno.stdout.writeSync(new TextEncoder().encode('\x1b[s'))
  
  // Clear and render first line (tabs)
  moveCursor(1, 1)
  Deno.stdout.writeSync(new TextEncoder().encode('\x1b[2K')) // Clear entire line
  
  // Start with "nsyte"
  let tabLine = colors.bold.cyan('nsyte') + colors.dim('  ')
  
  viewNames.forEach((name, index) => {
    const num = index + 1
    const displayName = name.charAt(0).toUpperCase() + name.slice(1)
    const isActive = name === state.currentView
    
    if (isActive) {
      tabLine += colors.inverse(` ${num}: ${displayName} `)
    } else {
      tabLine += colors.dim(` ${num}: `) + displayName + ' '
    }
    
    if (index < viewNames.length - 1) {
      tabLine += colors.dim(' │ ')
    }
  })
  
  // Format identity display (shortened npub)
  const npub = state.identity.npub
  const identityDisplay = colors.green(`[${npub.substring(0, 12)}...${npub.substring(npub.length - 6)}]`)
  
  // Add help text on the right
  const helpText = colors.dim('Press 1-9 to switch tabs, q to quit')
  const visibleLength = tabLine.replace(/\x1b\[[0-9;]*m/g, '').length
  const identityLength = identityDisplay.replace(/\x1b\[[0-9;]*m/g, '').length
  const helpLength = helpText.replace(/\x1b\[[0-9;]*m/g, '').length
  const padding = cols - visibleLength - identityLength - helpLength - 4 // 4 for spacing
  
  if (padding > 0) {
    tabLine += ' '.repeat(padding) + identityDisplay + '  ' + helpText
  } else {
    // If not enough space, just show identity
    const paddingForIdentity = cols - visibleLength - identityLength - 2
    if (paddingForIdentity > 0) {
      tabLine += ' '.repeat(paddingForIdentity) + identityDisplay
    }
  }
  
  Deno.stdout.writeSync(new TextEncoder().encode(tabLine))
  
  // Clear and render second line (separator)
  moveCursor(2, 1)
  Deno.stdout.writeSync(new TextEncoder().encode('\x1b[2K')) // Clear entire line
  Deno.stdout.writeSync(new TextEncoder().encode(colors.dim('─'.repeat(cols))))
  
  // Restore cursor position
  Deno.stdout.writeSync(new TextEncoder().encode('\x1b[u'))
}