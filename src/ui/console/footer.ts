import { colors } from '@cliffy/ansi/colors'
import { moveCursor, getTerminalSize } from '../browse/renderer.ts'

export interface FooterOptions {
  status?: string
  statusColor?: (str: string) => string
  hotkeys?: string[]
  startLine?: number
}

export function renderFooter(options: FooterOptions = {}) {
  const { rows, cols } = getTerminalSize()
  const { 
    status = '', 
    statusColor = colors.gray, 
    hotkeys = [],
    startLine = 1
  } = options
  
  // Move cursor to footer position (rows - 1 for separator, rows for status/hotkeys)
  moveCursor(rows - 1, 1)
  Deno.stdout.writeSync(new TextEncoder().encode('\x1b[K'))
  Deno.stdout.writeSync(new TextEncoder().encode(colors.gray('─'.repeat(cols)) + '\n'))
  
  // Move to last line for status and hotkeys
  moveCursor(rows, 1)
  Deno.stdout.writeSync(new TextEncoder().encode('\x1b[K'))
  
  // Prepare status text
  const statusText = statusColor(status)
  
  // Prepare hotkeys text
  const hotkeysText = hotkeys.join(' │ ')
  
  // Calculate padding to right-align status
  const statusLength = statusText.replace(/\x1b\[[0-9;]*m/g, '').length // Remove ANSI codes for length
  const hotkeysLength = hotkeysText.replace(/\x1b\[[0-9;]*m/g, '').length
  const padding = Math.max(1, cols - statusLength - hotkeysLength - 1)
  
  // Render hotkeys on left and status on right
  Deno.stdout.writeSync(new TextEncoder().encode(hotkeysText + ' '.repeat(padding) + statusText))
}

// Common hotkey builders for consistent UI
export function buildCommonHotkeys(options: {
  includeNavigation?: boolean
  includeQuit?: boolean
  customKeys?: string[]
}): string[] {
  const { includeNavigation = false, includeQuit = true, customKeys = [] } = options
  const keys: string[] = []
  
  if (includeNavigation) {
    keys.push(
      `${colors.gray('↑↓')} Navigate`,
      `${colors.gray('←→')} Pages`
    )
  }
  
  keys.push(...customKeys)
  
  if (includeQuit) {
    keys.push(`${colors.gray('q')} Quit`)
  }
  
  return keys
} 