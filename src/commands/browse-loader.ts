import type { NostrEvent } from "nostr-tools";
import { EventStore, simpleTimeout, mapEventsToStore, mapEventsToTimeline } from "applesauce-core";
import { pool, getTagValue } from "../lib/nostr.ts";
import { lastValueFrom } from "rxjs";
import { createLogger } from "../lib/logger.ts";
import { renderLoadingScreen } from "../ui/browse/renderer.ts";
import type { FileEntryWithSources } from "./ls.ts";
import { fetchServerListEvents } from "../lib/debug-helpers.ts";

const log = createLogger("browse-loader");
const NSITE_KIND = 34128;

// Simple circuit breaker to avoid hammering consistently failing servers
const serverFailureCount = new Map<string, number>();
const MAX_FAILURES_BEFORE_SKIP = 3;

function shouldSkipServer(server: string): boolean {
  const failures = serverFailureCount.get(server) || 0;
  return failures >= MAX_FAILURES_BEFORE_SKIP;
}

function recordServerFailure(server: string): void {
  const current = serverFailureCount.get(server) || 0;
  serverFailureCount.set(server, current + 1);
}

function recordServerSuccess(server: string): void {
  // Reset failure count on success
  serverFailureCount.delete(server);
}

function getTagValues(event: NostrEvent, tagName: string): string[] {
  return event.tags
    .filter((tag: string[]) => tag[0] === tagName && tag.length > 1)
    .map((tag: string[]) => tag[1]);
}

