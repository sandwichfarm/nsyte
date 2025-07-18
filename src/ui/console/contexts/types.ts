import { NostrEvent } from 'nostr-tools'
import { FileEntryWithSources } from '../../../commands/ls.ts'
import { ProjectConfig } from '../../../lib/config.ts'
import { Identity } from '../types.ts'

export type ContextStatus = 'pending' | 'loading' | 'loaded' | 'error'

export interface BaseContext {
  status: ContextStatus
  error?: string
  lastUpdated?: Date
}

export interface IdentityContext extends BaseContext {
  identity: Identity
  profile?: NostrEvent // kind 0
  relayList?: NostrEvent // kind 10002
  serverList?: NostrEvent // server list kind
  profileData?: {
    name?: string
    display_name?: string
    picture?: string
    about?: string
    nip05?: string
    lud16?: string
  }
  relayData?: {
    read: string[]
    write: string[]
  }
  serverData?: string[]
}

export interface NsiteContext extends BaseContext {
  events: NostrEvent[]
  files: FileEntryWithSources[]
  relays: string[]
  relayConnections: Map<string, {
    connected: boolean
    lastSeen?: Date
    events?: number
  }>
  discoveryRelays: string[]
  totalEvents: number
  processedRelays: number
  totalRelays: number
}

export interface ConfigContext extends BaseContext {
  config: ProjectConfig
  validationErrors: string[]
  projectPath: string
  isValid: boolean
}

export interface UploadContext extends BaseContext {
  isActive: boolean
  files: UploadFileStatus[]
  timeline: TimelineEntry[]
  stats: UploadStats
  signedEvents: Map<string, NostrEvent> // Pre-signed events
  signer?: any // Loaded signer
  stage: 'preparing' | 'signing' | 'uploading' | 'publishing' | 'completed' | 'failed'
}

export interface OperationContext extends BaseContext {
  activeOperations: Map<string, Operation>
  completedOperations: Operation[]
  failedOperations: Operation[]
}

export interface Operation {
  id: string
  type: 'upload' | 'download' | 'sync'
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  startTime: number
  endTime?: number
  error?: string
  canCancel: boolean
}

export interface UploadFileStatus {
  path: string
  size: number
  hash: string
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'publishing' | 'published'
  progress: number // 0-100
  error?: string
  uploadStartTime?: number
  uploadEndTime?: number
  publishStartTime?: number
  publishEndTime?: number
  servers: {
    [server: string]: {
      status: 'pending' | 'uploading' | 'completed' | 'failed'
      progress: number
      startTime?: number
      error?: string
    }
  }
  relays: {
    [relay: string]: {
      status: 'pending' | 'publishing' | 'published' | 'failed'
      progress: number
      error?: string
    }
  }
  signedEvent?: NostrEvent
}

export interface TimelineEntry {
  id: string
  type: 'upload' | 'publish' | 'sign'
  fileName: string
  startTime: number
  endTime?: number
  progress: number
  status: 'active' | 'completed' | 'failed'
  server?: string
  relay?: string
}

export interface UploadStats {
  totalFiles: number
  totalSize: number
  uploadedFiles: number
  uploadedSize: number
  failedFiles: number
  publishedEvents: number
  failedEvents: number
  startTime?: number
  endTime?: number
  signedEvents: number
  totalEvents: number
}

export type ContextType = 'identity' | 'nsite' | 'config' | 'upload' | 'operations'

export interface ContextSubscription {
  contextType: ContextType
  callback: (context: BaseContext) => void
}

export interface ContextManager {
  getContext<T extends BaseContext>(type: ContextType): T | null
  loadContext(type: ContextType, options?: any): Promise<void>
  subscribe(type: ContextType, callback: (context: BaseContext) => void): () => void
  refresh(type: ContextType): Promise<void>
  refreshAll(): Promise<void>
}