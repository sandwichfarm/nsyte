import { ConsoleView } from '../types.ts'
import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../../lib/config.ts'
import { validateConfigWithFeedback } from '../../../lib/config-validator.ts'
import { colors } from '@cliffy/ansi/colors'
import {
  clearScreen,
  moveCursor,
  getTerminalSize,
  showCursor,
  hideCursor,
  enterAlternateScreen,
  exitAlternateScreen,
} from '../../browse/renderer.ts'

interface ConfigField {
  key: string
  value: string | number | boolean | string[] | Record<string, any>
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'special'
  description?: string
  required?: boolean
  editable?: boolean
  specialHandler?: string
}

interface ConfigViewState {
  fields: ConfigField[]
  selectedIndex: number
  editingIndex: number | null
  editValue: string
  config: ProjectConfig
  originalConfig: ProjectConfig
  configPath: string
  hasChanges: boolean
  status: string
  statusColor?: (str: string) => string
  showHelp: boolean
  expandedPaths: Set<string>
  bunkerSelection?: BunkerSelectionState
}

interface BunkerSelectionState {
  active: boolean
  options: Array<{ name: string; value: string }>
  selectedIndex: number
  enteringManual: boolean
  manualInput: string
}

const FIELD_DESCRIPTIONS: Record<string, { description: string; required?: boolean; editable?: boolean; specialHandler?: string }> = {
  bunkerPubkey: { description: 'Nostr bunker public key for signing', required: false, editable: true, specialHandler: 'bunker' },
  publishProfile: { description: 'Whether to publish profile metadata', required: false, editable: true },
  publishRelayList: { description: 'Whether to publish relay list (NIP-65)', required: false, editable: true },
  publishServerList: { description: 'Whether to publish Blossom server list', required: false, editable: true },
  fallback: { description: 'Fallback path for 404 errors', required: false, editable: true },
  profile: { description: 'Profile metadata', required: false, editable: false },
  'profile.name': { description: 'Profile name', required: false, editable: true },
  'profile.display_name': { description: 'Profile display name', required: false, editable: true },
  'profile.about': { description: 'Profile description', required: false, editable: true },
  relays: { description: 'List of Nostr relays to use', required: false, editable: true },
  servers: { description: 'List of Blossom servers for file storage', required: false, editable: true },
}

export class ConfigView implements ConsoleView {
  name = 'Config'
  state: ConfigViewState  // Made public so console can check editing state
  private projectPath: string

  constructor(projectPath: string, config: ProjectConfig) {
    this.projectPath = projectPath
    const configPath = `${projectPath}/.nsite/config.json`
    const expandedPaths = new Set<string>()
    
    this.state = {
      fields: this.flattenConfig(config, '', expandedPaths),
      selectedIndex: 0,
      editingIndex: null,
      editValue: '',
      config: structuredClone(config),
      originalConfig: structuredClone(config),
      configPath,
      hasChanges: false,
      status: 'Configuration loaded',
      statusColor: colors.green,
      showHelp: false,
      expandedPaths,
    }
  }

  async initialize(contextManager: any): Promise<void> {
    // TODO: Implement context integration
  }

  async preload(onProgress?: (message: string) => void): Promise<void> {
    // Validate config
    const validationResult = validateConfigWithFeedback(this.state.config)
    if (!validationResult.valid) {
      this.state.status = 'Configuration has validation errors'
      this.state.statusColor = colors.yellow
    }
  }

