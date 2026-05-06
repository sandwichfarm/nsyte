import type { DryRunViewState } from "./state.ts";
import {
  collapseAllGroups,
  expandAllGroups,
  goBackToEventList,
  navigateDown,
  navigateUp,
  selectEvent,
  toggleGroup,
} from "./state.ts";

/** Result of processing a keypress */
export type KeyResult = "quit" | "render" | "none";

/**
 * Decode raw stdin bytes into a key name.
 */
export function decodeKey(buf: Uint8Array, bytesRead: number): string {
  if (bytesRead === 0) return "";

  // Escape sequences (arrow keys)
  if (bytesRead === 3 && buf[0] === 27 && buf[1] === 91) {
    switch (buf[2]) {
      case 65:
        return "up";
      case 66:
        return "down";
      case 67:
        return "right";
      case 68:
        return "left";
    }
  }

  // Single byte keys
  if (bytesRead === 1) {
    switch (buf[0]) {
      case 13:
        return "enter"; // CR
      case 10:
        return "enter"; // LF
      case 27:
        return "escape";
      case 127:
        return "backspace";
      case 3:
        return "ctrl-c"; // Ctrl+C
      default: {
        const char = String.fromCharCode(buf[0]);
        return char;
      }
    }
  }

  return "";
}

/**
 * Handle a keypress in the dry-run inspector.
 * Returns "quit" to exit, "render" to re-render, or "none" for no change.
 */
export function handleKeypress(
  state: DryRunViewState,
  key: string,
): KeyResult {
  // Global: quit
  if (key === "q" || key === "ctrl-c") {
    return "quit";
  }

  if (state.viewMode === "event-list") {
    return handleEventListKey(state, key);
  } else {
    return handleTagTreeKey(state, key);
  }
}

/**
 * Handle keys in event-list view.
 */
function handleEventListKey(
  state: DryRunViewState,
  key: string,
): KeyResult {
  switch (key) {
    case "up":
    case "k":
      navigateUp(state);
      return "render";

    case "down":
    case "j":
      navigateDown(state);
      return "render";

    case "enter":
      selectEvent(state, state.selectedEventIndex);
      return "render";

    default:
      return "none";
  }
}

/**
 * Handle keys in tag-tree view.
 */
function handleTagTreeKey(
  state: DryRunViewState,
  key: string,
): KeyResult {
  switch (key) {
    case "up":
    case "k":
      navigateUp(state);
      return "render";

    case "down":
    case "j":
      navigateDown(state);
      return "render";

    case "enter": {
      const group = state.tagGroups[state.selectedGroupIndex];
      if (group) {
        toggleGroup(state, group.name);
      }
      return "render";
    }

    case "escape":
    case "backspace":
      goBackToEventList(state);
      return "render";

    case "e":
      expandAllGroups(state);
      return "render";

    case "c":
      collapseAllGroups(state);
      return "render";

    default:
      return "none";
  }
}
