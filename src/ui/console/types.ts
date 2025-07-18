import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../lib/config.ts'
import { ConsoleContextManager } from './contexts/manager.ts'

export interface ConsoleView {
  name: string
  initialize(contextManager: ConsoleContextManager): Promise<void>
  render(): void
  handleInput(event: KeyPressEvent): Promise<boolean>
  isEditing?(): boolean
  isTyping?(): boolean  // New method to indicate active text input
  hasActiveUploadOperations?(): boolean
  getStatus?(): { text: string; color?: (str: string) => string }
  getHotkeys?(): string[]
  setViewSwitchCallback?(callback: (viewName: string) => void): void
}

export interface Identity {
  pubkey: string
  npub: string
  displayName?: string
  authMethod: 'bunker' | 'nsec' | 'hex'
  bunkerUrl?: string
  originalAuth?: string // Keep the original auth string for signer creation
}

export interface ConsoleState {
  projectPath: string
  config: ProjectConfig
  auth: string
  identity: Identity
  currentView: string
  views: Record<string, ConsoleView>
  contextManager: ConsoleContextManager
  keyboardHandler?: any
  status?: string
  statusColor?: (str: string) => string
}