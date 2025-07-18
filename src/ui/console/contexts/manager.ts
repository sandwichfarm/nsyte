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
import { colors } from '@cliffy/ansi/colors'

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
    const localFiles = await this.loadLocalFiles()
    
    // Get nsite context to check existing deployment state
    const nsiteContext = this.getContext<NsiteContext>('nsite')
    if (!nsiteContext || nsiteContext.status !== 'loaded') {
      log.warn('Nsite context not fully loaded, upload context may not have sync status')
    }
    const remoteFiles = nsiteContext?.files || []
    
    if (onProgress) {
      onProgress(`Checking sync status for ${localFiles.length} files against ${remoteFiles.length} remote files...`)
    }
    
    // Create a map of remote files by path for quick lookup
    const remoteFileMap = new Map<string, any>()
    remoteFiles.forEach(rf => {
      remoteFileMap.set(rf.path, rf)
    })
    
    log.debug(`Remote file map has ${remoteFileMap.size} entries`)
    
    // Get servers and relays from config
    const servers = this.config.servers || []
    const relays = this.config.relays || []
    
    let syncedCount = 0
    context.files = localFiles.map(file => {
      const remoteFile = remoteFileMap.get(file.path)
      
      if (remoteFile) {
        log.debug(`Found remote file for ${file.path}: local hash=${file.hash}, remote hash=${remoteFile.sha256}, servers=${JSON.stringify(remoteFile.availableOnServers)}, relays=${JSON.stringify(remoteFile.foundOnRelays)}`)
      }
      
      // Initialize server status based on remote file data
      const serverStatus: any = {}
      servers.forEach(server => {
        if (remoteFile && remoteFile.sha256 === file.hash && remoteFile.availableOnServers?.includes(server)) {
          // File exists on this server with same hash
          serverStatus[server] = {
            status: 'completed',
            progress: 100
          }
        } else {
          // File doesn't exist on this server or has different hash
          serverStatus[server] = {
            status: 'pending',
            progress: 0
          }
        }
      })
      
      // Initialize relay status based on remote file data
      const relayStatus: any = {}
      relays.forEach(relay => {
        if (remoteFile && remoteFile.sha256 === file.hash && remoteFile.foundOnRelays?.includes(relay)) {
          // File event exists on this relay
          relayStatus[relay] = {
            status: 'published',
            progress: 100
          }
        } else {
          // File event doesn't exist on this relay
          relayStatus[relay] = {
            status: 'pending',
            progress: 0
          }
        }
      })
      
      // Determine overall file status
      const hasAnyServer = servers.some(s => serverStatus[s]?.status === 'completed')
      const hasAnyRelay = relays.some(r => relayStatus[r]?.status === 'published')
      const isFullySynced = remoteFile && remoteFile.sha256 === file.hash && hasAnyServer && hasAnyRelay
      
      if (isFullySynced) {
        syncedCount++
      }
      
      return {
        path: file.path,
        size: file.size,
        hash: file.hash,
        status: isFullySynced ? 'completed' : 'pending',
        progress: isFullySynced ? 100 : 0,
        servers: serverStatus,
        relays: relayStatus
      }
    })
    
    log.debug(`Upload context: ${syncedCount}/${localFiles.length} files already synced`)

    // Update stats to reflect already synced files
    const syncedFiles = context.files.filter(f => f.status === 'completed').length
    context.stats.totalFiles = localFiles.length
    context.stats.totalSize = localFiles.reduce((sum, file) => sum + file.size, 0)
    context.stats.skippedFiles = syncedFiles
    context.stage = 'preparing'

    if (onProgress) {
      if (syncedFiles > 0) {
        onProgress(`Loaded ${localFiles.length} files (${syncedFiles} already deployed)`)
      } else {
        onProgress(`Loaded ${localFiles.length} files for upload`)
      }
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
    
    log.info(`Loading files from directory: ${this.projectPath}`)
    const result = await getLocalFiles(this.projectPath)
    
    // getLocalFiles already applies .nsite-ignore patterns
    // The result.includedFiles contains only files that should be uploaded
    // The result.ignoredFilePaths contains files that were ignored
    
    log.info(`Found ${result.includedFiles?.length || 0} files in ${this.projectPath}`)
    if (result.includedFiles && result.includedFiles.length > 0) {
      log.info(`First few files: ${result.includedFiles.slice(0, 5).map(f => f.path).join(', ')}`)
      // Check if these are actually from the dist directory
      const hasDistFiles = result.includedFiles.some(f => f.path.includes('dist'))
      const hasNonDistFiles = result.includedFiles.some(f => !f.path.includes('dist'))
      log.info(`Has dist files: ${hasDistFiles}, Has non-dist files: ${hasNonDistFiles}`)
    }
    
    return result.includedFiles || []
  }
  
  // Method to update project path and reload upload context
  async updateProjectPath(newPath: string): Promise<void> {
    log.info(`Updating project path from ${this.projectPath} to ${newPath}`)
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
    log.info(`Reloading upload context for path: ${this.projectPath}`)
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

  async cancelOperation(operationId: string): Promise<void> {
    const operationContext = this.getContext<OperationContext>('operations')
    const uploadContext = this.getContext<UploadContext>('upload')
    
    if (!operationContext) {
      throw new Error('Operation context not available')
    }
    
    const operation = operationContext.activeOperations.get(operationId)
    if (!operation || !operation.canCancel) {
      throw new Error('Operation cannot be cancelled')
    }
    
    // Mark operation as cancelled
    operation.status = 'cancelled'
    operation.endTime = Date.now()
    operationContext.activeOperations.delete(operationId)
    operationContext.failedOperations.push(operation)
    
    // Update upload context
    if (uploadContext) {
      uploadContext.isActive = false
      uploadContext.stage = 'idle'
      this.notifySubscribers('upload', uploadContext)
    }
    
    this.notifySubscribers('operations', operationContext)
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

      // First check if any files need to be uploaded
      const nsiteContext = this.getContext<NsiteContext>('nsite')
      if (!nsiteContext) {
        throw new Error('NsiteContext not available')
      }

      // Quick check for already deployed files
      const { compareFiles } = await import('../../../lib/files.ts')
      const localFiles = uploadContext.files.map(f => ({
        path: f.path,
        size: f.size,
        sha256: f.hash,
        contentType: 'application/octet-stream'
      }))
      const remoteFiles = nsiteContext.files || []
      const { toTransfer, existing } = compareFiles(localFiles, remoteFiles)
      
      // If no files to transfer, skip signer loading and mark as completed
      if (toTransfer.length === 0) {
        uploadContext.stage = 'completed'
        uploadContext.stats.totalFiles = localFiles.length
        uploadContext.stats.skippedFiles = existing.length
        uploadContext.stats.uploadedFiles = 0
        uploadContext.stats.endTime = Date.now()
        uploadContext.isActive = false
        
        // Update all files as already deployed
        uploadContext.files.forEach(file => {
          file.status = 'completed'
          file.progress = 100
          file.uploadEndTime = Date.now()
        })
        
        operation.status = 'completed'
        operation.progress = 100
        operation.endTime = Date.now()
        
        operationContext.activeOperations.delete(operationId)
        operationContext.completedOperations.push(operation)
        
        this.notifySubscribers('upload', uploadContext)
        this.notifySubscribers('operations', operationContext)
        return
      }

      // Stage 1: Load signer and prepare events (only if we have files to upload)
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
    // Use the standard initSigner for all auth methods
    const { initSigner } = await import('../../../lib/auth/signer.ts')
    
    const originalAuth = this.identity.originalAuth
    
    // If using project bunker, we don't have the private key but initSigner will handle it
    if (this.identity.authMethod === 'bunker' && this.config.bunkerPubkey && !originalAuth) {
      log.info('Using project bunker authentication...')
      // initSigner will check for stored nbunksec when no auth is provided but bunker is configured
      const result = await initSigner(
        null,
        {
          nonInteractive: false // Allow keychain prompts in console mode
        },
        this.config
      )
      
      if ('error' in result) {
        throw new Error(result.error)
      }
      
      return result
    }
    
    if (!originalAuth) {
      throw new Error('No authentication method available')
    }
    
    log.info(`Loading signer using initSigner with auth: ${originalAuth.substring(0, 20)}...`)
    
    // Convert auth to the format initSigner expects
    let authKeyHex: string | null = null
    let bunkerUrl: string | undefined
    
    if (originalAuth.startsWith('bunker://')) {
      bunkerUrl = originalAuth
    } else if (originalAuth.startsWith('nsec')) {
      // initSigner expects hex key, so convert nsec to hex
      const { nip19 } = await import('nostr-tools')
      const decoded = nip19.decode(originalAuth)
      if (decoded.type === 'nsec') {
        const bytes = decoded.data as Uint8Array
        authKeyHex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
      } else {
        throw new Error('Invalid nsec format')
      }
    } else if (originalAuth.length === 64 && /^[0-9a-fA-F]+$/.test(originalAuth)) {
      authKeyHex = originalAuth
    }
    
    // Call initSigner with proper options
    const result = await initSigner(
      authKeyHex,
      {
        bunker: bunkerUrl,
        nonInteractive: false // Allow keychain prompts in console mode
      },
      this.config
    )
    
    if ('error' in result) {
      throw new Error(result.error)
    }
    
    return result
  }

  private async preSignEvents(uploadContext: UploadContext): Promise<void> {
    const { createNsiteEvent } = await import('../../../lib/nostr.ts')
    const signer = uploadContext.signer
    
    if (!signer) {
      throw new Error('Signer not available for event signing')
    }
    
    // Get publisher pubkey
    const userPubkey = await signer.getPublicKey()
    
    // Clear any existing signed events
    uploadContext.signedEvents.clear()
    
    // Create and sign events for each uploaded file
    for (const file of uploadContext.files) {
      // Only create events for files that will be uploaded
      if (file.status === 'pending' || file.status === 'uploading') {
        try {
          const nsiteEvent = await createNsiteEvent(
            signer,
            userPubkey,
            file.path,
            file.hash
          )
          
          // Store the signed event
          uploadContext.signedEvents.set(file.path, nsiteEvent)
        } catch (error) {
          log.error(`Failed to create event for file ${file.path}: ${error}`)
          file.status = 'failed'
          file.error = `Failed to sign event: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
    
    // Update stats
    uploadContext.stats.signedEvents = uploadContext.signedEvents.size
    
    // Calculate total events including meta events
    let metaEventCount = 0
    if (this.config.publishProfile) metaEventCount++
    if (this.config.publishRelayList) metaEventCount++
    if (this.config.publishServerList) metaEventCount++
    if (this.config.publishAppHandler) metaEventCount++
    
    uploadContext.stats.totalEvents = uploadContext.signedEvents.size + metaEventCount
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

    // Compare files again to get detailed info for upload process
    const { toTransfer, existing, toDelete } = compareFiles(localFiles, remoteFiles)
    
    // Update stats
    uploadContext.stats.totalFiles = localFiles.length
    uploadContext.stats.skippedFiles = existing.length
    uploadContext.stats.uploadedFiles = 0
    uploadContext.stats.uploadedSize = 0
    
    // Update file statuses
    uploadContext.files.forEach(file => {
      const existingFile = existing.find(ef => ef.path === file.path)
      if (existingFile) {
        file.status = 'completed'
        file.progress = 100
        file.uploadEndTime = Date.now()
      } else {
        const fileToUpload = toTransfer.find(tf => tf.path === file.path)
        if (fileToUpload) {
          file.status = 'pending'
          file.progress = 0
        }
      }
    })
    
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
        DEFAULT_CONCURRENCY, // concurrency
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
      // Import required functions
      const { publishEventsToRelays } = await import('../../../lib/nostr.ts')
      const { publishMetadata } = await import('../../../lib/metadata/publisher.ts')
      
      const relays = this.config.relays || []
      const signer = uploadContext.signer
      
      if (!signer) {
        throw new Error('Signer not available for publishing events')
      }
      
      // Mark relays as publishing for active files
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
      
      this.notifySubscribers('upload', uploadContext)
      
      // Publish file metadata events if we have any
      const nsiteEvents: any[] = []
      for (const [eventId, event] of uploadContext.signedEvents) {
        nsiteEvents.push(event)
      }
      
      if (nsiteEvents.length > 0) {
        log.info(`Publishing ${nsiteEvents.length} file metadata events to ${relays.length} relays`)
        await publishEventsToRelays(relays, nsiteEvents)
        uploadContext.stats.publishedEvents = nsiteEvents.length
      }
      
      operation.progress = 90
      this.notifySubscribers('operations', this.getContext('operations')!)
      
      // Create a simple status display for metadata publisher
      const statusDisplay = {
        update: (msg: string) => log.info(msg),
        success: (msg: string) => log.info(`✓ ${msg}`),
        error: (msg: string) => log.error(msg)
      }
      
      // Publish metadata events (profile, relay list, server list, app handler)
      await publishMetadata(
        this.config,
        signer,
        relays,
        statusDisplay,
        {
          publishProfile: this.config.publishProfile,
          publishRelayList: this.config.publishRelayList,
          publishServerList: this.config.publishServerList,
          publishAppHandler: this.config.publishAppHandler
        },
        [] // includedFiles not needed for metadata
      )
      
      // Update stats based on what was published
      uploadContext.stats.profileEvents = this.config.publishProfile ? 1 : 0
      uploadContext.stats.relayListEvents = this.config.publishRelayList ? 1 : 0
      uploadContext.stats.serverListEvents = this.config.publishServerList ? 1 : 0
      uploadContext.stats.appHandlerEvents = this.config.publishAppHandler ? 1 : 0
      
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
      
      // Update total event count
      const actuallyUploadedFiles = uploadContext.files.filter(f => f.status === 'completed' && f.uploadEndTime && f.uploadEndTime > (uploadContext.stats.startTime || 0))
      uploadContext.stats.totalEvents = actuallyUploadedFiles.length + 
        uploadContext.stats.profileEvents + 
        uploadContext.stats.relayListEvents + 
        uploadContext.stats.serverListEvents + 
        uploadContext.stats.appHandlerEvents
      
    } catch (error) {
      // Failed to publish events
      uploadContext.stats.failedEvents = uploadContext.stats.totalEvents - uploadContext.stats.publishedEvents
      throw error
    }
  }

  private notifySubscribers(type: ContextType, context: BaseContext): void {
    const subscribers = this.subscriptions.get(type)
    if (subscribers) {
      subscribers.forEach(callback => callback(context))
    }
  }
}