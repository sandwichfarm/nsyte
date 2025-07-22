import type { Nip07Interface } from "applesauce-signers";
import { createLogger } from "./logger.ts";
import { createNsiteEvent } from "./nostr.ts";
import type { FileEntry, NostrEvent, NostrEventTemplate } from "./nostr.ts";

const log = createLogger("upload");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const DEFAULT_CONCURRENCY = 4;

/** @deprecated use Nip07Interface from applesauce-signers */
export interface Signer extends Nip07Interface {}

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
  signer: Signer,
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
        method: "HEAD",
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
    const authHeader = { Authorization: `Nostr ${base64Auth}` };

    const formData = new FormData();
    formData.append("file", fileObj);

    try {
      log.debug(`Trying PUT to ${serverUrl}upload with auth header`);
      const response = await fetch(`${serverUrl}upload`, {
        method: "PUT",
        headers: authHeader,
        body: fileObj,
      });

      if (response.ok) {
        log.debug(`Upload request succeeded for ${file.path} to ${server}, verifying storage...`);

        // Verify the file is actually stored and retrievable
        try {
          await new Promise((resolve) => setTimeout(resolve, 100)); // Brief delay for server processing
          const verifyResponse = await fetch(`${serverUrl}${blobSha256}`, {
            method: "HEAD",
          });

          if (verifyResponse.ok) {
            log.debug(`Upload verified: ${file.path} is retrievable from ${server}`);
            return true;
          } else {
            log.debug(
              `Upload verification failed: ${file.path} not retrievable from ${server} (status: ${verifyResponse.status})`,
            );
            return false;
          }
        } catch (e) {
          log.debug(`Upload verification failed for ${file.path} on ${server}: ${e}`);
          return false;
        }
      }

      const errorText = await response.text();
      log.debug(`PUT to /upload with auth header failed: ${response.status} - ${errorText}`);
    } catch (e) {
      log.debug(`PUT to /upload with auth header failed: ${e}`);
    }
  } catch (e) {
    log.debug(`PUT to /upload with auth header failed: ${e}`);
  }
  return false;
}

/**
 * Publish an nsite event to nostr
 */
