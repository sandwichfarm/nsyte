import { colors } from "@cliffy/ansi/colors";
import { getSeenRelays, type NostrEvent, relaySet } from "applesauce-core/helpers";
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
import { resolveSiteIdentifier } from "../lib/site-identifier.ts";
import {
  fetchTrustedSiteManifestEvent,
  fetchTrustedSiteManifestHistory,
} from "../lib/site-manifest.ts";
import { buildListTreeItems } from "../ui/file-tree.ts";
import {
  getServerSymbol,
  RELAY_COLORS,
  RELAY_SYMBOL,
  RELAY_SYMBOL_ALT,
  SERVER_COLORS,
} from "../ui/source-indicators.ts";
import { formatServerProgressBars } from "../ui/progress.ts";
import { formatManifestIdWithAge } from "../ui/time-formatter.ts";
import { truncateHash } from "../ui/browse/renderer.ts";
import nsyte from "./root.ts";

const BLOSSOM_CHECK_TIMEOUT_MS = 30_000;

export interface ManifestRelaySummary {
  relay: string;
  versionCount: number;
}

export interface CategorizedStatusServers {
  hintServers: string[];
  userOnlyServers: string[];
  allServers: string[];
}

interface StatusCommandOptions {
  config?: string | false;
  relays?: string;
  sec?: string;
  pubkey?: string;
  name?: string;
  full?: boolean;
  useFallbackRelays?: boolean;
  useFallbacks?: boolean;
}

function normalizePathFilter(pathFilter?: string): string | undefined {
  if (!pathFilter) {
    return undefined;
  }

  let normalizedPathFilter = pathFilter.startsWith("/") ? pathFilter.substring(1) : pathFilter;
  if (!normalizedPathFilter.includes(".") && !normalizedPathFilter.endsWith("/")) {
    normalizedPathFilter += "/";
  }

  return normalizedPathFilter;
}