export async function listRemoteFilesWithProgress(
  relays: string[],
  pubkey: string,
  checkBlossomServers = true,
): Promise<FileEntryWithSources[]> {
  const eventMap = new Map<string, { event: NostrEvent; foundOnRelays: Set<string> }>();
  let completedRelays = 0;
  let totalEvents = 0;

  renderLoadingScreen("Connecting to relays...", `0 / ${relays.length} relays`);

  // Subscribe to each relay individually to track sources
  const promises = relays.map(async (relay) => {
    try {
      log.debug(`Connecting to relay: ${relay}`);
      const store = new EventStore();
      
      // Add a race condition with manual timeout to handle EOSE issues
      const requestPromise = lastValueFrom(
        pool
          .request([relay], {
            kinds: [NSITE_KIND],
            authors: [pubkey],
          })
          .pipe(
            simpleTimeout(8000),
            mapEventsToStore(store),
            mapEventsToTimeline()
          ),
        { defaultValue: [] }
      );
      
      const timeoutPromise = new Promise<any[]>((_, reject) => {
        setTimeout(() => reject(new Error(`Relay ${relay} timeout - no EOSE received`)), 10000);
      });
      
      const events = await Promise.race([requestPromise, timeoutPromise]) as NostrEvent[];

      // Track which relay returned each event
      for (const event of events) {
        const existing = eventMap.get(event.id);
        if (existing) {
          existing.foundOnRelays.add(relay);
        } else {
          eventMap.set(event.id, {
            event,
            foundOnRelays: new Set([relay]),
          });
          totalEvents++;
        }
      }

      log.debug(`Found ${events.length} events from relay ${relay}`);
    } catch (error) {
      log.debug(`Failed to fetch from relay ${relay}: ${error}`);
    } finally {
      completedRelays++;
      renderLoadingScreen(
        "Loading files from relays...",
        `${completedRelays} / ${relays.length} relays • ${totalEvents} events found`
      );
    }
  });

  await Promise.all(promises);

  if (eventMap.size === 0) {
    log.warn(`No file events found for user ${pubkey} from any relays`);
    return [];
  }

  renderLoadingScreen("Processing files...", `${eventMap.size} events`);

  const fileEntries: FileEntryWithSources[] = [];

  for (const [eventId, { event, foundOnRelays }] of eventMap) {
    const path = getTagValue(event, "d");
    const sha256 = getTagValue(event, "x");

    if (path && sha256) {
      fileEntries.push({
        path,
        sha256,
        eventId,
        event,
        foundOnRelays: Array.from(foundOnRelays),
        availableOnServers: [], // Will be populated with actual availability check
      });
    }
  }

  renderLoadingScreen("Deduplicating files...", `${fileEntries.length} files`);

  // Deduplicate by path, keeping the newest event
  const uniqueFiles = fileEntries.reduce((acc, current) => {
    const existingIndex = acc.findIndex((file) => file.path === current.path);

    if (existingIndex === -1) {
      return [...acc, current];
    } else {
      const existing = acc[existingIndex];

      if ((existing.event?.created_at || 0) < (current.event?.created_at || 0)) {
        acc[existingIndex] = current;
      } else {
        // Merge relay sources
        const mergedRelays = new Set([...existing.foundOnRelays, ...current.foundOnRelays]);
        existing.foundOnRelays = Array.from(mergedRelays);
      }

      return acc;
    }
  }, [] as FileEntryWithSources[]);

  log.info(`Found ${uniqueFiles.length} unique remote files for user ${pubkey}`);

  // Fetch user's blossom server list
  renderLoadingScreen("Fetching server list...", "Loading user preferences");
  let userServers: string[] = [];
  
  try {
    const serverListEvents = await fetchServerListEvents(pool, relays, pubkey);
    if (serverListEvents.length > 0) {
      // Get the most recent server list event
      const latestEvent = serverListEvents[0];
      userServers = latestEvent.tags
        .filter(tag => tag[0] === "server" && tag[1])
        .map(tag => tag[1]);
      log.debug(`Found ${userServers.length} blossom servers in user's server list`);
    }
  } catch (error) {
    log.debug(`Failed to fetch server list: ${error}`);
  }

  // Check blossom server availability if requested
  if (checkBlossomServers && uniqueFiles.length > 0 && userServers.length > 0) {
    renderLoadingScreen("Checking blossom servers...", `0 / ${uniqueFiles.length} files`);
    
    let filesChecked = 0;
    const checkPromises = uniqueFiles.map(async (file) => {
      const availableServers = await checkBlossomServersForFile(file.sha256, userServers);
      file.availableOnServers = availableServers;
      
      filesChecked++;
      if (filesChecked % 10 === 0 || filesChecked === uniqueFiles.length) {
        renderLoadingScreen("Checking blossom servers...", `${filesChecked} / ${uniqueFiles.length} files`);
      }
    });
    
    // Process in smaller batches to avoid overwhelming servers
    const batchSize = 5; // Reduced from 20 to 5 for better server friendliness
    for (let i = 0; i < checkPromises.length; i += batchSize) {
      await Promise.all(checkPromises.slice(i, i + batchSize));
      
      // Add a small delay between batches to be extra server-friendly
      if (i + batchSize < checkPromises.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } else if (checkBlossomServers && userServers.length === 0) {
    log.info("No blossom servers found in user's server list");
  } else if (!checkBlossomServers) {
    log.debug("Blossom server checking disabled, will check in background");
  }

  return uniqueFiles.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Check blossom server availability for all files (async)
 */
export async function checkBlossomServersForFiles(
  relays: string[],
  pubkey: string,
  files: FileEntryWithSources[],
  onProgress?: (checkedCount: number, totalCount: number) => void,
  userServers?: string[]
): Promise<void> {
  // Use provided server list or fetch it
  let servers: string[] = userServers || [];
  
  if (!userServers) {
    try {
      const serverListEvents = await fetchServerListEvents(pool, relays, pubkey);
      if (serverListEvents.length > 0) {
        // Get the most recent server list event
        const latestEvent = serverListEvents[0];
        servers = latestEvent.tags
          .filter(tag => tag[0] === "server" && tag[1])
          .map(tag => tag[1]);
        log.debug(`Found ${servers.length} blossom servers in user's server list`);
      }
    } catch (error) {
      log.debug(`Failed to fetch server list: ${error}`);
    }
  }

  if (servers.length === 0) {
    log.info("No blossom servers found in user's server list");
    return;
  }

  let filesChecked = 0;
  const checkPromises = files.map(async (file) => {
    const availableServers = await checkBlossomServersForFile(file.sha256, servers);
    file.availableOnServers = availableServers;
    
    filesChecked++;
    if (onProgress) {
      onProgress(filesChecked, files.length);
    }
  });
  
  // Process in smaller batches to avoid overwhelming servers
  const batchSize = 5; // Reduced from 20 to 5 for better server friendliness
  for (let i = 0; i < checkPromises.length; i += batchSize) {
    await Promise.all(checkPromises.slice(i, i + batchSize));
    
    // Add a small delay between batches to be extra server-friendly
    if (i + batchSize < checkPromises.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

/**
 * Check which blossom servers actually have a file with retry logic
 */
async function checkBlossomServersForFile(
  sha256: string,
  servers: string[]
): Promise<string[]> {
  if (servers.length === 0) return [];
  
  const availableServers: string[] = [];
  
  // Process servers with limited concurrency to avoid overwhelming them
  const concurrencyLimit = 3; // Max 3 concurrent checks per file
  const checkPromises = servers.map(async (server) => {
    const result = await checkSingleServer(server, sha256);
    if (result) {
      availableServers.push(server);
    }
  });
  
  // Process in smaller batches to control concurrency
  for (let i = 0; i < checkPromises.length; i += concurrencyLimit) {
    await Promise.all(checkPromises.slice(i, i + concurrencyLimit));
  }
  
  return availableServers;
}

/**
 * Check a single server with retry logic and exponential backoff
 */
async function checkSingleServer(
  server: string,
  sha256: string,
  maxRetries: number = 2
): Promise<boolean> {
  // Skip servers that have failed too many times
  if (shouldSkipServer(server)) {
    log.debug(`Skipping server ${server} due to too many previous failures`);
    return false;
  }

  const url = server.endsWith('/') ? server.slice(0, -1) : server;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timeoutMs = 5000 + (attempt * 2000); // 5s, 7s, 9s timeouts
      const response = await fetch(`${url}/${sha256}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Cache-Control': 'no-cache',
          'User-Agent': 'nsyte-browser/1.0',
        },
      });
      
      if (response.status === 200) {
        recordServerSuccess(server);
        return true;
      } else if (response.status === 404) {
        // File definitely not found, but server is responding - this is success
        recordServerSuccess(server);
        return false;
      } else if (response.status >= 500 && attempt < maxRetries) {
        // Server error, might be temporary - retry with backoff
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        log.debug(`Server ${server} returned ${response.status}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      } else {
        // Other status codes (rate limiting, etc) - don't retry
        log.debug(`Server ${server} returned ${response.status}, giving up`);
        if (attempt === maxRetries) {
          recordServerFailure(server);
        }
        return false;
      }
    } catch (error) {
      if (attempt < maxRetries) {
        // Network error, timeout, etc - retry with exponential backoff
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        log.debug(`Failed to check ${server}/${sha256} (attempt ${attempt + 1}/${maxRetries + 1}): ${error}. Retrying in ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      } else {
        // Final attempt failed
        log.debug(`Failed to check ${server}/${sha256} after ${maxRetries + 1} attempts: ${error}`);
        recordServerFailure(server);
        return false;
      }
    }
  }
  
  return false;
}