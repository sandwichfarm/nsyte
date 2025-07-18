import { colors } from '@cliffy/ansi/colors'
import { UploadViewState } from './state/types.ts'

/**
 * Create a progress bar visualization
 */
export function createProgressBar(progress: number, width: number): string {
  const filled = Math.floor(progress / 100 * width)
  const empty = width - filled
  return colors.green('█'.repeat(filled)) + colors.gray('░'.repeat(empty))
}

/**
 * Format bytes into human-readable size
 */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

/**
 * Get a colored deploy badge based on state
 */
export function getDeployBadge(state: UploadViewState): string {
  const syncedFiles = state.files.filter(f => 
    f.servers && Object.values(f.servers).some(s => s.status === 'completed')
  ).length
  
  const localOnlyFiles = state.files.filter(f => 
    !f.servers || Object.values(f.servers).every(s => s.status !== 'completed')
  ).length
  
  if (state.files.length === 0) {
    return colors.gray('[ No Files ]')
  } else if (syncedFiles === state.files.length) {
    return colors.blue('[ All Files Deployed ]')
  } else if (syncedFiles > 0) {
    return colors.cyan(`[ ${syncedFiles}/${state.files.length} Files Deployed ]`)
  } else {
    return colors.yellow(`[ ${state.files.length} Files Ready ]`)
  }
}

/**
 * Get colored file name based on status
 */
export function getColoredFileName(fileName: string, status: string): string {
  switch (status) {
    case 'completed':
    case 'published':
      return colors.green(fileName)
    case 'uploading':
    case 'publishing':
      return colors.yellow(fileName)
    case 'failed':
      return colors.red(fileName)
    default:
      return colors.white(fileName)
  }
}

/**
 * Truncate a string with ellipsis
 */
export function truncateString(str: string, maxLength: number, position: 'start' | 'middle' | 'end' = 'end'): string {
  if (str.length <= maxLength) return str
  
  const ellipsis = '...'
  const availableLength = maxLength - ellipsis.length
  
  switch (position) {
    case 'start':
      return ellipsis + str.slice(-(availableLength))
    case 'middle':
      const halfLength = Math.floor(availableLength / 2)
      return str.slice(0, halfLength) + ellipsis + str.slice(-(availableLength - halfLength))
    case 'end':
    default:
      return str.slice(0, availableLength) + ellipsis
  }
}

/**
 * Build a file tree structure from flat file list
 */
export function buildFileTree(files: { path: string }[]): Record<string, any> {
  const tree: Record<string, any> = {}
  
  files.forEach(file => {
    const parts = file.path.split('/')
    let current = tree
    
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        // It's a file
        current[part] = file
      } else {
        // It's a directory
        if (!current[part]) {
          current[part] = {}
        }
        current = current[part]
      }
    })
  })
  
  return tree
}

/**
 * Get tree connector characters
 */
export function getTreeConnector(isLast: boolean): string {
  return isLast ? '└── ' : '├── '
}

/**
 * Calculate optimal column widths for three-column layout
 */
export function calculateColumnWidths(totalWidth: number, gapWidth: number = 2): {
  gridWidth: number
  statusWidth: number
  propagationWidth: number
} {
  const totalGaps = gapWidth * 2
  const availableWidth = totalWidth - totalGaps
  
  return {
    gridWidth: Math.floor(availableWidth * 0.25),
    statusWidth: Math.floor(availableWidth * 0.35),
    propagationWidth: availableWidth - Math.floor(availableWidth * 0.25) - Math.floor(availableWidth * 0.35)
  }
}