function matchesPathFilter(filePath: string, pathFilter?: string): boolean {
  if (!pathFilter) {
    return true;
  }

  const normalizedPath = filePath.startsWith("/") ? filePath.substring(1) : filePath;
  if (pathFilter.endsWith("/")) {
    return normalizedPath.startsWith(pathFilter);
  }

  return normalizedPath === pathFilter || normalizedPath.startsWith(pathFilter + ".") ||
    normalizedPath.startsWith(pathFilter + "/");
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

async function populateAvailableBlossomServers(
  files: FileEntryWithSources[],
  servers: string[],
): Promise<void> {
  await Promise.all(files.map(async (file) => {
    file.availableOnServers = await withTimeout(
      checkBlossomServersForFile(file.sha256, servers),
      BLOSSOM_CHECK_TIMEOUT_MS,
      [],
    );
  }));
}

export function buildManifestRelaySummary(events: NostrEvent[]): ManifestRelaySummary[] {
  const counts = new Map<string, Set<string>>();

  for (const event of events) {
    const relays = getSeenRelays(event) ?? [];
    for (const relay of relays) {
      if (!counts.has(relay)) {
        counts.set(relay, new Set());
      }
      counts.get(relay)!.add(event.id);
    }
  }

  return Array.from(counts.entries())
    .map(([relay, eventIds]) => ({
      relay,
      versionCount: eventIds.size,
    }))
    .sort((a, b) => {
      if (a.versionCount !== b.versionCount) {
        return b.versionCount - a.versionCount;
      }

      return a.relay.localeCompare(b.relay);
    });
}

export function categorizeStatusServers(
  manifestServers: string[],
  userServers: string[],
): CategorizedStatusServers {
  const hintServers = relaySet(manifestServers);
  const userOnlyServers = relaySet(userServers).filter((server) => !hintServers.includes(server));

  return {
    hintServers,
    userOnlyServers,
    allServers: relaySet(hintServers, userOnlyServers),
  };
}

function buildServerProgress(files: FileEntryWithSources[], servers: string[]) {
  return Object.fromEntries(
    servers.map((server) => [
      server,
      {
        total: files.length,
        completed: files.filter((file) => file.availableOnServers.includes(server)).length,
        failed: files.filter((file) => !file.availableOnServers.includes(server)).length,
        retrying: 0,
        skipped: 0,
      },
    ]),
  );
}

export function registerStatusCommand() {
  return nsyte
    .command("status")
    .description("Show relay, server, and manifest history details for a site.")
    .arguments("[path:string]")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-p, --pubkey <npub:string>",
      "The public key to inspect (npub, hex, or NIP-05 identifier like name@domain.com).",
    )
    .option(
      "-d, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, inspects root site (kind 15128).",
    )
    .option("--no-config", "Ignore config file and use only CLI arguments.", { default: false })
    .option("--full", "Show the full file list instead of the per-server file summary.", {
      default: false,
    })
    .option(
      "--use-fallback-relays",
      "Include default nsyte relays in addition to configured/user relays.",
    )
    .option("--use-fallbacks", "Enable all fallbacks (currently only relays for this command).")
    .action(async (options: StatusCommandOptions, pathFilter?: string) => {
      const configPath = typeof options.config === "string" ? options.config : undefined;
      const projectConfig = options.config === false ? null : readProjectFile(configPath);
      const siteName = resolveSiteIdentifier(options.name, projectConfig);
      const pubkey = await resolvePubkey(options, projectConfig);
      const allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;
      const configuredRelays = options.relays !== undefined
        ? resolveRelays(options, projectConfig, false)
        : (projectConfig?.relays || []);
      let relays = relaySet(configuredRelays);

      if (allowFallbackRelays) {
        relays = relaySet(relays, NSYTE_BROADCAST_RELAYS);
      }

      if (relays.length === 0) {
        if (allowFallbackRelays) {
          relays = NSYTE_BROADCAST_RELAYS;
          console.log(colors.yellow("Using default relays because none were configured."));
        } else {
          console.log(colors.red("No relays configured and fallbacks disabled."));
          Deno.exit(1);
        }
      }

      const normalizedPathFilter = normalizePathFilter(pathFilter);
      const siteType = siteName ? `named site \"${siteName}\"` : "root site";
      const displayName = await getUserDisplayName(pubkey);

      console.log(
        colors.cyan(
          `Checking status for ${siteType} owned by ${colors.bold(displayName)} on relays: ${
            relays.join(", ")
          }`,
        ),
      );

      if (normalizedPathFilter) {
        console.log(colors.cyan(`Filtering by path: ${normalizedPathFilter}`));
      }

      const [trustedManifest, manifestHistory] = await Promise.all([
        fetchTrustedSiteManifestEvent(relays, pubkey, siteName),
        fetchTrustedSiteManifestHistory(relays, pubkey, siteName),
      ]);

      if (!trustedManifest.event) {
        console.log(colors.red(`No manifest event found for ${siteType}`));
        Deno.exit(1);
      }

      const manifest = trustedManifest.event;
      let files: FileEntryWithSources[] = getManifestFiles(manifest).map((file) => ({
        path: file.path,
        sha256: file.sha256,
        eventId: manifest.id,
        event: manifest,
        foundOnRelays: [...trustedManifest.relays],
        availableOnServers: [],
      }));

      const manifestServers = getManifestServers(manifest).map((url) => url.toString());
      const userServers = await getUserBlossomServers(pubkey) ?? [];
      const { hintServers, userOnlyServers, allServers } = categorizeStatusServers(
        manifestServers,
        userServers,
      );

      if (allServers.length > 0) {
        console.log(colors.gray(`Checking ${allServers.length} blossom server(s)...`));
        await populateAvailableBlossomServers(files, allServers);
      }

      files = files.filter((file) => matchesPathFilter(file.path, normalizedPathFilter));

      const relaySummaries = buildManifestRelaySummary(manifestHistory);
      const relayColorMap = new Map<string, (text: string) => string>();
      const serverColorMap = new Map<string, (text: string) => string>();
      const uniqueServers = new Set<string>();

      for (const file of files) {
        for (const server of file.availableOnServers) {
          uniqueServers.add(server);
        }
      }

      relaySummaries.forEach((summary, index) => {
        const relay = summary.relay;
        relayColorMap.set(relay, RELAY_COLORS[index % RELAY_COLORS.length]);
      });
      allServers.forEach((server, index) => {
        serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length]);
      });

      console.log("\n" + colors.bold("Current Manifest:"));
      console.log(colors.cyan(formatManifestIdWithAge(manifest.id, manifest.created_at)));
      console.log(colors.gray("─".repeat(80)));

      if (relaySummaries.length > 0) {
        console.log(colors.bold("Manifest Relay Coverage:"));
        relaySummaries.forEach((summary, relayIndex) => {
          const colorFn = relayColorMap.get(summary.relay) || colors.white;
          const symbol = relayIndex % 2 === 0 ? RELAY_SYMBOL : RELAY_SYMBOL_ALT;
          const label = summary.versionCount === 1 ? "version" : "versions";
          console.log(`  ${colorFn(symbol)} ${summary.relay} (${summary.versionCount} ${label})`);
        });
      }

      if (allServers.length > 0) {
        console.log(colors.bold("\nManifest Hint Servers:"));
        if (hintServers.length === 0) {
          console.log(colors.gray("  None listed on the current manifest."));
        } else {
          hintServers.forEach((server) => {
            const serverIndex = allServers.indexOf(server);
            const colorFn = serverColorMap.get(server) || colors.white;
            console.log(`  ${colorFn(getServerSymbol(serverIndex))} ${server}`);
          });
        }

        if (userOnlyServers.length > 0) {
          console.log(colors.bold("\nAdditional User Blossom Servers:"));
          userOnlyServers.forEach((server) => {
            const serverIndex = allServers.indexOf(server);
            const colorFn = serverColorMap.get(server) || colors.white;
            console.log(`  ${colorFn(getServerSymbol(serverIndex))} ${server}`);
          });
        }
      }

      console.log("\n" + colors.bold("Manifest Versions:"));
      manifestHistory.forEach((event, index) => {
        const eventFiles = getManifestFiles(event);
        const seenRelays = Array.from(getSeenRelays(event) ?? []).sort();
        const label = index === 0 ? colors.green("latest") : colors.yellow(`older #${index}`);
        console.log(
          `  ${label} ${
            formatManifestIdWithAge(event.id, event.created_at)
          } (${eventFiles.length} files)`,
        );
        if (seenRelays.length > 0) {
          const relayList = seenRelays.map((relay) => {
            const colorFn = relayColorMap.get(relay) || colors.white;
            return colorFn(relay);
          }).join(colors.gray(", "));
          console.log(colors.gray("    seen on: ") + relayList);
        }
      });

      console.log(colors.gray("─".repeat(100)));

      if (files.length === 0) {
        const emptyMessage = normalizedPathFilter
          ? `No files found matching path: ${normalizedPathFilter}`
          : "No files found in this manifest.";
        console.log(colors.yellow(emptyMessage));
      } else {
        if (options.full) {
          const maxServerCount = Math.max(
            ...files.map((file) => file.availableOnServers.length),
            0,
          );
          const serverColumnWidth = Math.max(maxServerCount, 1);
          const treeItems = buildListTreeItems(files);

          console.log(colors.bold("Files:"));
          console.log(colors.gray("─".repeat(100)));

          treeItems.forEach((item) => {
            if (item.isDirectory) {
              const dirName = item.path.split("/").pop() || item.path;
              let treePrefix = item.parentPrefix;
              if (item.depth > 0) {
                treePrefix += item.isLast ? "└─ " : "├─ ";
              }

              const emptyIndicators = " ".repeat(serverColumnWidth);
              console.log(
                `${emptyIndicators} ${colors.gray(treePrefix)}${colors.gray(dirName + "/")}`,
              );
              return;
            }

            const file = item.file!;
            let serverIndicators = "";
            let serverCount = 0;
            file.availableOnServers.forEach((server) => {
              const colorFn = serverColorMap.get(server) || colors.white;
              let serverIndex = 0;
              for (const [mapServer] of serverColorMap) {
                if (mapServer === server) {
                  break;
                }
                serverIndex++;
              }
              serverIndicators += colorFn(getServerSymbol(serverIndex));
              serverCount++;
            });
            serverIndicators += " ".repeat(serverColumnWidth - serverCount);

            let treePrefix = item.parentPrefix;
            if (item.depth > 0) {
              treePrefix += item.isLast ? "└─ " : "├─ ";
            }

            const fileName = item.path.split("/").pop() || item.path;
            const hashDisplay = colors.gray(` [${truncateHash(file.sha256)}]`);
            console.log(
              `${serverIndicators} ${colors.gray(treePrefix)}${
                colors.white(fileName)
              }${hashDisplay}`,
            );
          });

          console.log(colors.gray("─".repeat(100)));
        } else {
          if (hintServers.length > 0) {
            console.log(colors.bold("Files on Manifest Hint Servers:"));
            const hintBars = formatServerProgressBars(
              hintServers,
              buildServerProgress(files, hintServers),
            );
            if (hintBars) {
              console.log(hintBars);
            }
          } else if (allServers.length > 0) {
            console.log(colors.yellow("No server hints listed on the current manifest."));
          }

          if (userOnlyServers.length > 0) {
            console.log(colors.bold("\nFiles on Additional User Servers:"));
            const userBars = formatServerProgressBars(
              userOnlyServers,
              buildServerProgress(files, userOnlyServers),
            );
            if (userBars) {
              console.log(userBars);
            }
          }

          console.log(colors.gray("Use --full to show the full file list."));
          console.log(colors.gray("─".repeat(100)));
        }
      }

      console.log("\n" + colors.bold("Summary:"));
      console.log(`Total files: ${files.length}`);
      console.log(`Manifest versions found on ${relaySummaries.length} relay(s)`);
      console.log(`Manifest hint servers: ${hintServers.length}`);
      console.log(`Additional user servers: ${userOnlyServers.length}`);
      console.log(`Files available on ${uniqueServers.size} checked server(s)`);
      console.log(`Manifest versions found: ${manifestHistory.length}`);
    }).error((error) => {
      handleError("Error checking site status", error, {
        showConsole: true,
        exit: true,
        exitCode: 1,
      });
    });
}
