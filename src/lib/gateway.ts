import { colors } from "@cliffy/ansi/colors";
import { decompress as brotliDecompress } from "@nick/brotli";
import { ensureDir } from "@std/fs";
import { contentType } from "@std/media-types";
import { extname, join } from "@std/path";
import { BLOSSOM_SERVER_LIST_KIND } from "applesauce-common/helpers";
import {
  type AddressPointer,
  decodePointer,
  kinds,
  normalizeToPubkey,
  npubEncode,
} from "applesauce-core/helpers";
import { DownloadService } from "./download.ts";
import { createLogger } from "./logger.ts";
import { getManifestFiles, getManifestServers } from "./manifest.ts";
import {
  type FileEntry,
  getSiteManifestEvent,
  getUserOutboxes,
  getUserProfile,
  getUserServers,
  listRemoteFiles,
  type NostrEvent,
  store,
} from "./nostr.ts";
import type { ByteArray } from "./types.ts";

const log = createLogger("gateway");

/**
 * Options for configuring the NsiteGatewayServer
 */
export interface GatewayServerOptions {
  port: number;
  targetSite: AddressPointer | null;
  profileRelays: string[];
  fileRelays: string[];
  defaultFileRelays: string[];
  servers: string[];
  cacheDir: string | null;
  allowFallbackRelays: boolean;
  allowFallbackServers: boolean;
  noOpen?: boolean;
}

/**
 * Extract npub and optional identifier from hostname
 * Root site: "npub123.localhost" -> { npub: "npub123" }
 * Named site: "blog.npub123.localhost" -> { npub: "npub123", identifier: "blog" }
 */
function extractNpubAndIdentifier(
  hostname: string,
): { npub: string; identifier?: string } | null {
  const parts = hostname.split(".");
  if (parts.length < 2) return null;

  // Handle root site: npub123.localhost
  if (parts[0].startsWith("npub")) {
    return { npub: parts[0] };
  }

  // Handle named site: blog.npub123.localhost
  if (parts.length >= 3 && parts[0] && parts[1].startsWith("npub")) {
    const identifier = parts[0];
    const npub = parts[1];
    // Validate identifier (alphanumeric, hyphens, underscores)
    if (/^[a-zA-Z0-9_-]+$/.test(identifier)) {
      return { npub, identifier };
    }
  }

  return null;
}

/**
 * Validates an npub string format
 */
function validateNpub(npub: string): boolean {
  try {
    const decoded = decodePointer(npub);
    return decoded.type === "npub";
  } catch {
    return false;
  }
}

/**
 * Nsite Gateway Server - serves nsites via npub subdomains
 */
export class NsiteGatewayServer {
  private options: GatewayServerOptions;
  private profileCache: Map<
    string,
    {
      profile: NostrEvent | null;
      relayList: NostrEvent | null;
      serverList: string[];
      userRelays: string[];
      timestamp: number;
    }
  >;
  private fileListCache: Map<
    string,
    {
      files: FileEntry[];
      timestamp: number;
      loading?: boolean;
      eventTimestamps?: Map<string, number>;
      manifestFoundButEmpty?: boolean;
    }
  >;
  private fileCache: Map<string, { data: ByteArray; timestamp: number; sha256: string }>;
  private pathUpdateTimestamps: Map<string, number>;
  private backgroundUpdateChecks: Map<string, Promise<void>>;
  private readonly CACHE_TTL = 600000; // 10 minutes cache for profile data only
  private serverController: Deno.HttpServer | null = null;

  /**
   * Generate cache key for site-specific caches (not profile)
   */
  private getSiteCacheKey(npub: string, identifier?: string): string {
    return identifier ? `${npub}:${identifier}` : `${npub}:root`;
  }

  constructor(options: GatewayServerOptions) {
    this.options = options;
    this.profileCache = new Map();
    this.fileListCache = new Map();
    this.fileCache = new Map();
    this.pathUpdateTimestamps = new Map();
    this.backgroundUpdateChecks = new Map();
  }

  /**
   * Start the gateway server
   */
  async start(): Promise<void> {
    const { port, targetSite, noOpen } = this.options;

    // Extract targetNpub and targetIdentifier from targetSite
    const targetNpub = targetSite ? npubEncode(targetSite.pubkey) : null;
    const targetIdentifier = targetSite?.identifier;

    console.log(colors.green(`\n🚀 Starting nsyte resolver server`));
    console.log(colors.cyan(`📡 Profile relays: ${this.options.profileRelays.join(", ")}`));
    console.log(colors.cyan(`📁 File relays: ${this.options.fileRelays.join(", ")}`));
    console.log(colors.cyan(`💾 Blossom servers: ${this.options.servers.join(", ")}`));
    console.log(colors.cyan(`🌐 Server URL: http://localhost:${port}`));
    console.log(colors.gray(`\nAccess nsites via:`));
    console.log(colors.gray(`  Root site: http://{npub}.localhost:${port}/path/to/file`));
    console.log(
      colors.gray(`  Named site: http://{identifier}.{npub}.localhost:${port}/path/to/file`),
    );
    console.log(colors.gray(`Example: http://npub1abc123.localhost:${port}/index.html`));
    console.log(colors.gray(`Example: http://blog.npub1abc123.localhost:${port}/index.html`));
    console.log(colors.gray(`\nNote: http://localhost:${port} redirects to:`));
    if (targetNpub) {
      if (targetIdentifier) {
        console.log(colors.gray(`http://${targetIdentifier}.${targetNpub}.localhost:${port}\n`));
      } else {
        console.log(colors.gray(`http://${targetNpub}.localhost:${port}\n`));
      }
    } else {
      console.log(colors.gray(`http://localhost:${port}\n`));
    }
    console.log(colors.gray(`Press Ctrl+C to stop the server\n`));

    // Open browser automatically unless disabled
    if (!noOpen) {
      await this.openBrowser(`http://localhost:${port}`);
    }

    // Set up cleanup handlers
    const cleanup = () => {
      console.log(colors.yellow("\n🛑 Shutting down server..."));
      // Clear all background checks
      this.backgroundUpdateChecks.clear();
      Deno.exit(0);
    };

    // Handle graceful shutdown
    Deno.addSignalListener("SIGINT", cleanup);
    Deno.addSignalListener("SIGTERM", cleanup);

    // Start server using Deno.serve
    this.serverController = Deno.serve({ port }, (req) => this.handleRequest(req));
    await this.serverController.finished;
  }

  /**
   * Stop the gateway server
   */
  stop(): void {
    if (this.serverController) {
      this.serverController.shutdown();
      this.serverController = null;
    }
    this.backgroundUpdateChecks.clear();
  }

