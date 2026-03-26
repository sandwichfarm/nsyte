import { colors } from "@cliffy/ansi/colors";
import { Keypress } from "@cliffy/keypress";
import type { UploadProgress } from "../lib/upload.ts";
import { SERVER_COLORS, SERVER_SYMBOLS } from "../commands/list.ts";

const PROGRESS_BAR_WIDTH = 30;
const SERVER_BAR_WIDTH = 20;
const PROGRESS_CHAR = "█";
const INCOMPLETE_CHAR = "░";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Format a progress bar with colored output
 */
export function formatProgressBar(
  current: number,
  total: number,
  width = PROGRESS_BAR_WIDTH,
): string {
  const percentage = total === 0 ? 100 : Math.floor((current / total) * 100);
  const filledWidth = Math.floor((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const filledPart = PROGRESS_CHAR.repeat(filledWidth);
  const emptyPart = INCOMPLETE_CHAR.repeat(emptyWidth);

  let progressColor;
  if (percentage < 30) {
    progressColor = colors.red;
  } else if (percentage < 70) {
    progressColor = colors.yellow;
  } else {
    progressColor = colors.green;
  }

  return `[${progressColor(filledPart)}${emptyPart}] ${percentage}%`;
}

/**
 * Format upload progress information
 */
export function formatUploadProgress(progress: UploadProgress): string {
  const { total, completed, failed, inProgress } = progress;
  const progressBar = formatProgressBar(completed, total);

  const completedStr = colors.green(`${completed} completed`);
  const failedStr = failed > 0 ? colors.red(`${failed} failed`) : `${failed} failed`;
  const inProgressStr = inProgress > 0
    ? colors.cyan(`${inProgress} in progress`)
    : `${inProgress} in progress`;

  return `${progressBar} ${completedStr}, ${failedStr}, ${inProgressStr} (${total} total)`;
}

interface ServerProgress {
  total: number;
  completed: number;
  failed: number;
  retrying: number;
  skipped: number;
  finishedAt?: number;
}

interface ProgressData {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  skipped?: number;
  retrying?: number;
  serverProgress?: Record<string, ServerProgress>;
}

/** Shorten a server URL for display: strip protocol, trailing slash */
function shortServerName(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Progress renderer for terminal with optional per-server bars toggled by [s] key
 */
export class ProgressRenderer {
  private startTime: number = 0;
  private lastUpdate: number = 0;
  private intervalId: number | null = null;
  private barLength = PROGRESS_BAR_WIDTH;
  private isFirstRender = true;
  private total: number;
  private servers: string[];
  private showServerBars = false;
  private lastLineCount = 0;
  private lastData: ProgressData | null = null;
  private keypress: InstanceType<typeof Keypress> | null = null;
  private keyListenerRunning = false;

  constructor(total: number = 0, servers: string[] = []) {
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.total = total;
    this.servers = servers;
  }

  start(): void {
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.isFirstRender = true;
    this.lastLineCount = 0;
    if (this.servers.length > 0) {
      this.startKeyListener();
    }
  }

  private startKeyListener(): void {
    if (this.keyListenerRunning) return;
    try {
      if (!Deno.stdin.isTerminal()) return;
    } catch {
      return;
    }

    this.keyListenerRunning = true;
    this.keypress = new Keypress();

    // Run as non-awaited async — runs in background alongside uploads
    (async () => {
      try {
        for await (const event of this.keypress!) {
          if (!this.keyListenerRunning) break;
          if (event.key === "s") {
            this.showServerBars = !this.showServerBars;
            if (this.lastData) {
              this.renderProgress(this.lastData);
            }
          }
          if (event.ctrlKey && event.key === "c") {
            this.stopKeyListener();
            Deno.exit(130);
          }
        }
      } catch {
        // Keypress disposed or error — ignore
      }
    })();
  }

  private stopKeyListener(): void {
    this.keyListenerRunning = false;
    try {
      this.keypress?.dispose();
    } catch { /* ignore */ }
    this.keypress = null;
  }

  /**
   * Update progress with a current value and optional path
   */
  update(current: number, path?: string): void;

  /**
   * Update progress with full progress data
   */
  update(data: ProgressData): void;

  /**
   * Implementation of both update overloads
   */
  update(dataOrCurrent: number | ProgressData, _path?: string): void {
    if (this.isFirstRender) {
      Deno.stdout.writeSync(new TextEncoder().encode("\n"));
      this.isFirstRender = false;
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (typeof dataOrCurrent === "number") {
      this.renderProgress({
        total: this.total,
        completed: dataOrCurrent,
        failed: 0,
        inProgress: this.total - dataOrCurrent,
      });
    } else {
      this.renderProgress(dataOrCurrent);
    }
  }

  /**
   * Stop the progress renderer, clear output, and restore terminal
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.stopKeyListener();
    this.clearRenderedLines();
  }

  complete(success: boolean, message: string): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);

    // Don't clear here — stop() already clears. Just write the completion line.
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));

    if (success) {
      console.log(`${colors.green("✓ SUCCESS")}: ${message} (took ${elapsed}s)`);
    } else {
      console.log(`${colors.red("✗ ERROR")}: ${message} (took ${elapsed}s)`);
    }
  }

  /** Clear all lines from the last render */
  private clearRenderedLines(): void {
    const enc = new TextEncoder();
    if (this.lastLineCount <= 0) {
      // Still clear the current line even if nothing was rendered
      Deno.stdout.writeSync(enc.encode("\r\x1b[2K"));
      return;
    }
    // Move to start of first rendered line
    if (this.lastLineCount > 1) {
      Deno.stdout.writeSync(enc.encode(`\x1b[${this.lastLineCount - 1}A`));
    }
    Deno.stdout.writeSync(enc.encode("\r"));
    // Clear each line
    for (let i = 0; i < this.lastLineCount; i++) {
      Deno.stdout.writeSync(enc.encode("\x1b[2K"));
      if (i < this.lastLineCount - 1) {
        Deno.stdout.writeSync(enc.encode("\n"));
      }
    }
    // Move back to start
    if (this.lastLineCount > 1) {
      Deno.stdout.writeSync(enc.encode(`\x1b[${this.lastLineCount - 1}A`));
    }
    Deno.stdout.writeSync(enc.encode("\r"));
    this.lastLineCount = 0;
  }

  /** Write multiple lines, clearing the previous render first */
  private writeLines(lines: string[]): void {
    const enc = new TextEncoder();
    const output: string[] = [];

    // Move cursor to start of previous block
    if (this.lastLineCount > 1) {
      output.push(`\x1b[${this.lastLineCount - 1}A`);
    }
    if (this.lastLineCount > 0) {
      output.push("\r");
    }

    // Write each line, clearing to end
    for (let i = 0; i < lines.length; i++) {
      output.push(`\x1b[2K${lines[i]}`);
      if (i < lines.length - 1) {
        output.push("\n");
      }
    }

    // Clear any leftover lines from previous render
    for (let i = lines.length; i < this.lastLineCount; i++) {
      output.push("\n\x1b[2K");
    }
    // Move cursor back to last content line
    if (this.lastLineCount > lines.length) {
      output.push(`\x1b[${this.lastLineCount - lines.length}A`);
    }

    Deno.stdout.writeSync(enc.encode(output.join("")));
    this.lastLineCount = lines.length;
  }

  private renderProgress(data: ProgressData): void {
    this.lastData = data;

    const done = data.completed + data.failed;
    const percent = data.total === 0 ? 0 : Math.floor((done / data.total) * 100);
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);

    let eta = "calculating...";
    if (data.completed > 0) {
      const timePerItem = elapsed / data.completed;
      const remainingItems = data.total - data.completed;
      const etaSeconds = Math.floor(timePerItem * remainingItems);
      eta = etaSeconds <= 0 ? "0s" : `${etaSeconds}s`;
    }

    // Build the colored bar segments
    let greenW = 0;
    let yellowW = 0;
    let redW = 0;
    let grayW = this.barLength;

    if (data.total > 0) {
      greenW = Math.floor((data.completed / data.total) * this.barLength);
      yellowW = Math.floor(((data.retrying ?? 0) / data.total) * this.barLength);
      redW = Math.floor((data.failed / data.total) * this.barLength);
      grayW = Math.max(0, this.barLength - greenW - yellowW - redW);
    }

    const bar = colors.green("█".repeat(greenW)) +
      colors.yellow("█".repeat(yellowW)) +
      colors.red("█".repeat(redW)) +
      "░".repeat(grayW);

    const skipped = data.skipped ?? 0;
    const retrying = data.retrying ?? 0;

    // Build main progress line with droppable segments
    const segments = [
      `[${bar}] ${percent}%`,
      `${done}/${data.total}`,
      `${data.completed} ok, ${skipped} skip, ${retrying} retry, ${data.failed} fail`,
      `${elapsed}s`,
      `ETA: ${eta}`,
    ];

    // Add toggle hint
    if (this.servers.length > 0) {
      segments.push(
        this.showServerBars ? colors.dim("[s] hide servers") : colors.dim("[s] servers"),
      );
    }

    // Truncate segments to fit terminal width
    let columns = 0;
    try {
      columns = Deno.consoleSize().columns;
    } catch { /* not a TTY */ }

    if (columns > 0) {
      while (segments.length > 1 && stripAnsi(segments.join(" | ")).length > columns) {
        segments.pop();
      }
    }

    const lines: string[] = [segments.join(" | ")];

    // Per-server bars when toggled on
    if (this.showServerBars && data.serverProgress) {
      // Separator between main bar and server bars
      const sepWidth = columns > 0 ? Math.min(columns, 60) : 60;
      lines.push(colors.dim("─".repeat(sepWidth)));

      const maxNameLen = Math.max(
        ...this.servers.map((s) => shortServerName(s).length),
      );

      for (let i = 0; i < this.servers.length; i++) {
        const server = this.servers[i];
        const sp = data.serverProgress[server];
        if (!sp) continue;

        const symbol = SERVER_SYMBOLS[i % SERVER_SYMBOLS.length];
        const colorFn = SERVER_COLORS[i % SERVER_COLORS.length];
        const name = shortServerName(server).padEnd(maxNameLen);
        const serverDone = sp.completed + sp.failed;
        const serverPercent = sp.total === 0 ? 0 : Math.floor((serverDone / sp.total) * 100);

        // Build per-server bar with standard colors (green/yellow/red)
        let sGreen = 0;
        let sYellow = 0;
        let sRed = 0;
        let sGray = SERVER_BAR_WIDTH;

        if (sp.total > 0) {
          sGreen = Math.floor((sp.completed / sp.total) * SERVER_BAR_WIDTH);
          sYellow = Math.floor((sp.retrying / sp.total) * SERVER_BAR_WIDTH);
          sRed = Math.floor((sp.failed / sp.total) * SERVER_BAR_WIDTH);
          sGray = Math.max(0, SERVER_BAR_WIDTH - sGreen - sYellow - sRed);
        }

        const sBar = colors.green("█".repeat(sGreen)) +
          colors.yellow("█".repeat(sYellow)) +
          colors.red("█".repeat(sRed)) +
          "░".repeat(sGray);

        const pctStr = `${serverPercent}%`.padStart(4);

        // Stats
        const statParts = [`${sp.completed} ok`];
        if (sp.failed > 0) statParts.push(colors.red(`${sp.failed} fail`));
        if (sp.retrying > 0) statParts.push(colors.yellow(`${sp.retrying} retry`));
        if (sp.skipped > 0) statParts.push(colors.dim(`${sp.skipped} skip`));

        // Show elapsed time when server is done
        let timeStr = "";
        if (sp.finishedAt) {
          const secs = Math.floor((sp.finishedAt - this.startTime) / 1000);
          timeStr = colors.dim(` (${secs}s)`);
        }

        lines.push(
          `  ${colorFn(symbol)} ${colorFn(name)} [${sBar}] ${pctStr} | ${
            statParts.join(", ")
          }${timeStr}`,
        );
      }
    }

    this.writeLines(lines);
    this.lastUpdate = Date.now();
  }
}

/**
 * Format elapsed time in a human-readable format
 */
function _formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
}
