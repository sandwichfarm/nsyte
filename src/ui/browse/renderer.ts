import { colors } from "@cliffy/ansi/colors";
import type { BrowseState } from "./state.ts";
import { RELAY_SYMBOL, SERVER_SYMBOL } from "../../commands/ls.ts";
import { isIgnored } from "../../lib/files.ts";

export function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
}

export function clearScreen() {
  console.clear();
  console.write("\x1b[H");
}

export function getTerminalSize() {
  return Deno.consoleSize();
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
  const { cols } = getTerminalSize();
  console.log(colors.gray("─".repeat(cols)));
  
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
        `${colors.gray("s")} Toggle selected`,
        `${colors.gray("ENTER")} Details`,
        `${colors.gray("DEL")} Delete`,
        `${colors.gray("q")} Quit`
      ];
      
      if (state.selectedItems.size > 0) {
        hotkeys.push(`${colors.magenta(`[${state.selectedItems.size} selected]`)}`);
      }
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
  
  const startIndex = state.page * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, state.filteredFiles.length);
  const pageFiles = state.filteredFiles.slice(startIndex, endIndex);
  
  // Calculate max relay/server counts for alignment
  const maxRelayCount = Math.max(...state.files.map(f => f.foundOnRelays.length), 1);
  const maxServerCount = Math.max(...state.files.map(f => f.availableOnServers.length), 1);
  
  pageFiles.forEach((file, index) => {
    const globalIndex = startIndex + index;
    const isSelected = state.selectedItems.has(globalIndex);
    const isFocused = globalIndex === state.selectedIndex;
    
    const relativePath = file.path.startsWith("/") ? file.path.substring(1) : file.path;
    const shouldBeIgnored = isIgnored(relativePath, state.ignoreRules, false);
    
    // Build indicators with proper alignment
    let relayIndicators = "";
    file.foundOnRelays.forEach(relay => {
      const colorFn = state.relayColorMap.get(relay) || colors.white;
      relayIndicators += colorFn(RELAY_SYMBOL);
    });
    relayIndicators = relayIndicators.padEnd(maxRelayCount);
    
    let serverIndicators = "";
    file.availableOnServers.forEach(server => {
      const colorFn = state.serverColorMap.get(server) || colors.white;
      serverIndicators += colorFn(SERVER_SYMBOL);
    });
    serverIndicators = serverIndicators.padEnd(maxServerCount);
    
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
    
    const hashDisplay = colors.gray(` [${truncateHash(file.sha256)}]`);
    
    // Calculate available width for path
    const indicatorsWidth = maxRelayCount + 3 + maxServerCount + 1; // +1 for space after indicators
    const hashWidth = hashDisplay.length;
    const availablePathWidth = cols - indicatorsWidth - hashWidth - 2;
    
    let displayPath = file.path;
    if (displayPath.length > availablePathWidth) {
      displayPath = "..." + displayPath.substring(displayPath.length - availablePathWidth + 3);
    }
    
    let line = `${indicators} ${pathColor(displayPath)}${hashDisplay}`;
    
    if (isFocused) {
      // Fill the entire line width for focused item
      const lineContent = `${indicators} ${displayPath}${hashDisplay}`;
      const paddingNeeded = cols - lineContent.length;
      line = colors.bgMagenta.white(lineContent + " ".repeat(Math.max(0, paddingNeeded)));
    }
    
    console.log(line);
  });
  
  // Fill remaining space
  const remainingRows = contentRows - pageFiles.length;
  for (let i = 0; i < remainingRows; i++) {
    console.log(" ".repeat(cols));
  }
}

export function renderDetailView(state: BrowseState) {
  const { rows, cols } = getTerminalSize();
  const contentRows = rows - 4;
  
  if (state.detailIndex === null || !state.filteredFiles[state.detailIndex]) {
    return;
  }
  
  const file = state.filteredFiles[state.detailIndex];
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