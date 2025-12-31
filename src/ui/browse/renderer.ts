import { colors } from "@cliffy/ansi/colors";
import type { BrowseState } from "./state.ts";
import { RELAY_SYMBOL, RELAY_SYMBOL_ALT, SERVER_SYMBOL } from "../../commands/list.ts";
import { isIgnored } from "../../lib/files.ts";
import { formatTimestamp } from "../time-formatter.ts";
import { addLineNumbers, highlightJson } from "../json-highlighter.ts";
import { getPropagationDisplay } from "../../lib/propagation-stats.ts";
import { npubEncode } from "applesauce-core/helpers";

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
    cols: size.columns,
  };
}

export function renderHeader(state: BrowseState) {
  const { cols } = getTerminalSize();
  const title = colors.bold.cyan("nsyte browse");

  // Format the npub
  const npub = npubEncode(state.pubkey);
  const identity = colors.green(`[${npub.substring(0, 12)}...${npub.substring(npub.length - 6)}]`);

  const legendItems: string[] = [];

  if (state.relayColorMap.size > 0) {
    // Sort relays for deterministic symbol assignment
    const sortedRelays = Array.from(state.relayColorMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    sortedRelays.forEach(([relay, colorFn], relayIndex) => {
      const shortRelay = relay.replace(/^wss?:\/\//, "").substring(0, 15);
      const symbol = relayIndex % 2 === 0 ? RELAY_SYMBOL : RELAY_SYMBOL_ALT;
      legendItems.push(`${colorFn(symbol)} ${shortRelay}`);
    });
  }

  if (state.serverColorMap.size > 0) {
    // Sort servers for deterministic display order
    const sortedServers = Array.from(state.serverColorMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    sortedServers.forEach(([server, colorFn]) => {
      const shortServer = server.replace(/^https?:\/\//, "").substring(0, 15);
      legendItems.push(`${colorFn(SERVER_SYMBOL)} ${shortServer}`);
    });
  }

  const legend = legendItems.join(" ");
  const titleAndIdentity = `${title} ${identity}`;
  const legendMaxWidth = cols - titleAndIdentity.length - 3;
  const truncatedLegend = legend.length > legendMaxWidth
    ? legend.substring(0, legendMaxWidth - 3) + "..."
    : legend;

  // Move to header position and clear lines
  moveCursor(1, 1);
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
  Deno.stdout.writeSync(
    new TextEncoder().encode(`${titleAndIdentity} ${colors.gray(truncatedLegend)}\n`),
  );
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
    if (state.authMode === "select") {
      hotkeys = [
        `${colors.gray("1")} Private Key (hex)`,
        `${colors.gray("2")} Private Key (nsec)`,
        `${colors.gray("3")} NostrBunker (nbunksec)`,
        `${colors.gray("ESC")} Cancel`,
      ];
    } else if (state.authMode === "input") {
      hotkeys = [
        `${colors.yellow(state.authPrompt || "Enter authentication:")}`,
        `${colors.gray("ESC")} Cancel`,
      ];
      if (state.authInput) {
        hotkeys.push(
          `${
            colors.gray(`[${
              state.authChoice === "nbunksec" || state.authChoice === "nsec"
                ? "•".repeat(state.authInput.length)
                : state.authInput
            }]`)
          }`,
        );
      }
    } else if (state.confirmingDelete) {
      hotkeys = [
        `${colors.red("Type 'yes' to confirm")}`,
        `${colors.gray("ESC")} Cancel`,
      ];
      if (state.deleteConfirmText) {
        hotkeys.push(`${colors.yellow(`[${state.deleteConfirmText}]`)}`);
      }
    } else {
      hotkeys = [
        `${colors.gray("↑↓")} Navigate`,
        `${colors.gray("←→")} Pages`,
        `${colors.gray("SPACE")} Select`,
        `${colors.gray("s")} ${state.showSelectedOnly ? "View All" : "View Selected"}${
          state.selectedItems.size > 0 ? ` [${state.selectedItems.size}]` : ""
        }`,
      ];

      if (state.selectedItems.size > 0) {
        hotkeys.push(`${colors.gray("a")} Deselect all`);
      }

      hotkeys.push(
        `${colors.gray("ENTER")} Details`,
        `${colors.gray("/")} Filter`,
        `${colors.gray("DEL")} Delete`,
        `${colors.gray("i")} Identity`,
        `${colors.gray("q")} Quit`,
      );
    }
  } else {
    hotkeys = [`${colors.gray("Any key")} Back to list`];
  }

  const hotkeysText = hotkeys.join(" │ ");

  // Calculate padding to right-align status
  const statusLength = statusText.replace(/\x1b\[[0-9;]*m/g, "").length; // Remove ANSI codes for length
  const hotkeysLength = hotkeysText.replace(/\x1b\[[0-9;]*m/g, "").length;
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

  // Calculate variables needed for both filter and normal mode
  const startIndex = state.page * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, state.treeItems.length);
  const pageItems = state.treeItems.slice(startIndex, endIndex);

  // Calculate tree root column position
  const maxRelayCount = Math.max(...state.files.map((f) => f.foundOnRelays.length), 3);
  const maxServerCount = Math.max(...state.files.map((f) => f.availableOnServers.length), 3);
  const treeRootCol = maxRelayCount + maxServerCount + 2; // indicators + spaces + tree starts here

  let hasConnector = false;

  if (state.filterMode) {
    // Show filter input with blinking cursor
    showCursor();
    const filterDisplay = `Filter: ${state.filterText}_`;
    Deno.stdout.writeSync(new TextEncoder().encode(colors.cyan(filterDisplay) + "\n"));
  } else {
    // Make sure cursor is hidden
    hideCursor();

    // Get the parent path of the first item on the page
    let pathIndicator = "/";
    if (pageItems.length > 0) {
      const firstItem = pageItems[0];
      const parts = firstItem.path.split("/");
      if (parts.length > 1) {
        pathIndicator = "/" + parts.slice(0, -1).join("/");
      }
    }

    // Build propagation stats display
    const { cols } = getTerminalSize();

    let propagationStats = "";
    if (state.propagationStats) {
      const relayPropagation = getPropagationDisplay(state.propagationStats.relayStrength);
      const serverPropagation = getPropagationDisplay(state.propagationStats.serverStrength);

      const relayDisplay = `${
        relayPropagation.color(relayPropagation.symbol)
      } ${relayPropagation.label}`;
      const serverDisplay = `${
        serverPropagation.color(serverPropagation.symbol)
      } ${serverPropagation.label}`;
      propagationStats = `R:${relayDisplay} S:${serverDisplay}`;
    }

    // Show filter indicator if active and calculate connector
    let pathDisplay: string;

    const pathText = state.filterText
      ? `[${pathIndicator}] (filtered: ${state.filterText})`
      : `[${pathIndicator}]`;

    // Calculate path length without ANSI codes
    const pathLength = pathText.length;

    // Only draw connector if path is shorter than tree root column and we have tree items
    let pathConnector = "";
    if (pathLength < treeRootCol && pageItems.some((item) => item.depth >= 0)) {
      const horizontalLength = treeRootCol - pathLength;
      if (horizontalLength > 0) {
        pathConnector = "─".repeat(horizontalLength) + "┐";
        hasConnector = true;
      }
    }

    if (state.filterText) {
      pathDisplay = colors.gray(`[${pathIndicator}] `) +
        colors.cyan(`(filtered: ${state.filterText})`) + colors.gray(pathConnector);
    } else {
      pathDisplay = colors.gray(`[${pathIndicator}]`) + colors.gray(pathConnector);
    }

    // Calculate padding to right-align propagation stats (if available)
    const pathDisplayLength = pathDisplay.replace(/\x1b\[[0-9;]*m/g, "").length;
    const propagationLength = propagationStats.replace(/\x1b\[[0-9;]*m/g, "").length;

    if (propagationStats) {
      const padding = Math.max(1, cols - pathDisplayLength - propagationLength - 1);
      // Render path and propagation stats
      Deno.stdout.writeSync(
        new TextEncoder().encode(pathDisplay + " ".repeat(padding) + propagationStats + "\n"),
      );
    } else {
      // Render just the path if no propagation stats available yet
      Deno.stdout.writeSync(new TextEncoder().encode(pathDisplay + "\n"));
    }
  }

  // Move to start of actual file list (row 4)
  moveCursor(4, 1);

  // Calculate max relay/server counts for alignment (minimum 3 for visual consistency)
  const maxRelayCountForDisplay = Math.max(...state.files.map((f) => f.foundOnRelays.length), 3);
  const maxServerCountForDisplay = Math.max(
    ...state.files.map((f) => f.availableOnServers.length),
    3,
  );

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
      const dirName = item.path.split("/").pop() || item.path;
      const emptyIndicators = " ".repeat(maxRelayCountForDisplay) + " " +
        " ".repeat(maxServerCountForDisplay);
      console.log(`${emptyIndicators} ${colors.gray(treePrefix)}${colors.gray(dirName + "/")}`);
    } else if (item.file) {
      // Render file
      const fileName = item.path.split("/").pop() || item.path;
      const relativePath = item.file
        ? (item.file.path.startsWith("/") ? item.file.path.substring(1) : item.file.path)
        : item.path;
      const shouldBeIgnored = isIgnored(relativePath, state.ignoreRules, false);

      // Build indicators
      let relayIndicators = "";
      let serverIndicators = "";

      if (item.file) {
        // Use sorted relay order (same as legend) and check if file is found on each relay
        const sortedRelays = Array.from(state.relayColorMap.keys()).sort();
        sortedRelays.forEach((relay, relayIndex) => {
          if (item.file!.foundOnRelays.includes(relay)) {
            const colorFn = state.relayColorMap.get(relay) || colors.white;
            const symbol = relayIndex % 2 === 0 ? RELAY_SYMBOL : RELAY_SYMBOL_ALT;
            relayIndicators += colorFn(symbol);
          }
        });
        relayIndicators += " ".repeat(maxRelayCountForDisplay - item.file.foundOnRelays.length);

        // Use sorted server order (same as legend) and check if file is available on each server
        const sortedServers = Array.from(state.serverColorMap.keys()).sort();
        sortedServers.forEach((server) => {
          if (item.file!.availableOnServers.includes(server)) {
            const colorFn = state.serverColorMap.get(server) || colors.white;
            serverIndicators += colorFn(SERVER_SYMBOL);
          }
        });
        serverIndicators += " ".repeat(
          maxServerCountForDisplay - item.file.availableOnServers.length,
        );
      } else {
        // Directory - show empty indicators
        relayIndicators = " ".repeat(maxRelayCountForDisplay);
        serverIndicators = " ".repeat(maxServerCountForDisplay);
      }

      const indicators = `${relayIndicators} ${serverIndicators}`;

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
        const fileDisplay = `${colors.gray(treePrefix)}${pathColor(fileName)}${
          colors.gray(hashDisplay)
        }`;
        console.log(`${coloredIndicators} ${fileDisplay}`);
      }
    }
  });

  // No need to fill remaining space since we cleared the entire area first
}

export function renderDetailView(state: BrowseState) {
  const { rows, cols } = getTerminalSize();
  const contentRows = rows - 5; // Header (2) + Path row (1) + Footer (2)

  if (
    state.detailIndex === null || !state.treeItems[state.detailIndex] ||
    !state.treeItems[state.detailIndex].file
  ) {
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
    // Use sorted relay order (same as legend) and only show relays where file is found
    const sortedRelays = Array.from(state.relayColorMap.keys()).sort();
    sortedRelays.forEach((relay, relayIndex) => {
      if (file.foundOnRelays.includes(relay)) {
        const colorFn = state.relayColorMap.get(relay) || colors.white;
        const symbol = relayIndex % 2 === 0 ? RELAY_SYMBOL : RELAY_SYMBOL_ALT;
        printLine(`  ${colorFn(symbol)} ${relay}`);
      }
    });
    printLine();
  }

  if (file.availableOnServers.length > 0) {
    printLine(colors.bold("Available on Servers:"));
    // Use sorted server order (same as legend) and only show servers where file is available
    const sortedServers = Array.from(state.serverColorMap.keys()).sort();
    sortedServers.forEach((server) => {
      if (file.availableOnServers.includes(server)) {
        const colorFn = state.serverColorMap.get(server) || colors.white;
        printLine(`  ${colorFn(SERVER_SYMBOL)} ${server}`);
      }
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
      withLineNumbers.split("\n").forEach((line) => {
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
