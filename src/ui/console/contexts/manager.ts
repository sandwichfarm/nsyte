import {
  BaseContext,
  ContextManager,
  ContextType,
  ContextSubscription,
  IdentityContext,
  NsiteContext,
  ConfigContext,
  UploadContext,
  OperationContext,
} from './types.ts'
import { Identity } from '../types.ts'
import { ProjectConfig } from '../../../lib/config.ts'
import { listRemoteFilesWithProgress } from '../../../commands/browse-loader.ts'
import { validateConfigWithFeedback } from '../../../lib/config-validator.ts'
import { resolveRelays } from '../../../lib/resolver-utils.ts'
import { parseIgnorePatterns, DEFAULT_IGNORE_PATTERNS } from '../../../lib/files.ts'
import { join } from '@std/path'
import { existsSync } from '@std/fs/exists'
import { createLogger } from '../../../lib/logger.ts'

const log = createLogger('context-manager')

export class ConsoleContextManager implements ContextManager {
  private contexts: Map<ContextType, BaseContext> = new Map()
  private subscriptions: Map<ContextType, Set<(context: BaseContext) => void>> = new Map()
  private identity: Identity
  private config: ProjectConfig
  private projectPath: string

  constructor(identity: Identity, config: ProjectConfig, projectPath: string) {
    this.identity = identity
    this.config = config
    this.projectPath = projectPath
  }

  getContext<T extends BaseContext>(type: ContextType): T | null {
    return (this.contexts.get(type) as T) || null
  }

  async loadContext(type: ContextType, onProgress?: (message: string) => void): Promise<void> {
    const context = this.getOrCreateContext(type)
    context.status = 'loading'
    this.notifySubscribers(type, context)

    try {
      switch (type) {
        case 'identity':
          await this.loadIdentityContext(context as IdentityContext, onProgress)
          break
        case 'nsite':
          await this.loadNsiteContext(context as NsiteContext, onProgress)
          break
        case 'config':
          await this.loadConfigContext(context as ConfigContext, onProgress)
          break
        case 'upload':
          await this.loadUploadContext(context as UploadContext, onProgress)
          break
        case 'operations':
          await this.loadOperationContext(context as OperationContext, onProgress)
          break
        default:
          throw new Error(`Unknown context type: ${type}`)
      }

      context.status = 'loaded'
      context.lastUpdated = new Date()
      context.error = undefined
    } catch (error) {
      context.status = 'error'
      context.error = error instanceof Error ? error.message : 'Unknown error'
      log.error(`Failed to load ${type} context: ${error}`)
    }

    this.notifySubscribers(type, context)
  }