  render(): void {
    const { rows, cols } = getTerminalSize()
    
    // Clear content area first
    for (let i = 3; i <= rows; i++) {
      moveCursor(i, 1)
      Deno.stdout.writeSync(new TextEncoder().encode('\x1b[K'))
    }
    
    // Content area (starting from line 3 because of tab bar)
    const contentStart = 3
    const contentHeight = rows - contentStart - 5 // Leave room for footer
    
    // Calculate visible area
    let visibleItems = contentHeight
    if (this.state.fields[this.state.selectedIndex]?.description) {
      visibleItems = Math.floor(contentHeight * 0.8)
    }
    
    const startIndex = Math.max(0, this.state.selectedIndex - Math.floor(visibleItems / 2))
    const endIndex = Math.min(this.state.fields.length, startIndex + visibleItems)
    
    // Show fields
    const maxKeyLength = Math.max(...this.state.fields.map(f => f.key.length))
    
    this.state.fields.slice(startIndex, endIndex).forEach((field, relativeIndex) => {
      const index = startIndex + relativeIndex
      const isSelected = index === this.state.selectedIndex
      const isEditing = index === this.state.editingIndex
      
      let line = ''
      const currentRow = contentStart + relativeIndex
      moveCursor(currentRow, 1)
      
      // Selection indicator
      if (isSelected) {
        line += colors.cyan('▶ ')
      } else {
        line += '  '
      }
      
      // Key
      let displayKey = field.key
      const depth = field.key.split('.').length - 1
      
      // Indent based on depth
      if (field.key.includes('[') && !field.key.endsWith('[+]')) {
        displayKey = '  '.repeat(depth + 1) + field.key.substring(field.key.lastIndexOf('.') + 1)
      } else if (field.key.endsWith('[+]') || field.key.endsWith('.+')) {
        displayKey = '  '.repeat(depth + 1) + '+'
      } else if (depth > 0) {
        displayKey = '  '.repeat(depth) + field.key.substring(field.key.lastIndexOf('.') + 1)
      }
      
      const paddedKey = displayKey.padEnd(maxKeyLength)
      if (isSelected) {
        line += colors.cyan.bold(paddedKey)
      } else if (field.key.endsWith('[+]')) {
        line += colors.green(paddedKey)
      } else {
        line += colors.gray(paddedKey)
      }
      
      line += ' : '
      
      // Value
      let valueStr = ''
      if (isEditing) {
        valueStr = this.state.editValue
        if (Math.floor(Date.now() / 500) % 2 === 0) {
          valueStr += '_'
        }
      } else {
        valueStr = this.formatFieldValue(field)
      }
      
      if (isSelected || isEditing) {
        line += colors.white.bold(valueStr)
      } else if (!field.value || (Array.isArray(field.value) && field.value.length === 0)) {
        line += colors.gray.italic(valueStr)
      } else {
        line += colors.white(valueStr)
      }
      
      // Editable indicator
      if (field.editable && !isEditing) {
        line += colors.gray(' (editable)')
      }
      
      // Special handler indicator
      if (field.specialHandler) {
        line += colors.yellow(` [${field.specialHandler}]`)
      }
      
      console.log(line)
      
      // Description on next line if selected
      if (isSelected && field.description && relativeIndex < visibleItems - 1) {
        moveCursor(currentRow + 1, 1)
        console.log(colors.gray(`     ${field.description}`))
      }
    })
    
    // Footer
    const footerStart = rows - 4
    moveCursor(footerStart, 1)
    console.log(colors.dim('─'.repeat(cols)))
    
    // Status line
    moveCursor(footerStart + 1, 1)
    if (this.state.hasChanges) {
      const changesText = `${this.state.status} (unsaved changes)`
      console.log(colors.yellow(changesText))
    }
    
    // Remove the help line - it will be handled by the parent console's footer
    
    // Render bunker selection overlay if active
    if (this.state.bunkerSelection?.active) {
      this.renderBunkerSelection(this.state.bunkerSelection, rows, cols)
    }
  }

  async handleInput(event: KeyPressEvent): Promise<boolean> {
    const key = event.key || ''
    const sequence = event.sequence || ''
    
    if (this.state.bunkerSelection?.active) {
      return await this.handleBunkerSelection(event)
    } else if (this.state.editingIndex !== null) {
      return await this.handleEditing(event)
    } else {
      return await this.handleNavigation(event)
    }
  }

