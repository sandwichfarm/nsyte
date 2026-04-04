import type { DryRunEvent } from "../../lib/dry-run/types.ts";
import { createInitialViewState } from "./state.ts";
import { render } from "./renderer.ts";
import { decodeKey, handleKeypress } from "./handlers.ts";
import {
  enterAlternateScreen,
  exitAlternateScreen,
  showCursor,
} from "../browse/renderer.ts";

/**
 * Run the interactive dry-run event inspector TUI.
 * Enters alternate screen buffer, renders events, handles keyboard input.
 * Exits when user presses 'q' or Ctrl+C.
 */
export async function runDryRunInspector(
  events: DryRunEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const state = createInitialViewState(events);

  // Enter TUI mode
  enterAlternateScreen();
  Deno.stdin.setRaw(true);

  try {
    // Initial render
    render(state);

    // Input loop
    const buf = new Uint8Array(8);
    while (true) {
      const bytesRead = await Deno.stdin.read(buf);
      if (bytesRead === null) break;

      const key = decodeKey(buf, bytesRead);
      if (!key) continue;

      const result = handleKeypress(state, key);

      if (result === "quit") {
        break;
      }

      if (result === "render") {
        render(state);
      }
    }
  } finally {
    // Clean up TUI mode
    Deno.stdin.setRaw(false);
    exitAlternateScreen();
    showCursor();
  }
}
