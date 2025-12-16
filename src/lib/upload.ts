import type { Nip07Interface } from "applesauce-signers";
import { createLogger } from "./logger.ts";
import { createNsiteEvent, publishEventsToRelays } from "./nostr.ts";
import type { FileEntry, NostrEvent, NostrEventTemplate } from "./nostr.ts";

const log = createLogger("upload");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 10_000;
const SIGN_TIMEOUT_MS = 15_000;
const PUBLISH_TIMEOUT_MS = 15_000;
const RETRY_BASE_DELAY_MS = 500;
const VERIFY_RETRY_DELAY_MS = 300;

const DEFAULT_CONCURRENCY = 4;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms) as unknown as number;
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function runWithRetry<T>(
  label: string,
  attempts: number,
  backoffMs: number,
  fn: (attempt: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;

      const wait = backoffMs * Math.pow(2, attempt);
      log.warn(
        `${label} attempt ${attempt + 1}/${attempts} failed: ${
          error instanceof Error ? error.message : String(error)
        }. Retrying in ${wait}ms...`,
      );
      await delay(wait);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function headWithRetry(
  url: string,
  label: string,
  attempts = MAX_RETRIES,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<boolean> {
  return await runWithRetry<boolean>(
    label,
    attempts,
    RETRY_BASE_DELAY_MS,
    async () => {
      const response = await fetchWithTimeout(url, { method: "HEAD" }, timeoutMs, label);

      if (response.ok) return true;
      if (response.status === 404) return false;
      if (shouldRetryStatus(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      return false;
    },
  );
}

async function getPublicKeyWithRetry(signer: Signer): Promise<string> {
  return await runWithRetry<string>(
    "getPublicKey",
    MAX_RETRIES,
    RETRY_BASE_DELAY_MS,
    async () => {
      return await withTimeout(
        Promise.resolve(signer.getPublicKey()),
        SIGN_TIMEOUT_MS,
        "getPublicKey",
      );
    },
  );
}

async function signEventWithRetry(
  label: string,
  signFn: () => NostrEvent | Promise<NostrEvent>,
): Promise<NostrEvent> {
  return await runWithRetry<NostrEvent>(
    label,
    MAX_RETRIES,
    RETRY_BASE_DELAY_MS,
    async () => {
      return await withTimeout(Promise.resolve(signFn()), SIGN_TIMEOUT_MS, label);
    },
  );
}

/** @deprecated use Nip07Interface from applesauce-signers */
export interface Signer extends Nip07Interface {}

export interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  skipped: number;
}

export type UploadResponse = {
  file: FileEntry;
  success: boolean;
  error?: string;
  eventId?: string;
  eventPublished?: boolean;
  skipped?: boolean;
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

  const signedEvent = await signEventWithRetry(
    `sign upload auth for ${blobSha256.substring(0, 8)}...`,
    () => signer.signEvent(authTemplate),
  );

  return JSON.stringify(signedEvent);
}

/**
 * Upload a blob to a single blossom server
 */
async function uploadToServer(
  server: string,
  file: FileEntry,
  signer: Signer,
): Promise<{ success: boolean; alreadyExists: boolean; error?: string }> {
  if (!file.data || !file.sha256) {
    throw new Error("File data or SHA-256 hash missing");
  }

  try {
    const blobSha256 = file.sha256;
    const fileName = file.path.split("/").pop() || "file";
    const contentType = file.contentType || "application/octet-stream";
    const serverUrl = server.endsWith("/") ? server : `${server}/`;

    try {
      const preflightLabel = `HEAD preflight ${file.path} on ${server}`;
      log.debug(`Checking if ${file.path} (${blobSha256}) already exists on ${server}`);
      const exists = await headWithRetry(`${serverUrl}${blobSha256}`, preflightLabel);
      if (exists) {
        log.debug(`File ${file.path} (${blobSha256}) already exists on ${server}`);
        return { success: true, alreadyExists: true };
      }
    } catch (e) {
      log.debug(`Error checking if file exists on ${server}: ${e}`);
    }

    const fileObj = new File([file.data], fileName, {
      type: contentType,
      lastModified: Date.now(),
    });

    const auth = await createUploadAuth(signer, blobSha256);

    const base64Auth = btoa(auth);
    const authHeader = { Authorization: `Nostr ${base64Auth}` };

    try {
      const uploadLabel = `PUT upload ${file.path} to ${server}`;
      log.debug(`Trying PUT to ${serverUrl}upload with auth header`);
      const response = await runWithRetry<Response>(
        uploadLabel,
        MAX_RETRIES,
        RETRY_BASE_DELAY_MS,
        async () => {
          const res = await fetchWithTimeout(
            `${serverUrl}upload`,
            {
              method: "PUT",
              headers: authHeader,
              body: fileObj,
            },
            FETCH_TIMEOUT_MS,
            uploadLabel,
          );

          if (res.ok) {
            return res;
          }

          if (shouldRetryStatus(res.status)) {
            const text = await res.text().catch(() => "");
            throw new Error(
              `HTTP ${res.status}${text ? `: ${text}` : ""}`,
            );
          }

          return res;
        },
      );

      if (response.ok) {
        log.debug(`Upload request succeeded for ${file.path} to ${server}, verifying storage...`);

        // Verify the file is actually stored and retrievable
        try {
          const verifyLabel = `verify HEAD ${file.path} on ${server}`;
          const verified = await runWithRetry<boolean>(
            verifyLabel,
            MAX_RETRIES,
            VERIFY_RETRY_DELAY_MS,
            async (attempt) => {
              if (attempt > 0) {
                await delay(VERIFY_RETRY_DELAY_MS * attempt);
              }
              const res = await fetchWithTimeout(
                `${serverUrl}${blobSha256}`,
                { method: "HEAD" },
                FETCH_TIMEOUT_MS,
                verifyLabel,
              );

              if (res.ok) return true;
              if (res.status === 404) return false;
              if (shouldRetryStatus(res.status)) {
                throw new Error(`HTTP ${res.status}`);
              }
              return false;
            },
          );

          if (verified) {
            log.debug(`Upload verified: ${file.path} is retrievable from ${server}`);
            return { success: true, alreadyExists: false };
          } else {
            log.debug(
              `Upload verification failed: ${file.path} not retrievable from ${server}`,
            );
            return { success: false, alreadyExists: false, error: "Verification failed" };
          }
        } catch (e) {
          log.debug(`Upload verification failed for ${file.path} on ${server}: ${e}`);
          return { success: false, alreadyExists: false, error: String(e) };
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
  return { success: false, alreadyExists: false, error: "Upload failed" };
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
  log.debug(`Publishing event to ${relays.length} relays via pool`);

  try {
    const publishLabel = `publish event ${event.id?.substring(0, 8) ?? ""}`;
    const success = await runWithRetry<boolean>(
      publishLabel,
      MAX_RETRIES,
      RETRY_BASE_DELAY_MS,
      async () => {
        const result = await withTimeout(
          publishEventsToRelays(relays, [event]),
          PUBLISH_TIMEOUT_MS,
          publishLabel,
        );
        if (!result) {
          throw new Error("Publish returned false");
        }
        return true;
      },
    );

    return success;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error(`Error publishing event: ${errorMessage}`);
    return false;
  }
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
    skipped: 0,
  };

  if (progressCallback) {
    progressCallback({ ...progress });
  }

  const userPubkey = await getPublicKeyWithRetry(signer);

  const results: UploadResponse[] = [];
  const queue = [...files];

  const errors: Array<{ file: string; error: string }> = [];

  while (queue.length > 0) {
    const chunk = queue.splice(0, Math.min(concurrency, queue.length));
    progress.inProgress = chunk.length;

    if (progressCallback) {
      progressCallback({ ...progress });
    }

    const chunkResults = await Promise.all(
      chunk.map(async (file) => {
        try {
          return await uploadFile(file, baseDir, servers, signer, relays, userPubkey);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (errorMessage.includes("rate-limit") || errorMessage.includes("noting too much")) {
            log.warn(`Rate limiting detected while uploading ${file.path}: ${errorMessage}`);

            return {
              file,
              success: false,
              error: `Relay rate limited: ${errorMessage}`,
              eventPublished: false,
              serverResults: {},
              skipped: false,
            };
          }

          log.error(`Failed to upload ${file.path}: ${errorMessage}`);
          return {
            file,
            success: false,
            error: errorMessage,
            serverResults: {},
            eventPublished: false,
            skipped: false,
          };
        }
      }),
    ).catch((error) => {
      log.error(`Error processing batch: ${error.message || error}`);
      return chunk.map((file) => ({
        file,
        success: false,
        error: `Batch processing error: ${error.message || error}`,
        serverResults: {},
        eventPublished: false,
        skipped: false,
      }));
    });

    for (const result of chunkResults) {
      results.push(result);

      if (result.success) {
        progress.completed++;
        if (result.skipped) {
          progress.skipped++;
        }

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

      progress.inProgress = Math.max(0, progress.inProgress - 1);

      if (progressCallback) {
        progressCallback({ ...progress });
      }
    }

    if (queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
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
  userPubkey: string,
  retryCount = 0,
): Promise<UploadResponse> {
  // Ensure serverResults is visible in catch blocks
  const serverResults: {
    [server: string]: {
      success: boolean;
      error?: string;
      alreadyExists?: boolean;
    };
  } = {};
  let allAlready = false;

  try {
    log.debug(
      `Uploading file ${file.path}${retryCount > 0 ? ` (retry ${retryCount})` : ""}`,
    );

    if (!file.data || !file.sha256) {
      throw new Error("File data or SHA-256 hash missing");
    }

    const uploadResults = await Promise.all(
      servers.map(async (server) => {
        try {
          const outcome = await uploadToServer(server, file, signer);

          serverResults[server] = {
            success: outcome.success || outcome.alreadyExists,
            alreadyExists: outcome.alreadyExists,
            error: outcome.error,
          };

          return outcome;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          serverResults[server] = { success: false, error: errorMessage };
          return { success: false, alreadyExists: false, error: errorMessage };
        }
      }),
    );

    const anyServerSuccess = uploadResults.some((result) =>
      result.success || result.alreadyExists
    );

    if (!anyServerSuccess) {
      const serverErrors = Object.entries(serverResults)
        .map(([server, result]) => `${server}: ${result.error || "Unknown error"}`)
        .join("; ");

      throw new Error(`Failed to upload to any server: ${serverErrors}`);
    }

    const serverHasBlob = Object.values(serverResults).some(
      (r) => r.success || r.alreadyExists,
    );

    if (!serverHasBlob) {
      throw new Error("No server stored the blob after upload attempts");
    }

    allAlready = uploadResults.every((r) => r.alreadyExists);

    let signedEvent: NostrEvent | null = null;
    let eventPublished = false;

    try {
      signedEvent = await signEventWithRetry(
        `sign nsite event for ${file.path}`,
        () => createNsiteEvent(
          signer,
          userPubkey,
          file.path,
          file.sha256!,
        ),
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
            success: false,
            skipped: allAlready,
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
          success: false,
          skipped: allAlready,
          serverResults,
          eventPublished: false,
          error: `Rate limited during signing: ${errorMessage}`,
        };
      }

      log.error(`Error signing nsite event for ${file.path}: ${errorMessage}`);
    }

    return {
      file,
      success: eventPublished,
      skipped: allAlready,
      eventId: signedEvent?.id,
      serverResults,
      eventPublished: eventPublished,
      error: eventPublished ? undefined : "Event not published",
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
        success: false,
        skipped: allAlready,
        error: `Rate limited: ${errorMessage}`,
        serverResults,
        eventPublished: false,
      };
    }

    log.error(`Failed to upload ${file.path}: ${errorMessage}`);

    if (retryCount < MAX_RETRIES) {
      log.debug(
        `Retrying upload for ${file.path} (attempt ${retryCount + 1}/${MAX_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return uploadFile(file, baseDir, servers, signer, relays, userPubkey, retryCount + 1);
    }

    return {
      file,
      success: false,
      error: errorMessage,
      serverResults,
      eventPublished: false,
    };
  }
}
