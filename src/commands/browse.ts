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
import {
  DEFAULT_IGNORE_PATTERNS,
  type IgnoreRule,
  parseIgnorePatterns,
} from "../lib/files.ts";
import { Keypress } from "@cliffy/keypress";
import { createInitialState } from "../ui/browse/state.ts";
import { 
  render, 
  renderUpdate,
  getTerminalSize, 
  showCursor, 
  enterAlternateScreen, 
  exitAlternateScreen,
  renderLoadingScreen
} from "../ui/browse/renderer.ts";
import { handleDeleteConfirmation, handleListModeKey, handleDetailModeKey, handleFilterMode } from "../ui/browse/handlers.ts";

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
      const hasExplicitAuth = options.pubkey || options.privatekey || options.bunker || options.nbunksec;
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
    
    // Fetch files with progress
    const files = await listRemoteFilesWithProgress(relays, pubkey);
    
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
    
    files.forEach(file => {
      file.foundOnRelays.forEach(relay => allRelays.add(relay));
      file.availableOnServers.forEach(server => allServers.add(server));
    });
    
    Array.from(allRelays).forEach((relay, index) => {
      relayColorMap.set(relay, RELAY_COLORS[index % RELAY_COLORS.length]);
    });
    
    Array.from(allServers).forEach((server, index) => {
      serverColorMap.set(server, SERVER_COLORS[index % SERVER_COLORS.length]);
    });
    
    renderLoadingScreen("Building file tree...", `${allRelays.size} relays • ${allServers.size} servers`);
    
    // Initialize state
    const { rows } = Deno.consoleSize();
    const state = createInitialState(
      files,
      rows - 5, // Header (2) + Path row (1) + Footer (2)
      relayColorMap,
      serverColorMap,
      ignoreRules,
      pubkey,
      undefined // Don't store signer in state
    );
    
    // Store options for later use in delete handler
    state.authOptions = {
      privatekey: options.privatekey,
      bunker: options.bunker,
      nbunksec: options.nbunksec
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
    
    // Setup keypress handler
    const keypress = new Keypress();
    
    for await (const event of keypress) {
      if (state.filterMode) {
        const shouldRender = handleFilterMode(state, event.key || "", event.sequence);
        if (shouldRender) {
          render(state);
        }
        continue;
      }
      
      if (state.confirmingDelete) {
        const shouldRender = await handleDeleteConfirmation(state, event.key || "", event.sequence);
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
      
      const shouldContinue = handleListModeKey(state, event.key || "");
      if (!shouldContinue) {
        // Clean up
        Deno.removeSignalListener("SIGWINCH", handleResize);
        keypress.dispose();
        showCursor();
        exitAlternateScreen();
        
        // Check if we should switch identity
        if (state.switchIdentity) {
          // Break out of keypress loop to show menu again
          break;
        } else {
          // Normal exit
          Deno.exit(0);
        }
      }
      
      // For up/down navigation, do a partial render
      if (event.key === "up" || event.key === "down") {
        renderUpdate(state);
      } else {
        // Full render for other keys
        render(state);
      }
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