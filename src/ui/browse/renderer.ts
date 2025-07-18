import { colors } from "@cliffy/ansi/colors";
import { nip19 } from "nostr-tools";
import type { BrowseState } from "./state.ts";
import { RELAY_SYMBOL, SERVER_SYMBOL } from "../../commands/ls.ts";
import { isIgnored } from "../../lib/files.ts";
import { formatTimestamp } from "../time-formatter.ts";
import { highlightJson, addLineNumbers } from "../json-highlighter.ts";

export function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
}

export function clearScreen() {
  // Clear screen and move cursor to top-left
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[2J\x1b[H"));
}

export function clearLine() {
  // Clear the current line
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
}

export function enterAlternateScreen() {
  // Enter alternate screen buffer
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?1049h"));
}

export function exitAlternateScreen() {
  // Exit alternate screen buffer
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?1049l"));
}

export function renderLoadingScreen(status: string, progress?: string) {
  hideCursor();
  clearScreen();
  
  const { rows, cols } = getTerminalSize();
  const title = "nsyte browse";
  const titleRow = Math.floor(rows / 2) - 3;
  const statusRow = titleRow + 2;
  const progressRow = statusRow + 1;
  
  // Center and display title
  const titleCol = Math.floor((cols - title.length) / 2);
  moveCursor(titleRow, titleCol);
  Deno.stdout.writeSync(new TextEncoder().encode(colors.bold.cyan(title)));
  
  // Center and display status
  const statusCol = Math.floor((cols - status.length) / 2);
  moveCursor(statusRow, statusCol);
  Deno.stdout.writeSync(new TextEncoder().encode(colors.gray(status)));
  
  // Display progress if provided
  if (progress) {
    const progressCol = Math.floor((cols - progress.length) / 2);
    moveCursor(progressRow, progressCol);
    Deno.stdout.writeSync(new TextEncoder().encode(colors.green(progress)));
  }
}

export function hideCursor() {
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));
}

export function showCursor() {
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
}

