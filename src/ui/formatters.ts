import { colors } from "@cliffy/ansi/colors";
import { DisplayMode, getDisplayManager } from "../lib/display-mode.ts";

/**
 * Format a title section with color
 */
export function formatTitle(text: string): string {
  return colors.bold(colors.cyan(text));
}

/**
 * Format a section header
 */
export function formatSectionHeader(text: string): string {
  return colors.magenta.bold(text);
}

/**
 * Format a list of relays
 */
export function formatRelayList(relays: string[]): string {
  const displayManager = getDisplayManager();

  if (displayManager.isNonInteractive()) {
    return relays.join(", ");
  }

  // In interactive mode, format relays nicely
  if (relays.length <= 3 || displayManager.isDebug()) {
    return relays.map((relay) => colors.cyan(relay)).join(", ");
  }

  // Show first 3 relays and count
  const visibleRelays = relays.slice(0, 3).map((relay) => colors.cyan(relay)).join(", ");
  return `${visibleRelays} and ${colors.yellow(String(relays.length - 3))} more`;
}

/**
 * Format a file path
 */
export function formatFilePath(path: string): string {
  const parts = path.split("/");
  const filename = parts.pop() || "";
  const directory = parts.join("/");

  if (directory) {
    return `${colors.gray(directory + "/")}${colors.white(filename)}`;
  }

  return colors.white(filename);
}

/**
 * Format a file size
 */
export function formatFileSize(sizeInBytes?: number): string {
  if (sizeInBytes === undefined) {
    return colors.gray("unknown size");
  }

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  }

  if (sizeInBytes < 1024 * 1024 * 1024) {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format a percentage
 */
export function formatPercentage(value: number, total: number): string {
  if (total === 0) {
    return "0%";
  }

  const percentage = Math.round((value / total) * 100);

  let colorFn = colors.red;
  if (percentage >= 90) {
    colorFn = colors.green;
  } else if (percentage >= 60) {
    colorFn = colors.yellow;
  }

  return colorFn(`${percentage}%`);
}

/**
 * Format a file success ratio
 */
export function formatSuccessRatio(success: number, total: number): string {
  const ratio = `${success}/${total}`;
  const percentage = formatPercentage(success, total);

  if (success === total) {
    return colors.green(`${ratio} (${percentage})`);
  }

  if (success === 0) {
    return colors.red(`${ratio} (${percentage})`);
  }

  return colors.yellow(`${ratio} (${percentage})`);
}

/**
 * Format a file status
 */
export function formatFileStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "new":
      return colors.green("New");
    case "unchanged":
      return colors.gray("Unchanged");
    case "modified":
      return colors.yellow("Modified");
    case "deleted":
      return colors.red("Deleted");
    default:
      return status;
  }
}

/**
 * Format a summary of files by status
 */
export function formatFileSummary(
  newCount: number,
  unchangedCount: number,
  deletedCount: number,
): string {
  const displayManager = getDisplayManager();

  if (displayManager.isNonInteractive()) {
    return `${newCount} new, ${unchangedCount} unchanged, ${deletedCount} to delete`;
  }

  const parts = [];

  if (newCount > 0) {
    parts.push(`${colors.green(String(newCount))} new`);
  }

  if (unchangedCount > 0) {
    parts.push(`${colors.gray(String(unchangedCount))} unchanged`);
  }

  if (deletedCount > 0) {
    parts.push(`${colors.red(String(deletedCount))} to delete`);
  }

  if (parts.length === 0) {
    return "No files";
  }

  return parts.join(", ");
}

/**
 * Create a simple table with rows
 */
export function formatTable(rows: string[][], indent: number = 0): string {
  if (rows.length === 0) {
    return "";
  }

  // Find the maximum width of each column
  const columnWidths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      // Strip ANSI color codes for width calculation
      const cellWidth = row[i].replace(/\u001b\[\d+m/g, "").length;
      if (!columnWidths[i] || cellWidth > columnWidths[i]) {
        columnWidths[i] = cellWidth;
      }
    }
  }

  // Format each row
  const formattedRows = rows.map((row) => {
    const paddedCells = row.map((cell, i) => {
      // Don't pad the last column
      if (i === row.length - 1) {
        return cell;
      }

      // Calculate padding length accounting for ANSI color codes
      const contentLength = cell.replace(/\u001b\[\d+m/g, "").length;
      const paddingLength = columnWidths[i] - contentLength + 2; // 2 spaces padding between columns

      return cell + " ".repeat(paddingLength);
    });

    return " ".repeat(indent) + paddedCells.join("");
  });

  return formattedRows.join("\n");
}

/**
 * Format server results
 */
export function formatServerResults(
  serverResults: Record<string, { success: number; total: number }>,
): string {
  const displayManager = getDisplayManager();

  if (Object.keys(serverResults).length === 0) {
    return "No server results available";
  }

  if (displayManager.isNonInteractive()) {
    return Object.entries(serverResults)
      .map(([server, stats]) =>
        `${server}: ${stats.success}/${stats.total} (${
          Math.round((stats.success / stats.total) * 100)
        }%)`
      )
      .join(", ");
  }

  const rows: string[][] = [];

  for (const [server, stats] of Object.entries(serverResults)) {
    const serverName = server;
    const ratio = formatSuccessRatio(stats.success, stats.total);

    const status = stats.success === stats.total
      ? colors.green("✓")
      : (stats.success === 0 ? colors.red("✗") : colors.yellow("!"));

    rows.push([status, serverName, ratio]);
  }

  return formatTable(rows);
}

/**
 * Format a summary title
 */
export function formatSummaryTitle(text: string, success: boolean): string {
  return success ? colors.green(text) : colors.yellow(text);
}

/**
 * Formats a single configuration line for display.
 * Pads the label and adds a (default) marker if applicable.
 */
export function formatConfigValue(
  label: string,
  value: string | number | boolean,
  isDefault: boolean,
): string {
  const PADDING = 35; // Adjust as needed
  const labelPadded = label.padEnd(PADDING - 1) + ":"; // Pad label and add colon
  let valueStr: string;

  if (typeof value === "boolean") {
    valueStr = value ? colors.green("true") : colors.red("false");
  } else if (typeof value === "number") {
    valueStr = colors.yellow(String(value));
  } else if (Array.isArray(value)) {
    // Assuming formatRelayList handles colors
    valueStr = value.length > 0 ? value.join(", ") : colors.gray("none");
  } else {
    // Assuming formatRelayList handles colors for relays/servers
    // For other strings like user, fallback, etc., use cyan
    valueStr = value === "none" ? colors.gray("none") : colors.cyan(String(value));
  }

  const defaultMarker = isDefault ? colors.dim(" (default)") : "";
  return `${labelPadded} ${valueStr}${defaultMarker}`;
}

/**
 * Format a progress bar
 */
export function formatProgressBar(current: number, total: number, width: number = 20): string {
  if (total === 0) {
    return "[" + "░".repeat(width) + "] 0%";
  }

  const percentage = Math.min(100, Math.floor((current / total) * 100));
  const filledWidth = Math.floor((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const filled = "█".repeat(filledWidth);
  const empty = "░".repeat(emptyWidth);

  return `[${colors.green(filled)}${colors.gray(empty)}] ${percentage}%`;
}

/**
 * Format a duration in milliseconds to human readable format
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }

  if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(1)}s`;
  }

  if (milliseconds < 3600000) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}
