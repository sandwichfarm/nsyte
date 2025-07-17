import { colors } from "@cliffy/ansi/colors";
import type { BrowseState } from "./state.ts";
import { RELAY_SYMBOL, SERVER_SYMBOL } from "../../commands/ls.ts";
import { isIgnored } from "../../lib/files.ts";

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
  const legendItems: string[] = [];
  
  if (state.relayColorMap.size > 0) {
    state.relayColorMap.forEach((colorFn, relay) => {
      const shortRelay = relay.replace(/^wss?:\/\//, '').substring(0, 15);
      legendItems.push(`${colorFn(RELAY_SYMBOL)}${shortRelay}`);
    });
  }
  
  if (state.serverColorMap.size > 0) {
    state.serverColorMap.forEach((colorFn, server) => {
      const shortServer = server.replace(/^https?:\/\//, '').substring(0, 15);
      legendItems.push(`${colorFn(SERVER_SYMBOL)}${shortServer}`);
    });
  }
  
  const legend = legendItems.join(" ");
  const legendMaxWidth = cols - title.length - 3;
  const truncatedLegend = legend.length > legendMaxWidth ? legend.substring(0, legendMaxWidth - 3) + "..." : legend;
  
  console.log(`${title} ${colors.gray(truncatedLegend)}`);
  console.log(colors.gray("─".repeat(cols)));
}

export function renderFooter(state: BrowseState) {
  const { rows, cols } = getTerminalSize();
  
  // Move cursor to footer position
  moveCursor(rows - 1, 1);
  
  // Clear the footer area
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
  console.log(colors.gray("─".repeat(cols)));
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
  
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
        `${colors.gray("s")} Toggle selected${state.selectedItems.size > 0 ? ` [${state.selectedItems.size}]` : ''}`,
        `${colors.gray("ENTER")} Details`,
        `${colors.gray("DEL")} Delete`,
        `${colors.gray("q")} Quit`
      ];
    }
  } else {
    hotkeys = [`${colors.gray("Any key")} Back to list`];
  }
  
  const hotkeysText = hotkeys.join(" │ ");
  const padding = Math.max(0, cols - hotkeysText.length) / 2;
  console.log(" ".repeat(Math.floor(padding)) + hotkeysText);
}

export function renderFileList(state: BrowseState) {
  const { rows, cols } = getTerminalSize();
  const contentRows = rows - 4; // Header (2) + Footer (2)
  
  // Move cursor to start of file list area (row 3)
  moveCursor(3, 1);
  
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
      let pathColor;
      if (isFocused) {
        pathColor = colors.bgMagenta.white;
      } else if (isSelected) {
        pathColor = colors.brightMagenta;
      } else if (shouldBeIgnored) {
        pathColor = colors.red;
      } else {
        pathColor = colors.white;
      }
      
      const hashDisplay = colors.gray(` [${truncateHash(item.file.sha256)}]`);
      const fileDisplay = `${colors.gray(treePrefix)}${pathColor(fileName)}${hashDisplay}`;
      
      if (isFocused) {
        const lineContent = `${indicators} ${treePrefix}${fileName}${hashDisplay}`;
        const paddingNeeded = cols - lineContent.length;
        console.log(colors.bgMagenta.white(`${indicators} ${treePrefix}${fileName}${hashDisplay}` + " ".repeat(Math.max(0, paddingNeeded))));
      } else {
        console.log(`${indicators} ${fileDisplay}`);
      }
    }
  });
  
  // Fill remaining space
  const remainingRows = contentRows - pageItems.length;
  for (let i = 0; i < remainingRows; i++) {
    console.log(" ".repeat(cols));
  }
}

export function renderDetailView(state: BrowseState) {
  const { rows, cols } = getTerminalSize();
  const contentRows = rows - 4;
  
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
  
  // Fill remaining space
  while (currentRow < contentRows) {
    printLine();
  }
}

export function render(state: BrowseState) {
  hideCursor();
  clearScreen();
  
  // Update page size based on current terminal size
  const { rows } = getTerminalSize();
  state.pageSize = rows - 4;
  
  renderHeader(state);
  
  if (state.viewMode === "list") {
    renderFileList(state);
  } else {
    renderDetailView(state);
  }
  
  renderFooter(state);
}