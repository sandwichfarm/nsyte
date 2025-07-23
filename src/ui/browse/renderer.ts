import { colors } from "@cliffy/ansi/colors";
import { nip19 } from "nostr-tools";
import type { BrowseState } from "./state.ts";
import { RELAY_SYMBOL, SERVER_SYMBOL } from "../../commands/ls.ts";
import { isIgnored } from "../../lib/files.ts";
import { formatTimestamp } from "../time-formatter.ts";
import { highlightJson, addLineNumbers } from "../json-highlighter.ts";
import { formatFileSize } from "../formatters.ts";

export function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
}

export function clearScreen() {
  // Clear screen and move cursor to top-left
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[2J\x1b[H"));
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

export function renderHeader(state: BrowseState) {
  const { cols } = getTerminalSize();
  const title = colors.bold.cyan("nsyte browse");
  
  // Format the npub
  const npub = nip19.npubEncode(state.pubkey);
  const identity = colors.green(`[${npub.substring(0, 12)}...${npub.substring(npub.length - 6)}]`);
  
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
  const titleAndIdentity = `${title} ${identity}`;
  const legendMaxWidth = cols - titleAndIdentity.length - 3;
  const truncatedLegend = legend.length > legendMaxWidth ? legend.substring(0, legendMaxWidth - 3) + "..." : legend;
  
  // Move to header position and clear lines
  moveCursor(1, 1);
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
  Deno.stdout.writeSync(new TextEncoder().encode(`${titleAndIdentity} ${colors.gray(truncatedLegend)}\n`));
  moveCursor(2, 1);
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
  Deno.stdout.writeSync(new TextEncoder().encode(colors.gray("─".repeat(cols)) + "\n"));
}

export function renderFooter(state: BrowseState) {
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

export function renderFileList(state: BrowseState) {
  const { rows, cols } = getTerminalSize();
  const contentRows = rows - 5; // Header (2) + Path row (1) + Footer (2)
  
  // Move cursor to start of file list area (row 3)
  moveCursor(3, 1);
  
  // Clear the entire display area including path row
  for (let i = 0; i < contentRows + 1; i++) {
    moveCursor(3 + i, 1);
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K")); // Clear line
  }
  
  // Render path indicator row or filter input
  moveCursor(3, 1);
  
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
  
  // Move to start of actual file list (row 4)
  moveCursor(4, 1);
  
  const startIndex = state.page * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, state.treeItems.length);
  const pageItems = state.treeItems.slice(startIndex, endIndex);
  
  // Calculate max relay/server counts for alignment (minimum 3 for visual consistency)
  const maxRelayCount = Math.max(...state.files.map(f => f.foundOnRelays.length), 3);
  const maxServerCount = Math.max(...state.files.map(f => f.availableOnServers.length), 3);
  
  // Determine if we have enough space for additional columns
  const showSizeColumn = cols > 100;
  const showTypeColumn = cols > 120;
  
  // Calculate column widths
  const sizeColumnWidth = 8; // "99.9 MB "
  const typeColumnWidth = COLUMN_WIDTH_TYPE; // "application/..."
  
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
      
      // Add empty columns for size and type if shown
      let extraColumns = "";
      if (showSizeColumn) extraColumns += " ".repeat(sizeColumnWidth) + " ";
      if (showTypeColumn) extraColumns += " ".repeat(typeColumnWidth) + " ";
      
      console.log(`${emptyIndicators} ${extraColumns}${colors.gray(treePrefix)}${colors.gray(dirName + '/')}`);
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
      
      // Format size column
      let sizeStr = "";
      if (showSizeColumn) {
        if (item.file.size !== undefined) {
          sizeStr = formatFileSize(item.file.size).padEnd(sizeColumnWidth);
        } else {
          sizeStr = "-".padEnd(sizeColumnWidth);
        }
        sizeStr += " ";
      }
      
      // Format type column
      let typeStr = "";
      if (showTypeColumn) {
        if (item.file.contentType) {
          // Shorten content type for display
          let shortType = item.file.contentType;
          if (shortType.startsWith("application/")) {
            shortType = shortType.substring(12);
          } else if (shortType.startsWith("text/")) {
            shortType = shortType.substring(5);
          } else if (shortType.startsWith("image/")) {
            shortType = "img/" + shortType.substring(6);
          }
          typeStr = shortType.substring(0, typeColumnWidth - 1).padEnd(typeColumnWidth);
        } else {
          typeStr = "-".padEnd(typeColumnWidth);
        }
        typeStr += " ";
      }
      
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
        const lineContent = `${indicators} ${sizeStr}${typeStr}${treePrefix}${fileName}${hashDisplay}`;
        const paddingNeeded = cols - lineContent.length;
        const fullLine = lineContent + " ".repeat(Math.max(0, paddingNeeded));
        
        if (isFocused) {
          console.log(colors.bgMagenta.white(fullLine));
        } else if (isSelected) {
          console.log(colors.bgBrightMagenta.black(fullLine));
        }
      } else {
        // Normal rendering without background
        const sizeDisplay = showSizeColumn ? (isDeleting || isDeleted ? indicatorColor(sizeStr) : colors.gray(sizeStr)) : "";
        const typeDisplay = showTypeColumn ? (isDeleting || isDeleted ? indicatorColor(typeStr) : colors.gray(typeStr)) : "";
        const fileDisplay = `${colors.gray(treePrefix)}${pathColor(fileName)}${colors.gray(hashDisplay)}`;
        console.log(`${coloredIndicators} ${sizeDisplay}${typeDisplay}${fileDisplay}`);
      }
    }
  });
  
  // No need to fill remaining space since we cleared the entire area first
}

export function renderDetailView(state: BrowseState) {
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
  
  // Add size if available
  if (file.size !== undefined) {
    printLine(`${colors.gray("Size:")} ${formatFileSize(file.size)}`);
  }
  
  // Add content type if available
  if (file.contentType) {
    printLine(`${colors.gray("Type:")} ${file.contentType}`);
  }
  
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

export function render(state: BrowseState) {
  if (!state.filterMode) {
    hideCursor();
  }
  clearScreen();
  
  // Update page size based on current terminal size
  const { rows } = getTerminalSize();
  state.pageSize = rows - 5; // Header (2) + Path row (1) + Footer (2)
  
  renderHeader(state);
  
  if (state.viewMode === "list") {
    renderFileList(state);
  } else {
    renderDetailView(state);
  }
  
  renderFooter(state);
}

export function renderUpdate(state: BrowseState) {
  if (!state.filterMode) {
    hideCursor();
  }
  
  // Update page size based on current terminal size
  const { rows } = getTerminalSize();
  state.pageSize = rows - 5; // Header (2) + Path row (1) + Footer (2)
  
  // Don't clear screen, just update parts
  renderHeader(state);
  renderFileList(state);
  renderFooter(state);
}