async function createpublishNsiteEvent(
  signer: Signer,
  pubkey: string,
  path: string,
  sha256: string,
): Promise<NostrEvent> {
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
async function publishEventToRelays(
  event: NostrEvent,
  relays: string[],
): Promise<boolean> {
  log.debug(`Publishing event to ${relays.length} relays`);

  let successCount = 0;
  const eventJson = JSON.stringify(["EVENT", event]);
  const relayErrors = new Map<string, string>();

  await Promise.all(
    relays.map(async (relay) => {
      try {
        const socket = new WebSocket(relay);

        const connectPromise = new Promise<boolean>((resolve) => {
          socket.onopen = () => {
            log.debug(`Connected to relay: ${relay}`);
            socket.send(eventJson);

            socket.onmessage = (msg) => {
              try {
                const data = JSON.parse(msg.data);

                if (
                  Array.isArray(data) &&
                  data.length >= 3 &&
                  data[0] === "OK" &&
                  data[2] === true
                ) {
                  log.debug(`Event published to relay: ${relay}`);
                  resolve(true);
                  socket.close();
                  return;
                }

                if (
                  Array.isArray(data) &&
                  data.length >= 4 &&
                  data[0] === "OK" &&
                  data[2] === false
                ) {
                  const errorMessage = data[3] || "Unknown relay error";

                  if (
                    errorMessage.includes("rate-limit") ||
                    errorMessage.includes("noting too much")
                  ) {
                    log.warn(
                      `Relay ${relay} rate-limited this publish: ${errorMessage}`,
                    );
                    relayErrors.set(relay, `Rate limited: ${errorMessage}`);
                  } else {
                    log.warn(`Relay ${relay} rejected event: ${errorMessage}`);
                    relayErrors.set(relay, errorMessage);
                  }

                  resolve(false);
                  socket.close();
                }
              } catch (e) {
                log.debug(`Error parsing message from relay ${relay}: ${e}`);
              }
            };

            setTimeout(() => {
              relayErrors.set(relay, "Timeout waiting for response");
              resolve(false);
              socket.close();
            }, 5000);
          };

          socket.onerror = (e) => {
            log.debug(`WebSocket error with relay ${relay}: ${e}`);
            relayErrors.set(relay, `WebSocket error: ${e}`);
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
        relayErrors.set(relay, `Connection failed: ${e}`);
      }
    }),
  );

  const success = successCount > 0;

  if (success) {
    log.info(`Published event to ${successCount}/${relays.length} relays`);

    if (successCount < relays.length) {
      log.debug("Some relays failed to accept the event:");
      for (const [relay, error] of relayErrors.entries()) {
        log.debug(`  - ${relay}: ${error}`);
      }
    }
  } else {
    log.warn("Failed to publish event to any relay");
    log.debug("Relay errors:");
    for (const [relay, error] of relayErrors.entries()) {
      log.debug(`  - ${relay}: ${error}`);
    }
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
  progressCallback?: (progress: UploadProgress) => void,
): Promise<UploadResponse[]> {
  if (!relays || relays.length === 0) {
    throw new Error(
      "No relays provided for publishing events. Events must be published to relays to make the files accessible.",
    );
  }

  log.info(
    `Starting upload of ${files.length} files to ${servers.length} servers with concurrency ${concurrency}`,
  );

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
  const resultsMap = new Map<FileEntry, UploadResponse>();
  const queue = [...files];
  const errors: Array<{ file: string; error: string }> = [];

  // Create a pool of workers that maintain constant concurrency
  let queueIndex = 0;
  let activeWorkers = 0;

  // Worker function that continuously processes files from the queue
  const worker = async (): Promise<void> => {
    while (true) {
      // Atomically get next file index
      const currentIndex = queueIndex++;
      if (currentIndex >= queue.length) {
        break;
      }

      const file = queue[currentIndex];
      activeWorkers++;

      progress.inProgress = activeWorkers;
      if (progressCallback) {
        progressCallback({ ...progress });
      }

      try {
        const result = await uploadFile(file, baseDir, servers, signer, relays);
        resultsMap.set(file, result);

        if (result.success) {
          progress.completed++;

          if (
            result.error &&
            (result.error.includes("rate-limit") || result.error.includes("noting too much"))
          ) {
            log.warn(
              `Upload for ${result.file.path} succeeded but event publishing was rate-limited`,
            );
          }
        } else {
          progress.failed++;
          errors.push({
            file: result.file.path,
            error: result.error || "Unknown error",
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("rate-limit") || errorMessage.includes("noting too much")) {
          log.warn(`Rate limiting detected while uploading ${file.path}: ${errorMessage}`);

          resultsMap.set(file, {
            file,
            success: true,
            error: `Relay rate limited: ${errorMessage}`,
            eventPublished: false,
            serverResults: {},
          });
          progress.completed++;
        } else {
          log.error(`Failed to upload ${file.path}: ${errorMessage}`);
          resultsMap.set(file, {
            file,
            success: false,
            error: errorMessage,
            serverResults: {},
            eventPublished: false,
          });
          progress.failed++;
          errors.push({
            file: file.path,
            error: errorMessage,
          });
        }
      }

      activeWorkers--;
      progress.inProgress = activeWorkers;

      if (progressCallback) {
        progressCallback({ ...progress });
      }
    }
  };

  // Start workers up to concurrency limit
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    workers.push(worker());
  }

  // Wait for all workers to complete
  await Promise.all(workers);

  // Preserve original order of results
  for (const file of files) {
    const result = resultsMap.get(file);
    if (result) {
      results.push(result);
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
  retryCount = 0,
): Promise<UploadResponse> {
  try {
    log.debug(
      `Uploading file ${file.path}${retryCount > 0 ? ` (retry ${retryCount})` : ""}`,
    );

    const userPubkey = await signer.getPublicKey();

    if (!file.data || !file.sha256) {
      throw new Error("File data or SHA-256 hash missing");
    }

    const serverResults: {
      [server: string]: {
        success: boolean;
        error?: string;
        alreadyExists?: boolean;
      };
    } = {};

    const uploadResults = await Promise.all(
      servers.map(async (server) => {
        try {
          const success = await uploadToServer(server, file, signer);

          const serverUrl = server.endsWith("/") ? server : `${server}/`;
          let alreadyExists = false;

          try {
            const response = await fetch(`${serverUrl}${file.sha256}`, {
              method: "HEAD",
            });
            alreadyExists = response.ok;
          } catch (e) {}

          serverResults[server] = {
            success,
            alreadyExists: alreadyExists && success,
          };

          return success;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          serverResults[server] = { success: false, error: errorMessage };
          return false;
        }
      }),
    );

    const anyServerSuccess = uploadResults.some((result) => result);

    if (!anyServerSuccess) {
      const allServersHaveFile = servers.every((server) => {
        const result = serverResults[server];
        return result && (result.success || result.alreadyExists);
      });

      if (allServersHaveFile) {
        log.info(
          `File ${file.path} already exists on all servers, skipping upload but publishing events`,
        );
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

    const successfulServers = Object.values(serverResults).filter(
      (r) => r.success,
    ).length;

    let signedEvent: NostrEvent | null = null;
    let eventPublished = false;

    try {
      signedEvent = await createNsiteEvent(
        signer,
        userPubkey,
        file.path,
        file.sha256,
      );

      if (!relays || relays.length === 0) {
        throw new Error("No relays provided for publishing events");
      }

      try {
        eventPublished = await publishEventToRelays(signedEvent, relays);

        if (eventPublished) {
          log.info(`Published nsite event for ${file.path} to relays`);
        } else {
          log.warn(`Failed to publish nsite event for ${file.path} to relays`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes("rate-limit") ||
          errorMessage.includes("noting too much")
        ) {
          log.warn(
            `Rate limiting detected when publishing event for ${file.path}: ${errorMessage}`,
          );
          return {
            file,
            success: true,
            eventId: signedEvent.id,
            serverResults,
            eventPublished: false,
            error: `Rate limited: ${errorMessage}`,
          };
        }

        log.error(
          `Error publishing nsite event for ${file.path}: ${errorMessage}`,
        );
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("rate-limit") ||
        errorMessage.includes("noting too much")
      ) {
        log.warn(
          `Rate limiting detected when signing event for ${file.path}: ${errorMessage}`,
        );
        return {
          file,
          success: true,
          serverResults,
          eventPublished: false,
          error: `Rate limited during signing: ${errorMessage}`,
        };
      }

      log.error(`Error signing nsite event for ${file.path}: ${errorMessage}`);
    }

    return {
      file,
      success: true,
      eventId: signedEvent?.id,
      serverResults,
      eventPublished: eventPublished,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("rate-limit") ||
      errorMessage.includes("noting too much")
    ) {
      log.warn(`Rate limiting detected for ${file.path}: ${errorMessage}`);

      return {
        file,
        success: true,
        error: `Rate limited: ${errorMessage}`,
        serverResults: {},
        eventPublished: false,
      };
    }

    log.error(`Failed to upload ${file.path}: ${errorMessage}`);

    if (retryCount < MAX_RETRIES) {
      log.debug(
        `Retrying upload for ${file.path} (attempt ${retryCount + 1}/${MAX_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return uploadFile(file, baseDir, servers, signer, relays, retryCount + 1);
    }

    return {
      file,
      success: false,
      error: errorMessage,
      serverResults: {},
      eventPublished: false,
    };
  }
}
