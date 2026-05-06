import { colors } from "@cliffy/ansi/colors";
import {
  clearScreen,
  getTerminalSize,
  hideCursor,
  moveCursor,
} from "../browse/renderer.ts";
import type { DryRunViewState, TagGroup } from "./state.ts";

const encoder = new TextEncoder();

function write(text: string): void {
  Deno.stdout.writeSync(encoder.encode(text));
}

/**
 * Render the dry-run TUI based on current state.
 */
export function render(state: DryRunViewState): void {
  hideCursor();
  clearScreen();

  if (state.viewMode === "event-list") {
    renderEventList(state);
  } else {
    renderTagTree(state);
  }
}

/**
 * Render the event list view.
 */
function renderEventList(state: DryRunViewState): void {
  const { cols } = getTerminalSize();

  // Header
  moveCursor(1, 1);
  write(colors.bold.yellow("[DRY RUN]") + " " + colors.bold.cyan("Event Inspector"));
  moveCursor(2, 1);
  write(colors.dim("\u2500".repeat(Math.min(cols - 2, 60))));

  // Event count
  moveCursor(3, 1);
  write(colors.dim(`${state.events.length} event(s) would be published:`));

  // Event list
  const startRow = 5;
  for (let i = 0; i < state.events.length; i++) {
    const event = state.events[i];
    const isSelected = i === state.selectedEventIndex;
    const row = startRow + i;

    moveCursor(row, 1);
    const prefix = isSelected ? colors.cyan("\u25b8 ") : "  ";
    const label = isSelected
      ? colors.bold.white(event.label)
      : colors.white(event.label);
    const kindStr = colors.dim(` (${event.template.tags.length} tags)`);

    write(prefix + label + kindStr);
  }

  // Footer
  renderEventListFooter(startRow + state.events.length + 2);
}

/**
 * Render the tag tree view for a selected event.
 */
function renderTagTree(state: DryRunViewState): void {
  const { cols, rows } = getTerminalSize();
  const event = state.events[state.selectedEventIndex];

  // Header
  moveCursor(1, 1);
  write(colors.bold.yellow("[DRY RUN]") + " " + colors.bold.cyan(event.label));
  moveCursor(2, 1);
  write(colors.dim("\u2500".repeat(Math.min(cols - 2, 60))));

  // Event metadata
  moveCursor(3, 1);
  const contentDesc = event.template.content.length > 0
    ? event.template.content.length + " chars"
    : "(empty)";
  write(
    colors.dim(
      `Kind: ${event.template.kind}  |  Tags: ${event.template.tags.length}  |  Content: ${contentDesc}`,
    ),
  );

  // Tag groups
  const startRow = 5;
  let currentRow = startRow;
  const maxRow = rows - 4; // Leave room for footer

  for (let i = 0; i < state.tagGroups.length && currentRow < maxRow; i++) {
    const group = state.tagGroups[i];
    const isSelected = i === state.selectedGroupIndex;
    const isExpanded = state.expandedGroups.has(group.name);

    // Group header
    moveCursor(currentRow, 1);
    const prefix = isSelected ? colors.cyan("\u25b8 ") : "  ";
    const expandIcon = isExpanded ? "\u25be" : "\u25b8";
    const groupLabel = formatGroupLabel(group);
    const groupLine = isSelected
      ? colors.bold.white(`${expandIcon} ${groupLabel}`)
      : colors.white(`${expandIcon} ${groupLabel}`);

    write(prefix + groupLine);
    currentRow++;

    // Expanded tag details
    if (isExpanded) {
      const maxTags = Math.min(group.tags.length, maxRow - currentRow - 2);
      for (let j = 0; j < maxTags; j++) {
        const tag = group.tags[j];
        moveCursor(currentRow, 1);
        write("    " + formatTag(tag, cols - 6));
        currentRow++;
      }
      if (group.tags.length > maxTags) {
        moveCursor(currentRow, 1);
        write(colors.dim(`    ... and ${group.tags.length - maxTags} more`));
        currentRow++;
      }
    }
  }

  // Footer
  renderTagTreeFooter(Math.max(currentRow + 1, rows - 2));
}

/**
 * Format a tag group label with count and description.
 */
function formatGroupLabel(group: TagGroup): string {
  const { name, count } = group;

  // Provide descriptive counts for known tag types
  switch (name) {
    case "path":
      return `${name} ${colors.dim(`(${count} file hash${count !== 1 ? "es" : ""})`)}`;
    case "relay":
      return `${name} ${colors.dim(`(${count} relay${count !== 1 ? "s" : ""})`)}`;
    case "server":
      return `${name} ${colors.dim(`(${count} server${count !== 1 ? "s" : ""})`)}`;
    case "k":
      return `${name} ${colors.dim(`(${count} kind${count !== 1 ? "s" : ""})`)}`;
    case "web":
      return `${name} ${colors.dim(`(${count} handler${count !== 1 ? "s" : ""})`)}`;
    default:
      return `${name} ${colors.dim(`(${count})`)}`;
  }
}

/**
 * Format a single tag for display.
 */
function formatTag(tag: string[], maxWidth: number): string {
  if (tag.length === 0) return "";

  if (tag[0] === "path" && tag.length >= 3) {
    // path tags: show path -> truncated hash
    const hash = tag[2].length > 16
      ? `${tag[2].substring(0, 8)}...${tag[2].substring(tag[2].length - 8)}`
      : tag[2];
    return colors.green(tag[1]) + colors.dim(" \u2192 ") + colors.yellow(hash);
  }

  if (tag.length === 2) {
    return colors.green(tag[1]);
  }

  // Generic: join remaining elements
  const value = tag.slice(1).join(", ");
  const truncated = value.length > maxWidth ? value.substring(0, maxWidth - 3) + "..." : value;
  return colors.green(truncated);
}

/**
 * Render footer for event list view.
 */
function renderEventListFooter(row: number): void {
  const { rows } = getTerminalSize();
  const footerRow = Math.max(row, rows - 1);
  moveCursor(footerRow, 1);
  write(colors.dim("\u2191\u2193 navigate  ") + colors.dim("Enter select  ") + colors.dim("q quit"));
}

/**
 * Render footer for tag tree view.
 */
function renderTagTreeFooter(row: number): void {
  const { rows } = getTerminalSize();
  const footerRow = Math.max(row, rows - 1);
  moveCursor(footerRow, 1);
  write(
    colors.dim("\u2191\u2193 navigate  ") +
      colors.dim("Enter expand/collapse  ") +
      colors.dim("e expand all  ") +
      colors.dim("c collapse all  ") +
      colors.dim("Esc back  ") +
      colors.dim("q quit"),
  );
}