export function moveCursor(row: number, col: number) {
  Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${row};${col}H`));
}

export function getTerminalSize() {
  const size = Deno.consoleSize();
  return {
    rows: size.rows,
    cols: size.columns
  };
}

export function renderHeader(state: BrowseState, startLine: number = 1) {
  const { cols } = getTerminalSize();
  
  // IMPORTANT: Ensure we never write above startLine
  if (startLine < 1) startLine = 1;
  
  // Don't show title in console mode - it's already in the tab bar
  const legendItems: string[] = [];
  
  if (state.relayColorMap.size > 0) {
    state.relayColorMap.forEach((colorFn, relay) => {
      const shortRelay = relay.replace(/^wss?:\/\//, '').substring(0, 15);
      legendItems.push(`${colorFn(RELAY_SYMBOL)} ${shortRelay}`);
    });
  }
  
  if (state.serverColorMap.size > 0) {
    state.serverColorMap.forEach((colorFn, server) => {
      const shortServer = server.replace(/^https?:\/\//, '').substring(0, 15);
      legendItems.push(`${colorFn(SERVER_SYMBOL)} ${shortServer}`);
    });
  }
  
  const legend = legendItems.join(" ");
  
  // In standalone mode, show title + identity + legend
  if (startLine === 1) {
    const title = colors.bold.cyan("nsyte browse") + " " + colors.green(`[${nip19.npubEncode(state.pubkey).substring(0, 12)}...${nip19.npubEncode(state.pubkey).substring(nip19.npubEncode(state.pubkey).length - 6)}]`);
    const legendMaxWidth = cols - title.replace(/\x1b\[[0-9;]*m/g, '').length - 3;
    const truncatedLegend = legend.length > legendMaxWidth ? legend.substring(0, legendMaxWidth - 3) + "..." : legend;
    
    moveCursor(startLine, 1);
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K" + title + " " + colors.gray(truncatedLegend)));
  } else {
    // In console mode, just show the legend
    moveCursor(startLine, 1);
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K" + colors.gray(legend)));
  }
  
  // Move to separator line and draw it
  moveCursor(startLine + 1, 1);
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K" + colors.gray("─".repeat(cols))));
}

export function renderFooter(state: BrowseState, startLine: number = 1) {
  const { rows, cols } = getTerminalSize();
  
  // Move cursor to footer position (rows - 1 for separator, rows for status/hotkeys)
  moveCursor(rows - 1, 1);
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
  Deno.stdout.writeSync(new TextEncoder().encode(colors.gray("─".repeat(cols)) + "\n"));
  
  // Move to last line for status and hotkeys
  moveCursor(rows, 1);
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
  
  // Prepare status text
  const statusColor = state.statusColor || colors.gray;
  const statusText = statusColor(state.status);
  
  // Prepare hotkeys
  let hotkeys: string[] = [];
  
  if (state.viewMode === "list") {
    if (state.confirmingDelete) {
      hotkeys = [
        `${colors.red("Type 'yes' to confirm")}`,
        `${colors.gray("ESC")} Cancel`
      ];
      if (state.deleteConfirmText) {
        hotkeys.push(`${colors.yellow(`[${state.deleteConfirmText}]`)}`);
      }
    } else {
      hotkeys = [
        `${colors.gray("↑↓")} Navigate`,
        `${colors.gray("←→")} Pages`,
        `${colors.gray("SPACE")} Select`,
        `${colors.gray("s")} ${state.showSelectedOnly ? 'View All' : 'View Selected'}${state.selectedItems.size > 0 ? ` [${state.selectedItems.size}]` : ''}`,
      ];
      
      if (state.selectedItems.size > 0) {
        hotkeys.push(`${colors.gray("a")} Deselect all`);
      }
      
      hotkeys.push(
        `${colors.gray("ENTER")} Details`,
        `${colors.gray("/")} Filter`,
        `${colors.gray("DEL")} Delete`,
        `${colors.gray("i")} Identity`,
        `${colors.gray("q")} Quit`
      );
    }
  } else {
    hotkeys = [`${colors.gray("Any key")} Back to list`];
  }
  
  const hotkeysText = hotkeys.join(" │ ");
  
  // Calculate padding to right-align status
  const statusLength = statusText.replace(/\x1b\[[0-9;]*m/g, '').length; // Remove ANSI codes for length
  const hotkeysLength = hotkeysText.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(1, cols - statusLength - hotkeysLength - 1);
  
  // Render hotkeys on left and status on right
  Deno.stdout.writeSync(new TextEncoder().encode(hotkeysText + " ".repeat(padding) + statusText));
}

export function renderFileList(state: BrowseState, startLine: number = 1) {
  const { rows, cols } = getTerminalSize();
  
  // IMPORTANT: When in console mode (startLine > 1), we must not clear above startLine
  // The console has already cleared the appropriate area
  if (startLine === 1) {
    // Standalone mode - we can clear from path row onwards
    const startRow = startLine + 2; // After header
    const maxRow = rows - 2; // Leave room for footer
    
    // Clear from path row to bottom (but not footer area)
    for (let row = startRow; row <= maxRow; row++) {
      moveCursor(row, 1);
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K")); // Clear line
    }
  }
  // In console mode, don't clear - console already did it
  
  // Render path indicator row or filter input
  moveCursor(startLine + 2, 1);
  
  if (state.filterMode) {
    // Show filter input with blinking cursor
    showCursor();
    const filterDisplay = `Filter: ${state.filterText}_`;
    Deno.stdout.writeSync(new TextEncoder().encode(colors.cyan(filterDisplay) + "\n"));
  } else {
    // Make sure cursor is hidden
    hideCursor();
    // Show path indicator
    const startIndex = state.page * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, state.treeItems.length);
    const pageItems = state.treeItems.slice(startIndex, endIndex);
    
    // Get the parent path of the first item on the page
    let pathIndicator = "/";
    if (pageItems.length > 0) {
      const firstItem = pageItems[0];
      const parts = firstItem.path.split('/');
      if (parts.length > 1) {
        pathIndicator = "/" + parts.slice(0, -1).join('/');
      }
    }
    
    // Show filter indicator if active
    if (state.filterText) {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.gray(`[${pathIndicator}] `) + colors.cyan(`(filtered: ${state.filterText})`) + "\n"));
    } else {
      Deno.stdout.writeSync(new TextEncoder().encode(colors.gray(`[${pathIndicator}]`) + "\n"));
    }
  }
  
  // Move to start of actual file list (after path row)
  moveCursor(startLine + 3, 1);
  
  const startIndex = state.page * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, state.treeItems.length);
  const pageItems = state.treeItems.slice(startIndex, endIndex);
  
  // Calculate max relay/server counts for alignment (minimum 3 for visual consistency)
  const maxRelayCount = Math.max(...state.files.map(f => f.foundOnRelays.length), 3);
  const maxServerCount = Math.max(...state.files.map(f => f.availableOnServers.length), 3);
  
  pageItems.forEach((item, listIndex) => {
    const globalIndex = startIndex + listIndex;
    const isSelected = state.selectedItems.has(item.path);
    const isFocused = globalIndex === state.selectedIndex;
    
    // Build tree prefix
    let treePrefix = item.parentPrefix;
    if (item.depth > 0) {
      treePrefix += item.isLast ? "└─ " : "├─ ";
    }
    
    if (item.isDirectory) {
      // Render directory
      const dirName = item.path.split('/').pop() || item.path;
      const emptyIndicators = " ".repeat(maxRelayCount) + ` ${colors.gray("│")} ` + " ".repeat(maxServerCount);
      console.log(`${emptyIndicators} ${colors.gray(treePrefix)}${colors.gray(dirName + '/')}`);
    } else if (item.file) {
      // Render file
      const fileName = item.path.split('/').pop() || item.path;
      const relativePath = item.file.path.startsWith("/") ? item.file.path.substring(1) : item.file.path;
      const shouldBeIgnored = isIgnored(relativePath, state.ignoreRules, false);
      
      // Build indicators
      let relayIndicators = "";
      item.file.foundOnRelays.forEach(relay => {
        const colorFn = state.relayColorMap.get(relay) || colors.white;
        relayIndicators += colorFn(RELAY_SYMBOL);
      });
      relayIndicators += " ".repeat(maxRelayCount - item.file.foundOnRelays.length);
      
      let serverIndicators = "";
      item.file.availableOnServers.forEach(server => {
        const colorFn = state.serverColorMap.get(server) || colors.white;
        serverIndicators += colorFn(SERVER_SYMBOL);
      });
      serverIndicators += " ".repeat(maxServerCount - item.file.availableOnServers.length);
      
      const indicators = `${relayIndicators} ${colors.gray("│")} ${serverIndicators}`;
      
      // Format file info
      const isDeleting = state.deletingItems.has(item.path);
      const isDeleted = state.deletedItems.has(item.path);
      
      let pathColor;
      let indicatorColor = (str: string) => str;
      let rowBackground = false;
      
      if (isDeleting || isDeleted) {
        // Show in red when deleting or deleted
        pathColor = colors.red;
        indicatorColor = colors.red;
      } else if (isFocused) {
        pathColor = colors.bgMagenta.white;
        rowBackground = true;
      } else if (isSelected) {
        pathColor = colors.bgBrightMagenta.black;
        rowBackground = true;
      } else if (shouldBeIgnored) {
        pathColor = colors.red;
      } else {
        pathColor = colors.white;
      }
      
      // Apply red color to indicators if deleting
      const coloredIndicators = isDeleting || isDeleted ? indicatorColor(indicators) : indicators;
      
      const hashDisplay = ` [${truncateHash(item.file.sha256)}]`;
      
      if (rowBackground && !isDeleting && !isDeleted) {
        // Apply background color to entire row
        const lineContent = `${indicators} ${treePrefix}${fileName}${hashDisplay}`;
        const paddingNeeded = cols - lineContent.length;
        const fullLine = lineContent + " ".repeat(Math.max(0, paddingNeeded));
        
        if (isFocused) {
          console.log(colors.bgMagenta.white(fullLine));
        } else if (isSelected) {
          console.log(colors.bgBrightMagenta.black(fullLine));
        }
      } else {
        // Normal rendering without background
        const fileDisplay = `${colors.gray(treePrefix)}${pathColor(fileName)}${colors.gray(hashDisplay)}`;
        console.log(`${coloredIndicators} ${fileDisplay}`);
      }
    }
  });
  
  // No need to fill remaining space since we cleared the entire area first
}

export function renderDetailView(state: BrowseState, startLine: number = 1) {
  const { rows, cols } = getTerminalSize();
  const contentRows = rows - 5; // Header (2) + Path row (1) + Footer (2)
  
  if (state.detailIndex === null || !state.treeItems[state.detailIndex] || !state.treeItems[state.detailIndex].file) {
    return;
  }
  
  const file = state.treeItems[state.detailIndex].file!;
  let currentRow = 0;
  
  const printLine = (text: string = "") => {
    if (currentRow < contentRows) {
      console.log(text.padEnd(cols));
      currentRow++;
    }
  };
  
  printLine(colors.bold("File Details"));
  printLine();
  printLine(`${colors.gray("Path:")} ${file.path}`);
  printLine(`${colors.gray("SHA256:")} ${file.sha256}`);
  printLine(`${colors.gray("Event ID:")} ${file.eventId}`);
  
  // Add creation time if event exists
  if (file.event?.created_at) {
    const timeStr = formatTimestamp(file.event.created_at);
    printLine(`${colors.gray("Created:")} ${timeStr}`);
  }
  
  printLine();
  
  if (file.foundOnRelays.length > 0) {
    printLine(colors.bold("Found on Relays:"));
    file.foundOnRelays.forEach(relay => {
      const colorFn = state.relayColorMap.get(relay) || colors.white;
      printLine(`  ${colorFn(RELAY_SYMBOL)} ${relay}`);
    });
    printLine();
  }
  
  if (file.availableOnServers.length > 0) {
    printLine(colors.bold("Available on Servers:"));
    file.availableOnServers.forEach(server => {
      const colorFn = state.serverColorMap.get(server) || colors.white;
      printLine(`  ${colorFn(SERVER_SYMBOL)} ${server}`);
    });
    printLine();
  }
  
  // Show JSON event with syntax highlighting
  if (file.event) {
    printLine(colors.bold("Event JSON:"));
    printLine();
    
    try {
      const jsonStr = JSON.stringify(file.event, null, 2);
      const highlighted = highlightJson(jsonStr);
      const withLineNumbers = addLineNumbers(highlighted);
      
      // Print each line of the JSON
      withLineNumbers.split('\n').forEach(line => {
        printLine(line);
      });
    } catch (error) {
      printLine(colors.red("Error formatting event JSON"));
    }
  }
  
  // Fill remaining space
  while (currentRow < contentRows) {
    printLine();
  }
}

export function render(state: BrowseState, startLine: number = 1, renderFooterFlag: boolean = true) {
  if (!state.filterMode) {
    hideCursor();
  }
  
  // Never clear the entire screen when startLine > 1 (console mode)
  if (startLine === 1) {
    clearScreen();
  } else {
    // In console mode, we should NOT clear anything - the console already cleared the content area
    // Just render our content starting from startLine
  }
  
  // Update page size based on current terminal size (only if not already set by console mode)
  if (startLine === 1) {
    const { rows } = getTerminalSize();
    const footerLines = renderFooterFlag ? 2 : 0; // No footer lines if not rendering footer
    // Calculate available lines: total rows - lines above content - header(2) - path(1) - footer
    state.pageSize = rows - (startLine - 1) - 2 - 1 - footerLines;
  }
  
  renderHeader(state, startLine);
  
  if (state.viewMode === "list") {
    renderFileList(state, startLine);
  } else {
    renderDetailView(state, startLine);
  }
  
  if (renderFooterFlag) {
    renderFooter(state, startLine);
  }
}

export function renderUpdate(state: BrowseState, startLine: number = 1, renderFooterFlag: boolean = true) {
  if (!state.filterMode) {
    hideCursor();
  }
  
  // Update page size based on current terminal size
  const { rows } = getTerminalSize();
  const footerLines = renderFooterFlag ? 2 : 0; // No footer lines if not rendering footer
  // Calculate available lines: total rows - lines above content - header(2) - path(1) - footer
  state.pageSize = rows - (startLine - 1) - 2 - 1 - footerLines;
  
  // Don't clear screen, just update parts
  renderHeader(state, startLine);
  renderFileList(state, startLine);
  if (renderFooterFlag) {
    renderFooter(state, startLine);
  }
}

// Console-specific render functions that don't render footer
export function renderForConsole(state: BrowseState, startLine: number = 1) {
  // In console mode, we need to account for the console footer (2 lines)
  const { rows } = getTerminalSize();
  const consoleFooterLines = 2;
  state.pageSize = rows - (startLine - 1) - 2 - 1 - consoleFooterLines; // header(2) + path(1) + console footer(2)
  
  render(state, startLine, false);
}

export function renderUpdateForConsole(state: BrowseState, startLine: number = 1) {
  renderUpdate(state, startLine, false);
}