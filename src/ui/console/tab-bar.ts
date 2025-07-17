import { ConsoleState } from './types.ts'
import { moveCursor, getTerminalSize } from '../browse/renderer.ts'
import { colors } from '@cliffy/ansi/colors'

export function renderTabBar(state: ConsoleState) {
  const { cols } = getTerminalSize()
  const viewNames = Object.keys(state.views)
  
  // Clear first two lines for tab bar
  moveCursor(1, 1)
  console.log(' '.repeat(cols))
  moveCursor(1, 2)
  console.log(' '.repeat(cols))
  
  // Render tabs
  moveCursor(1, 1)
  let tabLine = ''
  
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
      tabLine += colors.dim('│')
    }
  })
  
  // Add help text on the right
  const helpText = colors.dim('Press 1-9 to switch tabs, q to quit')
  const padding = cols - tabLine.replace(/\x1b\[[0-9;]*m/g, '').length - helpText.replace(/\x1b\[[0-9;]*m/g, '').length - 2
  
  if (padding > 0) {
    tabLine += ' '.repeat(padding) + helpText
  }
  
  console.log(tabLine)
  
  // Render separator line
  moveCursor(1, 2)
  console.log(colors.dim('─'.repeat(cols)))
}