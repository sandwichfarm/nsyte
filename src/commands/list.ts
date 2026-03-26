import { colors } from "@cliffy/ansi/colors";
import { mergeBlossomServers } from "applesauce-common/helpers";
import { relaySet } from "applesauce-core/helpers";
import { checkBlossomServersForFile } from "../lib/browse-loader.ts";
import { readProjectFile } from "../lib/config.ts";
import { NSYTE_BROADCAST_RELAYS } from "../lib/constants.ts";
import { handleError } from "../lib/error-utils.ts";
import { getManifestFiles, getManifestServers } from "../lib/manifest.ts";
import {
  type FileEntryWithSources,
  getUserBlossomServers,
  getUserDisplayName,
} from "../lib/nostr.ts";
import { resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
import { fetchTrustedSiteManifestEvent } from "../lib/site-manifest.ts";
import { formatManifestIdWithAge } from "../ui/time-formatter.ts";
import nsyte from "./root.ts";

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
  colors.cyan,
  colors.yellow,
  colors.green,
  colors.magenta,
  colors.brightRed,
  colors.brightCyan,
  colors.brightYellow,
  colors.brightGreen,
  colors.brightMagenta,
];

// Symbols for relays and servers
export const RELAY_SYMBOL = "▲"; // Triangle for relays (right-side up)
export const RELAY_SYMBOL_ALT = "▼"; // Triangle for relays (upside down)

// Distinct shapes for blossom servers — cycled per server
export const SERVER_SYMBOLS = ["■", "●", "◆", "★", "▰"];
/** @deprecated Use SERVER_SYMBOLS[index] instead */
export const SERVER_SYMBOL = SERVER_SYMBOLS[0];
export const BLOSSOM_CHECK_TIMEOUT_MS = 10_000;

/**
 * Get the symbol for a server by index
 */
export function getServerSymbol(index: number): string {
  return SERVER_SYMBOLS[index % SERVER_SYMBOLS.length];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => resolve(fallbackValue), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export async function populateAvailableBlossomServers(
  files: FileEntryWithSources[],
  servers: string[],
  checker: (sha256: string, servers: string[]) => Promise<string[]> = checkBlossomServersForFile,
  timeoutMs: number = BLOSSOM_CHECK_TIMEOUT_MS,
): Promise<void> {
  await Promise.all(files.map(async (file) => {
    file.availableOnServers = await withTimeout(checker(file.sha256, servers), timeoutMs, []);
  }));
}

export interface ListTreeItem {
  path: string;
  isDirectory: boolean;
  depth: number;
  isLast: boolean;
  parentPrefix: string;
  file?: FileEntryWithSources;
}

export function buildListTreeItems(files: FileEntryWithSources[]): ListTreeItem[] {
  const fileMap = new Map<string, FileEntryWithSources>();
  const directories = new Set<string>();
  const children = new Map<string, Set<string>>();

  const ensureChildren = (path: string) => {
    if (!children.has(path)) {
      children.set(path, new Set());
    }
  };

  ensureChildren("");

  for (const file of files) {
    const normalizedPath = file.path.startsWith("/") ? file.path.substring(1) : file.path;
    fileMap.set(normalizedPath, file);

    const parts = normalizedPath.split("/");
    if (parts.length === 1) {
      children.get("")!.add(normalizedPath);
      continue;
    }

    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      directories.add(currentPath);
      ensureChildren(parentPath);
      ensureChildren(currentPath);
      children.get(parentPath)!.add(currentPath);
    }

    children.get(parts.slice(0, -1).join("/"))!.add(normalizedPath);
  }

  const sortChildren = (paths: string[]) => {
    return paths.sort((a, b) => {
      const aIsDirectory = directories.has(a);
      const bIsDirectory = directories.has(b);
      if (aIsDirectory !== bIsDirectory) {
        return aIsDirectory ? -1 : 1;
      }

      const aName = a.split("/").pop() || a;
      const bName = b.split("/").pop() || b;
      return aName.localeCompare(bName);
    });
  };

  const treeItems: ListTreeItem[] = [];

  const visit = (path: string, depth: number, isLast: boolean, parentPrefix = "") => {
    const isDirectory = directories.has(path);
    treeItems.push({
      path,
      isDirectory,
      depth,
      isLast,
      parentPrefix,
      file: fileMap.get(path),
    });

    if (!isDirectory) {
      return;
    }

    const nextParentPrefix = parentPrefix + (depth > 0 ? (isLast ? "   " : "│  ") : "");
    const childPaths = sortChildren(Array.from(children.get(path) || []));
    childPaths.forEach((childPath, index) => {
      visit(childPath, depth + 1, index === childPaths.length - 1, nextParentPrefix);
    });
  };

  const rootPaths = sortChildren(Array.from(children.get("") || []));
  rootPaths.forEach((path, index) => {
    visit(path, 0, index === rootPaths.length - 1);
  });

  return treeItems;
}

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
// (Removed old per-relay fetch; we now reuse listRemoteFiles for consistency with run)

