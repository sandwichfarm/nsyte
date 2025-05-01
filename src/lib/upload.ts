import { createLogger } from "./logger.ts";
import { FileEntry, NostrEvent, NostrEventTemplate, connectToRelay } from "./nostr.ts";
import { NSYTE_BROADCAST_RELAYS } from "./constants.ts";

const log = createLogger("upload");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const DEFAULT_CONCURRENCY = 4;

export interface Signer {
  signEvent(event: NostrEventTemplate): Promise<NostrEvent>;
  getPublicKey(): string;
}

export interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}

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
  
  const authTemplate: NostrEventTemplate = {
    kind: 24242,
    created_at: currentTime,
    tags: [
      ["t", "upload"],
      ["x", blobSha256],
      ["expiration", (currentTime + 3600).toString()],
      ["client", "nsyte"],
    ],
    content: "Upload blob via nsyte",
  };
  
  const signedEvent = await signer.signEvent(authTemplate);
  
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
    
    try {
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
    }
    
    const fileObj = new File([file.data], fileName, {
      type: contentType,
      lastModified: Date.now(),
    });
    
    const auth = await createUploadAuth(signer, blobSha256);
    
    const serverUrl = server.endsWith("/") ? server : `${server}/`;
    
    const base64Auth = btoa(auth);
    const authHeader = { "Authorization": `Nostr ${base64Auth}` };
    
    const formData = new FormData();
    formData.append("file", fileObj);
    
    
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
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  
  const eventTemplate: NostrEventTemplate = {
    kind: 34128,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", normalizedPath],
      ["x", sha256],
      ["client", "nsyte"],
    ],
    content: "",
    pubkey: pubkey,
  };
  
  return await signer.signEvent(eventTemplate);
}

/**
 * Publish event to relays with direct WebSocket connections
 */
async function publishEventToRelays(event: NostrEvent, relays: string[]): Promise<boolean> {
  log.debug(`Publishing event to ${relays.length} relays`);
  
  let successCount = 0;
  const eventJson = JSON.stringify(["EVENT", event]);
  
  await Promise.all(relays.map(async (relay) => {
    try {
      const socket = new WebSocket(relay);
      
      const connectPromise = new Promise<boolean>(resolve => {
        socket.onopen = () => {
          log.debug(`Connected to relay: ${relay}`);
          socket.send(eventJson);
          
          socket.onmessage = (msg) => {
            try {
              const data = JSON.parse(msg.data);
              if (Array.isArray(data) && data.length >= 3 && data[0] === "OK" && data[2] === true) {
                log.debug(`Event published to relay: ${relay}`);
                resolve(true);
                socket.close();
              }
            } catch (e) {
              log.debug(`Error parsing message from relay ${relay}: ${e}`);
            }
          };
          
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
  if (!relays || relays.length === 0) {
    throw new Error("No relays provided for publishing events. Events must be published to relays to make the files accessible.");
  }
  
  log.info(`Starting upload of ${files.length} files to ${servers.length} servers with concurrency ${concurrency}`);
  
  const progress: UploadProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
  };
  
  if (progressCallback) {
    progressCallback({ ...progress });
  }
  
  const results: UploadResponse[] = [];
  const queue = [...files];
  
  const errors: Array<{file: string, error: string}> = [];
  
  while (queue.length > 0) {
    const chunk = queue.splice(0, Math.min(concurrency, queue.length));
    progress.inProgress = chunk.length;
    
    if (progressCallback) {
      progressCallback({ ...progress });
    }
    
    const chunkResults = await Promise.all(
      chunk.map(file => uploadFile(file, baseDir, servers, signer, relays))
    );
    
    for (const result of chunkResults) {
      results.push(result);
      
      if (result.success) {
        progress.completed++;
      } else {
        progress.failed++;
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
    
    const userPubkey = signer.getPublicKey();
    
    if (!file.data || !file.sha256) {
      throw new Error("File data or SHA-256 hash missing");
    }
    
    const serverResults: { [server: string]: { success: boolean; error?: string; alreadyExists?: boolean } } = {};
    
    const uploadResults = await Promise.all(
      servers.map(async (server) => {
        try {
          const success = await uploadToServer(server, file, signer);
          
          const serverUrl = server.endsWith("/") ? server : `${server}/`;
          let alreadyExists = false;
          
          try {
            const response = await fetch(`${serverUrl}${file.sha256}`, {
              method: "HEAD"
            });
            alreadyExists = response.ok;
          } catch (e) {
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
    
    const anyServerSuccess = uploadResults.some(result => result);
    
    if (!anyServerSuccess) {
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
    
    const successfulServers = Object.values(serverResults).filter(r => r.success).length;
    
    const signedEvent = await publishNsiteEvent(signer, userPubkey, file.path, file.sha256);
    
    let eventPublished = false;
    try {
      if (!relays || relays.length === 0) {
        throw new Error("No relays provided for publishing events");
      }
      
      eventPublished = await publishEventToRelays(signedEvent, relays);
      
      if (eventPublished) {
        log.info(`Published nsite event for ${file.path} to relays`);
      } else {
        log.warn(`Failed to publish nsite event for ${file.path} to relays`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Error publishing nsite event for ${file.path}: ${errorMessage}`);
    }
    
    return {
      file,
      success: true,
      eventId: signedEvent.id,
      serverResults,
      eventPublished
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to upload ${file.path}: ${errorMessage}`);
    
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