  /**
   * Handle HTTP request
   */
  private async handleRequest(request: Request): Promise<Response> {
    const startTime = performance.now();
    const url = new URL(request.url);
    const hostname = request.headers.get("host")?.split(":")[0] || "";
    const { port, targetSite } = this.options;

    // Extract targetNpub and targetIdentifier from targetSite
    const targetNpub = targetSite ? npubEncode(targetSite.pubkey) : null;
    const targetIdentifier = targetSite?.identifier;

    // Handle root localhost redirect
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
      if (!targetNpub) {
        const elapsed = Math.round(performance.now() - startTime);
        console.log(colors.red(`✗ No target site configured - ${elapsed}ms`));
        return new Response("No target site configured", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }
      const redirectUrl = targetIdentifier
        ? `http://${targetIdentifier}.${targetNpub}.localhost:${port}${url.pathname}${url.search}`
        : `http://${targetNpub}.localhost:${port}${url.pathname}${url.search}`;
      const elapsed = Math.round(performance.now() - startTime);
      console.log(colors.cyan(`→ Redirecting to ${redirectUrl} - ${elapsed}ms`));
      return new Response(null, {
        status: 302,
        headers: {
          "Location": redirectUrl,
          "Cache-Control": "no-cache",
        },
      });
    }

    // Extract npub and identifier from hostname
    const hostInfo = extractNpubAndIdentifier(hostname);

    if (!hostInfo) {
      const elapsed = Math.round(performance.now() - startTime);
      console.log(colors.red(`✗ Invalid request (no npub) - ${elapsed}ms`));
      return new Response(
        "Invalid request. Use npub subdomain (e.g., npub123.localhost or blog.npub123.localhost)",
        {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }

    const { npub, identifier } = hostInfo;

    // Validate npub format
    if (!validateNpub(npub)) {
      const elapsed = Math.round(performance.now() - startTime);
      console.log(colors.red(`✗ Invalid npub format: ${npub} - ${elapsed}ms`));
      return new Response(`Invalid npub format: ${npub}`, {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    try {
      const pubkeyHex = normalizeToPubkey(npub);
      if (!pubkeyHex) throw new Error(`Invalid npub format: ${npub}`);
      const requestedPath = url.pathname;
      const siteCacheKey = this.getSiteCacheKey(npub, identifier);

      // Update check endpoint
      if (requestedPath === "/_nsyte/check-updates") {
        const path = url.searchParams.get("path");
        const since = parseInt(url.searchParams.get("since") || "0");

        if (!path) {
          return new Response(JSON.stringify({ error: "Missing path parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const updateKey = `${siteCacheKey}:${path}`;
        const lastUpdate = this.pathUpdateTimestamps.get(updateKey) || 0;
        const hasUpdate = lastUpdate > since;

        return new Response(JSON.stringify({ hasUpdate, timestamp: lastUpdate }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
        });
      }

      log.debug(
        `Request: ${hostname}${requestedPath} -> npub: ${npub}, identifier: ${
          identifier || "root"
        }`,
      );

      // Log successful npub resolution to console
      console.log(
        colors.green(
          `✓ Resolved ${colors.cyan(npub)} ${identifier ? `(${colors.cyan(identifier)})` : ""} → ${
            colors.gray(requestedPath)
          }`,
        ),
      );

      // Check profile cache
      let profileData = this.profileCache.get(npub);
      if (!profileData || Date.now() - profileData.timestamp > this.CACHE_TTL) {
        // Fetch profile and relay list
        console.log(colors.gray(`  → Fetching profile data for ${npub}...`));

        try {
          const [profile, userRelays] = await Promise.all([
            getUserProfile(this.options.profileRelays, pubkeyHex),
            getUserOutboxes(pubkeyHex),
          ]);

          // Get relay list event from store for display purposes
          const relayList = store.getReplaceable(kinds.RelayList, pubkeyHex) ?? null;
          if (userRelays.length > 0) {
            log.debug(
              `Found ${userRelays.length} relays from user's relay list: ${userRelays.join(", ")}`,
            );
          }

          // Extract servers from manifest events first (per NIP-XX spec)
          const userRelaysToUse = userRelays.length > 0 ? userRelays : this.options.fileRelays;
          const allServerListRelays = Array.from(
            new Set([...userRelaysToUse, ...this.options.profileRelays]),
          );

          let serverList: string[] = [];

          // First, try to get servers from manifest events (prioritized per NIP-XX)
          log.debug(
            `Getting site manifest event for ${pubkeyHex}${
              identifier ? ` (site: ${identifier})` : " (root site)"
            } from relays: ${allServerListRelays.join(", ")}`,
          );
          const manifestEvent = await getSiteManifestEvent(
            allServerListRelays,
            pubkeyHex,
            identifier,
          );

          if (manifestEvent) {
            const manifestId = manifestEvent.id || "unknown";
            const manifestServers = getManifestServers(manifestEvent);
            serverList = manifestServers.map((url) => url.toString());
            if (serverList.length > 0) {
              log.debug(`Found ${serverList.length} servers from manifest event ${manifestId}`);
              console.log(
                colors.gray(
                  `  → Found ${serverList.length} servers in manifest (id: ${
                    manifestId.slice(0, 16)
                  }...)`,
                ),
              );
            } else {
              console.log(
                colors.gray(
                  `  → Found manifest (id: ${manifestId.slice(0, 16)}...) but no servers listed`,
                ),
              );
            }
          }

          // Fall back to kind 10063 server list event if no servers found in manifests
          if (serverList.length === 0) {
            log.debug(
              `No servers in manifest, getting server list (Kind ${BLOSSOM_SERVER_LIST_KIND}) for ${pubkeyHex}`,
            );
            serverList = await getUserServers(pubkeyHex);

            if (serverList.length > 0) {
              log.debug(`Found ${serverList.length} servers from server list event (kind 10063)`);
              console.log(colors.gray(`  → Found server list with ${serverList.length} servers`));
            } else {
              log.debug("No server list event found");
              console.log(colors.gray(`  → No server list found`));
            }
          }

          profileData = { profile, relayList, serverList, userRelays, timestamp: Date.now() };
          this.profileCache.set(npub, profileData);

          if (profile) {
            try {
              const profileContent = JSON.parse(profile.content || "{}");
              console.log(
                colors.gray(
                  `  → Profile: ${profileContent.name || profileContent.display_name || "Unknown"}`,
                ),
              );
            } catch {
              console.log(colors.gray(`  → Profile data found but could not parse`));
            }
          } else {
            console.log(colors.gray(`  → No profile found (user may not have set one)`));
          }

          if (relayList) {
            console.log(
              colors.gray(
                `  → Found relay list with ${
                  relayList.tags.filter((t) => t[0] === "r").length
                } relays`,
              ),
            );
          }
        } catch (error) {
          console.log(colors.yellow(`  → Could not fetch profile data: ${error}`));
          profileData = {
            profile: null,
            relayList: null,
            serverList: [],
            userRelays: [],
            timestamp: Date.now(),
          };
          this.profileCache.set(npub, profileData);
        }
      }

      // Determine which relays to use for file events - prefer user's relays from kind 10002
      // Merge user relays (kind 10002) with configured relays to improve coverage
      const fileEventRelays = Array.from(
        new Set([
          ...(profileData?.userRelays || []),
          ...this.options.fileRelays,
        ]),
      );

      // Get or fetch file list
      let fileListEntry = this.fileListCache.get(siteCacheKey);

      // If we have no in-memory cache, try to load from disk first
      if (!fileListEntry && this.options.cacheDir) {
        console.log(
          colors.gray(
            `  → Checking disk cache for ${npub}${identifier ? ` (${identifier})` : ""}...`,
          ),
        );
        const diskCache = await this.loadFileListFromDiskCache(
          this.options.cacheDir,
          npub,
          identifier,
        );
        if (diskCache) {
          fileListEntry = {
            files: diskCache.files,
            timestamp: Date.now(),
            loading: false,
            eventTimestamps: diskCache.eventTimestamps,
            manifestFoundButEmpty: diskCache.manifestFoundButEmpty,
          };
          this.fileListCache.set(siteCacheKey, fileListEntry);
          if (diskCache.manifestFoundButEmpty) {
            console.log(colors.gray(`  → Loaded empty manifest from disk cache`));
          } else {
            console.log(colors.gray(`  → Loaded ${diskCache.files.length} files from disk cache`));
          }
        } else {
          console.log(
            colors.gray(`  → No manifest.json found in disk cache (will fetch file list)`),
          );
        }
      }

      // If we still have no cache at all, we need to load first
      if (!fileListEntry) {
        // For non-HTML requests when there's no cache, return 404
        // But allow directory paths that might have index files
        const mightBeHtml = requestedPath === "/" ||
          requestedPath.endsWith(".html") ||
          requestedPath.endsWith(".htm") ||
          requestedPath.endsWith("/") ||
          !requestedPath.includes(".");

        if (!mightBeHtml) {
          const elapsed = Math.round(performance.now() - startTime);
          console.log(colors.yellow(`  → File not found (no cache) - ${elapsed}ms`));
          return new Response("File not found", {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Start loading file list
        this.fileListCache.set(siteCacheKey, { files: [], timestamp: Date.now(), loading: true });

        (async () => {
          try {
            console.log(
              colors.gray(
                `  → Fetching file list for ${
                  identifier ? `site "${identifier}"` : "root site"
                } from ${fileEventRelays.length} relays...`,
              ),
            );
            let files = await listRemoteFiles(fileEventRelays, pubkeyHex, identifier);

            // Retry with default file relays if allowed and nothing came back (likely relay hiccup)
            if (files.length === 0 && this.options.allowFallbackRelays) {
              const fallbackRelays = Array.from(
                new Set([...fileEventRelays, ...this.options.defaultFileRelays]),
              );
              console.log(
                colors.gray(
                  `  → No files returned, retrying with fallback relays (${fallbackRelays.length})...`,
                ),
              );
              files = await listRemoteFiles(fallbackRelays, pubkeyHex, identifier);
            }

            // Track manifest event timestamps for cache invalidation
            const eventTimestamps = new Map<string, number>();
            files.forEach((file) => {
              if (file.event) {
                eventTimestamps.set(file.path, file.event.created_at);
              }
            });

            // Only cache if we got files
            if (files.length > 0) {
              // Extract the manifest event from the first file (all files share the same event)
              const manifestEvent = files[0]?.event;

              this.fileListCache.set(siteCacheKey, {
                files,
                timestamp: Date.now(),
                loading: false,
                eventTimestamps,
              });
              console.log(colors.gray(`  → Found ${files.length} files`));

              // Save to disk cache if we have the manifest event
              if (manifestEvent) {
                const manifestId = manifestEvent.id || "unknown";
                console.log(
                  colors.gray(
                    `  → Manifest id: ${manifestId.slice(0, 16)}... (kind ${manifestEvent.kind})`,
                  ),
                );
                await this.saveFileListManifest(
                  this.options.cacheDir,
                  npub,
                  identifier,
                  manifestEvent,
                );
              } else {
                console.log(
                  colors.yellow(`  → Files missing manifest event, skipping disk cache save`),
                );
              }
            } else {
              // Check if a manifest exists but has no files
              const allServerListRelays = Array.from(
                new Set([...fileEventRelays, ...this.options.profileRelays]),
              );
              const manifestEvent = await getSiteManifestEvent(
                allServerListRelays,
                pubkeyHex,
                identifier,
              );

              if (manifestEvent) {
                // Manifest exists but has no files - cache this state
                const manifestId = manifestEvent.id || "unknown";
                console.log(
                  colors.yellow(
                    `  → Manifest found (id: ${manifestId.slice(0, 16)}...) but contains no files`,
                  ),
                );
                this.fileListCache.set(siteCacheKey, {
                  files: [],
                  timestamp: Date.now(),
                  loading: false,
                  eventTimestamps: new Map(),
                  manifestFoundButEmpty: true,
                });
                // Save manifest to disk cache for consistency
                await this.saveFileListManifest(
                  this.options.cacheDir,
                  npub,
                  identifier,
                  manifestEvent,
                );
              } else {
                // No manifest found - remove the loading entry
                this.fileListCache.delete(siteCacheKey);
                console.log(
                  colors.yellow(`  → No files found after retry (removed from cache)`),
                );
              }
            }
          } catch (error) {
            console.log(colors.red(`  → Failed to fetch file list: ${error}`));
            // Remove the loading entry on error
            this.fileListCache.delete(siteCacheKey);
          }
        })();

        // Return loading page only for first-time load
        const loadingHtml = this.generateLoadingPage(npub, identifier, profileData?.profile);
        const elapsed = Math.round(performance.now() - startTime);
        console.log(colors.blue(`  → Loading page served (first visit) - ${elapsed}ms`));
        return new Response(loadingHtml, {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "Refresh": "2", // Auto-refresh every 2 seconds
          },
        });
      }

      // If we have cached content, serve it immediately and check for updates in the background
      // Also check for updates if manifest is empty (to detect when files are added)
      if (
        fileListEntry && !fileListEntry.loading &&
        (fileListEntry.files.length > 0 || fileListEntry.manifestFoundButEmpty)
      ) {
        // Check if there's already a background update in progress for this site
        if (!this.backgroundUpdateChecks.has(siteCacheKey)) {
          // Start background update check (non-blocking)
          const updatePromise = (async () => {
            try {
              console.log(
                colors.gray(
                  `  → Checking for updates in background from ${fileEventRelays.length} relays...`,
                ),
              );
              let files = await listRemoteFiles(fileEventRelays, pubkeyHex, identifier);

              // Retry with default file relays if allowed and nothing came back (relay hiccup)
              if (files.length === 0 && this.options.allowFallbackRelays) {
                const fallbackRelays = Array.from(
                  new Set([...fileEventRelays, ...this.options.defaultFileRelays]),
                );
                console.log(
                  colors.gray(
                    `  → No files returned, retrying update check with fallback relays...`,
                  ),
                );
                files = await listRemoteFiles(fallbackRelays, pubkeyHex, identifier);
              }

              // Track manifest event timestamps for cache invalidation
              const newEventTimestamps = new Map<string, number>();
              files.forEach((file) => {
                if (file.event) {
                  newEventTimestamps.set(file.path, file.event.created_at);
                }
              });

              // Check if any files have been updated
              let hasUpdates = false;
              let currentPathAffected = false;

              // If we previously had an empty manifest, any files found is an update
              if (fileListEntry.manifestFoundButEmpty && files.length > 0) {
                hasUpdates = true;
                console.log(colors.yellow(`  → Files added to previously empty manifest`));
                currentPathAffected = true; // Always refresh when files are added to empty manifest
              } else if (fileListEntry.eventTimestamps) {
                // Check for new or updated files
                for (const [path, newTimestamp] of newEventTimestamps) {
                  const oldTimestamp = fileListEntry.eventTimestamps.get(path);
                  if (!oldTimestamp || newTimestamp > oldTimestamp) {
                    hasUpdates = true;
                    console.log(colors.yellow(`  → Updated: ${path}`));
                    // Check if this affects the current request path
                    if (
                      requestedPath === "/" || path === requestedPath.slice(1) ||
                      (requestedPath.endsWith("/") && path.startsWith(requestedPath.slice(1)))
                    ) {
                      currentPathAffected = true;
                    }
                  }
                }

                // Check for deleted files
                if (!hasUpdates) {
                  for (const [path] of fileListEntry.eventTimestamps) {
                    if (!newEventTimestamps.has(path)) {
                      hasUpdates = true;
                      console.log(colors.yellow(`  → Removed: ${path}`));
                      // Check if this affects the current request path
                      if (
                        requestedPath === "/" || path === requestedPath.slice(1) ||
                        (requestedPath.endsWith("/") && path.startsWith(requestedPath.slice(1)))
                      ) {
                        currentPathAffected = true;
                      }
                    }
                  }
                }
              }

              // Handle the case where files.length === 0
              if (files.length === 0) {
                // Check if a manifest exists but has no files
                const allServerListRelays = Array.from(
                  new Set([...fileEventRelays, ...this.options.profileRelays]),
                );
                const manifestEvent = await getSiteManifestEvent(
                  allServerListRelays,
                  pubkeyHex,
                  identifier,
                );

                if (manifestEvent) {
                  // Manifest exists but still has no files - update cache with empty flag
                  if (!fileListEntry.manifestFoundButEmpty) {
                    hasUpdates = true; // This is a state change (from no manifest to empty manifest)
                    console.log(colors.yellow(`  → Manifest found but still contains no files`));
                  }
                  // Update cache to reflect current state
                  this.fileListCache.set(siteCacheKey, {
                    files: [],
                    timestamp: Date.now(),
                    loading: false,
                    eventTimestamps: new Map(),
                    manifestFoundButEmpty: true,
                  });
                  await this.saveFileListManifest(
                    this.options.cacheDir,
                    npub,
                    identifier,
                    manifestEvent,
                  );
                } else {
                  // No manifest found - if we had an empty manifest, this is a change
                  if (fileListEntry.manifestFoundButEmpty) {
                    hasUpdates = true;
                    console.log(colors.yellow(`  → Manifest no longer exists`));
                    // Remove the cache entry
                    this.fileListCache.delete(siteCacheKey);
                  } else {
                    console.log(
                      colors.gray(
                        `  → No files returned from update check (keeping existing cache)`,
                      ),
                    );
                  }
                }
                // Don't continue with file update logic if no files
                if (!hasUpdates) {
                  return;
                }
              } else if (hasUpdates) {
                // Files found - update cache and clear empty manifest flag
                // Extract the manifest event from the first file (all files share the same event)
                const manifestEvent = files[0]?.event;

                this.fileListCache.set(siteCacheKey, {
                  files,
                  timestamp: Date.now(),
                  loading: false,
                  eventTimestamps: newEventTimestamps,
                  manifestFoundButEmpty: false, // Clear the flag since we now have files
                });
                console.log(colors.gray(`  → Found ${files.length} files (cache updated)`));

                // Save to disk cache if we have the manifest event
                if (manifestEvent) {
                  const manifestId = manifestEvent.id || "unknown";
                  console.log(
                    colors.gray(
                      `  → Manifest id: ${manifestId.slice(0, 16)}... (kind ${manifestEvent.kind})`,
                    ),
                  );
                  await this.saveFileListManifest(
                    this.options.cacheDir,
                    npub,
                    identifier,
                    manifestEvent,
                  );
                } else {
                  console.log(
                    colors.yellow(`  → Files missing manifest event, skipping disk cache save`),
                  );
                }

                if (currentPathAffected) {
                  console.log(
                    colors.yellow(`  → Current path affected by updates, client should refresh`),
                  );
                  // Mark this path as updated
                  this.pathUpdateTimestamps.set(`${siteCacheKey}:${requestedPath}`, Date.now());
                }
              } else {
                console.log(colors.gray(`  → No updates found (${files.length} files)`));
              }
            } catch (error) {
              console.log(colors.red(`  → Background update check failed: ${error}`));
            } finally {
              // Remove from ongoing checks
              this.backgroundUpdateChecks.delete(siteCacheKey);
            }
          })();

          // Track this background check
          this.backgroundUpdateChecks.set(siteCacheKey, updatePromise);
        }
      }

      // At this point, fileListEntry should be defined
      if (!fileListEntry) {
        const elapsed = Math.round(performance.now() - startTime);
        console.log(
          colors.red(`  → Internal error: file list entry is undefined - ${elapsed}ms`),
        );
        return new Response("Internal server error", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // If still loading, show loading page
      if (fileListEntry.loading) {
        const loadingHtml = this.generateLoadingPage(npub, identifier, profileData?.profile);
        const elapsed = Math.round(performance.now() - startTime);
        console.log(colors.blue(`  → Loading page served (still loading) - ${elapsed}ms`));
        return new Response(loadingHtml, {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "Refresh": "2", // Auto-refresh every 2 seconds
          },
        });
      }

      if (fileListEntry.files.length === 0) {
        const elapsed = Math.round(performance.now() - startTime);
        // Check if manifest exists but is empty
        if (fileListEntry.manifestFoundButEmpty) {
          console.log(colors.yellow(`  → Manifest found but no files - ${elapsed}ms`));
          const noContentHtml = this.generateNoContentPage(npub, identifier, profileData?.profile);
          return new Response(noContentHtml, {
            status: 200,
            headers: {
              "Content-Type": "text/html",
            },
          });
        }
        console.log(colors.yellow(`  → No files found - ${elapsed}ms`));
        const siteLabel = identifier ? `named site "${identifier}"` : "root site";
        return new Response(`No files found for this ${siteLabel}`, {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Handle root path - look for default files
      let targetPath = requestedPath;
      let foundFile = null;
      let rootIsCompressed = false;
      let rootCompressionType: "br" | "gz" | null = null;

      // Check for compressed versions support
      const acceptEncoding = request.headers.get("accept-encoding") || "";
      const supportsBrotli = acceptEncoding.includes("br");
      const supportsGzip = acceptEncoding.includes("gzip");

      // Debug log the Accept-Encoding header
      if (acceptEncoding) {
        log.debug(
          `Accept-Encoding: ${acceptEncoding}, supportsBrotli: ${supportsBrotli}, supportsGzip: ${supportsGzip}`,
        );
      }

      if (requestedPath === "/") {
        const defaultFiles = [
          "index.html",
          "index.htm",
          "README.md",
          "docs/index.html",
          "dist/index.html",
          "public/index.html",
          "build/index.html",
          "404.html",
          "docs/404.html",
        ];

        // Build a list of all possible files including compressed versions
        const possibleFiles: string[] = [];
        for (const defaultFile of defaultFiles) {
          // Add compressed versions first (preferred)
          if (supportsBrotli) {
            possibleFiles.push(defaultFile + ".br");
          }
          if (supportsGzip) {
            possibleFiles.push(defaultFile + ".gz");
          }
          // Add uncompressed version
          possibleFiles.push(defaultFile);
        }

        for (const possibleFile of possibleFiles) {
          const file = fileListEntry.files.find((f) => {
            const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedPath === possibleFile;
          });

          if (file) {
            foundFile = file;
            // Check if this is a compressed version
            if (possibleFile.endsWith(".br")) {
              targetPath = "/" + possibleFile.slice(0, -3); // Remove .br extension
              rootIsCompressed = true;
              rootCompressionType = "br";
            } else if (possibleFile.endsWith(".gz")) {
              targetPath = "/" + possibleFile.slice(0, -3); // Remove .gz extension
              rootIsCompressed = true;
              rootCompressionType = "gz";
            } else {
              targetPath = "/" + possibleFile;
            }
            break;
          }
        }

        // If still root, show directory listing
        if (targetPath === "/") {
          const html = this.generateDirectoryListing(npub, identifier, fileListEntry.files);
          const elapsed = Math.round(performance.now() - startTime);
          console.log(colors.gray(`  → Directory listing served - ${elapsed}ms`));
          return new Response(html, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
      }

      // Find the requested file
      const normalizedRequestPath = targetPath.startsWith("/") ? targetPath.slice(1) : targetPath;
      let file: FileEntry | null = foundFile;

      log.debug(
        `Looking for file: ${normalizedRequestPath}, supportsBrotli: ${supportsBrotli}, supportsGzip: ${supportsGzip}`,
      );

      // Build a list of files to try in order of preference
      const filesToTry: Array<
        { file: FileEntry | null; compressed: boolean; type: "br" | "gz" | null }
      > = [];

      // If we haven't found a file yet (not from root path handling)
      if (!file) {
        // Add compressed versions first if browser supports them
        if (supportsBrotli) {
          const brPath = normalizedRequestPath + ".br";
          log.debug(`Checking for brotli version: ${brPath}`);

          const brFile = fileListEntry.files.find((f) => {
            const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedFilePath === brPath;
          });

          if (brFile) {
            filesToTry.push({ file: brFile, compressed: true, type: "br" });
            log.debug(`Found brotli version: ${brPath}`);
          }
        }

        if (supportsGzip) {
          const gzPath = normalizedRequestPath + ".gz";
          log.debug(`Checking for gzip version: ${gzPath}`);

          const gzFile = fileListEntry.files.find((f) => {
            const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedFilePath === gzPath;
          });

          if (gzFile) {
            filesToTry.push({ file: gzFile, compressed: true, type: "gz" });
            log.debug(`Found gzip version: ${gzPath}`);
          }
        }

        // Always add the uncompressed version as fallback
        const uncompressedFile = fileListEntry.files.find((f) => {
          const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
          return normalizedFilePath === normalizedRequestPath;
        });

        if (uncompressedFile) {
          filesToTry.push({ file: uncompressedFile, compressed: false, type: null });
          log.debug(`Found uncompressed version: ${normalizedRequestPath}`);
        }
      } else {
        // We already have a file from root path handling
        // But we should still add all available versions for fallback

        // First add the one we found
        filesToTry.push({ file, compressed: rootIsCompressed, type: rootCompressionType });

        // Then add other versions as fallbacks
        // Extract the base path without compression extension
        const basePath = targetPath.startsWith("/") ? targetPath.slice(1) : targetPath;

        // Add other compressed versions if they exist and weren't already added
        if (rootCompressionType !== "br" && supportsBrotli) {
          const brPath = basePath + ".br";
          const brFile = fileListEntry.files.find((f) => {
            const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedFilePath === brPath;
          });

          if (brFile && brFile !== file) {
            filesToTry.push({ file: brFile, compressed: true, type: "br" });
            log.debug(`Added alternative brotli version: ${brPath}`);
          }
        }

        if (rootCompressionType !== "gz" && supportsGzip) {
          const gzPath = basePath + ".gz";
          const gzFile = fileListEntry.files.find((f) => {
            const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedFilePath === gzPath;
          });

          if (gzFile && gzFile !== file) {
            filesToTry.push({ file: gzFile, compressed: true, type: "gz" });
            log.debug(`Added alternative gzip version: ${gzPath}`);
          }
        }

        // Add uncompressed version if we started with compressed
        if (rootIsCompressed) {
          const uncompressedFile = fileListEntry.files.find((f) => {
            const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedFilePath === basePath;
          });

          if (uncompressedFile && uncompressedFile !== file) {
            filesToTry.push({ file: uncompressedFile, compressed: false, type: null });
            log.debug(`Added uncompressed fallback: ${basePath}`);
          }
        }
      }

      // If path ends with / or looks like a directory (no extension), try directory index files
      if (
        filesToTry.length === 0 && (requestedPath.endsWith("/") || !requestedPath.includes("."))
      ) {
        const dirPath = requestedPath.endsWith("/")
          ? normalizedRequestPath
          : normalizedRequestPath + "/";
        const indexFiles = ["index.html", "index.htm", "README.md"];

        for (const indexFile of indexFiles) {
          const indexPath = dirPath + indexFile;
          let foundIndexFile = false;

          // Check for compressed versions first
          if (supportsBrotli) {
            const brPath = indexPath + ".br";
            const brFile = fileListEntry.files.find((f) => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === brPath;
            });

            if (brFile) {
              filesToTry.push({ file: brFile, compressed: true, type: "br" });
              foundIndexFile = true;
            }
          }

          if (supportsGzip) {
            const gzPath = indexPath + ".gz";
            const gzFile = fileListEntry.files.find((f) => {
              const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
              return normalizedFilePath === gzPath;
            });

            if (gzFile) {
              filesToTry.push({ file: gzFile, compressed: true, type: "gz" });
              foundIndexFile = true;
            }
          }

          // Always check for uncompressed version
          const indexFileEntry = fileListEntry.files.find((f) => {
            const normalizedFilePath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedFilePath === indexPath;
          });

          if (indexFileEntry) {
            filesToTry.push({ file: indexFileEntry, compressed: false, type: null });
            foundIndexFile = true;
          }

          // If we found any version of this index file, stop looking
          if (foundIndexFile) {
            log.debug(
              `Directory ${requestedPath} resolved to ${indexPath} (with ${filesToTry.length} variants)`,
            );
            break;
          }
        }
      }

      // If no files found yet, try 404.html
      if (filesToTry.length === 0) {
        let found404 = false;

        // Try to find /404.html as fallback per nsite specification
        // Check for compressed versions first if supported
        if (supportsBrotli) {
          const notFoundBr = fileListEntry.files.find((f) => {
            const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedPath === "404.html.br";
          });

          if (notFoundBr && notFoundBr.sha256) {
            filesToTry.push({ file: notFoundBr, compressed: true, type: "br" });
            found404 = true;
            console.log(
              colors.yellow(`  → File not found: ${requestedPath}, will try /404.html.br`),
            );
          }
        }

        if (supportsGzip) {
          const notFoundGz = fileListEntry.files.find((f) => {
            const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
            return normalizedPath === "404.html.gz";
          });

          if (notFoundGz && notFoundGz.sha256) {
            filesToTry.push({ file: notFoundGz, compressed: true, type: "gz" });
            found404 = true;
            console.log(
              colors.yellow(`  → File not found: ${requestedPath}, will try /404.html.gz`),
            );
          }
        }

        // Always try uncompressed 404.html
        const notFoundFile = fileListEntry.files.find((f) => {
          const normalizedPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
          return normalizedPath === "404.html";
        });

        if (notFoundFile && notFoundFile.sha256) {
          filesToTry.push({ file: notFoundFile, compressed: false, type: null });
          found404 = true;
          console.log(colors.yellow(`  → File not found: ${requestedPath}, will try /404.html`));
        }

        // If still no file found, return error response
        if (!found404) {
          const elapsed = Math.round(performance.now() - startTime);
          console.log(
            colors.red(
              `  → File not found: ${requestedPath} (no 404.html available) - ${elapsed}ms`,
            ),
          );

          // Generate a simple HTML 404 page if the request appears to be for HTML content
          const wantsHtml = requestedPath === "/" || requestedPath.endsWith(".html") ||
            requestedPath.endsWith(".htm") ||
            !requestedPath.includes(".") || request.headers.get("accept")?.includes("text/html");

          if (wantsHtml) {
            const html404 = `<!DOCTYPE html>
<html>
<head>
  <title>404 - Not Found</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
    h1 { color: #666; }
    p { color: #999; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>404 - Not Found</h1>
  <p>The requested file <code>${requestedPath}</code> was not found.</p>
  <p style="font-size: 0.9em;">This nsite does not have a custom 404.html page.</p>
</body>
</html>`;

            return new Response(html404, {
              status: 404,
              headers: { "Content-Type": "text/html" },
            });
          }

          // Return plain text for non-HTML requests
          return new Response(`File not found: ${requestedPath}`, {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      // Try to download files in order of preference
      let fileData: ByteArray | null = null;
      let successfulFile: FileEntry | null = null;

      for (const fileOption of filesToTry) {
        if (!fileOption.file || !fileOption.file.sha256) continue;

        const tryFile = fileOption.file;
        const fileSha256 = tryFile.sha256!; // We already checked this is not undefined
        // Use different cache keys for compressed vs decompressed content
        const rawCacheKey = `${siteCacheKey}-${fileSha256}-raw`;
        const decompressedCacheKey = `${siteCacheKey}-${fileSha256}-decompressed`;
        const isStale = this.isCacheStale(fileListEntry, tryFile);

        let currentFileData: ByteArray | null = null;
        let isAlreadyDecompressed = false;

        // For compressed files, check if we have a decompressed version cached
        if (fileOption.compressed && !isStale) {
          // Try decompressed cache first (memory)
          const memCachedDecompressed = this.fileCache.get(decompressedCacheKey);
          if (memCachedDecompressed) {
            currentFileData = memCachedDecompressed.data;
            isAlreadyDecompressed = true;
            log.debug(`Loaded decompressed ${tryFile.path} from memory cache`);
          }

          // Try decompressed cache (disk)
          if (!currentFileData && this.options.cacheDir) {
            currentFileData = await this.loadCachedFile(
              this.options.cacheDir,
              npub,
              identifier,
              fileSha256 + "-decompressed",
            );
            if (currentFileData) {
              isAlreadyDecompressed = true;
              log.debug(`Loaded decompressed ${tryFile.path} from disk cache`);
            }
          }
        }

        // If no decompressed version, try raw cache
        if (!currentFileData && !isStale) {
          // Try persistent cache first if available
          if (this.options.cacheDir) {
            currentFileData = await this.loadCachedFile(
              this.options.cacheDir,
              npub,
              identifier,
              fileSha256,
            );
            if (currentFileData) {
              log.debug(`Loaded raw ${tryFile.path} from disk cache`);
            }
          }

          // Check memory cache if no persistent cache or file not found
          if (!currentFileData) {
            const memCached = this.fileCache.get(rawCacheKey);
            if (memCached) {
              currentFileData = memCached.data;
              log.debug(`Loaded raw ${tryFile.path} from memory cache`);
            }
          }
        }

        // Try to download the file if not in cache
        if (!currentFileData) {
          const hashSnippet = tryFile.sha256 ? ` ${tryFile.sha256.slice(0, 10)}...` : "";
          console.log(
            colors.gray(
              `  → Downloading ${colors.cyan(tryFile.path)}${hashSnippet}${
                isStale ? " (updated)" : ""
              }`,
            ),
          );

          // Use servers from profile data if available, otherwise fall back to configured servers
          const userServers = profileData?.serverList && profileData.serverList.length > 0
            ? profileData.serverList
            : this.options.servers;

          log.debug(
            `Using ${userServers.length} servers for download: ${userServers.join(", ")}`,
          );

          for (const server of userServers) {
            try {
              log.debug(`Attempting download from ${server} for hash ${fileSha256}`);
              const downloadService = DownloadService.create();
              const downloadedData = await downloadService.downloadFromServer(server, fileSha256);
              if (downloadedData) {
                currentFileData = downloadedData;

                // Save raw file to memory cache (no expiration - only invalidated by new events)
                this.fileCache.set(rawCacheKey, {
                  data: currentFileData,
                  timestamp: Date.now(),
                  sha256: fileSha256,
                });

                // Save raw file to disk cache if available
                if (this.options.cacheDir) {
                  await this.saveCachedFile(
                    this.options.cacheDir,
                    npub,
                    identifier,
                    fileSha256,
                    currentFileData,
                  );
                  log.debug(`Saved raw ${tryFile.path} to disk cache`);
                }

                console.log(colors.gray(`  → Downloaded from ${server}`));
                break;
              } else {
                log.debug(`Server ${server} returned no data for hash ${fileSha256}`);
              }
            } catch (error) {
              log.debug(`Failed to download from ${server}: ${error}`);
            }
          }

          if (!currentFileData) {
            console.log(
              colors.gray(
                `  → Could not download ${tryFile.path} from ${userServers.length} servers, trying alternative formats...`,
              ),
            );
            log.debug(
              `Failed to download ${tryFile.path} from any of: ${userServers.join(", ")}`,
            );
            continue;
          }
        }

        // Now we have the file data, try to decompress if needed
        if (
          fileOption.compressed && fileOption.type && currentFileData && !isAlreadyDecompressed
        ) {
          if (fileOption.type === "br") {
            // Decompress Brotli
            try {
              const decompressed = brotliDecompress(currentFileData) as ByteArray;
              console.log(
                colors.gray(
                  `  → Decompressed Brotli data: ${this.formatFileSize(decompressed.byteLength)}`,
                ),
              );
              fileData = decompressed;
              successfulFile = tryFile;

              // Cache the decompressed version
              this.fileCache.set(decompressedCacheKey, {
                data: decompressed,
                timestamp: Date.now(),
                sha256: fileSha256,
              });
              if (this.options.cacheDir) {
                await this.saveCachedFile(
                  this.options.cacheDir,
                  npub,
                  identifier,
                  fileSha256 + "-decompressed",
                  decompressed,
                );
                log.debug(`Saved decompressed ${tryFile.path} to disk cache`);
              }

              // Successfully decompressed
              break; // Success!
            } catch (brError) {
              log.debug(`Brotli decompression error: ${brError}`);
              console.log(
                colors.gray(`  → Brotli version corrupted, trying alternative formats...`),
              );
              // Clear the failed file from cache to prevent repeated failures
              this.fileCache.delete(rawCacheKey);
              this.fileCache.delete(decompressedCacheKey);
              continue; // Try next option
            }
          } else if (fileOption.type === "gz") {
            // Decompress Gzip
            try {
              const decompressed = await new Response(
                new Response(currentFileData).body!.pipeThrough(new DecompressionStream("gzip")),
              ).arrayBuffer();
              fileData = new Uint8Array(decompressed);
              console.log(
                colors.gray(
                  `  → Decompressed Gzip data: ${this.formatFileSize(fileData.byteLength)}`,
                ),
              );
              successfulFile = tryFile;

              // Cache the decompressed version
              this.fileCache.set(decompressedCacheKey, {
                data: fileData,
                timestamp: Date.now(),
                sha256: fileSha256,
              });
              if (this.options.cacheDir) {
                await this.saveCachedFile(
                  this.options.cacheDir,
                  npub,
                  identifier,
                  fileSha256 + "-decompressed",
                  fileData,
                );
                log.debug(`Saved decompressed ${tryFile.path} to disk cache`);
              }

              // Successfully decompressed
              break; // Success!
            } catch (gzError) {
              log.debug(`Gzip decompression error: ${gzError}`);
              console.log(
                colors.gray(`  → Gzip version corrupted, trying alternative formats...`),
              );
              // Clear the failed file from cache to prevent repeated failures
              this.fileCache.delete(rawCacheKey);
              this.fileCache.delete(decompressedCacheKey);
              continue; // Try next option
            }
          }
        } else if (isAlreadyDecompressed) {
          // Already decompressed, use as-is
          fileData = currentFileData;
          successfulFile = tryFile;
          log.debug(`Using cached decompressed data for ${tryFile.path}`);
          break; // Success!
        } else {
          // Uncompressed file, use as-is
          fileData = currentFileData;
          successfulFile = tryFile;
          // Uncompressed file
          break; // Success!
        }
      }

      if (!fileData || !successfulFile) {
        const elapsed = Math.round(performance.now() - startTime);
        const userServers = profileData?.serverList && profileData.serverList.length > 0
          ? profileData.serverList
          : this.options.servers;
        console.log(colors.red(`  → Failed to download any version of the file - ${elapsed}ms`));
        log.debug(`No servers had the requested file. Servers tried: ${userServers.join(", ")}`);
        return new Response(
          `Failed to download file from any server. Tried servers: ${userServers.join(", ")}`,
          {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          },
        );
      }

      // Update variables for serving
      file = successfulFile;

      // ETag support: Check for conditional request before processing
      if (file.sha256) {
        const etag = `"${file.sha256}"`;
        const ifNoneMatch = request.headers.get("If-None-Match");

        // If client has the same version cached, return 304 Not Modified
        if (ifNoneMatch === etag) {
          const elapsed = Math.round(performance.now() - startTime);
          console.log(
            colors.gray(
              `  → 304 Not Modified ${
                colors.cyan(file.path.replace(/\.(br|gz)$/, ""))
              } - ${elapsed}ms`,
            ),
          );
          return new Response(null, {
            status: 304,
            headers: {
              "ETag": etag,
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      }

      // Serve the file
      // For 404 pages, use the 404.html content type, otherwise use the target path (without .br/.gz)
      const is404 = (file.path.endsWith("404.html") || file.path.endsWith("404.html.br") ||
        file.path.endsWith("404.html.gz")) &&
        requestedPath !== "/404.html";
      // Use original path (without compression extension) for content type detection
      let contentTypePath: string;
      if (is404) {
        contentTypePath = "404.html";
      } else {
        // Use the actual file path for content type detection
        let originalPath = file.path.startsWith("/") ? file.path.slice(1) : file.path;
        // Remove compression extensions if present
        if (originalPath.endsWith(".br")) {
          originalPath = originalPath.slice(0, -3);
        } else if (originalPath.endsWith(".gz")) {
          originalPath = originalPath.slice(0, -3);
        }
        contentTypePath = originalPath;
      }
      const contentType = this.getContentType(contentTypePath);
      console.log(
        colors.yellow(
          `  → DEBUG: file.path=${file.path}, contentTypePath=${contentTypePath}, contentType=${contentType}`,
        ),
      );
      const elapsed = Math.round(performance.now() - startTime);
      const statusCode = is404 ? 404 : 200;

      const servedPath = file.path.replace(/\.(br|gz)$/, "");
      const servedHash = file.sha256 ? ` ${file.sha256.slice(0, 10)}...` : "";
      console.log(
        colors.gray(
          `  → Served ${colors.cyan(servedPath)}${servedHash} (${
            this.formatFileSize(fileData.byteLength)
          }) - ${elapsed}ms${is404 ? " [404]" : ""}`,
        ),
      );

      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Length": fileData.byteLength.toString(),
        "Cache-Control": "public, max-age=3600", // Browser can cache for 1 hour
      };

      // Add ETag header for efficient caching (based on sha256 hash)
      if (file.sha256) {
        headers["ETag"] = `"${file.sha256}"`;
      }

      // No need for Content-Encoding since we're serving decompressed data
      console.log(
        colors.blue(
          `  → Headers: Content-Type: ${contentType}${
            file.sha256 ? `, ETag: "${file.sha256.slice(0, 16)}..."` : ""
          }`,
        ),
      );

      // For HTML responses, inject auto-refresh script
      if (contentType === "text/html" && !is404) {
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let html = decoder.decode(fileData);

        // Inject update checker script before closing body tag
        const updateScript = `
<script>
(function() {
  const currentPath = '${requestedPath}';
  const npub = '${npub}';
  const startTime = Date.now();

  function checkForUpdates() {
    fetch('/_nsyte/check-updates?path=' + encodeURIComponent(currentPath) + '&since=' + startTime)
      .then(r => r.json())
      .then(data => {
        if (data.hasUpdate) {
          console.log('Page update detected, refreshing...');
          location.reload();
        }
      })
      .catch(err => console.error('Update check failed:', err));
  }

  // Check for updates every 5 seconds
  setInterval(checkForUpdates, 5000);
})();
</script>`;

        // Try to inject before closing body tag, or at the end if not found
        if (html.includes("</body>")) {
          html = html.replace("</body>", updateScript + "</body>");
        } else if (html.includes("</html>")) {
          html = html.replace("</html>", updateScript + "</html>");
        } else {
          html += updateScript;
        }

        fileData = encoder.encode(html);
        headers["Content-Length"] = fileData.byteLength.toString();
      }

      return new Response(fileData, {
        status: statusCode,
        headers,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Error handling request: ${errorMessage}`);

      const elapsed = Math.round(performance.now() - startTime);
      console.log(colors.red(`  → Error: ${errorMessage} - ${elapsed}ms`));

      return new Response(`Error: ${errorMessage}`, {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  /**
   * Generate loading page
   */
  private generateLoadingPage(
    npub: string,
    identifier: string | undefined,
    profile: NostrEvent | null,
  ): string {
    const profileContent = profile ? JSON.parse(profile.content || "{}") : {};
    const name = profileContent.name || profileContent.display_name || npub.slice(0, 12) + "...";
    const siteName = identifier ? `"${identifier}"` : "root site";

    return `<!DOCTYPE html>
<html>
<head>
  <title>Loading ${name}'s nsite...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #fafafa;
      color: #333;
    }
    .container {
      text-align: center;
      max-width: 400px;
      padding: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 400;
      margin-bottom: 1rem;
      color: #555;
    }
    .npub {
      font-family: monospace;
      font-size: 0.875rem;
      color: #999;
      word-break: break-all;
      margin-bottom: 2rem;
    }
    .loader {
      width: 40px;
      height: 40px;
      margin: 0 auto 2rem;
      border: 3px solid #e0e0e0;
      border-top-color: #666;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status {
      font-size: 0.875rem;
      color: #666;
      line-height: 1.5;
    }
    .profile-pic {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      margin: 0 auto 1rem;
      background: #e0e0e0;
      overflow: hidden;
    }
    .profile-pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
</head>
<body>
  <div class="container">
    ${
      profileContent.picture
        ? `<div class="profile-pic"><img src="${profileContent.picture}" alt="${name}" onerror="this.style.display='none'"></div>`
        : ""
    }
    <h1>Loading ${name}'s ${siteName}</h1>
    <div class="npub">${npub}${identifier ? ` (${identifier})` : ""}</div>
    <div class="loader"></div>
    <div class="status">
      Connecting to nostr relays...<br>
      This will only take a moment.
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generate "no content" page for sites with manifest but no files
   */
  private generateNoContentPage(
    npub: string,
    identifier: string | undefined,
    profile: NostrEvent | null,
  ): string {
    const profileContent = profile ? JSON.parse(profile.content || "{}") : {};
    const name = profileContent.name || profileContent.display_name || npub.slice(0, 12) + "...";
    const siteName = identifier ? `"${identifier}"` : "root site";

    return `<!DOCTYPE html>
<html>
<head>
  <title>${name}'s nsite - No Content</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #fafafa;
      color: #333;
    }
    .container {
      text-align: center;
      max-width: 500px;
      padding: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 400;
      margin-bottom: 1rem;
      color: #555;
    }
    .npub {
      font-family: monospace;
      font-size: 0.875rem;
      color: #999;
      word-break: break-all;
      margin-bottom: 2rem;
    }
    .message {
      font-size: 1rem;
      color: #666;
      line-height: 1.6;
      margin-bottom: 1rem;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }
    .profile-pic {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      margin: 0 auto 1rem;
      background: #e0e0e0;
      overflow: hidden;
    }
    .profile-pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
</head>
<body>
  <div class="container">
    ${
      profileContent.picture
        ? `<div class="profile-pic"><img src="${profileContent.picture}" alt="${name}" onerror="this.style.display='none'"></div>`
        : ""
    }
    <div class="icon">📭</div>
    <h1>${name}'s ${siteName}</h1>
    <div class="npub">${npub}${identifier ? ` (${identifier})` : ""}</div>
    <div class="message">
      This nsite exists but currently has no content.<br>
      Files may be added in the future.
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generate HTML directory listing
   */
  private generateDirectoryListing(
    npub: string,
    identifier: string | undefined,
    files: FileEntry[],
  ): string {
    const fileList = files.map((file) => {
      const size = file.size ? this.formatFileSize(file.size) : "unknown";
      return `<li><a href="/${file.path}">${file.path}</a> (${size})</li>`;
    }).join("\n");

    const siteTitle = identifier ? `nsite: ${npub} (${identifier})` : `nsite: ${npub}`;

    return `<!DOCTYPE html>
<html>
<head>
  <title>${siteTitle}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #333; }
    ul { list-style: none; padding: 0; }
    li { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .info { background: #f0f0f0; padding: 1rem; border-radius: 4px; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <h1>${siteTitle}</h1>
  <div class="info">
    <strong>Files:</strong> ${files.length}<br>
    <strong>Total size:</strong> ${
      this.formatFileSize(files.reduce((sum, f) => sum + (f.size || 0), 0))
    }
  </div>
  <ul>
    ${fileList || "<li>No files found</li>"}
  </ul>
</body>
</html>`;
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(filename: string): string {
    const ext = extname(filename).toLowerCase();
    const type = contentType(ext);
    return type || "application/octet-stream";
  }

  /**
   * Format file size in human readable format
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  /**
   * Load cached file from disk
   */
  private async loadCachedFile(
    cacheDir: string | null,
    npub: string,
    identifier: string | undefined,
    sha256: string,
  ): Promise<ByteArray | null> {
    if (!cacheDir) return null;
    try {
      const siteDir = identifier || "root";
      const filePath = join(cacheDir, npub, siteDir, sha256);
      const data = await Deno.readFile(filePath);
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Save file to disk cache
   */
  private async saveCachedFile(
    cacheDir: string | null,
    npub: string,
    identifier: string | undefined,
    sha256: string,
    data: ByteArray,
  ): Promise<void> {
    if (!cacheDir) return;
    const siteDir = identifier || "root";
    const dirPath = join(cacheDir, npub, siteDir);
    await ensureDir(dirPath);
    const filePath = join(dirPath, sha256);
    await Deno.writeFile(filePath, data);
  }

  /**
   * Save file list manifest to disk cache
   */
  private async saveFileListManifest(
    cacheDir: string | null,
    npub: string,
    identifier: string | undefined,
    manifestEvent: NostrEvent,
  ): Promise<void> {
    if (!cacheDir) return;

    const siteDir = identifier || "root";
    const dirPath = join(cacheDir, npub, siteDir);
    await ensureDir(dirPath);
    const manifestPath = join(dirPath, "manifest.json");

    // Save the raw Nostr event
    await Deno.writeTextFile(manifestPath, JSON.stringify(manifestEvent, null, 2));
  }

  /**
   * Check if cached file is stale based on event timestamps
   */
  private isCacheStale(
    fileListEntry: {
      files: FileEntry[];
      timestamp: number;
      loading?: boolean;
      eventTimestamps?: Map<string, number>;
    },
    file: FileEntry,
  ): boolean {
    if (!fileListEntry.eventTimestamps || !file.event) {
      return false;
    }

    const cachedEventTime = fileListEntry.eventTimestamps.get(file.path);
    const currentEventTime = file.event.created_at;

    return cachedEventTime !== undefined && currentEventTime > cachedEventTime;
  }

  /**
   * Load file list from disk cache if available
   */
  private async loadFileListFromDiskCache(
    cacheDir: string | null,
    npub: string,
    identifier: string | undefined,
  ): Promise<
    | { files: FileEntry[]; eventTimestamps: Map<string, number>; manifestFoundButEmpty?: boolean }
    | null
  > {
    if (!cacheDir) return null;

    try {
      const siteDir = identifier || "root";
      const manifestPath = join(cacheDir, npub, siteDir, "manifest.json");
      const manifestData = await Deno.readTextFile(manifestPath);
      const parsed = JSON.parse(manifestData);

      // Check if this is the old format (has 'files' property)
      if (parsed.files && Array.isArray(parsed.files)) {
        // Old format - return null to force refresh
        console.log(colors.gray(`  → Old cache format detected, will refresh`));
        return null;
      }

      // New format: it's a Nostr event
      const manifestEvent = parsed as NostrEvent;

      // Validate it's a proper Nostr event
      if (!manifestEvent.kind || !manifestEvent.tags || !manifestEvent.created_at) {
        console.log(colors.gray(`  → Invalid manifest event format, will refresh`));
        return null;
      }

      // Use getManifestFiles() to extract files from the manifest event
      const fileMappings = getManifestFiles(manifestEvent);

      // If manifest exists but has no files, return empty with flag
      if (fileMappings.length === 0) {
        console.log(colors.gray(`  → Manifest found in cache but contains no files`));
        return {
          files: [],
          eventTimestamps: new Map(),
          manifestFoundButEmpty: true,
        };
      }

      // Reconstruct FileEntry[] from the parsed files
      const files: FileEntry[] = fileMappings.map((mapping) => ({
        path: mapping.path,
        sha256: mapping.sha256,
        event: manifestEvent,
        size: 0,
      }));

      // Create eventTimestamps Map using the manifest event's created_at for all files
      // (since all files come from the same manifest event)
      const eventTimestamps = new Map<string, number>();
      files.forEach((file) => {
        eventTimestamps.set(file.path, manifestEvent.created_at);
      });

      return { files, eventTimestamps };
    } catch {
      // No manifest - for backward compatibility, return null
      console.log(colors.gray(`  → No manifest.json or error reading cache`));
      return null;
    }
  }

  /**
   * Open browser with the given URL (cross-platform)
   */
  private async openBrowser(url: string): Promise<void> {
    try {
      const os = Deno.build.os;
      let cmd: string[];

      switch (os) {
        case "darwin": // macOS
          cmd = ["open", url];
          break;
        case "windows":
          cmd = ["cmd", "/c", "start", url];
          break;
        case "linux":
          // Try xdg-open first, then fallback to other options
          cmd = ["xdg-open", url];
          break;
        default:
          console.log(
            colors.yellow(`⚠️  Cannot auto-open browser on ${os}. Please manually open: ${url}`),
          );
          return;
      }

      const command = new Deno.Command(cmd[0], {
        args: cmd.slice(1),
        stdout: "null",
        stderr: "null",
      });

      const { success } = await command.output();

      if (success) {
        console.log(colors.green(`🌐 Browser opened automatically`));
      } else if (os === "linux") {
        // Try alternative Linux browsers
        const alternatives = [
          ["firefox", url],
          ["google-chrome", url],
          ["chromium-browser", url],
          ["sensible-browser", url],
        ];

        for (const alt of alternatives) {
          try {
            const altCmd = new Deno.Command(alt[0], {
              args: alt.slice(1),
              stdout: "null",
              stderr: "null",
            });
            const result = await altCmd.output();
            if (result.success) {
              console.log(colors.green(`🌐 Browser opened with ${alt[0]}`));
              return;
            }
          } catch {
            // Try next alternative
          }
        }

        console.log(colors.yellow(`⚠️  Could not auto-open browser. Please manually open: ${url}`));
      }
    } catch (error) {
      log.debug(`Failed to open browser: ${error}`);
      console.log(colors.yellow(`⚠️  Could not auto-open browser. Please manually open: ${url}`));
    }
  }
}
