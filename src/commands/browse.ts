import { colors } from "@cliffy/ansi/colors";
import nsyte from "./root.ts";
import { Keypress } from "@cliffy/keypress";
import { existsSync } from "@std/fs/exists";
import { join } from "@std/path";
import { fetchAllSites, listRemoteFilesWithProgress } from "../lib/browse-loader.ts";
import { readProjectFile } from "../lib/config.ts";
import { NSYTE_BROADCAST_RELAYS } from "../lib/constants.ts";
import { handleError } from "../lib/error-utils.ts";
import { DEFAULT_IGNORE_PATTERNS, type IgnoreRule, parseIgnorePatterns } from "../lib/files.ts";
import { createLogger } from "../lib/logger.ts";
import { fetchSiteManifestEvent } from "../lib/nostr.ts";
import { resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
import { extractServersFromEvent, extractServersFromManifestEvents } from "../lib/utils.ts";
import {
  handleAuthInput,
  handleAuthSelection,
  handleDeleteConfirmation,
  handleDetailModeKey,
  handleFilterMode,
  handleListModeKey,
} from "../ui/browse/handlers.ts";
import {
  enterAlternateScreen,
  exitAlternateScreen,
  getTerminalSize,
  render,
  renderLoadingScreen,
  renderUpdate,
  showCursor,
} from "../ui/browse/renderer.ts";
import { createInitialState, updatePropagationStats } from "../ui/browse/state.ts";
import { RELAY_COLORS, SERVER_COLORS } from "./list.ts";

const log = createLogger("browse");

export function registerBrowseCommand(): void {
  nsyte
    .command("browse")
    .description("Interactive TUI browser for files on the nostr network")
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
      "--use-fallback-relays",
      "Include default nsyte relays in addition to configured/user relays.",
    )
    .option("--use-fallbacks", "Enable all fallbacks (currently only relays for this command).")
    .action(async (options) => {
      try {
        let useDiscoveryRelays = false;
        let previousPubkey: string | undefined = undefined;

        // Loop to allow identity switching
        while (true) {
          // Check if we have explicit auth options or project config
          const hasExplicitAuth = options.pubkey || options.sec;
          const projectConfig = readProjectFile(options.config);
          const hasProjectAuth = projectConfig?.bunkerPubkey;

          let pubkey: string;

          // Show menu if no auth provided and not in a project, or if switching identity
          if ((!hasExplicitAuth && !hasProjectAuth) || useDiscoveryRelays) {
            // Show interactive menu
            const { showBrowseMenu } = await import("../ui/browse/menu.ts");
            const result = await showBrowseMenu(previousPubkey);

            if (result.type === "bunker") {
              // Use bunker from secrets manager
              pubkey = result.value;
            } else {
              pubkey = result.value;
            }

            previousPubkey = undefined;
          } else {
            // Use normal resolution
            pubkey = await resolvePubkey(options);
          }

          // Enter TUI after auth is resolved
          enterAlternateScreen();
          renderLoadingScreen("Initializing...");

          // Use discovery relays if identity was switched or no project
          const allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;
          const relays = useDiscoveryRelays || (!hasExplicitAuth && !hasProjectAuth)
            ? resolveRelays({}, null, true) // Force discovery relays for discovery mode
            : (() => {
              const configuredRelays = options.relays !== undefined
                ? resolveRelays(options, projectConfig, false)
                : (projectConfig?.relays || []);
              let selected = [...configuredRelays];

              if (allowFallbackRelays) {
                selected = Array.from(new Set([...selected, ...NSYTE_BROADCAST_RELAYS]));
              }

              if (selected.length === 0) {
                if (allowFallbackRelays) {
                  selected = NSYTE_BROADCAST_RELAYS;
                  console.log(
                    colors.yellow("⚠️  Using default relays because none were configured."),
                  );
                } else {
                  console.log(colors.red("✗ No relays configured and fallbacks disabled."));
                  Deno.exit(1);
                }
              }

              return selected;
            })();

          renderLoadingScreen("Loading configuration...");

          // Load ignore rules
          const cwd = Deno.cwd();
          const ignoreFilePath = join(cwd, ".nsite-ignore");
          let ignoreRules: IgnoreRule[] = parseIgnorePatterns(DEFAULT_IGNORE_PATTERNS);

          if (existsSync(ignoreFilePath)) {
            try {
              const ignoreContent = await Deno.readTextFile(ignoreFilePath);
              const customPatterns = ignoreContent.split("\n").map((l) => l.trim()).filter((l) =>
                l && !l.startsWith("#")
              );
              ignoreRules = parseIgnorePatterns([...DEFAULT_IGNORE_PATTERNS, ...customPatterns]);
            } catch (error) {
              log.warn(`Failed to read .nsite-ignore file: ${error}`);
            }
          }

          // Fetch all sites for the pubkey
          const sites = await fetchAllSites(relays, pubkey);

          if (sites.length === 0) {
            exitAlternateScreen();
            showCursor();
            console.log(colors.yellow("No sites found for this user."));
            Deno.exit(0);
          }

          // Loop to allow site switching
          while (true) {
            // Show site selection menu if multiple sites exist, or auto-select if only one
            let selectedSiteIdentifier: string | null;
            let selectedSiteName: string;

            if (sites.length > 1) {
              const { showSiteSelectionMenu } = await import("../ui/browse/menu.ts");
              selectedSiteIdentifier = await showSiteSelectionMenu(sites);

              // Determine the selected site name for display
              if (selectedSiteIdentifier === null) {
                const rootSite = sites.find((s) => s.type === "root");
                selectedSiteName = rootSite?.title || "Root Site";
              } else {
                const namedSite = sites.find((s) => s.identifier === selectedSiteIdentifier);
                selectedSiteName = namedSite?.title || selectedSiteIdentifier;
              }

              // Re-enter alternate screen after menu
              enterAlternateScreen();
            } else {
              // Auto-select the only site
              const site = sites[0];
              selectedSiteIdentifier = site.type === "root" ? null : site.identifier!;
              selectedSiteName = site.title ||
                (site.type === "root" ? "Root Site" : site.identifier!);
            }

            // Fetch files for the selected site
            const files = await listRemoteFilesWithProgress(
              relays,
              pubkey,
              false,
              selectedSiteIdentifier,
            );

            if (files.length === 0) {
              exitAlternateScreen();
              showCursor();
              console.log(colors.yellow(`No files found in ${selectedSiteName}.`));
              Deno.exit(0);
            }

            renderLoadingScreen("Processing files...", `${files.length} unique files found`);

            // Create color mappings
            const relayColorMap = new Map<string, (str: string) => string>();
            const serverColorMap = new Map<string, (str: string) => string>();

            const allRelays = new Set<string>();
            const allServers = new Set<string>();

            files.forEach((file) => {
              file.foundOnRelays.forEach((relay: string) => allRelays.add(relay));
              file.availableOnServers.forEach((server: string) => allServers.add(server));
            });

            // Sort relays and servers for deterministic color/symbol assignment
            Array.from(allRelays).sort().forEach((relay, index) => {
              relayColorMap.set(relay, RELAY_COLORS[index % RELAY_COLORS.length]);
            });

            Array.from(allServers).sort().forEach((server, index) => {
              serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length]);
            });

            // Update server color map when blossom servers are loaded
            const updateServerColorMap = (blossomServers: string[]) => {
              const allServersSet = new Set(Array.from(allServers));
              blossomServers.forEach((server) => allServersSet.add(server));

              // Rebuild color map with all servers (existing + blossom)
              serverColorMap.clear();
              Array.from(allServersSet).sort().forEach((server, index) => {
                serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length]);
              });
            };

            renderLoadingScreen(
              "Building file tree...",
              `${allRelays.size} relays • ${allServers.size} servers`,
            );

            // Initialize state
            const { rows } = Deno.consoleSize();
            const state = createInitialState(
              files,
              rows - 5, // Header (2) + Path row (1) + Footer (2)
              relayColorMap,
              serverColorMap,
              ignoreRules,
              pubkey,
              undefined, // Don't store signer in state
              selectedSiteName,
              sites.length > 1, // hasMultipleSites
            );

            // Store options for later use in delete handler
            state.authOptions = {
              sec: options.sec,
            };

            // Set up terminal resize handler
            let resizeTimeout: number | undefined;
            const handleResize = () => {
              if (resizeTimeout) {
                clearTimeout(resizeTimeout);
              }
              resizeTimeout = setTimeout(() => {
                // Update page size based on new terminal size
                const { rows } = getTerminalSize();
                state.pageSize = rows - 5; // Header (2) + Path row (1) + Footer (2)
                // Ensure selected index is still valid
                const maxIndex =
                  Math.min((state.page + 1) * state.pageSize, state.treeItems.length) -
                  1;
                if (state.selectedIndex > maxIndex) {
                  state.selectedIndex = maxIndex;
                }
                render(state);
              }, 100);
            };

            // Listen for terminal resize
            Deno.addSignalListener("SIGWINCH", handleResize);

            // Create throttled render function to prevent flickering
            let renderTimer: number | null = null;
            let lastRenderTime = 0;
            const RENDER_THROTTLE_MS = 100; // Max 10 renders per second

            const throttledRender = (forceImmediate = false) => {
              const now = Date.now();
              const timeSinceLastRender = now - lastRenderTime;

              if (forceImmediate || timeSinceLastRender >= RENDER_THROTTLE_MS) {
                // Render immediately
                if (renderTimer) {
                  clearTimeout(renderTimer);
                  renderTimer = null;
                }
                render(state);
                lastRenderTime = now;
              } else if (!renderTimer) {
                // Schedule a render
                const delay = RENDER_THROTTLE_MS - timeSinceLastRender;
                renderTimer = setTimeout(() => {
                  render(state);
                  lastRenderTime = Date.now();
                  renderTimer = null;
                }, delay);
              }
            };

            // Initial render
            render(state);

            // Start initial blossom server check in background (don't await)
            const { checkBlossomServersForFiles, checkBlossomServersForFile } = await import(
              "../lib/browse-loader.ts"
            );
            const { fetchServerListEvents } = await import("../lib/nostr.ts");

            // Non-blocking function to check remaining files
            const checkBlossomServersWithYielding = async (
              relays: string[],
              pubkey: string,
              files: typeof state.files,
              servers: string[],
            ) => {
              const BATCH_SIZE = 2; // Check 2 files at a time
              const YIELD_DELAY = 100; // Yield to event loop every 100ms

              for (let i = 0; i < files.length; i += BATCH_SIZE) {
                const batch = files.slice(i, i + BATCH_SIZE);

                // Check this batch
                await Promise.all(batch.map(async (file) => {
                  try {
                    const availableServers = await checkBlossomServersForFile(file.sha256, servers);
                    file.availableOnServers = availableServers;
                  } catch (error) {
                    log.debug(`Failed to check blob for ${file.path}: ${error}`);
                  }
                }));

                // Update stats after each batch
                updatePropagationStats(state);

                // Yield to event loop to process keypresses
                await new Promise((resolve) => setTimeout(resolve, YIELD_DELAY));
              }
            };

            // First fetch server list asynchronously (prioritize manifest events per NIP-XX)
            state.status = "Loading server list...";
            throttledRender();

            // Fire and forget - don't block
            let hasInitialBlossomCheck = false;
            (async () => {
              // First, try to get servers from manifest events (prioritized per NIP-XX)
              const manifestEvent = await fetchSiteManifestEvent(relays, pubkey);
              const manifestEvents = manifestEvent ? [manifestEvent] : [];
              if (manifestEvents.length > 0) {
                state.blossomServers = extractServersFromManifestEvents(manifestEvents);
                if (state.blossomServers.length > 0) {
                  log.debug(
                    `Found ${state.blossomServers.length} blossom servers in manifest event(s)`,
                  );
                  // Update color map with blossom servers
                  updateServerColorMap(state.blossomServers);
                  updatePropagationStats(state);
                  throttledRender();
                }
              }

              // Fall back to kind 10063 server list event if no servers found in manifests
              if (state.blossomServers.length === 0) {
                const serverListEvents = await fetchServerListEvents(relays, pubkey);
                if (serverListEvents.length > 0) {
                  const latestEvent = serverListEvents[0];
                  state.blossomServers = extractServersFromEvent(latestEvent);
                  log.debug(
                    `Found ${state.blossomServers.length} blossom servers in user's server list (kind 10063)`,
                  );

                  // Update color map with blossom servers
                  updateServerColorMap(state.blossomServers);
                  updatePropagationStats(state);
                  throttledRender();
                }
              }

              if (state.blossomServers.length === 0) {
                state.status = "Ready (no blossom servers)";
                throttledRender();
                return;
              }

              // Now check blossom servers with cached list - but only for visible files
              state.status = "Checking blossom servers...";
              throttledRender();

              // Only check files that are currently visible
              const visibleFiles = state.files.slice(
                state.page * state.pageSize,
                (state.page + 1) * state.pageSize,
              );

              // Check visible files first for immediate feedback
              await checkBlossomServersForFiles(
                relays,
                pubkey,
                visibleFiles,
                (checked, total) => {
                  state.status = `Checking visible files... ${checked}/${total}`;
                  throttledRender();
                },
                state.blossomServers,
                manifestEvents,
              );

              // Then check remaining files in background without blocking
              const remainingFiles = [
                ...state.files.slice(0, state.page * state.pageSize),
                ...state.files.slice((state.page + 1) * state.pageSize),
              ];

              if (remainingFiles.length > 0) {
                // Check remaining files with yielding to not block the UI
                checkBlossomServersWithYielding(
                  relays,
                  pubkey,
                  remainingFiles,
                  state.blossomServers,
                );
              }

              hasInitialBlossomCheck = true;
              state.status = "Ready";
              updatePropagationStats(state);
              throttledRender(true); // Force immediate render when done
            })().catch((error) => {
              hasInitialBlossomCheck = true;
              state.status = "Ready";
              log.debug(`Initial blossom check failed: ${error}`);
              throttledRender(true); // Force immediate render on error
            });

            // Setup keypress handler with priority-based input queue
            const keypress = new Keypress();

            // Priority input queue to handle keyboard events properly
            let inputQueue: Array<
              { key: string; sequence?: string; timestamp: number; priority: number }
            > = [];
            let processingQueue = false;
            let shouldExitLoop = false;

            // Process the input queue in priority order
            const processInputQueue = async () => {
              if (processingQueue || inputQueue.length === 0) return;
              processingQueue = true;

              try {
                // Sort by priority (higher priority first), then by timestamp (FIFO)
                inputQueue.sort((a, b) => {
                  if (a.priority !== b.priority) return b.priority - a.priority;
                  return a.timestamp - b.timestamp;
                });

                // Process at most 3 events at a time to prevent blocking
                let eventsProcessed = 0;
                const maxEventsPerBatch = 3;

                while (inputQueue.length > 0 && eventsProcessed < maxEventsPerBatch) {
                  const input = inputQueue.shift()!;
                  const key = input.key;
                  const sequence = input.sequence;
                  eventsProcessed++;

                  // Process the key event
                  if (state.filterMode) {
                    const shouldRender = handleFilterMode(state, key, sequence);
                    if (shouldRender) {
                      render(state);
                    }
                    continue;
                  }

                  if (state.authMode === "select") {
                    const shouldRender = await handleAuthSelection(state, key);
                    if (shouldRender) {
                      render(state);
                    }
                    continue;
                  }

                  if (state.authMode === "input") {
                    const shouldRender = await handleAuthInput(state, key, sequence);
                    if (shouldRender) {
                      render(state);
                    }
                    continue;
                  }

                  if (state.confirmingDelete) {
                    const shouldRender = await handleDeleteConfirmation(state, key, sequence);
                    if (shouldRender) {
                      render(state);
                      if (!state.confirmingDelete) {
                        // Refresh after deletion complete
                        setTimeout(() => render(state), 2000);
                      }
                    }
                    continue;
                  }

                  if (state.viewMode === "detail") {
                    const shouldContinue = handleDetailModeKey(state);
                    if (shouldContinue) {
                      render(state);
                    }
                    continue;
                  }

                  const shouldContinue = handleListModeKey(state, key);
                  if (!shouldContinue) {
                    // Clean up
                    if (blossomRefreshInterval) {
                      clearInterval(blossomRefreshInterval);
                    }
                    Deno.removeSignalListener("SIGWINCH", handleResize);
                    keypress.dispose();
                    showCursor();
                    exitAlternateScreen();

                    // Check if we should switch identity
                    if (state.switchIdentity) {
                      // Signal to exit the input loop
                      shouldExitLoop = true;
                      processingQueue = false;
                      return;
                    } else {
                      // Normal exit
                      Deno.exit(0);
                    }
                  }

                  // For up/down navigation, do a partial render
                  if (key === "up" || key === "down") {
                    renderUpdate(state);
                  } else {
                    // Full render for other keys
                    render(state);
                  }
                }
              } finally {
                processingQueue = false;

                // If there are more events in the queue, schedule another processing
                if (inputQueue.length > 0) {
                  setTimeout(() => processInputQueue(), 10);
                }
              }
            };

            // Track trackpad activity for debugging
            let trackpadEventCount = 0;
            let lastTrackpadTime = 0;

            // Start background blossom server checking with 10-minute refresh (optional)
            let blossomRefreshInterval: number | undefined;

            const startBlossomRefresh = () => {
              if (blossomRefreshInterval) {
                clearInterval(blossomRefreshInterval);
              }

              // Only set up periodic refresh if user wants it (every 10 minutes)
              // For now, let's disable periodic refresh - blossom checking happens once per session
              // Uncomment the following lines if periodic refresh is desired:
              /*
        blossomRefreshInterval = setInterval(async () => {
          // Skip refresh if no blossom servers
          if (state.blossomServers.length === 0) {
            return;
          }

          try {
            state.status = "Refreshing blossom servers...";
            render(state);

            const { checkBlossomServersForFiles } = await import("../lib/browse-loader.ts");
            await checkBlossomServersForFiles(relays, pubkey, state.files, (checked, total) => {
              state.status = `Refreshing blossom servers... ${checked}/${total}`;
              render(state);
            }, state.blossomServers);

            state.status = "Ready";
            updatePropagationStats(state);
            render(state);
          } catch (error) {
            state.status = "Ready";
            log.debug(`Background blossom refresh failed: ${error}`);
            render(state);
          }
        }, 600000); // 10 minutes
        */
            };

            // Start the refresh timer (currently disabled)
            startBlossomRefresh();

            for await (const event of keypress) {
              if (shouldExitLoop) break;

              const key = event.key || "";
              const sequence = event.sequence;
              const now = Date.now();

              // Comprehensive trackpad/mouse event filtering
              const isTrackpadEvent = key && (
                key.includes("\u001b[M") || // Mouse events
                key.includes("\u001b[<") || // SGR mouse events
                key.includes("\u001b[?") || // Mouse mode events
                key.includes("\u001b[O") || // Function key events
                key.includes("\u001b[1;") || // Modified key events
                key.includes("\u001b[2;") || key.includes("\u001b[3;") ||
                key.includes("\u001b[4;") ||
                key.includes("\u001b[5;") || key.includes("\u001b[6;") ||
                key.includes("\u001b[7;") ||
                key.includes("\u001b[8;") || key.includes("\u001b[9;") ||
                key.includes("\u001b\u001b") || // Double escape sequences
                (key.length > 10) || // Very long sequences
                (key.length > 4 && key.startsWith("\u001b[") && !key.match(/^\u001b\[[ABCD]$/)) || // Complex escape sequences (but allow arrow keys)
                key.includes("\u001b[2~") || key.includes("\u001b[3~") || // Insert/Delete
                key.includes("\u001b[5~") || key.includes("\u001b[6~") || // Page Up/Down
                key.includes("\u001b[H") || key.includes("\u001b[F") || // Home/End\
                // deno-lint-ignore no-control-regex
                key.match(/\u001b\[[0-9]+[a-zA-Z]/) || // Numbered escape sequences
                // deno-lint-ignore no-control-regex
                (!key.match(/^[a-zA-Z0-9 \t\n\r\u001b\[ABCD\/]$/) && key.length === 1 &&
                  key.charCodeAt(0) > 127) // Non-ASCII single chars
              );

              if (isTrackpadEvent) {
                trackpadEventCount++;
                lastTrackpadTime = now;
                log.debug(`Filtered trackpad event: "${key}" (count: ${trackpadEventCount})`);
                continue; // Completely skip trackpad events
              }

              // Also filter empty/null keys
              if (!key || key === "\u0000") {
                continue;
              }

              // Reset trackpad counter if no recent activity
              if (now - lastTrackpadTime > 500) {
                trackpadEventCount = 0;
              }

              // For navigation keys and common actions, process immediately without queueing
              const isNavigationKey = key === "up" || key === "down" || key === "left" ||
                key === "right" ||
                key === "pageup" || key === "pagedown" || key === "home" || key === "end";
              const isActionKey = key === "return" || key === "space" || key === "q" ||
                key === "escape";

              if (isNavigationKey || isActionKey) {
                // Process immediately without queueing
                if (processingQueue) {
                  // If already processing, skip navigation keys to prevent buildup
                  if (isNavigationKey) {
                    continue;
                  }
                }

                // Process this key immediately
                processingQueue = true;
                try {
                  // Process the key event directly
                  if (state.filterMode) {
                    const shouldRender = handleFilterMode(state, key, sequence);
                    if (shouldRender) {
                      render(state);
                    }
                  } else if (state.authMode === "select") {
                    const shouldRender = await handleAuthSelection(state, key);
                    if (shouldRender) {
                      render(state);
                    }
                  } else if (state.authMode === "input") {
                    const shouldRender = await handleAuthInput(state, key, sequence);
                    if (shouldRender) {
                      render(state);
                    }
                  } else if (state.confirmingDelete) {
                    const shouldRender = await handleDeleteConfirmation(state, key, sequence);
                    if (shouldRender) {
                      render(state);
                      if (!state.confirmingDelete) {
                        setTimeout(() => render(state), 2000);
                      }
                    }
                  } else if (state.viewMode === "detail") {
                    const shouldContinue = handleDetailModeKey(state);
                    if (shouldContinue) {
                      render(state);
                    }
                  } else {
                    const shouldContinue = handleListModeKey(state, key);
                    if (!shouldContinue) {
                      if (blossomRefreshInterval) {
                        clearInterval(blossomRefreshInterval);
                      }
                      shouldExitLoop = true;
                      break;
                    }

                    if (key === "up" || key === "down") {
                      renderUpdate(state);
                    } else {
                      render(state);
                    }
                  }
                } finally {
                  processingQueue = false;
                }
              } else {
                // For other keys, use the queue system
                const priority = 1;
                inputQueue.push({ key, sequence, timestamp: now, priority });
                await processInputQueue();
              }
            }

            // Check if user wants to switch site or identity
            if (state.switchSite) {
              // Go back to site selection (only if multiple sites)
              if (sites.length > 1) {
                state.switchSite = false; // Reset flag
                continue; // Continue inner site loop
              } else {
                // Only one site, so treat q as exit
                Deno.exit(0);
              }
            }

            if (state.switchIdentity) {
              // Break out of site loop to go to identity selection
              break;
            }

            // Normal exit (shouldn't reach here)
            Deno.exit(0);
          } // End of site selection loop

          // If we get here, user wants to switch identity
          previousPubkey = pubkey;
          useDiscoveryRelays = true;
          continue;
        } // End of identity while loop
      } catch (error: unknown) {
        exitAlternateScreen();
        showCursor();
        handleError("Error in browse mode", error, {
          showConsole: true,
          exit: true,
          exitCode: 1,
        });
      }
    });
}
