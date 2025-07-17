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
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[H"));
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
  
  // Calculate max relay/server counts for alignment (minimum 3 for visual consistency)
  const maxRelayCount = Math.max(...state.files.map(f => f.foundOnRelays.length), 3);
  const maxServerCount = Math.max(...state.files.map(f => f.availableOnServers.length), 3);
  
  // Build directory tree structure
  const directories = new Map<string, Set<string>>();
  const rootFiles = new Set<string>();
  
  // Organize files into directory structure
  state.filteredFiles.forEach(file => {
    const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
    const parts = path.split('/');
    
    if (parts.length === 1) {
      rootFiles.add(path);
    } else {
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        
        if (!directories.has(parentPath)) {
          directories.set(parentPath, new Set());
        }
        directories.get(parentPath)!.add(currentPath);
        
        if (!directories.has(currentPath)) {
          directories.set(currentPath, new Set());
        }
      }
      
      // Add file to its parent directory
      const parentDir = parts.slice(0, -1).join('/');
      directories.get(parentDir)!.add(path);
    }
  });
  
  // Render files with tree structure
  let currentRow = 0;
  const renderedPaths = new Set<string>();
  
  const renderTreeNode = (path: string, depth: number, isLast: boolean, parentPrefix: string = '') => {
    if (currentRow >= endIndex || currentRow < startIndex) {
      currentRow++;
      return;
    }
    
    const file = state.filteredFiles.find(f => (f.path.startsWith("/") ? f.path.substring(1) : f.path) === path);
    const isDirectory = !file && directories.has(path);
    
    if (currentRow >= startIndex && currentRow < endIndex) {
      const globalIndex = state.filteredFiles.findIndex(f => (f.path.startsWith("/") ? f.path.substring(1) : f.path) === path);
      const isSelected = globalIndex >= 0 && state.selectedItems.has(globalIndex);
      const isFocused = globalIndex === state.selectedIndex;
      
      // Build tree prefix
      let treePrefix = parentPrefix;
      if (depth > 0) {
        treePrefix += isLast ? "└─ " : "├─ ";
      }
      
      if (isDirectory) {
        // Render directory
        const dirName = path.split('/').pop() || path;
        const emptyIndicators = " ".repeat(maxRelayCount) + ` ${colors.gray("│")} ` + " ".repeat(maxServerCount);
        console.log(`${emptyIndicators} ${colors.gray(treePrefix)}${colors.gray(dirName + '/')}`);
      } else if (file) {
        // Render file
        const fileName = path.split('/').pop() || path;
        const relativePath = file.path.startsWith("/") ? file.path.substring(1) : file.path;
        const shouldBeIgnored = isIgnored(relativePath, state.ignoreRules, false);
        
        // Build indicators
        let relayIndicators = "";
        file.foundOnRelays.forEach(relay => {
          const colorFn = state.relayColorMap.get(relay) || colors.white;
          relayIndicators += colorFn(RELAY_SYMBOL);
        });
        relayIndicators += " ".repeat(maxRelayCount - file.foundOnRelays.length);
        
        let serverIndicators = "";
        file.availableOnServers.forEach(server => {
          const colorFn = state.serverColorMap.get(server) || colors.white;
          serverIndicators += colorFn(SERVER_SYMBOL);
        });
        serverIndicators += " ".repeat(maxServerCount - file.availableOnServers.length);
        
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
        const fileDisplay = `${colors.gray(treePrefix)}${pathColor(fileName)}${hashDisplay}`;
        
        if (isFocused) {
          const lineContent = `${indicators} ${treePrefix}${fileName}${hashDisplay}`;
          const paddingNeeded = cols - lineContent.length;
          console.log(colors.bgMagenta.white(`${indicators} ${treePrefix}${fileName}${hashDisplay}` + " ".repeat(Math.max(0, paddingNeeded))));
        } else {
          console.log(`${indicators} ${fileDisplay}`);
        }
      }
    }
    
    currentRow++;
    renderedPaths.add(path);
    
    // Render children
    if (isDirectory && directories.has(path)) {
      const children = Array.from(directories.get(path)!).sort();
      const childPrefix = parentPrefix + (depth > 0 ? (isLast ? "   " : "│  ") : "");
      
      children.forEach((child, index) => {
        if (!renderedPaths.has(child)) {
          renderTreeNode(child, depth + 1, index === children.length - 1, childPrefix);
        }
      });
    }
  };
  
  // Render root level items
  const rootItems = Array.from(rootFiles).concat(
    Array.from(directories.get('') || [])
  ).sort();
  
  rootItems.forEach((item, index) => {
    renderTreeNode(item, 0, index === rootItems.length - 1);
  });
  
  // Fill remaining space
  const renderedRows = Math.min(currentRow - startIndex, pageFiles.length);
  const remainingRows = contentRows - renderedRows;
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