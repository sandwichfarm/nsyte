import { createLogger } from "./logger.ts";
import { FileEntry, NostrEvent, NostrEventTemplate, connectToRelay } from "./nostr.ts";
import { NSITE_BROADCAST_RELAYS } from "./constants.ts";

const log = createLogger("upload");

// Define retry parameters
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Default concurrency limit
const DEFAULT_CONCURRENCY = 4;

// Interface to represent a generic signer
export interface Signer {
  signEvent(event: NostrEventTemplate): Promise<NostrEvent>;
  getPublicKey(): string;
}

// Interface for upload progress tracking
export interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}

// Upload response type
export type UploadResponse = {
  file: FileEntry;
  success: boolean;
  error?: string;
  eventId?: string;
  eventPublished?: boolean;
  serverResults: {
    [server: string]: {
      success: boolean;
      error?: string;
      alreadyExists?: boolean;
    };
  };
};

/**
 * Sign a blob upload authorization
 */
async function createUploadAuth(signer: Signer, blobSha256: string): Promise<string> {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Create auth event template following Blossom spec
  const authTemplate: NostrEventTemplate = {
    kind: 24242, // Blossom auth kind per spec
    created_at: currentTime,
    tags: [
      ["t", "upload"], // Required verb tag per spec
      ["x", blobSha256], // Blob hash
      ["expiration", (currentTime + 3600).toString()], // 1 hour expiration per NIP-40
      ["client", "nsyte"],
    ],
    content: "Upload blob via nsyte", // Human-readable description per spec
  };
  
  // Sign the auth event
  const signedEvent = await signer.signEvent(authTemplate);
  
  // Return the stringified event
  return JSON.stringify(signedEvent);
}

/**
 * Upload a blob to a single blossom server
 */