  isEditing(): boolean {
    return this.state.editingIndex !== null || this.state.bunkerSelection?.active === true
  }

  private async handleBunkerSelection(event: KeyPressEvent): Promise<boolean> {
    const key = event.key || ''
    const sequence = event.sequence || ''
    
    if (this.state.bunkerSelection!.enteringManual) {
      // Manual entry mode
      if (key === 'escape') {
        this.state.bunkerSelection!.enteringManual = false
        this.state.bunkerSelection!.manualInput = ''
      } else if (key === 'return') {
        // Validate and apply
        try {
          const { nip19 } = await import('nostr-tools')
          const decoded = nip19.decode(this.state.bunkerSelection!.manualInput)
          if (decoded.type === 'npub') {
            this.updateConfigValue(this.state.selectedIndex, decoded.data)
            this.state.status = 'Bunker pubkey updated'
            this.state.statusColor = colors.green
            this.state.bunkerSelection = undefined
          } else {
            this.state.status = 'Invalid npub format'
            this.state.statusColor = colors.red
          }
        } catch {
          this.state.status = 'Invalid npub format'
          this.state.statusColor = colors.red
        }
      } else if (key === 'backspace') {
        this.state.bunkerSelection!.manualInput = this.state.bunkerSelection!.manualInput.slice(0, -1)
      } else if (sequence && sequence.length === 1 && sequence >= ' ') {
        this.state.bunkerSelection!.manualInput += sequence
      }
    } else {
      // List selection mode
      if (key === 'up') {
        this.state.bunkerSelection!.selectedIndex = Math.max(0, this.state.bunkerSelection!.selectedIndex - 1)
      } else if (key === 'down') {
        this.state.bunkerSelection!.selectedIndex = Math.min(
          this.state.bunkerSelection!.options.length - 1,
          this.state.bunkerSelection!.selectedIndex + 1
        )
      } else if (key === 'return') {
        const selected = this.state.bunkerSelection!.options[this.state.bunkerSelection!.selectedIndex]
        if (selected.value === 'manual') {
          this.state.bunkerSelection!.enteringManual = true
          this.state.bunkerSelection!.manualInput = ''
        } else {
          this.updateConfigValue(this.state.selectedIndex, selected.value)
          this.state.status = 'Bunker pubkey updated'
          this.state.statusColor = colors.green
          this.state.bunkerSelection = undefined
        }
      } else if (key === 'escape') {
        this.state.bunkerSelection = undefined
        this.state.status = 'Bunker selection cancelled'
        this.state.statusColor = colors.yellow
      }
    }
    
    return true
  }