/**
 * Register the ls command
 */
export function registerListCommand() {
  return nsyte
    .command("list")
    .alias("ls")
    .description(
      "List files available on the nostr network with source information. Optionally filter by path (e.g., 'docs/' or 'docs/index.html')",
    )
    .arguments("[path:string]")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-p, --pubkey <npub:string>",
      "The public key to list files for (npub, hex, or NIP-05 identifier like name@domain.com).",
    )
    .option(
      "-d, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, lists root site (kind 15128).",
    )
    .option(
      "--use-fallback-relays",
      "Include default nsyte relays in addition to configured/user relays.",
    )
    .option("--use-fallbacks", "Enable all fallbacks (currently only relays for this command).")
    .action(async (options, pathFilter?: string) => {
      const pubkey = await resolvePubkey(options);
      const projectConfig = readProjectFile(options.config);
      const allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;
      const configuredRelays = options.relays !== undefined
        ? resolveRelays(options, projectConfig, false)
        : (projectConfig?.relays || []);
      let relays = [...configuredRelays];

      if (allowFallbackRelays) {
        relays = relaySet(relays, NSYTE_BROADCAST_RELAYS);
      }

      if (relays.length === 0) {
        if (allowFallbackRelays) {
          relays = NSYTE_BROADCAST_RELAYS;
          console.log(colors.yellow("⚠️  Using default relays because none were configured."));
        } else {
          console.log(colors.red("✗ No relays configured and fallbacks disabled."));
          Deno.exit(1);
        }
      }

      // Normalize path filter
      let normalizedPathFilter: string | undefined;
      if (pathFilter) {
        // Remove leading slash if present
        normalizedPathFilter = pathFilter.startsWith("/") ? pathFilter.substring(1) : pathFilter;
        // For directory filters, ensure trailing slash
        if (!normalizedPathFilter.includes(".") && !normalizedPathFilter.endsWith("/")) {
          normalizedPathFilter += "/";
        }
      }

      const siteType = options.name ? `named site "${options.name}"` : "root site";
      console.log(
        colors.cyan(
          `Searching for ${siteType} manifest event for ${
            colors.bold(await getUserDisplayName(pubkey))
          } on relays: ${relays.join(", ")}`,
        ),
      );

      if (normalizedPathFilter) {
        console.log(colors.cyan(`Filtering by path: ${normalizedPathFilter}`));
      }

      const trustedManifest = await fetchTrustedSiteManifestEvent(relays, pubkey, options.name);
      if (!trustedManifest.event) {
        const siteType = options.name ? `named site "${options.name}"` : "root site";
        console.log(colors.red(`No manifest event found for ${siteType}`));
        Deno.exit(1);
      }

      const manifest = trustedManifest.event;

      console.log(
        colors.gray(
          `Found manifest event: ${formatManifestIdWithAge(manifest.id, manifest.created_at)}`,
        ),
      );

      // Convert FilePathMapping[] to FileEntryWithSources[]
      const fileMappings = getManifestFiles(manifest);
      // Use the relays we queried as the found relays (since we successfully got the manifest from them)
      let files: FileEntryWithSources[] = fileMappings.map((file) => ({
        path: file.path,
        sha256: file.sha256,
        eventId: manifest.id,
        event: manifest,
        foundOnRelays: [...trustedManifest.relays],
        availableOnServers: [],
      }));

      // Get full list of blossom servers: user's servers + manifest servers
      const manifestServers = getManifestServers(manifest).map((url) => url.toString());
      const userServers = await getUserBlossomServers(pubkey);
      const allServers = mergeBlossomServers(userServers, manifestServers);

      // Check server availability for each file
      if (allServers.length > 0) {
        console.log(colors.gray(`Checking ${allServers.length} blossom server(s)...`));
        await populateAvailableBlossomServers(files, allServers);
      }

      // Filter files by path if specified
      if (normalizedPathFilter) {
        files = files.filter((file) => {
          const filePath = file.path.startsWith("/") ? file.path.substring(1) : file.path;

          // If filter ends with /, match directory prefix
          if (normalizedPathFilter.endsWith("/")) {
            return filePath.startsWith(normalizedPathFilter);
          }

          // Otherwise, match exact file, file with extension, or directory prefix
          return filePath === normalizedPathFilter ||
            filePath.startsWith(normalizedPathFilter + ".") ||
            filePath.startsWith(normalizedPathFilter + "/");
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

        files.forEach((file) => {
          file.foundOnRelays.forEach((relay) => allRelays.add(relay));
          file.availableOnServers.forEach((server) => allServers.add(server));
        });

        // Assign colors (sorted for deterministic assignment)
        Array.from(allRelays).sort().forEach((relay, index) => {
          relayColorMap.set(relay, RELAY_COLORS[index % RELAY_COLORS.length]);
        });

        Array.from(allServers).sort().forEach((server, index) => {
          serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length]);
        });

        // Display manifest event ID
        console.log("\n" + colors.bold("Manifest Event:"));
        console.log(colors.cyan(formatManifestIdWithAge(manifest.id, manifest.created_at)));
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
          let serverIdx = 0;
          serverColorMap.forEach((colorFn, server) => {
            console.log(`  ${colorFn(getServerSymbol(serverIdx))} ${server}`);
            serverIdx++;
          });
        }

        console.log(colors.gray("─".repeat(60)));

        // Calculate fixed column widths for better alignment
        const maxRelayCount = Math.max(...files.map((file) => file.foundOnRelays.length), 0);
        const maxServerCount = Math.max(
          ...files.map((file) => file.availableOnServers.length),
          0,
        );

        // Fixed width for relay and server sections (with separator)
        const relayColumnWidth = Math.max(maxRelayCount, 1); // At least 1 space
        const serverColumnWidth = Math.max(maxServerCount, 1); // At least 1 space
        const totalIndicatorWidth = relayColumnWidth + 3 + serverColumnWidth; // 3 for " | "

        const treeItems = buildListTreeItems(files);

        // Display files in tree-like format
        console.log("\n" + colors.bold("Files:"));
        console.log(colors.gray("─".repeat(100)));

        treeItems.forEach((item) => {
          if (item.isDirectory) {
            const dirName = item.path.split("/").pop() || item.path;
            let treePrefix = item.parentPrefix;
            if (item.depth > 0) {
              treePrefix += item.isLast ? "└─ " : "├─ ";
            }

            const emptyIndicators = " ".repeat(totalIndicatorWidth);
            console.log(
              `${emptyIndicators} ${colors.gray(treePrefix)}${colors.gray(dirName + "/")}`,
            );
          } else {
            const file = item.file!;

            // Build relay indicators (fixed width based on count, not string length)
            let relayIndicators = "";
            let relayCount = 0;
            file.foundOnRelays.forEach((relay) => {
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
            file.availableOnServers.forEach((server) => {
              const colorFn = serverColorMap.get(server) || colors.white;
              // Find server index for symbol selection
              let srvIdx = 0;
              for (const [mapServer] of serverColorMap) {
                if (mapServer === server) break;
                srvIdx++;
              }
              serverIndicators += colorFn(getServerSymbol(srvIdx));
              serverCount++;
            });
            // Pad based on actual symbol count
            const serverPadding = " ".repeat(serverColumnWidth - serverCount);
            serverIndicators += serverPadding;

            // Combine indicators with fixed total width
            const indicators = relayIndicators + separator + serverIndicators;

            const fileName = item.path.split("/").pop() || item.path;
            let treePrefix = item.parentPrefix;
            if (item.depth > 0) {
              treePrefix += item.isLast ? "└─ " : "├─ ";
            }

            const hashDisplay = colors.gray(` [${truncateHash(file.sha256)}]`);

            console.log(
              `${indicators} ${colors.gray(treePrefix)}${colors.white(fileName)}${hashDisplay}`,
            );
          }
        });

        console.log(colors.gray("─".repeat(100)));

        // Summary
        console.log("\n" + colors.bold("Summary:"));
        console.log(`Total files: ${files.length}`);
        console.log(
          `Found on ${allRelays.size} relay(s), available on ${allServers.size} server(s)`,
        );
      }

      Deno.exit(0);
    }).error((error) => {
      handleError("Error listing files", error, {
        showConsole: true,
        exit: true,
        exitCode: 1,
      });
    });
}
