import { colors } from '@cliffy/ansi/colors'
import { RELAY_SYMBOL, SERVER_SYMBOL, RELAY_COLORS, SERVER_COLORS } from '../../../commands/ls.ts'

export interface FileSyncData {
  foundOnRelays: string[]
  availableOnServers: string[]
}

export interface SyncIndicatorOptions {
  relayColorMap: Map<string, (str: string) => string>
  serverColorMap: Map<string, (str: string) => string>
  maxRelayCount?: number
  maxServerCount?: number
  separator?: string
}

export function createColorMaps(relays: string[], servers: string[]): {
  relayColorMap: Map<string, (str: string) => string>
  serverColorMap: Map<string, (str: string) => string>
} {
  const relayColorMap = new Map<string, (str: string) => string>()
  const serverColorMap = new Map<string, (str: string) => string>()
  
  relays.forEach((relay, index) => {
    relayColorMap.set(relay, RELAY_COLORS[index % RELAY_COLORS.length])
  })
  
  servers.forEach((server, index) => {
    serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length])
  })
  
  return { relayColorMap, serverColorMap }
}

export function renderSyncIndicators(
  file: FileSyncData,
  options: SyncIndicatorOptions
): string {
  const {
    relayColorMap,
    serverColorMap,
    maxRelayCount = 0,
    maxServerCount = 0,
    separator = colors.gray(' | ')
  } = options
  
  // Build relay indicators
  let relayIndicators = ''
  file.foundOnRelays.forEach(relay => {
    const colorFn = relayColorMap.get(relay) || colors.white
    relayIndicators += colorFn(RELAY_SYMBOL)
  })
  
  // Add padding if needed
  if (maxRelayCount > file.foundOnRelays.length) {
    relayIndicators += colors.gray('○'.repeat(maxRelayCount - file.foundOnRelays.length))
  }
  
  // Build server indicators
  let serverIndicators = ''
  file.availableOnServers.forEach(server => {
    const colorFn = serverColorMap.get(server) || colors.white
    serverIndicators += colorFn(SERVER_SYMBOL)
  })
  
  // Add padding if needed
  if (maxServerCount > file.availableOnServers.length) {
    serverIndicators += colors.gray('○'.repeat(maxServerCount - file.availableOnServers.length))
  }
  
  return `${relayIndicators}${separator}${serverIndicators}`
}

export function renderSyncLegend(
  relays: string[],
  servers: string[],
  relayColorMap: Map<string, (str: string) => string>,
  serverColorMap: Map<string, (str: string) => string>
): string[] {
  const lines: string[] = []
  
  if (relays.length > 0) {
    lines.push(colors.gray('Relays:'))
    relays.forEach(relay => {
      const colorFn = relayColorMap.get(relay) || colors.white
      const hostname = new URL(relay).hostname.slice(0, 20)
      lines.push(`  ${colorFn(RELAY_SYMBOL)} ${colorFn(hostname)}`)
    })
  }
  
  if (servers.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(colors.gray('Servers:'))
    servers.forEach(server => {
      const colorFn = serverColorMap.get(server) || colors.white
      const hostname = new URL(server).hostname.slice(0, 20)
      lines.push(`  ${colorFn(SERVER_SYMBOL)} ${colorFn(hostname)}`)
    })
  }
  
  return lines
}

export function getFileSyncStatus(
  file: FileSyncData,
  expectedRelays: string[],
  expectedServers: string[]
): 'synced' | 'partial' | 'local' | 'error' {
  const hasAllRelays = expectedRelays.every(r => file.foundOnRelays.includes(r))
  const hasAllServers = expectedServers.every(s => file.availableOnServers.includes(s))
  
  if (hasAllRelays && hasAllServers) {
    return 'synced'
  } else if (file.foundOnRelays.length > 0 || file.availableOnServers.length > 0) {
    return 'partial'
  } else {
    return 'local'
  }
}

export function getSyncStatusSymbol(status: 'synced' | 'partial' | 'local' | 'error'): string {
  switch (status) {
    case 'synced': return '●'
    case 'partial': return '◐'
    case 'local': return '○'
    case 'error': return '✗'
  }
}

export function getSyncStatusColor(status: 'synced' | 'partial' | 'local' | 'error'): (str: string) => string {
  switch (status) {
    case 'synced': return colors.green
    case 'partial': return colors.yellow
    case 'local': return colors.gray
    case 'error': return colors.red
  }
}