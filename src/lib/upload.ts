import { encodeBase64 } from "@std/encoding/base64";
import type { NostrEvent } from "applesauce-core/helpers";
import type { ISigner } from "applesauce-signers";
import { createLogger } from "./logger.ts";
import type { FileEntry, NostrEventTemplate } from "./nostr.ts";

const log = createLogger("upload");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 10_000;
const SIGN_TIMEOUT_MS = 15_000;
const RETRY_BASE_DELAY_MS = 500;
const VERIFY_RETRY_DELAY_MS = 300;

const DEFAULT_CONCURRENCY = 4;
const UPLOAD_AUTH_BATCH_SIZE = 20;

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

export interface ServerProgressEntry {
  total: number;
  completed: number;
  failed: number;
  retrying: number;
  skipped: number;
  /** Timestamp (ms) when this server finished all files */
  finishedAt?: number;
}

export interface UploadProgress {
  /** Total upload units: files × servers */
  total: number;
  /** Server-file pairs that succeeded (includes already-existing) */
  completed: number;
  /** Server-file pairs that failed after retries */
  failed: number;
  /** Server-file pairs currently being processed */
  inProgress: number;
  /** Server-file pairs where file already existed */
  skipped: number;
  /** Server-file pairs currently retrying */
  retrying: number;
  /** Per-server progress breakdown */
  serverProgress: Record<string, ServerProgressEntry>;
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
      retries?: number;
    };
  };
};

type ServerUploadResult = UploadResponse["serverResults"][string];

/**
 * Sign a batch blob upload authorization covering up to UPLOAD_AUTH_BATCH_SIZE hashes.
 * Returns the full Authorization header value: "Nostr <base64-encoded-event>".
 */
async function createBatchUploadAuth(signer: ISigner, blobSha256s: string[]): Promise<string> {
  const currentTime = Math.floor(Date.now() / 1000);

  const xTags: string[][] = blobSha256s.map((hash) => ["x", hash]);

  const authTemplate: NostrEventTemplate = {
    kind: 24242,
    created_at: currentTime,
    tags: [
      ["t", "upload"],
      ...xTags,
      ["expiration", (currentTime + 3600).toString()],
      ["client", "nsyte"],
    ],
    content: "Upload blobs via nsyte",
  };

  const label = blobSha256s.length === 1
    ? `sign upload auth for ${blobSha256s[0].substring(0, 8)}...`
    : `sign batch upload auth for ${blobSha256s.length} blobs`;

  const signedEvent = await signEventWithRetry(
    label,
    () => signer.signEvent(authTemplate),
  );

  return `Nostr ${encodeBase64(JSON.stringify(signedEvent))}`;
}

/**
 * Upload a blob to a single blossom server
 */
