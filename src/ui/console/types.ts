import { KeyPressEvent } from '@cliffy/keypress'
import { ProjectConfig } from '../../lib/config.ts'

export interface ConsoleView {
  name: string
  preload(): Promise<void>
  render(): void
  handleInput(event: KeyPressEvent): Promise<boolean>
  isEditing?(): boolean
}

export interface ConsoleState {
  projectPath: string
  config: ProjectConfig
  auth: string
  currentView: string
  views: Record<string, ConsoleView>
  keyboardHandler?: any
}