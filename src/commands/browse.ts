import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { RELAY_COLORS, SERVER_COLORS } from "./ls.ts";
import { listRemoteFilesWithProgress } from "./browse-loader.ts";
import { resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
import { readProjectFile } from "../lib/config.ts";
import { existsSync } from "@std/fs/exists";
import { join } from "@std/path";
import { DEFAULT_IGNORE_PATTERNS, type IgnoreRule, parseIgnorePatterns } from "../lib/files.ts";
import { Keypress } from "@cliffy/keypress";
import { pool } from "../lib/nostr.ts";
import { createInitialState, updatePropagationStats } from "../ui/browse/state.ts";
import {
  enterAlternateScreen,
  exitAlternateScreen,
  getTerminalSize,
  render,
  renderLoadingScreen,
  renderUpdate,
  showCursor,
} from "../ui/browse/renderer.ts";
import {
  handleAuthSelection,
  handleAuthInput,
  handleDeleteConfirmation,
  handleDetailModeKey,
  handleFilterMode,
  handleListModeKey,
} from "../ui/browse/handlers.ts";

const log = createLogger("browse");

export function registerBrowseCommand(program: Command): void {
  program
    .command("browse")
    .description("Interactive TUI browser for files on the nostr network")
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

export async function command(options: any): Promise<void> {
  try {
    let useDiscoveryRelays = false;

    // Loop to allow identity switching
    while (true) {
      // Check if we have explicit auth options or project config
      const hasExplicitAuth = options.pubkey || options.privatekey || options.bunker ||
        options.nbunksec;
      const projectConfig = readProjectFile();
      const hasProjectAuth = projectConfig?.bunkerPubkey;

      let pubkey: string;

      // Show menu if no auth provided and not in a project, or if switching identity
      if ((!hasExplicitAuth && !hasProjectAuth) || useDiscoveryRelays) {
        // Show interactive menu
        const { showBrowseMenu } = await import("../ui/browse/menu.ts");
        const result = await showBrowseMenu(options._currentPubkey);

        if (result.type === "bunker") {
          // Use bunker from secrets manager
          pubkey = result.value;
        } else {
          pubkey = result.value;
        }

        // Clear the current pubkey after use
        delete options._currentPubkey;
      } else {
        // Use normal resolution
        pubkey = await resolvePubkey(options);
      }

      // Enter TUI after auth is resolved
      enterAlternateScreen();
      renderLoadingScreen("Initializing...");

      // Use discovery relays if identity was switched or no project
      const relays = useDiscoveryRelays || (!hasExplicitAuth && !hasProjectAuth)
        ? resolveRelays({}, null, true) // Force discovery relays
        : resolveRelays(options);

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

      // Fetch files with progress (without blocking on blossom server checks)
      const files = await listRemoteFilesWithProgress(relays, pubkey, false);

      if (files.length === 0) {
        exitAlternateScreen();
        showCursor();
        console.log(colors.yellow("No files found for this user."));
        Deno.exit(0);
      }

      renderLoadingScreen("Processing files...", `${files.length} unique files found`);

      // Create color mappings
      const relayColorMap = new Map<string, (str: string) => string>();
      const serverColorMap = new Map<string, (str: string) => string>();

      const allRelays = new Set<string>();
      const allServers = new Set<string>();

      files.forEach((file) => {
        file.foundOnRelays.forEach((relay) => allRelays.add(relay));
        file.availableOnServers.forEach((server) => allServers.add(server));
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
        blossomServers.forEach(server => allServersSet.add(server));
        
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
      );

      // Store options for later use in delete handler
      state.authOptions = {
        privatekey: options.privatekey,
        bunker: options.bunker,
        nbunksec: options.nbunksec,
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
          const maxIndex = Math.min((state.page + 1) * state.pageSize, state.treeItems.length) - 1;
          if (state.selectedIndex > maxIndex) {
            state.selectedIndex = maxIndex;
          }
          render(state);
        }, 100);
      };

      // Listen for terminal resize
      Deno.addSignalListener("SIGWINCH", handleResize);

      // Initial render
      render(state);

      // Start initial blossom server check in background (don't await)
      const { checkBlossomServersForFiles } = await import("./browse-loader.ts");
      const { fetchServerListEvents } = await import("../lib/debug-helpers.ts");
      
      // First fetch server list asynchronously
      state.status = "Loading server list...";
      render(state);
      
      // Fire and forget - don't block
      fetchServerListEvents(pool, relays, pubkey).then((serverListEvents) => {
        if (serverListEvents.length > 0) {
          const latestEvent = serverListEvents[0];
          state.blossomServers = latestEvent.tags
            .filter(tag => tag[0] === "server" && tag[1])
            .map(tag => tag[1]);
          log.debug(`Found ${state.blossomServers.length} blossom servers in user's server list`);
          
          // Update color map with blossom servers
          updateServerColorMap(state.blossomServers);
          updatePropagationStats(state);
          render(state);
        }
        
        if (state.blossomServers.length === 0) {
          state.status = "Ready (no blossom servers)";
          render(state);
          return;
        }
        
        // Now check blossom servers with cached list
        state.status = "Checking blossom servers...";
        render(state);
        
        return checkBlossomServersForFiles(relays, pubkey, state.files, (checked, total) => {
          state.status = `Checking blossom servers... ${checked}/${total}`;
          render(state);
        }, state.blossomServers);
      }).then(() => {
        hasInitialBlossomCheck = true;
        state.status = "Ready";
        updatePropagationStats(state);
        render(state);
      }).catch((error) => {
        hasInitialBlossomCheck = true;
        state.status = "Ready";
        log.debug(`Initial blossom check failed: ${error}`);
        render(state);
      });

      // Setup keypress handler with priority-based input queue
      const keypress = new Keypress();

      // Priority input queue to handle keyboard events properly
      const inputQueue: Array<
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

          while (inputQueue.length > 0) {
            const input = inputQueue.shift()!;
            const key = input.key;
            const sequence = input.sequence;

            // Process the key event
            if (state.filterMode) {
              const shouldRender = handleFilterMode(state, key, sequence);
              if (shouldRender) {
                render(state);
              }
              continue;
            }

            if (state.authMode === "select") {
              const shouldRender = await handleAuthSelection(state, key, sequence);
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
        }
      };

      // Track trackpad activity for debugging
      let trackpadEventCount = 0;
      let lastTrackpadTime = 0;

      // Start background blossom server checking with 10-minute refresh (optional)
      let blossomRefreshInterval: number | undefined;
      let hasInitialBlossomCheck = false;
      
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
            
            const { checkBlossomServersForFiles } = await import("./browse-loader.ts");
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
          key.includes("\u001b[2;") || key.includes("\u001b[3;") || key.includes("\u001b[4;") ||
          key.includes("\u001b[5;") || key.includes("\u001b[6;") || key.includes("\u001b[7;") ||
          key.includes("\u001b[8;") || key.includes("\u001b[9;") ||
          key.includes("\u001b\u001b") || // Double escape sequences
          (key.length > 10) || // Very long sequences
          (key.length > 4 && key.startsWith("\u001b[") && !key.match(/^\u001b\[[ABCD]$/)) || // Complex escape sequences (but allow arrow keys)
          key.includes("\u001b[2~") || key.includes("\u001b[3~") || // Insert/Delete
          key.includes("\u001b[5~") || key.includes("\u001b[6~") || // Page Up/Down
          key.includes("\u001b[H") || key.includes("\u001b[F") || // Home/End
          key.match(/\u001b\[[0-9]+[a-zA-Z]/) || // Numbered escape sequences
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

        // Determine priority for this key event
        let priority = 1; // Default priority
        if (key === "q" || key === "escape") {
          priority = 10; // High priority for quit/escape
        } else if (key === "up" || key === "down" || key === "left" || key === "right") {
          priority = 5; // Medium-high priority for navigation
        } else if (key === "return" || key === "space") {
          priority = 3; // Medium priority for actions
        }

        // Add to priority queue
        inputQueue.push({ key, sequence, timestamp: now, priority });

        // Process queue
        await processInputQueue();
      }

      // If we get here, user wants to switch identity
      // Pass current pubkey to menu
      const currentPubkey = state.pubkey;
      // Set flag to use discovery relays
      useDiscoveryRelays = true;
      // Store current pubkey to pass to menu
      options._currentPubkey = currentPubkey;
      // Continue the loop - the menu will be shown at the top
      continue;
    } // End of while loop
  } catch (error: unknown) {
    exitAlternateScreen();
    showCursor();
    handleError("Error in browse mode", error, {
      showConsole: true,
      exit: true,
      exitCode: 1,
    });
  }
}
