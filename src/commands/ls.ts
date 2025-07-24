import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { existsSync } from "@std/fs/exists";
import { join } from "@std/path";
import { createLogger } from "../lib/logger.ts";
import { getTagValue, NSITE_KIND, pool } from "../lib/nostr.ts";
import {
  DEFAULT_IGNORE_PATTERNS,
  type IgnoreRule,
  isIgnored,
  parseIgnorePatterns,
} from "../lib/files.ts";
import { resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
import { handleError } from "../lib/error-utils.ts";
import type { NostrEvent } from "nostr-tools";
import { lastValueFrom } from "rxjs";
import { simpleTimeout, mapEventsToStore, mapEventsToTimeline } from "applesauce-core";
import { EventStore } from "applesauce-core";

const log = createLogger("ls");

// Helper function to get all values for a specific tag
function getTagValues(event: NostrEvent, tagName: string): string[] {
  return event.tags
    .filter((tag: string[]) => tag[0] === tagName && tag.length > 1)
    .map((tag: string[]) => tag[1]);
}

// Enhanced FileEntry with source tracking
export interface FileEntryWithSources {
  path: string;
  sha256: string;
  eventId: string;
  event?: NostrEvent;
  foundOnRelays: string[];
  availableOnServers: string[];
}

// Color palette for relays and servers
export const RELAY_COLORS = [
  colors.cyan,
  colors.green,
  colors.yellow,
  colors.magenta,
  colors.blue,
  colors.brightCyan,
  colors.brightGreen,
  colors.brightYellow,
  colors.brightMagenta,
  colors.brightBlue,
];

export const SERVER_COLORS = [
  colors.red,
  colors.brightRed,
  colors.white,
  colors.gray,
  colors.brightWhite,
];

// Symbols for relays and servers
export const RELAY_SYMBOL = "▲";  // Triangle for relays (right-side up)
export const RELAY_SYMBOL_ALT = "▼"; // Triangle for relays (upside down)
export const SERVER_SYMBOL = "■"; // Filled square for blossom servers

/**
 * Truncate hash to show first 8 and last 8 characters
 */
function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
}

/**
 * Fetch file events with source relay tracking
 */
async function fetchFileEventsWithSourceTracking(
  relays: string[],
  pubkey: string,
): Promise<Map<string, { event: NostrEvent; foundOnRelays: Set<string> }>> {
  log.debug(`Fetching file events for ${pubkey} from ${relays.join(", ")}`);

  const eventMap = new Map<string, { event: NostrEvent; foundOnRelays: Set<string> }>();

  try {
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
              simpleTimeout(8000), // Increased timeout
              mapEventsToStore(store),
              mapEventsToTimeline()
            ),
          { defaultValue: [] }
        );
        
        const timeoutPromise = new Promise<any[]>((_, reject) => {
          setTimeout(() => reject(new Error(`Relay ${relay} timeout - no EOSE received`)), 10000);
        });
        
        const events = await Promise.race([requestPromise, timeoutPromise]);

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
          }
        }

        log.debug(`Found ${events.length} events from relay ${relay}`);
      } catch (error) {
        log.debug(`Failed to fetch from relay ${relay}: ${error}`);
        // Don't throw - just log and continue with other relays
      }
    });

    await Promise.all(promises);
  } catch (error) {
    log.error(`Error fetching file events: ${error}`);
  }

  return eventMap;
}

/**
 * List remote files with enhanced source information
 */