async function uploadToServer(
  server: string, 
  file: FileEntry, 
  signer: Signer
): Promise<boolean> {
  if (!file.data || !file.sha256) {
    throw new Error("File data or SHA-256 hash missing");
  }
  
  try {
    const blobSha256 = file.sha256;
    const fileName = file.path.split("/").pop() || "file";
    const contentType = file.contentType || "application/octet-stream";
    
    // First check if the file already exists on the server
    try {
      // Ensure server URL ends with a slash
      const serverUrl = server.endsWith("/") ? server : `${server}/`;
      
      log.debug(`Checking if ${file.path} (${blobSha256}) already exists on ${server}`);
      const response = await fetch(`${serverUrl}${blobSha256}`, {
        method: "HEAD"
      });
      
      if (response.ok) {
        log.debug(`File ${file.path} (${blobSha256}) already exists on ${server}`);
        return true;
      }
    } catch (e) {
      log.debug(`Error checking if file exists on ${server}: ${e}`);
      // Continue with upload attempts if check fails
    }
    
    // Create a file object from the data
    const fileObj = new File([file.data], fileName, {
      type: contentType,
      lastModified: Date.now(),
    });
    
    // Create an auth token
    const auth = await createUploadAuth(signer, blobSha256);
    
    // Ensure server URL ends with a slash
    const serverUrl = server.endsWith("/") ? server : `${server}/`;
    
    // Create base64 auth for header per spec
    const base64Auth = btoa(auth);
    const authHeader = { "Authorization": `Nostr ${base64Auth}` };
    
    // Create form data with file
    const formData = new FormData();
    formData.append("file", fileObj);
    
    // Try multiple approaches in order of Blossom spec preference
    
    // 1. Try PUT with Authorization header to /{sha256} (primary per spec)
    try {
      log.debug(`Trying PUT to ${serverUrl}${blobSha256} with auth header`);
      const response = await fetch(`${serverUrl}${blobSha256}`, {
        method: "PUT",
        headers: authHeader,
        body: fileObj
      });
      
      if (response.ok) {
        log.debug(`Uploaded ${file.path} to ${server} using PUT with auth header`);
        return true;
      }
      
      const errorText = await response.text();
      log.debug(`PUT with auth header failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`PUT with auth header failed: ${e}`);
    }
    
    // 2. Try POST with Authorization header to /{sha256} 
    try {
      log.debug(`Trying POST to ${serverUrl}${blobSha256} with auth header`);
      const response = await fetch(`${serverUrl}${blobSha256}`, {
        method: "POST",
        headers: authHeader,
        body: fileObj
      });
      
      if (response.ok) {
        log.debug(`Uploaded ${file.path} to ${server} using POST with auth header`);
        return true;
      }
      
      const errorText = await response.text();
      log.debug(`POST with auth header failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`POST with auth header failed: ${e}`);
    }
    
    // 3. Try PUT with Authorization header to /upload
    try {
      log.debug(`Trying PUT to ${serverUrl}upload with auth header`);
      const response = await fetch(`${serverUrl}upload`, {
        method: "PUT",
        headers: authHeader,
        body: fileObj
      });
      
      if (response.ok) {
        log.debug(`Uploaded ${file.path} to ${server} using PUT to /upload with auth header`);
        return true;
      }
      
      const errorText = await response.text();
      log.debug(`PUT to /upload with auth header failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`PUT to /upload with auth header failed: ${e}`);
    }
    
    // 4. Try POST with Authorization header to /upload
    try {
      log.debug(`Trying POST to ${serverUrl}upload with auth header`);
      const response = await fetch(`${serverUrl}upload`, {
        method: "POST",
        headers: authHeader,
        body: fileObj
      });
      
      if (response.ok) {
        log.debug(`Uploaded ${file.path} to ${server} using POST to /upload with auth header`);
        return true;
      }
      
      const errorText = await response.text();
      log.debug(`POST to /upload with auth header failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`POST to /upload with auth header failed: ${e}`);
    }
    
    // 5. Try POST with Authorization header to /{sha256} with FormData
    try {
      log.debug(`Trying POST to ${serverUrl}${blobSha256} with auth header and FormData`);
      const response = await fetch(`${serverUrl}${blobSha256}`, {
        method: "POST",
        headers: authHeader,
        body: formData
      });
      
      if (response.ok) {
        log.debug(`Uploaded ${file.path} to ${server} using POST with auth header and FormData`);
        return true;
      }
      
      const errorText = await response.text();
      log.debug(`POST with auth header and FormData failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`POST with auth header and FormData failed: ${e}`);
    }
    
    // 6. Try POST with Authorization header to /upload with FormData
    try {
      log.debug(`Trying POST to ${serverUrl}upload with auth header and FormData`);
      const response = await fetch(`${serverUrl}upload`, {
        method: "POST",
        headers: authHeader,
        body: formData
      });
      
      if (response.ok) {
        log.debug(`Uploaded ${file.path} to ${server} using POST to /upload with auth header and FormData`);
        return true;
      }
      
      const errorText = await response.text();
      log.debug(`POST to /upload with auth header and FormData failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`POST to /upload with auth header and FormData failed: ${e}`);
    }
    
    // 7. Try POST with auth in FormData (fallback for non-spec servers)
    try {
      const formDataWithAuth = new FormData();
      formDataWithAuth.append("file", fileObj);
      formDataWithAuth.append("auth", auth);
      
      log.debug(`Trying POST to ${serverUrl}${blobSha256} with auth in FormData`);
      const response = await fetch(`${serverUrl}${blobSha256}`, {
        method: "POST",
        body: formDataWithAuth
      });
      
      if (response.ok) {
        log.debug(`Uploaded ${file.path} to ${server} using POST with auth in FormData`);
        return true;
      }
      
      const errorText = await response.text();
      log.debug(`POST with auth in FormData failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`POST with auth in FormData failed: ${e}`);
    }
    
    // 8. Try POST to /upload with auth in FormData (fallback for non-spec servers)
    try {
      const formDataWithAuth = new FormData();
      formDataWithAuth.append("file", fileObj);
      formDataWithAuth.append("auth", auth);
      
      log.debug(`Trying POST to ${serverUrl}upload with auth in FormData`);
      const response = await fetch(`${serverUrl}upload`, {
        method: "POST",
        body: formDataWithAuth
      });
      
      if (response.ok) {
        log.debug(`Uploaded ${file.path} to ${server} using POST to /upload with auth in FormData`);
        return true;
      }
      
      const errorText = await response.text();
      log.debug(`POST to /upload with auth in FormData failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`POST to /upload with auth in FormData failed: ${e}`);
    }
    
    log.error(`Failed to upload ${file.path} to ${server}: All upload methods failed`);
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to upload ${file.path} to ${server}: ${errorMessage}`);
    return false;
  }
}

/**
 * Publish an nsite event to NOSTR
 */
async function publishNsiteEvent(signer: Signer, pubkey: string, path: string, sha256: string): Promise<NostrEvent> {
  // Ensure path starts with a slash
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  
  // Create event template
  const eventTemplate: NostrEventTemplate = {
    kind: 34128, // NSITE kind
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", normalizedPath],
      ["x", sha256],
      ["client", "nsyte"],
    ],
    content: "",
    pubkey: pubkey,
  };
  
  // Sign the event
  return await signer.signEvent(eventTemplate);
}

/**
 * Publish event to relays with direct WebSocket connections
 */
async function publishEventToRelays(event: NostrEvent, relays: string[]): Promise<boolean> {
  log.debug(`Publishing event to ${relays.length} relays`);
  
  // Keep track of successful publishes
  let successCount = 0;
  const eventJson = JSON.stringify(["EVENT", event]);
  
  // Try each relay
  await Promise.all(relays.map(async (relay) => {
    try {
      // Open WebSocket connection
      const socket = new WebSocket(relay);
      
      // Create a promise that resolves when we get a response or timeout
      const connectPromise = new Promise<boolean>(resolve => {
        // Handle socket events
        socket.onopen = () => {
          log.debug(`Connected to relay: ${relay}`);
          socket.send(eventJson);
          
          // Set event handlers
          socket.onmessage = (msg) => {
            try {
              const data = JSON.parse(msg.data);
              // Check for OK response
              if (Array.isArray(data) && data.length >= 3 && data[0] === "OK" && data[2] === true) {
                log.debug(`Event published to relay: ${relay}`);
                resolve(true);
                socket.close();
              }
            } catch (e) {
              log.debug(`Error parsing message from relay ${relay}: ${e}`);
            }
          };
          
          // Set a timeout to close the connection in case we don't get a response
          setTimeout(() => {
            resolve(false);
            socket.close();
          }, 5000);
        };
        
        socket.onerror = (e) => {
          log.debug(`WebSocket error with relay ${relay}: ${e}`);
          resolve(false);
        };
        
        socket.onclose = () => {
          resolve(false);
        };
      });
      
      // Wait for the connection and publication
      const success = await connectPromise;
      if (success) {
        successCount++;
      }
    } catch (e) {
      log.debug(`Failed to connect to relay ${relay}: ${e}`);
    }
  }));
  
  const success = successCount > 0;
  if (success) {
    log.info(`Published event to ${successCount}/${relays.length} relays`);
  } else {
    log.warn("Failed to publish event to any relay");
  }
  
  return success;
}

/**
 * Process uploads in parallel with progress tracking
 */
export async function processUploads(
  files: FileEntry[],
  baseDir: string,
  servers: string[],
  signer: Signer,
  relays: string[],
  concurrency = DEFAULT_CONCURRENCY,
  progressCallback?: (progress: UploadProgress) => void
): Promise<UploadResponse[]> {
  // Validate required parameters
  if (!relays || relays.length === 0) {
    throw new Error("No relays provided for publishing events. Events must be published to relays to make the files accessible.");
  }
  
  log.info(`Starting upload of ${files.length} files to ${servers.length} servers with concurrency ${concurrency}`);
  
  // Initialize progress based on file count, not server operations
  const progress: UploadProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
  };
  
  // Update progress initially
  if (progressCallback) {
    progressCallback({ ...progress });
  }
  
  // Process files in chunks based on concurrency
  const results: UploadResponse[] = [];
  const queue = [...files];
  
  // Collect errors to display at the end
  const errors: Array<{file: string, error: string}> = [];
  
  while (queue.length > 0) {
    const chunk = queue.splice(0, Math.min(concurrency, queue.length));
    progress.inProgress = chunk.length;
    
    if (progressCallback) {
      progressCallback({ ...progress });
    }
    
    // Upload files in this chunk in parallel
    const chunkResults = await Promise.all(
      chunk.map(file => uploadFile(file, baseDir, servers, signer, relays))
    );
    
    // Process results from this chunk
    for (const result of chunkResults) {
      results.push(result);
      
      if (result.success) {
        progress.completed++;
      } else {
        progress.failed++;
        // Save error for later display
        errors.push({
          file: result.file.path,
          error: result.error || "Unknown error"
        });
      }
      
      progress.inProgress = Math.max(0, progress.inProgress - 1);
      
      if (progressCallback) {
        progressCallback({ ...progress });
      }
    }
  }
  
  // Display collected errors after progress bar completes
  if (errors.length > 0) {
    log.info("\nFile upload errors:");
    for (const error of errors) {
      log.error(`Failed to upload ${error.file}: ${error.error}`);
    }
  }
  
  log.info(`Upload completed: ${progress.completed} succeeded, ${progress.failed} failed`);
  return results;
}

/**
 * Upload a single file with retries
 */
async function uploadFile(
  file: FileEntry,
  baseDir: string,
  servers: string[],
  signer: Signer,
  relays: string[],
  retryCount = 0
): Promise<UploadResponse> {
  try {
    log.debug(`Uploading file ${file.path}${retryCount > 0 ? ` (retry ${retryCount})` : ""}`);
    
    // Get user's pubkey from the signer
    const userPubkey = signer.getPublicKey();
    
    // Ensure the file has data and SHA-256 hash
    if (!file.data || !file.sha256) {
      throw new Error("File data or SHA-256 hash missing");
    }
    
    // Upload to all blossom servers and track results per server
    const serverResults: { [server: string]: { success: boolean; error?: string; alreadyExists?: boolean } } = {};
    
    const uploadResults = await Promise.all(
      servers.map(async (server) => {
        try {
          const success = await uploadToServer(server, file, signer);
          
          // Check if the file already exists (this requires changes to uploadToServer)
          const serverUrl = server.endsWith("/") ? server : `${server}/`;
          let alreadyExists = false;
          
          try {
            const response = await fetch(`${serverUrl}${file.sha256}`, {
              method: "HEAD"
            });
            alreadyExists = response.ok;
          } catch (e) {
            // Ignore error checking if file exists
          }
          
          serverResults[server] = { 
            success, 
            alreadyExists: alreadyExists && success
          };
          
          return success;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          serverResults[server] = { success: false, error: errorMessage };
          return false;
        }
      })
    );
    
    // Check if at least one server upload succeeded
    const anyServerSuccess = uploadResults.some(result => result);
    
    if (!anyServerSuccess) {
      // Check if the file already exists on all servers
      const allServersHaveFile = servers.every(server => {
        const result = serverResults[server];
        return result && (result.success || result.alreadyExists);
      });
      
      if (allServersHaveFile) {
        log.info(`File ${file.path} already exists on all servers, skipping upload but publishing events`);
        for (const server of servers) {
          serverResults[server] = { success: true, alreadyExists: true };
        }
      } else {
        const serverErrors = Object.entries(serverResults)
          .map(([server, result]) => `${server}: ${result.error || "Unknown error"}`)
          .join("; ");
        
        throw new Error(`Failed to upload to any server: ${serverErrors}`);
      }
    }
    
    // Count successful servers
    const successfulServers = Object.values(serverResults).filter(r => r.success).length;
    
    // Publish NOSTR event only if at least one server upload succeeded
    const signedEvent = await publishNsiteEvent(signer, userPubkey, file.path, file.sha256);
    
    // Publish the event to the relays provided by the user
    let eventPublished = false;
    try {
      // Verify we have relays to publish to
      if (!relays || relays.length === 0) {
        throw new Error("No relays provided for publishing events");
      }
      
      // Publish event to relays
      eventPublished = await publishEventToRelays(signedEvent, relays);
      
      if (eventPublished) {
        log.info(`Published NSITE event for ${file.path} to relays`);
      } else {
        log.warn(`Failed to publish NSITE event for ${file.path} to relays`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Error publishing NSITE event for ${file.path}: ${errorMessage}`);
      // Continue despite error - we still uploaded the file
    }
    
    return {
      file,
      success: true, // Mark as success if we got this far
      eventId: signedEvent.id,
      serverResults,
      eventPublished
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to upload ${file.path}: ${errorMessage}`);
    
    // Retry logic
    if (retryCount < MAX_RETRIES) {
      log.debug(`Retrying upload for ${file.path} (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return uploadFile(file, baseDir, servers, signer, relays, retryCount + 1);
    }
    
    return {
      file,
      success: false,
      error: errorMessage,
      serverResults: {},
      eventPublished: false
    };
  }
} 