async function uploadToServer(
  server: string,
  file: FileEntry,
  authHeader: string,
  force = false,
): Promise<{ success: boolean; alreadyExists: boolean; error?: string; httpStatus?: number }> {
  if (!file.data) {
    throw new Error("File data missing");
  }

  try {
    const blobSha256 = file.sha256;
    const fileName = file.path.split("/").pop() || "file";
    const contentType = file.contentType || "application/octet-stream";
    const serverUrl = server.endsWith("/") ? server : `${server}/`;

    if (!force) {
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
    } else {
      log.debug(`Force mode: skipping HEAD preflight for ${file.path} on ${server}`);
    }

    const fileObj = new File([file.data], fileName, {
      type: contentType,
      lastModified: Date.now(),
    });

    const headers = { Authorization: authHeader };

    try {
      const uploadLabel = `PUT upload ${file.path} to ${server}`;
      log.debug(`Trying PUT to ${serverUrl}upload with auth header`);
      // Single attempt — retries are handled by uploadFileToServer() with progress visibility
      const response = await fetchWithTimeout(
        `${serverUrl}upload`,
        {
          method: "PUT",
          headers: headers,
          body: fileObj,
        },
        FETCH_TIMEOUT_MS,
        uploadLabel,
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

      const errorText = await response.text().catch(() => "");
      const httpError = `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`;
      log.debug(`PUT to /upload with auth header failed: ${httpError}`);
      return {
        success: false,
        alreadyExists: false,
        error: httpError,
        httpStatus: response.status,
      };
    } catch (e) {
      log.debug(`PUT to /upload with auth header failed: ${e}`);
      return { success: false, alreadyExists: false, error: String(e) };
    }
  } catch (e) {
    log.debug(`PUT to /upload with auth header failed: ${e}`);
    return { success: false, alreadyExists: false, error: String(e) };
  }
}

/**
 * Process uploads in parallel with progress tracking
 */
export async function processUploads(
  files: FileEntry[],
  _baseDir: string,
  servers: string[],
  signer: ISigner,
  relays: string[],
  concurrency = DEFAULT_CONCURRENCY,
  progressCallback?: (progress: UploadProgress) => void,
  force = false,
): Promise<UploadResponse[]> {
  if (!relays || relays.length === 0) {
    throw new Error(
      "No relays provided for publishing events. Events must be published to relays to make the files accessible.",
    );
  }

  log.info(
    `Starting upload of ${files.length} files to ${servers.length} servers with ${concurrency} worker(s) per server`,
  );

  const serverProgress: Record<string, ServerProgressEntry> = {};
  for (const server of servers) {
    serverProgress[server] = {
      total: files.length,
      completed: 0,
      failed: 0,
      retrying: 0,
      skipped: 0,
    };
  }

  const progress: UploadProgress = {
    total: files.length * servers.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
    skipped: 0,
    retrying: 0,
    serverProgress,
  };

  const getProgressSnapshot = (): UploadProgress => ({
    ...progress,
    serverProgress: Object.fromEntries(
      Object.entries(serverProgress).map(([server, sp]) => [server, { ...sp }]),
    ),
  });

  if (progressCallback) {
    progressCallback(getProgressSnapshot());
  }

  // Pre-sign batch upload auth tokens (up to UPLOAD_AUTH_BATCH_SIZE hashes per token).
  // This avoids one signer call per file — instead we sign ceil(n/UPLOAD_AUTH_BATCH_SIZE) tokens.
  const allHashes = files
    .map((f) => f.sha256)
    .filter((h): h is string => typeof h === "string" && h.length > 0);

  const authTokenMap = new Map<string, string>();

  for (let i = 0; i < allHashes.length; i += UPLOAD_AUTH_BATCH_SIZE) {
    const batchHashes = allHashes.slice(i, i + UPLOAD_AUTH_BATCH_SIZE);
    log.debug(
      `Signing batch upload auth token ${Math.floor(i / UPLOAD_AUTH_BATCH_SIZE) + 1}/${
        Math.ceil(allHashes.length / UPLOAD_AUTH_BATCH_SIZE)
      } for ${batchHashes.length} blobs`,
    );
    const authHeader = await createBatchUploadAuth(signer, batchHashes);
    for (const hash of batchHashes) {
      authTokenMap.set(hash, authHeader);
    }
  }

  log.info(
    `Signed ${
      Math.ceil(allHashes.length / UPLOAD_AUTH_BATCH_SIZE)
    } batch auth token(s) for ${allHashes.length} files`,
  );

  const results: UploadResponse[] = files.map((file) => ({
    file,
    success: false,
    serverResults: {},
    eventPublished: false,
    skipped: false,
  }));
  const errors: Array<{ file: string; error: string }> = [];

  const emitProgress = () => {
    if (progressCallback) {
      progressCallback(getProgressSnapshot());
    }
  };

  const recordServerEvent = (server: string, event: ServerEventType) => {
    const sp = serverProgress[server];
    if (!sp) return;

    switch (event) {
      case "completed":
        progress.completed++;
        sp.completed++;
        break;
      case "skipped":
        progress.completed++;
        progress.skipped++;
        sp.completed++;
        sp.skipped++;
        break;
      case "failed":
        progress.failed++;
        sp.failed++;
        break;
      case "retry-start":
        progress.retrying++;
        sp.retrying++;
        break;
      case "retry-end":
        progress.retrying = Math.max(0, progress.retrying - 1);
        sp.retrying = Math.max(0, sp.retrying - 1);
        break;
    }

    // Record when a server finishes all its files.
    if (!sp.finishedAt && sp.completed + sp.failed >= sp.total) {
      sp.finishedAt = Date.now();
    }

    emitProgress();
  };

  const workersPerServer = Math.max(1, Math.floor(concurrency));

  const processServerQueue = async (server: string): Promise<void> => {
    let nextFileIndex = 0;

    const worker = async () => {
      while (nextFileIndex < files.length) {
        const fileIndex = nextFileIndex++;
        const response = results[fileIndex];

        progress.inProgress++;
        emitProgress();

        try {
          response.serverResults[server] = await uploadFileToServer(
            response.file,
            server,
            authTokenMap,
            force,
            recordServerEvent,
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          response.serverResults[server] = {
            success: false,
            error: errorMessage,
            retries: 0,
          };
          recordServerEvent(server, "failed");
        } finally {
          progress.inProgress = Math.max(0, progress.inProgress - 1);
          emitProgress();
        }
      }
    };

    const workerCount = Math.min(workersPerServer, files.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  };

  await Promise.all(servers.map((server) => processServerQueue(server)));

  for (const result of results) {
    const serverResults = Object.values(result.serverResults);
    const anySuccess = serverResults.some((r) => r.success);
    const allAlready = serverResults.length > 0 && serverResults.every((r) => r.alreadyExists);

    result.success = anySuccess;
    result.skipped = allAlready;
    result.error = anySuccess ? undefined : "Failed to upload to any server";

    if (!result.success) {
      errors.push({
        file: result.file.path,
        error: result.error || "Unknown error",
      });
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

type ServerEventType = "completed" | "failed" | "skipped" | "retry-start" | "retry-end";

/**
 * Upload a single file to one server with retries.
 * Server queues call this independently so one server cannot block another.
 * Fires onServerEvent for completion/failure/retry for real-time progress.
 */
async function uploadFileToServer(
  file: FileEntry,
  server: string,
  authTokenMap: Map<string, string>,
  force = false,
  onServerEvent?: (server: string, event: ServerEventType) => void,
): Promise<ServerUploadResult> {
  if (!file.data) {
    onServerEvent?.(server, "failed");
    return {
      success: false,
      error: "File data missing",
      retries: 0,
    };
  }

  const authHeader = authTokenMap.get(file.sha256);
  if (!authHeader) {
    onServerEvent?.(server, "failed");
    return {
      success: false,
      error: `No auth token found for blob ${file.sha256.substring(0, 8)}...`,
      retries: 0,
    };
  }

  log.debug(`Uploading file ${file.path} to ${server}`);

  let result: ServerUploadResult = {
    success: false,
    error: "Upload failed",
    retries: 0,
  };
  let shouldRetry = true;

  try {
    const outcome = await uploadToServer(server, file, authHeader, force);
    const success = outcome.success || outcome.alreadyExists;
    result = {
      success,
      alreadyExists: outcome.alreadyExists,
      error: success ? undefined : outcome.error,
      retries: 0,
    };
    if (success) {
      onServerEvent?.(server, outcome.alreadyExists ? "skipped" : "completed");
      return result;
    }

    // Don't retry non-retryable HTTP statuses (e.g. 400, 401, 403).
    if (outcome.httpStatus && !shouldRetryStatus(outcome.httpStatus)) {
      shouldRetry = false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result = { success: false, error: errorMessage, retries: 0 };
  }

  if (!shouldRetry) {
    onServerEvent?.(server, "failed");
    return result;
  }

  // Retries for this server run independently from every other server queue.
  onServerEvent?.(server, "retry-start");
  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      await delay(RETRY_DELAY_MS * attempt);
      log.debug(`Retrying ${file.path} on ${server} (attempt ${attempt}/${MAX_RETRIES})`);
      try {
        const outcome = await uploadToServer(server, file, authHeader, force);
        const success = outcome.success || outcome.alreadyExists;
        result = {
          success,
          alreadyExists: outcome.alreadyExists,
          error: success ? undefined : outcome.error,
          retries: attempt,
        };
        if (success) {
          onServerEvent?.(server, outcome.alreadyExists ? "skipped" : "completed");
          return result;
        }

        // Stop retrying on non-retryable HTTP statuses.
        if (outcome.httpStatus && !shouldRetryStatus(outcome.httpStatus)) {
          break;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result = { success: false, error: errorMessage, retries: attempt };
      }
    }

    // All retries exhausted or stopped by a non-retryable response.
    onServerEvent?.(server, "failed");
    return result;
  } finally {
    onServerEvent?.(server, "retry-end");
  }
}