export async function listRemoteFilesWithSources(
  relays: string[],
  pubkey: string,
): Promise<FileEntryWithSources[]> {
  const eventMap = await fetchFileEventsWithSourceTracking(relays, pubkey);

  if (eventMap.size === 0) {
    log.warn(`No file events found for user ${pubkey} from any relays`);
    return [];
  }

  const fileEntries: FileEntryWithSources[] = [];

  for (const [eventId, { event, foundOnRelays }] of eventMap) {
    const path = getTagValue(event, "d");
    const sha256 = getTagValue(event, "x");

    if (path && sha256) {
      // Get blossom servers from the event
      const servers = getTagValues(event, "r").filter(url => 
        url.startsWith("http://") || url.startsWith("https://")
      );

      fileEntries.push({
        path,
        sha256,
        eventId,
        event,
        foundOnRelays: Array.from(foundOnRelays),
        availableOnServers: servers,
      });
    }
  }

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

  return uniqueFiles.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Register the ls command
 */
export function registerLsCommand(program: Command): void {
  program
    .command("list")
    .alias("ls")
    .description("List files available on the nostr network with source information. Optionally filter by path (e.g., 'docs/' or 'docs/index.html')")
    .arguments("[path:string]")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option(
      "-p, --pubkey <npub:string>",
      "The public key to list files for (if not using private key).",
    )
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing")
    .option("--nbunksec <nbunksec:string>", "The NIP-46 bunker encoded as nbunksec")
    .action(command);
}

export async function command(options: any, pathFilter?: string): Promise<void> {
  try {
    const cwd = Deno.cwd();
    const ignoreFilePath = join(cwd, ".nsite-ignore");

    const pubkey = await resolvePubkey(options);
    const relays = resolveRelays(options);

    let ignoreRules: IgnoreRule[] = parseIgnorePatterns(DEFAULT_IGNORE_PATTERNS);
    let ignoredFileCount = 0;

    // Normalize path filter
    let normalizedPathFilter: string | undefined;
    if (pathFilter) {
      // Remove leading slash if present
      normalizedPathFilter = pathFilter.startsWith('/') ? pathFilter.substring(1) : pathFilter;
      // For directory filters, ensure trailing slash
      if (!normalizedPathFilter.includes('.') && !normalizedPathFilter.endsWith('/')) {
        normalizedPathFilter += '/';
      }
    }

    console.log(
      colors.cyan(`Listing files for ${colors.bold(truncateHash(pubkey))} using relays: ${relays.join(", ")}`),
    );
    
    if (normalizedPathFilter) {
      console.log(colors.cyan(`Filtering by path: ${normalizedPathFilter}`));
    }

    if (existsSync(ignoreFilePath)) {
      try {
        const ignoreContent = await Deno.readTextFile(ignoreFilePath);
        const customPatterns = ignoreContent.split("\n").map((l) => l.trim()).filter((l) =>
          l && !l.startsWith("#")
        );
        ignoreRules = parseIgnorePatterns([...DEFAULT_IGNORE_PATTERNS, ...customPatterns]);
        log.info(`Loaded .nsite-ignore rules.`);
      } catch (error) {
        log.warn(`Failed to read .nsite-ignore file: ${error}. Using default ignore patterns.`);
      }
    } else {
      log.debug("No .nsite-ignore file found, using default patterns.");
    }

    let files = await listRemoteFilesWithSources(relays, pubkey);
    
    // Filter files by path if specified
    if (normalizedPathFilter) {
      files = files.filter(file => {
        const filePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
        
        // If filter ends with /, match directory prefix
        if (normalizedPathFilter.endsWith('/')) {
          return filePath.startsWith(normalizedPathFilter);
        }
        
        // Otherwise, match exact file, file with extension, or directory prefix
        return filePath === normalizedPathFilter || 
               filePath.startsWith(normalizedPathFilter + '.') || 
               filePath.startsWith(normalizedPathFilter + '/');
      });
    }

    if (files.length === 0) {
      if (normalizedPathFilter) {
        console.log(colors.yellow(`\nNo files found matching path: ${normalizedPathFilter}`));
      } else {
        console.log(colors.yellow("\nNo files found for this user."));
      }
    } else {
      // Display files in non-interactive mode
      console.log(colors.green(`\nFound ${files.length} files:`));

      // Create color mappings
      const relayColorMap = new Map<string, (str: string) => string>();
      const serverColorMap = new Map<string, (str: string) => string>();
      
      // Collect all unique relays and servers
      const allRelays = new Set<string>();
      const allServers = new Set<string>();
      
      files.forEach(file => {
        file.foundOnRelays.forEach(relay => allRelays.add(relay));
        file.availableOnServers.forEach(server => allServers.add(server));
      });

      // Assign colors (sorted for deterministic assignment)
      Array.from(allRelays).sort().forEach((relay, index) => {
        relayColorMap.set(relay, RELAY_COLORS[index % RELAY_COLORS.length]);
      });
      
      Array.from(allServers).sort().forEach((server, index) => {
        serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length]);
      });

      // Display legend
      console.log("\n" + colors.bold("Legend:"));
      console.log(colors.gray("─".repeat(60)));
      
      if (relayColorMap.size > 0) {
        console.log(colors.bold("Relays:"));
        let relayIndex = 0;
        relayColorMap.forEach((colorFn, relay) => {
          const symbol = relayIndex % 2 === 0 ? RELAY_SYMBOL : RELAY_SYMBOL_ALT;
          console.log(`  ${colorFn(symbol)} ${relay}`);
          relayIndex++;
        });
      }
      
      if (serverColorMap.size > 0) {
        console.log(colors.bold("\nBlossom Servers:"));
        serverColorMap.forEach((colorFn, server) => {
          console.log(`  ${colorFn(SERVER_SYMBOL)} ${server}`);
        });
      }
      
      console.log(colors.gray("─".repeat(60)));

      // Calculate fixed column widths for better alignment
      const maxRelayCount = Math.max(...files.map(file => file.foundOnRelays.length), 0);
      const maxServerCount = Math.max(...files.map(file => file.availableOnServers.length), 0);
      
      // Fixed width for relay and server sections (with separator)
      const relayColumnWidth = Math.max(maxRelayCount, 1); // At least 1 space
      const serverColumnWidth = Math.max(maxServerCount, 1); // At least 1 space
      const totalIndicatorWidth = relayColumnWidth + 3 + serverColumnWidth; // 3 for " | "

      // Derive directories from file paths
      const directories = new Set<string>();
      files.forEach(file => {
        const pathParts = file.path.split('/').filter(p => p);
        let currentPath = '';
        for (let i = 0; i < pathParts.length - 1; i++) {
          currentPath += (currentPath ? '/' : '') + pathParts[i];
          directories.add(currentPath);
        }
      });

      // Create combined list of directories and files
      interface ListItem {
        path: string;
        isDirectory: boolean;
        file?: FileEntryWithSources;
        displayLine?: string;
        row?: number;
      }

      const allItems: ListItem[] = [
        // Add directories
        ...Array.from(directories).map(dir => ({
          path: '/' + dir,
          isDirectory: true,
        })),
        // Add files
        ...files.map(file => ({
          path: file.path,
          isDirectory: false,
          file,
        })),
      ];

      // Sort files to create a tree-like structure
      const sortedItems = [...allItems].sort((a, b) => {
        const aDepth = a.path.split('/').filter(p => p).length;
        const bDepth = b.path.split('/').filter(p => p).length;
        
        // If same depth, directories come before files
        if (aDepth === bDepth) {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
        }
        
        return a.path.localeCompare(b.path);
      });

      // Count ignored files first
      let ignoredFileCount = 0;
      files.forEach(file => {
        const relativePath = file.path.startsWith("/") ? file.path.substring(1) : file.path;
        if (isIgnored(relativePath, ignoreRules, false)) {
          ignoredFileCount++;
        }
      });

      // Display files in tree-like format
      console.log("\n" + colors.bold("Files:"));
      if (ignoredFileCount > 0) {
        console.log(colors.yellow(`${ignoredFileCount} file${ignoredFileCount > 1 ? 's' : ''} will be skipped during upload (shown in red below)`));
      }
      console.log(colors.gray("─".repeat(100)));

      sortedItems.forEach((item, index) => {
        if (item.isDirectory) {
          // Display directory
          const pathParts = item.path.split('/').filter(p => p);
          const depth = Math.max(0, pathParts.length - 1);
          const dirName = pathParts[pathParts.length - 1] || item.path;
          
          // Determine if this is the last item at this depth level
          const isLast = index === sortedItems.length - 1 || 
                         (index < sortedItems.length - 1 && 
                          sortedItems[index + 1].path.split('/').filter(p => p).length <= pathParts.length);
          
          // Build tree structure
          let treePrefix = "";
          if (depth > 0) {
            // Add spacing for parent directories
            for (let i = 0; i < depth - 1; i++) {
              treePrefix += "  ";
            }
            // Add branch
            treePrefix += isLast ? "└─ " : "├─ ";
          }

          // Empty indicators for directories (no relay/server info)
          const emptyIndicators = " ".repeat(totalIndicatorWidth);
          
          // Display directory in gray
          console.log(`${emptyIndicators} ${colors.gray(treePrefix)}${colors.gray(dirName + '/')}`);
        } else {
          // Display file
          const file = item.file!;
          const relativePath = file.path.startsWith("/") ? file.path.substring(1) : file.path;
          const shouldBeIgnored = isIgnored(relativePath, ignoreRules, false);

          // Build relay indicators (fixed width based on count, not string length)
          let relayIndicators = "";
          let relayCount = 0;
          file.foundOnRelays.forEach(relay => {
            const colorFn = relayColorMap.get(relay) || colors.white;
            // Get relay index to determine which triangle to use
            let relayIndex = 0;
            for (const [mapRelay] of relayColorMap) {
              if (mapRelay === relay) break;
              relayIndex++;
            }
            const symbol = relayIndex % 2 === 0 ? RELAY_SYMBOL : RELAY_SYMBOL_ALT;
            relayIndicators += colorFn(symbol);
            relayCount++;
          });
          // Pad based on actual symbol count
          const relayPadding = " ".repeat(relayColumnWidth - relayCount);
          relayIndicators += relayPadding;
          
          // Add separator
          const separator = colors.gray(" │ ");
          
          // Build server indicators (fixed width based on count, not string length)
          let serverIndicators = "";
          let serverCount = 0;
          file.availableOnServers.forEach(server => {
            const colorFn = serverColorMap.get(server) || colors.white;
            serverIndicators += colorFn(SERVER_SYMBOL);
            serverCount++;
          });
          // Pad based on actual symbol count
          const serverPadding = " ".repeat(serverColumnWidth - serverCount);
          serverIndicators += serverPadding;

          // Combine indicators with fixed total width
          const indicators = relayIndicators + separator + serverIndicators;
          
          // Calculate tree indentation based on path depth
          const pathParts = file.path.split('/').filter(p => p);
          const depth = Math.max(0, pathParts.length - 1);
          const fileName = pathParts[pathParts.length - 1] || file.path;
          
          // Determine if this is the last item at this depth level
          const isLast = index === sortedItems.length - 1 || 
                         (index < sortedItems.length - 1 && 
                          sortedItems[index + 1].path.split('/').filter(p => p).length <= pathParts.length);
          
          // Build tree structure
          let treePrefix = "";
          if (depth > 0) {
            // Add spacing for parent directories
            for (let i = 0; i < depth - 1; i++) {
              treePrefix += "  ";
            }
            // Add branch
            treePrefix += isLast ? "└─ " : "├─ ";
          }

          // Format file info
          const pathColor = shouldBeIgnored ? colors.red : colors.white;
          const hashDisplay = colors.gray(` [${truncateHash(file.sha256)}]`);
          const eventIdDisplay = colors.gray(` {${truncateHash(file.eventId)}}`);

          // Fixed width for indicators column, then tree and file info
          console.log(`${indicators} ${colors.gray(treePrefix)}${pathColor(fileName)}${hashDisplay}${eventIdDisplay}`);
        }
      });

      console.log(colors.gray("─".repeat(100)));

      // Summary
      console.log("\n" + colors.bold("Summary:"));
      console.log(`Total files: ${files.length}`);
      console.log(`Found on ${allRelays.size} relay(s), available on ${allServers.size} server(s)`);
    }

    Deno.exit(0);
  } catch (error: unknown) {
    handleError("Error listing files", error, {
      showConsole: true,
      exit: true,
      exitCode: 1,
    });
  }
}