  private async handleEditing(event: KeyPressEvent): Promise<boolean> {
    const key = event.key || ''
    const sequence = event.sequence || ''
    
    if (key === 'escape') {
      this.state.editingIndex = null
      this.state.editValue = ''
      this.state.status = 'Edit cancelled'
      this.state.statusColor = colors.yellow
    } else if (key === 'return') {
      const field = this.state.fields[this.state.editingIndex!]
      
      // Parse the value based on type
      let newValue: any = this.state.editValue
      if (field.type === 'number') {
        newValue = Number(this.state.editValue)
        if (isNaN(newValue)) {
          this.state.status = 'Invalid number'
          this.state.statusColor = colors.red
          return true
        }
      } else if (field.type === 'boolean') {
        newValue = this.state.editValue.toLowerCase() === 'true'
      } else if (field.type === 'array') {
        newValue = this.state.editValue.split(',').map(s => s.trim()).filter(s => s)
      }
      
      // Handle array item editing
      if (field.key.includes('[') && !field.key.endsWith('[+]')) {
        const match = field.key.match(/\[(\d+)\]$/)
        if (match) {
          const index = parseInt(match[1])
          const arrayKey = field.key.substring(0, field.key.lastIndexOf('['))
          const keys = arrayKey.split('.')
          
          // Navigate to array in config
          let current = this.state.config
          for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]]
          }
          const lastKey = keys[keys.length - 1]
          
          // Update array item
          if (Array.isArray(current[lastKey])) {
            current[lastKey][index] = newValue
            this.state.hasChanges = true
            
            // Update fields to reflect change
            this.state.expandedPaths.add(arrayKey)
            this.state.fields = this.flattenConfig(this.state.config, '', this.state.expandedPaths)
          }
        }
      } else {
        this.updateConfigValue(this.state.editingIndex!, newValue)
      }
      
      this.state.editingIndex = null
      this.state.editValue = ''
      this.state.status = 'Value updated'
      this.state.statusColor = colors.green
    } else if (key === 'backspace') {
      this.state.editValue = this.state.editValue.slice(0, -1)
    } else if (sequence && sequence.length === 1 && sequence >= ' ') {
      this.state.editValue += sequence
    }
    
    return true
  }

  private async handleNavigation(event: KeyPressEvent): Promise<boolean> {
    const key = event.key || ''
    
    switch (key) {
      case 'up':
        if (this.state.selectedIndex > 0) {
          this.state.selectedIndex--
          return true
        }
        break
        
      case 'down':
        if (this.state.selectedIndex < this.state.fields.length - 1) {
          this.state.selectedIndex++
          return true
        }
        break
        
      case 'return':
        return await this.handleEnter()
        
      case 's':
        if (this.state.hasChanges) {
          await this.saveConfig()
        } else {
          this.state.status = 'No changes to save'
          this.state.statusColor = colors.yellow
        }
        return true
        
      case 'r':
        if (this.state.hasChanges) {
          this.state.config = structuredClone(this.state.originalConfig)
          this.state.fields = this.flattenConfig(this.state.config)
          this.state.hasChanges = false
          this.state.status = 'Configuration reset to original'
          this.state.statusColor = colors.yellow
          return true
        }
        break
        
      case 'delete':
      case 'backspace':
        return await this.handleDelete()
        
      case 'escape':
        // If any paths are expanded, collapse them all
        if (this.state.expandedPaths.size > 0) {
          this.state.expandedPaths.clear()
          this.state.fields = this.flattenConfig(this.state.config, '', this.state.expandedPaths)
          this.state.status = 'All sections collapsed'
          this.state.statusColor = colors.cyan
          return true
        }
        break
    }
    
    return false
  }

  private async handleEnter(): Promise<boolean> {
    const field = this.state.fields[this.state.selectedIndex]
    
    // Handle array/object expansion/collapse
    if ((field.type === 'array' || (field.type === 'object' && !field.editable)) && !field.key.includes('[')) {
      // Toggle expansion
      if (this.state.expandedPaths.has(field.key)) {
        this.state.expandedPaths.delete(field.key)
        this.state.status = field.type === 'array' ? 'Array collapsed' : 'Object collapsed'
      } else {
        this.state.expandedPaths.add(field.key)
        this.state.status = field.type === 'array' ? 'Array expanded' : 'Object expanded'
      }
      this.state.statusColor = colors.cyan
      this.state.fields = this.flattenConfig(this.state.config, '', this.state.expandedPaths)
      return true
    } else if (field.key.endsWith('[+]')) {
      // Add new array item
      return await this.addArrayItem(field)
    } else if (field.key.endsWith('.+')) {
      // Add new property to object
      return await this.addObjectProperty(field)
    } else if (field.editable) {
      if (field.specialHandler === 'bunker') {
        this.state.bunkerSelection = await this.handleBunkerSpecial()
        this.state.status = 'Select a bunker'
        this.state.statusColor = colors.cyan
      } else {
        this.state.editingIndex = this.state.selectedIndex
        if (field.type === 'array') {
          this.state.editValue = Array.isArray(field.value) ? field.value.join(', ') : ''
        } else {
          this.state.editValue = String(field.value || '')
        }
        this.state.status = `Editing ${field.key}`
        this.state.statusColor = colors.cyan
      }
      return true
    } else {
      this.state.status = 'Field is not editable'
      this.state.statusColor = colors.red
      return true
    }
  }

  private async addArrayItem(field: ConfigField): Promise<boolean> {
    exitAlternateScreen()
    showCursor()
    
    const { Input } = await import('@cliffy/prompt')
    const newValue = await Input.prompt({
      message: 'Enter new value:',
    })
    
    enterAlternateScreen()
    hideCursor()
    
    if (newValue) {
      // Get array key
      const arrayKey = field.key.substring(0, field.key.length - 3)
      const keys = arrayKey.split('.')
      
      // Navigate to array in config
      let current = this.state.config
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
      }
      const lastKey = keys[keys.length - 1]
      
      // Add to array
      if (!Array.isArray(current[lastKey])) {
        current[lastKey] = []
      }
      current[lastKey].push(newValue)
      
      // Update fields
      this.state.expandedPaths.add(arrayKey)
      this.state.fields = this.flattenConfig(this.state.config, '', this.state.expandedPaths)
      this.state.hasChanges = true
      this.state.status = 'Item added'
      this.state.statusColor = colors.green
    }
    
    return true
  }

  private async addObjectProperty(field: ConfigField): Promise<boolean> {
    exitAlternateScreen()
    showCursor()
    
    const { Input } = await import('@cliffy/prompt')
    const propertyName = await Input.prompt({
      message: 'Enter property name:',
      validate: (value) => {
        if (!value || value.includes('.') || value.includes('[') || value.includes(']')) {
          return 'Invalid property name'
        }
        return true
      }
    })
    
    if (propertyName) {
      const propertyValue = await Input.prompt({
        message: `Enter value for ${propertyName}:`,
      })
      
      enterAlternateScreen()
      hideCursor()
      
      if (propertyValue !== undefined) {
        // Get object key
        const objectKey = field.key.substring(0, field.key.length - 2)
        const keys = objectKey.split('.')
        
        // Navigate to object in config
        let current = this.state.config
        for (let i = 0; i < keys.length - 1; i++) {
          current = current[keys[i]]
        }
        const lastKey = keys[keys.length - 1]
        
        // Add to object
        if (!current[lastKey]) {
          current[lastKey] = {}
        }
        current[lastKey][propertyName] = propertyValue
        
        // Update fields
        this.state.expandedPaths.add(objectKey)
        this.state.fields = this.flattenConfig(this.state.config, '', this.state.expandedPaths)
        this.state.hasChanges = true
        this.state.status = 'Property added'
        this.state.statusColor = colors.green
      }
    } else {
      enterAlternateScreen()
      hideCursor()
    }
    
    return true
  }

  private async handleDelete(): Promise<boolean> {
    const deleteField = this.state.fields[this.state.selectedIndex]
    
    // Allow deleting array items and object properties
    if ((deleteField.key.includes('[') && !deleteField.key.endsWith('[+]')) || 
        (deleteField.key.includes('.') && deleteField.key.split('.').length > 1 && 
         !deleteField.key.endsWith('.+') && deleteField.editable)) {
      exitAlternateScreen()
      showCursor()
      
      const { Confirm } = await import('@cliffy/prompt')
      const shouldDelete = await Confirm.prompt({
        message: `Delete "${deleteField.value}"?`,
        default: false
      })
      
      enterAlternateScreen()
      hideCursor()
      
      if (shouldDelete) {
        // Check if it's an array item or object property
        const arrayMatch = deleteField.key.match(/\[(\d+)\]$/)
        if (arrayMatch) {
          // Array item deletion
          const index = parseInt(arrayMatch[1])
          const arrayKey = deleteField.key.substring(0, deleteField.key.lastIndexOf('['))
          const keys = arrayKey.split('.')
          
          // Navigate to array in config
          let current = this.state.config
          for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]]
          }
          const lastKey = keys[keys.length - 1]
          
          // Remove from array
          if (Array.isArray(current[lastKey])) {
            current[lastKey].splice(index, 1)
            
            // Update fields
            this.state.expandedPaths.add(arrayKey)
            this.state.fields = this.flattenConfig(this.state.config, '', this.state.expandedPaths)
            this.state.hasChanges = true
            this.state.status = 'Item deleted'
            this.state.statusColor = colors.green
            
            // Adjust selected index if needed
            if (this.state.selectedIndex >= this.state.fields.length) {
              this.state.selectedIndex = Math.max(0, this.state.fields.length - 1)
            }
          }
        } else {
          // Object property deletion
          const keys = deleteField.key.split('.')
          const propertyName = keys[keys.length - 1]
          
          // Navigate to parent object
          let current = this.state.config
          for (let i = 0; i < keys.length - 2; i++) {
            current = current[keys[i]]
          }
          const parentKey = keys[keys.length - 2]
          
          // Delete property
          if (current[parentKey] && typeof current[parentKey] === 'object') {
            delete current[parentKey][propertyName]
            
            // Update fields
            const parentPath = keys.slice(0, -1).join('.')
            this.state.expandedPaths.add(parentPath)
            this.state.fields = this.flattenConfig(this.state.config, '', this.state.expandedPaths)
            this.state.hasChanges = true
            this.state.status = 'Property deleted'
            this.state.statusColor = colors.green
            
            // Adjust selected index if needed
            if (this.state.selectedIndex >= this.state.fields.length) {
              this.state.selectedIndex = Math.max(0, this.state.fields.length - 1)
            }
          }
        }
      }
    }
    
    return true
  }

  private async handleBunkerSpecial(): Promise<BunkerSelectionState> {
    try {
      const { SecretsManager } = await import('../../../lib/secrets/mod.ts')
      const { nip19 } = await import('nostr-tools')
      
      const secretsManager = SecretsManager.getInstance()
      const bunkerPubkeys = await secretsManager.getAllPubkeys()
      
      const currentValue = this.state.fields[this.state.selectedIndex].value
      
      // Build options
      const options: Array<{ name: string; value: string }> = bunkerPubkeys.map(pubkey => ({
        name: nip19.npubEncode(pubkey),
        value: pubkey,
      }))
      
      // Add manual entry option
      options.push({ 
        name: 'Enter npub manually', 
        value: 'manual' 
      })
      
      // Find current selection
      let selectedIndex = options.findIndex(opt => opt.value === currentValue)
      if (selectedIndex === -1) selectedIndex = 0
      
      return {
        active: true,
        options,
        selectedIndex,
        enteringManual: false,
        manualInput: '',
      }
    } catch (error) {
      this.state.status = 'Failed to load bunkers'
      this.state.statusColor = colors.red
      return {
        active: false,
        options: [],
        selectedIndex: 0,
        enteringManual: false,
        manualInput: '',
      }
    }
  }

  private async saveConfig(): Promise<boolean> {
    try {
      // Validate the config before saving
      const validationResult = validateConfigWithFeedback(this.state.config)
      if (!validationResult.valid) {
        this.state.status = `Validation failed: ${validationResult.errors?.map(e => e.message).join(', ')}`
        this.state.statusColor = colors.red
        return false
      }
      
      // Convert to JSON with nice formatting
      const jsonContent = JSON.stringify(this.state.config, null, 2)
      
      // Write to file
      await Deno.writeTextFile(this.state.configPath, jsonContent)
      
      this.state.hasChanges = false
      this.state.originalConfig = structuredClone(this.state.config)
      this.state.status = 'Configuration saved successfully'
      this.state.statusColor = colors.green
      
      return true
    } catch (error) {
      this.state.status = `Save failed: ${error}`
      this.state.statusColor = colors.red
      return false
    }
  }

  private updateConfigValue(fieldIndex: number, newValue: any): void {
    const field = this.state.fields[fieldIndex]
    const keys = field.key.split('.')
    
    // Update the actual config object
    let current = this.state.config
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }
    
    const lastKey = keys[keys.length - 1]
    current[lastKey] = newValue
    
    // Update the field value
    field.value = newValue
    
    // Mark as changed
    this.state.hasChanges = true
  }

  private flattenConfig(config: Record<string, any>, prefix = '', expandedPaths: Set<string> = new Set()): ConfigField[] {
    const fields: ConfigField[] = []
    
    for (const [key, value] of Object.entries(config)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      const fieldInfo = FIELD_DESCRIPTIONS[fullKey] || FIELD_DESCRIPTIONS[key] || {}
      
      if (value === null || value === undefined) {
        fields.push({
          key: fullKey,
          value: '',
          type: 'string',
          ...fieldInfo,
          editable: fieldInfo.editable !== false,
        })
      } else if (Array.isArray(value)) {
        // Add the array field itself
        fields.push({
          key: fullKey,
          value: value,
          type: 'array',
          ...fieldInfo,
          editable: fieldInfo.editable !== false,
        })
        
        // If this array should be expanded, add individual items
        if (expandedPaths.has(fullKey)) {
          value.forEach((item, index) => {
            fields.push({
              key: `${fullKey}[${index}]`,
              value: item,
              type: typeof item === 'object' ? 'object' : typeof item as 'string' | 'number' | 'boolean',
              description: `Item ${index + 1}`,
              editable: true,
            })
          })
          // Add option to add new item
          fields.push({
            key: `${fullKey}[+]`,
            value: '<Add new item>',
            type: 'special',
            description: 'Add a new item to this array',
            editable: true,
          })
        }
      } else if (typeof value === 'object') {
        // Check if this object should be expanded or if we want to treat it as editable
        const isExpandable = !fieldInfo.editable
        
        fields.push({
          key: fullKey,
          value: value,
          type: 'object',
          ...fieldInfo,
          editable: fieldInfo.editable || false,
        })
        
        // If expanded, show nested fields
        if (isExpandable && expandedPaths.has(fullKey)) {
          // Recursively flatten nested objects
          fields.push(...this.flattenConfig(value, fullKey, expandedPaths))
          
          // Add option to add new property (for certain objects)
          if (fullKey === 'profile') {
            fields.push({
              key: `${fullKey}.+`,
              value: '<Add new property>',
              type: 'special' as any,
              description: 'Add a new property to this object',
              editable: true,
            })
          }
        }
      } else {
        fields.push({
          key: fullKey,
          value: value,
          type: typeof value as 'string' | 'number' | 'boolean',
          ...fieldInfo,
          editable: fieldInfo.editable !== false,
        })
      }
    }
    
    return fields
  }

  private formatFieldValue(field: ConfigField): string {
    if (field.type === 'array' && !field.key.includes('[')) {
      const count = Array.isArray(field.value) ? field.value.length : 0
      let valueStr = `[${count} item${count !== 1 ? 's' : ''}]`
      if (!this.state.expandedPaths.has(field.key)) {
        valueStr += ' (press ENTER to expand)'
      } else {
        valueStr += ' (expanded)'
      }
      return valueStr
    } else if (field.type === 'object' && !field.key.includes('.') && !field.editable) {
      const keys = Object.keys(field.value || {})
      let valueStr = `{${keys.length} field${keys.length !== 1 ? 's' : ''}}`
      if (!this.state.expandedPaths.has(field.key)) {
        valueStr += ' (press ENTER to expand)'
      } else {
        valueStr += ' (expanded)'
      }
      return valueStr
    } else if (field.type === 'object') {
      return '{...}'
    } else if (field.type === 'boolean') {
      return String(field.value)
    } else if (field.type === 'special' && (field.key.endsWith('[+]') || field.key.endsWith('.+'))) {
      return field.value
    } else {
      return field.value || '<empty>'
    }
  }

  private renderBunkerSelection(bunkerState: BunkerSelectionState, rows: number, cols: number): void {
    // Calculate overlay dimensions
    const maxWidth = 60
    const width = Math.min(maxWidth, cols - 10)
    const height = Math.min(bunkerState.options.length + 6, rows - 10)
    
    const startCol = Math.floor((cols - width) / 2)
    const startRow = Math.floor((rows - height) / 2)
    
    // Draw box
    moveCursor(startCol, startRow)
    console.log(colors.bgBlack.white('┌' + '─'.repeat(width - 2) + '┐'))
    
    // Title
    moveCursor(startCol, startRow + 1)
    console.log(colors.bgBlack.white('│' + ' '.repeat(width - 2) + '│'))
    moveCursor(startCol + 2, startRow + 1)
    console.log(colors.bgBlack.cyan.bold('Select Bunker'))
    
    // Separator
    moveCursor(startCol, startRow + 2)
    console.log(colors.bgBlack.white('├' + '─'.repeat(width - 2) + '┤'))
    
    // Options
    if (bunkerState.enteringManual) {
      // Manual entry mode
      moveCursor(startCol, startRow + 3)
      console.log(colors.bgBlack.white('│' + ' '.repeat(width - 2) + '│'))
      moveCursor(startCol + 2, startRow + 3)
      console.log(colors.bgBlack.white('Enter npub:'))
      
      moveCursor(startCol, startRow + 4)
      console.log(colors.bgBlack.white('│' + ' '.repeat(width - 2) + '│'))
      moveCursor(startCol + 2, startRow + 4)
      const inputDisplay = bunkerState.manualInput + (Math.floor(Date.now() / 500) % 2 === 0 ? '_' : '')
      console.log(colors.bgBlack.green(inputDisplay.substring(0, width - 4)))
      
      // Help text
      moveCursor(startCol, startRow + 5)
      console.log(colors.bgBlack.white('│' + ' '.repeat(width - 2) + '│'))
      moveCursor(startCol, startRow + 6)
      console.log(colors.bgBlack.white('│' + ' '.repeat(width - 2) + '│'))
      moveCursor(startCol + 2, startRow + 6)
      console.log(colors.bgBlack.gray('ENTER Confirm • ESC Cancel'))
    } else {
      // List mode
      bunkerState.options.forEach((option, index) => {
        const row = startRow + 3 + index
        moveCursor(startCol, row)
        console.log(colors.bgBlack.white('│' + ' '.repeat(width - 2) + '│'))
        
        moveCursor(startCol + 2, row)
        const isSelected = index === bunkerState.selectedIndex
        const displayName = option.name.length > width - 6 
          ? option.name.substring(0, width - 9) + '...' 
          : option.name
        
        if (isSelected) {
          console.log(colors.bgBlack.bgMagenta.white(' ' + displayName + ' '))
        } else {
          console.log(colors.bgBlack.white(displayName))
        }
      })
      
      // Help text
      const helpRow = startRow + 3 + bunkerState.options.length
      moveCursor(startCol, helpRow)
      console.log(colors.bgBlack.white('├' + '─'.repeat(width - 2) + '┤'))
      moveCursor(startCol, helpRow + 1)
      console.log(colors.bgBlack.white('│' + ' '.repeat(width - 2) + '│'))
      moveCursor(startCol + 2, helpRow + 1)
      console.log(colors.bgBlack.gray('↑/↓ Navigate • ENTER Select • ESC Cancel'))
    }
    
    // Bottom border
    const bottomRow = startRow + (bunkerState.enteringManual ? 7 : 4 + bunkerState.options.length)
    moveCursor(startCol, bottomRow)
    console.log(colors.bgBlack.white('└' + '─'.repeat(width - 2) + '┘'))
  }
}