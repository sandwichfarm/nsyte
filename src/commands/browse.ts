import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { listRemoteFilesWithSources, RELAY_COLORS, SERVER_COLORS } from "./ls.ts";
import { resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
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
  exitAlternateScreen 
} from "../ui/browse/renderer.ts";
import { handleDeleteConfirmation, handleListModeKey, handleDetailModeKey } from "../ui/browse/handlers.ts";

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
    const pubkey = await resolvePubkey(options);
    const relays = resolveRelays(options);
    
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
    
    // Show loading message
    console.log(colors.cyan("Loading files from relays..."));
    
    // Fetch files
    const files = await listRemoteFilesWithSources(relays, pubkey);
    
    if (files.length === 0) {
      console.log(colors.yellow("No files found for this user."));
      Deno.exit(0);
    }
    
    console.log(colors.green(`Found ${files.length} files`));
    
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
    
    // Initialize state
    const { rows } = Deno.consoleSize();
    const state = createInitialState(
      files,
      rows - 5, // Header (2) + Path row (1) + Footer (2)
      relayColorMap,
      serverColorMap,
      ignoreRules,
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
    
    // Enter alternate screen buffer
    enterAlternateScreen();
    
    // Listen for terminal resize
    Deno.addSignalListener("SIGWINCH", handleResize);
    
    // Initial render
    render(state);
    
    // Setup keypress handler
    const keypress = new Keypress();
    
    for await (const event of keypress) {
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
        // Clean up and exit
        Deno.removeSignalListener("SIGWINCH", handleResize);
        keypress.dispose();
        showCursor();
        exitAlternateScreen();
        Deno.exit(0);
      }
      
      // For up/down navigation, do a partial render
      if (event.key === "up" || event.key === "down") {
        renderUpdate(state);
      } else {
        // Full render for other keys
        render(state);
      }
    }
    
  } catch (error: unknown) {
    handleError("Error in browse mode", error, {
      showConsole: true,
      exit: true,
      exitCode: 1,
    });
  }
}