  subscribe(type: ContextType, callback: (context: BaseContext) => void): () => void {
    if (!this.subscriptions.has(type)) {
      this.subscriptions.set(type, new Set())
    }
    this.subscriptions.get(type)!.add(callback)

    // Immediately notify with current context if available
    const context = this.contexts.get(type)
    if (context) {
      callback(context)
    }

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(type)?.delete(callback)
    }
  }

  async refresh(type: ContextType): Promise<void> {
    await this.loadContext(type)
  }

  async refreshAll(): Promise<void> {
    const promises = Array.from(this.contexts.keys()).map(type => this.refresh(type))
    await Promise.all(promises)
  }

  private getOrCreateContext(type: ContextType): BaseContext {
    if (!this.contexts.has(type)) {
      this.contexts.set(type, this.createEmptyContext(type))
    }
    return this.contexts.get(type)!
  }

  private createEmptyContext(type: ContextType): BaseContext {
    switch (type) {
      case 'identity':
        return {
          status: 'pending',
          identity: this.identity,
          profileData: {},
          relayData: { read: [], write: [] },
          serverData: [],
        } as IdentityContext
      case 'nsite':
        return {
          status: 'pending',
          events: [],
          files: [],
          relays: [],
          relayConnections: new Map(),
          discoveryRelays: [],
          totalEvents: 0,
          processedRelays: 0,
          totalRelays: 0,
        } as NsiteContext
      case 'config':
        return {
          status: 'pending',
          config: this.config,
          validationErrors: [],
          projectPath: this.projectPath,
          isValid: true,
        } as ConfigContext
      case 'upload':
        return {
          status: 'pending',
          isActive: false,
          files: [],
          timeline: [],
          stats: {
            totalFiles: 0,
            totalSize: 0,
            uploadedFiles: 0,
            uploadedSize: 0,
            failedFiles: 0,
            skippedFiles: 0,
            publishedEvents: 0,
            failedEvents: 0,
            profileEvents: 0,
            relayListEvents: 0,
            serverListEvents: 0,
            appHandlerEvents: 0,
            signedEvents: 0,
            totalEvents: 0
          },
          signedEvents: new Map(),
          stage: 'preparing'
        } as UploadContext
      case 'operations':
        return {
          status: 'pending',
          activeOperations: new Map(),
          completedOperations: [],
          failedOperations: []
        } as OperationContext
      default:
        throw new Error(`Unknown context type: ${type}`)
    }
  }

  private async loadIdentityContext(context: IdentityContext, onProgress?: (message: string) => void): Promise<void> {
    if (onProgress) {
      onProgress('Loading identity profile...')
    }

    context.identity = this.identity
    
    // TODO: Load kind 0 (profile), kind 10002 (relay list), and server list events
    // For now, set up basic structure
    context.profileData = {
      name: this.identity.npub.slice(0, 12) + '...',
      display_name: this.identity.npub.slice(0, 12) + '...',
    }
    
    // Use config relays or discovery relays as fallback
    const configRelays = this.config.relays || []
    const discoveryRelays = resolveRelays({}, null, true)
    
    context.relayData = {
      read: configRelays.length > 0 ? configRelays : discoveryRelays,
      write: configRelays.length > 0 ? configRelays : discoveryRelays,
    }
    
    context.serverData = this.config.servers || []
    
    if (onProgress) {
      onProgress(`Identity loaded: ${context.relayData.read.length} relays, ${context.serverData.length} servers`)
    }
  }

  private async loadNsiteContext(context: NsiteContext, onProgress?: (message: string) => void): Promise<void> {
    // Get relays from identity context if available, otherwise use config or discovery
    const identityContext = this.getContext<IdentityContext>('identity')
    let relays: string[]
    
    if (identityContext && identityContext.relayData) {
      relays = identityContext.relayData.read
      if (onProgress) {
        onProgress(`Using identity relays: ${relays.length} relays`)
      }
    } else {
      // Fallback to config or discovery
      relays = this.config.relays && this.config.relays.length > 0 
        ? this.config.relays 
        : resolveRelays({}, null, true)
      if (onProgress) {
        onProgress(`Using config/discovery relays: ${relays.length} relays`)
      }
    }

    const discoveryRelays = resolveRelays({}, null, true)
    
    context.relays = relays
    context.discoveryRelays = discoveryRelays
    context.totalRelays = relays.length
    context.processedRelays = 0
    context.totalEvents = 0

    // Initialize relay connections
    context.relayConnections = new Map()
    const allRelays = [...relays, ...discoveryRelays]
    for (const relay of allRelays) {
      context.relayConnections.set(relay, {
        connected: false,
        lastSeen: undefined,
        events: 0
      })
    }

    if (onProgress) {
      onProgress(`Connecting to ${relays.length} relays...`)
    }

    // Load ignore rules
    const ignoreFilePath = join(this.projectPath, '.nsite-ignore')
    let ignoreRules = parseIgnorePatterns(DEFAULT_IGNORE_PATTERNS)
    
    if (existsSync(ignoreFilePath)) {
      try {
        const ignoreContent = await Deno.readTextFile(ignoreFilePath)
        const customPatterns = ignoreContent.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'))
        ignoreRules = parseIgnorePatterns([...DEFAULT_IGNORE_PATTERNS, ...customPatterns])
      } catch (error) {
        log.warn(`Failed to read .nsite-ignore file: ${error}`)
      }
    }

    // Create progress callback that updates context
    const progressCallback = (message: string) => {
      if (onProgress) {
        onProgress(message)
      }
      this.notifySubscribers('nsite', context)
    }

    // Load files with progress tracking
    const files = await listRemoteFilesWithProgress(
      relays,
      this.identity.pubkey,
      true, // silent mode
      progressCallback
    )

    context.files = files
    context.totalEvents = files.length

    if (onProgress) {
      onProgress(`Found ${files.length} files from ${relays.length} relays`)
    }
  }


  private async loadConfigContext(context: ConfigContext, onProgress?: (message: string) => void): Promise<void> {
    if (onProgress) {
      onProgress('Validating configuration...')
    }

    context.config = this.config
    context.projectPath = this.projectPath

    // Validate config
    const validation = validateConfigWithFeedback(this.config)
    context.isValid = validation.valid
    context.validationErrors = validation.errors?.map(e => e.message) || []

    if (onProgress) {
      const status = validation.valid ? 'Configuration is valid' : `Found ${validation.errors?.length || 0} validation errors`
      onProgress(status)
    }
  }

  private async loadUploadContext(context: UploadContext, onProgress?: (message: string) => void): Promise<void> {
    if (onProgress) {
      onProgress('Preparing upload context...')
    }

    // Load local files
    const files = await this.loadLocalFiles()
    context.files = files.map(file => ({
      path: file.path,
      size: file.size,
      hash: file.hash,
      status: 'pending',
      progress: 0,
      servers: {},
      relays: {}
    }))

    context.stats.totalFiles = files.length
    context.stats.totalSize = files.reduce((sum, file) => sum + file.size, 0)
    context.stage = 'preparing'

    if (onProgress) {
      onProgress(`Loaded ${files.length} files for upload`)
    }
  }

  private async loadOperationContext(context: OperationContext, onProgress?: (message: string) => void): Promise<void> {
    if (onProgress) {
      onProgress('Initializing operations queue...')
    }

    // Initialize empty operations context
    context.activeOperations = new Map()
    context.completedOperations = []
    context.failedOperations = []

    if (onProgress) {
      onProgress('Operations queue ready')
    }
  }

  private async loadLocalFiles(): Promise<any[]> {
    // Import the getLocalFiles function
    const { getLocalFiles } = await import('../../../lib/files.ts')
    const result = await getLocalFiles(this.projectPath)
    
    // getLocalFiles already applies .nsite-ignore patterns
    // The result.includedFiles contains only files that should be uploaded
    // The result.ignoredFilePaths contains files that were ignored
    
    return result.includedFiles || []
  }
  
  // Method to update project path and reload upload context
  async updateProjectPath(newPath: string): Promise<void> {
    this.projectPath = newPath
    
    // Clear existing upload context
    const uploadContext = this.getContext<UploadContext>('upload')
    if (uploadContext) {
      uploadContext.files = []
      uploadContext.stats = {
        totalFiles: 0,
        totalSize: 0,
        uploadedFiles: 0,
        uploadedSize: 0,
        failedFiles: 0,
        skippedFiles: 0,
        publishedEvents: 0,
        failedEvents: 0,
        profileEvents: 0,
        relayListEvents: 0,
        serverListEvents: 0,
        appHandlerEvents: 0,
        signedEvents: 0,
        totalEvents: 0
      }
    }
    
    // Reload upload context with new path
    await this.loadContext('upload')
  }

  // New method to start upload operation
  async startUpload(): Promise<string> {
    const uploadContext = this.getContext<UploadContext>('upload')
    const operationContext = this.getContext<OperationContext>('operations')
    
    if (!uploadContext || !operationContext) {
      throw new Error('Upload and operations contexts must be loaded')
    }

    // Create operation
    const operationId = `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const operation = {
      id: operationId,
      type: 'upload' as const,
      status: 'pending' as const,
      progress: 0,
      startTime: Date.now(),
      canCancel: true
    }

    operationContext.activeOperations.set(operationId, operation)
    
    // Set upload context to active immediately
    if (uploadContext) {
      uploadContext.isActive = true
      uploadContext.stage = 'preparing'
      this.notifySubscribers('upload', uploadContext)
    }
    
    this.notifySubscribers('operations', operationContext)

    // Start upload process in background
    this.processUploadOperation(operationId).catch(error => {
      // Handle any unhandled errors in the upload operation
      const uploadCtx = this.getContext<UploadContext>('upload')
      const operationCtx = this.getContext<OperationContext>('operations')
      
      if (uploadCtx && operationCtx) {
        const operation = operationCtx.activeOperations.get(operationId)
        if (operation) {
          operation.status = 'failed'
          operation.error = error instanceof Error ? error.message : 'Unknown error'
          operation.endTime = Date.now()
          
          operationCtx.activeOperations.delete(operationId)
          operationCtx.failedOperations.push(operation)
          
          uploadCtx.stage = 'failed'
          uploadCtx.isActive = false
          
          this.notifySubscribers('upload', uploadCtx)
          this.notifySubscribers('operations', operationCtx)
        }
      }
    })

    return operationId
  }

  private async processUploadOperation(operationId: string): Promise<void> {
    const uploadContext = this.getContext<UploadContext>('upload')
    const operationContext = this.getContext<OperationContext>('operations')
    
    if (!uploadContext || !operationContext) {
      log.error('Upload or operation context not available')
      return
    }

    const operation = operationContext.activeOperations.get(operationId)
    if (!operation) {
      log.error(`Operation ${operationId} not found`)
      return
    }

    try {
      // Processing upload operation
      
      // Update operation status
      operation.status = 'running'
      operation.progress = 0
      uploadContext.isActive = true
      this.notifySubscribers('operations', operationContext)

      // Stage 1: Load signer and prepare events
      uploadContext.stage = 'signing'
      uploadContext.stats.startTime = Date.now()
      this.notifySubscribers('upload', uploadContext)

      const signer = await this.loadSigner()
      uploadContext.signer = signer
      // Signer loaded successfully

      // Pre-sign all events
      await this.preSignEvents(uploadContext)
      operation.progress = 20
      this.notifySubscribers('operations', operationContext)

      // Stage 2: Upload files
      uploadContext.stage = 'uploading'
      this.notifySubscribers('upload', uploadContext)
      // Starting file upload process

      await this.uploadFiles(uploadContext, operation)
      operation.progress = 80
      this.notifySubscribers('operations', operationContext)

      // Stage 3: Publish events
      uploadContext.stage = 'publishing'
      this.notifySubscribers('upload', uploadContext)
      // Starting event publishing

      await this.publishEvents(uploadContext, operation)
      operation.progress = 100
      this.notifySubscribers('operations', operationContext)

      // Complete operation
      uploadContext.stage = 'completed'
      uploadContext.stats.endTime = Date.now()
      uploadContext.isActive = false
      
      operation.status = 'completed'
      operation.endTime = Date.now()
      
      operationContext.activeOperations.delete(operationId)
      operationContext.completedOperations.push(operation)

      // Upload operation completed successfully
      this.notifySubscribers('upload', uploadContext)
      this.notifySubscribers('operations', operationContext)

    } catch (error) {
      // Handle failure - ensure error is visible
      uploadContext.stage = 'failed'
      uploadContext.isActive = false
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      operation.status = 'failed'
      operation.endTime = Date.now()
      operation.error = errorMessage
      
      operationContext.activeOperations.delete(operationId)
      operationContext.failedOperations.push(operation)

      // Make sure the upload context shows the error
      uploadContext.stats.failedFiles = uploadContext.stats.totalFiles
      
      this.notifySubscribers('upload', uploadContext)
      this.notifySubscribers('operations', operationContext)
    }
  }

  private async loadSigner(): Promise<any> {
    const { createSigner } = await import('../../../lib/auth/signer-factory.ts')
    const { importFromNbunk } = await import('../../../lib/nip46.ts')
    const { SecretsManager } = await import('../../../lib/secrets/mod.ts')
    
    const originalAuth = this.identity.originalAuth
    if (!originalAuth) {
      throw new Error('No authentication method available')
    }
    
    // Follow the same initSigner logic as deploy command
    
    // Priority 1: bunker URL from auth
    if (originalAuth.startsWith('bunker://')) {
      try {
        const { createNip46ClientFromUrl } = await import('../../../lib/nostr.ts')
        const { client } = await createNip46ClientFromUrl(originalAuth)
        return client
      } catch (error) {
        throw new Error(`Failed to connect to bunker: ${error}`)
      }
    }
    
    // Priority 2: nsec from auth
    if (originalAuth.startsWith('nsec')) {
      try {
        const result = await createSigner({ privateKey: originalAuth })
        if ('error' in result) {
          throw new Error(result.error)
        }
        return result.signer
      } catch (error) {
        throw new Error(`Failed to create signer from nsec: ${error}`)
      }
    }
    
    // Priority 3: project bunker with stored nbunksec
    if (this.config.bunkerPubkey && originalAuth === this.config.bunkerPubkey) {
      const secretsManager = SecretsManager.getInstance()
      const nbunkString = await secretsManager.getNbunk(this.config.bunkerPubkey)
      if (nbunkString) {
        try {
          const bunkerSigner = await importFromNbunk(nbunkString)
          await bunkerSigner.getPublicKey()
          return bunkerSigner
        } catch (error) {
          throw new Error(`Failed to use stored nbunksec: ${error}`)
        }
      } else {
        throw new Error('No stored nbunksec found for configured bunker')
      }
    }
    
    throw new Error('No valid signing method available. Please provide a private key, bunker URL, or nbunksec.')
  }

  private async preSignEvents(uploadContext: UploadContext): Promise<void> {
    // TODO: Implement bulk event signing
    // This would create and sign all file metadata events, profile events, etc.
    // NOTE: This is a placeholder implementation. When the upload functionality is completed,
    // this should use the signer to create and sign events for each file, similar to:
    // - createNsiteEvent() from lib/upload.ts
    // - Sign profile, relay list, and app handler events
    // For now, we're just updating the stats to indicate the expected number of events
    uploadContext.stats.signedEvents = uploadContext.files.length
    uploadContext.stats.totalEvents = uploadContext.files.length + 3 // files + profile + relay list + app handler
  }

  private async uploadFiles(uploadContext: UploadContext, operation: any): Promise<void> {
    // Get nsite context for remote files comparison
    const nsiteContext = this.getContext<NsiteContext>('nsite')
    if (!nsiteContext) {
      throw new Error('NsiteContext not available')
    }

    // Import required functions
    const { compareFiles, loadFileData } = await import('../../../lib/files.ts')
    const { processUploads } = await import('../../../lib/upload.ts')

    // Use already loaded signer from upload context
    const signer = uploadContext.signer
    if (!signer) {
      throw new Error('Signer not available in upload context')
    }

    // Convert upload context files to FileEntry format
    const localFiles = uploadContext.files.map(f => ({
      path: f.path,
      size: f.size,
      sha256: f.hash,
      contentType: 'application/octet-stream'
    }))

    // Use existing remote files from nsite context
    const remoteFiles = nsiteContext.files || []

    // Compare files
    const { toTransfer, existing, toDelete } = compareFiles(localFiles, remoteFiles)
    
    // Update upload context to show comparison results
    uploadContext.stats.totalFiles = localFiles.length
    
    // Update all files in upload context based on comparison results
    uploadContext.files.forEach(file => {
      // Check if file already exists remotely
      const existingFile = existing.find(ef => ef.path === file.path)
      if (existingFile) {
        // File already exists remotely - mark as deployed
        file.status = 'completed'
        file.progress = 100
        file.uploadEndTime = Date.now()
      } else {
        // Check if file needs to be uploaded
        const fileToUpload = toTransfer.find(tf => tf.path === file.path)
        if (fileToUpload) {
          // File needs to be uploaded - mark as pending
          file.status = 'pending'
          file.progress = 0
        }
      }
    })
    
    // Update stats for already deployed files (skipped)
    const alreadyDeployedCount = existing.length
    uploadContext.stats.skippedFiles = alreadyDeployedCount
    uploadContext.stats.uploadedFiles = 0 // Will be updated as files are actually uploaded
    uploadContext.stats.uploadedSize = 0 // Will be updated as files are actually uploaded
    
    // If no files to transfer, mark as completed (all files are up-to-date)
    if (toTransfer.length === 0) {
      uploadContext.stage = 'completed'
      uploadContext.stats.endTime = Date.now()
      uploadContext.isActive = false
      
      this.notifySubscribers('upload', uploadContext)
      return
    }
    
    // Notify subscribers with updated file statuses
    this.notifySubscribers('upload', uploadContext)

    // Load file data for files to transfer
    const preparedFiles: any[] = []
    for (const file of toTransfer) {
      const fileWithData = await loadFileData(this.projectPath, file)
      preparedFiles.push(fileWithData)
    }

    // Process uploads if there are files to upload
    if (preparedFiles.length > 0) {
      const servers = this.config.servers || []
      const relays = this.config.relays || []
      
      if (servers.length === 0) {
        throw new Error('No servers configured for upload')
      }
      
      // Mark files as uploading and initialize server/relay status
      uploadContext.files.forEach(file => {
        const fileToUpload = toTransfer.find(tf => tf.path === file.path)
        if (fileToUpload) {
          file.status = 'uploading'
          file.progress = 0
          
          // Initialize server status for each server
          file.servers = file.servers || {}
          servers.forEach(server => {
            file.servers![server] = {
              status: 'uploading',
              progress: 0,
              startTime: Date.now()
            }
          })
          
          // Initialize relay status for each relay (will be used during publishing)
          file.relays = file.relays || {}
          relays.forEach(relay => {
            file.relays![relay] = {
              status: 'pending',
              progress: 0
            }
          })
        }
      })
      this.notifySubscribers('upload', uploadContext)
      
      const uploadResponses = await processUploads(
        preparedFiles,
        this.projectPath,
        servers,
        signer,
        relays,
        4, // concurrency
        (progress: any) => {
          // Update progress in upload context
          const progressValue = typeof progress === 'number' ? progress : 0
          operation.progress = Math.floor(20 + (progressValue * 0.6)) // 20-80% for upload phase
          
          // Update individual file progress
          if (typeof progress === 'object' && progress.fileName) {
            const fileIndex = uploadContext.files.findIndex(f => f.path === progress.fileName)
            if (fileIndex !== -1) {
              const file = uploadContext.files[fileIndex]
              file.status = progress.status === 'completed' ? 'completed' : 'uploading'
              file.progress = progress.progress || 0
              
              // Update server status for this file
              if (progress.server && file.servers) {
                file.servers[progress.server] = {
                  status: progress.status === 'completed' ? 'completed' : 'uploading',
                  progress: progress.progress || 0,
                  startTime: file.servers[progress.server]?.startTime || Date.now()
                }
              }
              
              if (progress.status === 'completed') {
                file.uploadEndTime = Date.now()
                
                // Mark all servers as completed for this file
                if (file.servers) {
                  Object.keys(file.servers).forEach(server => {
                    file.servers![server].status = 'completed'
                    file.servers![server].progress = 100
                  })
                }
              }
            }
          }
          
          this.notifySubscribers('operations', this.getContext('operations')!)
          this.notifySubscribers('upload', uploadContext)
        }
      )
      
      // Mark uploaded files as completed
      uploadResponses.forEach((response, index) => {
        if (response?.success && preparedFiles[index]) {
          const filePath = preparedFiles[index].path
          const fileIndex = uploadContext.files.findIndex(f => f.path === filePath)
          if (fileIndex !== -1) {
            const file = uploadContext.files[fileIndex]
            file.status = 'completed'
            file.progress = 100
            file.uploadEndTime = Date.now()
            
            // Mark all servers as completed for this file
            if (file.servers) {
              Object.keys(file.servers).forEach(server => {
                file.servers![server].status = 'completed'
                file.servers![server].progress = 100
              })
            }
          }
        }
      })
      
    } else {
      // No files to upload
    }

    // Update upload context with final stats
    const completedFiles = uploadContext.files.filter(f => f.status === 'completed')
    const actuallyUploadedFiles = completedFiles.filter(f => f.uploadEndTime && f.uploadEndTime > (uploadContext.stats.startTime || 0))
    
    uploadContext.stats.uploadedFiles = actuallyUploadedFiles.length
    uploadContext.stats.totalFiles = uploadContext.files.length
    uploadContext.stats.uploadedSize = actuallyUploadedFiles.reduce((sum, file) => sum + file.size, 0)
    uploadContext.stats.failedFiles = uploadContext.files.filter(f => f.status === 'failed').length
  }

  private async publishEvents(uploadContext: UploadContext, operation: any): Promise<void> {
    try {
      // TODO: Implement actual event publishing
      // This is a placeholder implementation that simulates publishing progress.
      // When the upload functionality is completed, this should:
      // 1. Retrieve pre-signed events from uploadContext
      // 2. Publish events to relays using publishEventToRelays() from lib/upload.ts
      // 3. Update stats based on actual publishing results
      // For now, we're just simulating the publishing process
      
      // Mark relays as publishing for active files
      const relays = this.config.relays || []
      uploadContext.files.forEach(file => {
        if (file.status === 'completed' && file.relays) {
          relays.forEach(relay => {
            if (file.relays![relay]) {
              file.relays![relay].status = 'publishing'
              file.relays![relay].progress = 50
            }
          })
        }
      })
      
      // Simulate publishing delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Mark relays as published
      uploadContext.files.forEach(file => {
        if (file.status === 'completed' && file.relays) {
          relays.forEach(relay => {
            if (file.relays![relay]) {
              file.relays![relay].status = 'published'
              file.relays![relay].progress = 100
            }
          })
        }
      })
      
      // Update progress for publishing phase
      operation.progress = 100
      this.notifySubscribers('operations', this.getContext('operations')!)
      this.notifySubscribers('upload', uploadContext)
      
      // Update meta event stats
      const actuallyUploadedFiles = uploadContext.files.filter(f => f.status === 'completed' && f.uploadEndTime && f.uploadEndTime > (uploadContext.stats.startTime || 0))
      uploadContext.stats.publishedEvents = actuallyUploadedFiles.length // One event per uploaded file
      uploadContext.stats.totalEvents = actuallyUploadedFiles.length + 4 // files + profile + relay + server + app handler
      
      // Track meta events (these would be actual counts when implemented)
      uploadContext.stats.profileEvents = this.config.publishProfile ? 1 : 0
      uploadContext.stats.relayListEvents = this.config.publishRelayList ? 1 : 0
      uploadContext.stats.serverListEvents = this.config.publishServerList ? 1 : 0
      uploadContext.stats.appHandlerEvents = this.config.publishAppHandler ? 1 : 0
      
    } catch (error) {
      // Failed to publish events
      uploadContext.stats.failedEvents = uploadContext.stats.totalEvents - uploadContext.stats.publishedEvents
    }
  }

  private notifySubscribers(type: ContextType, context: BaseContext): void {
    const subscribers = this.subscriptions.get(type)
    if (subscribers) {
      subscribers.forEach(callback => callback(context))
    }
  }
}