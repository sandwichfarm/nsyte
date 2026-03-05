import { colors } from "@cliffy/ansi/colors";
import type { UploadProgress } from "../lib/upload.ts";

const PROGRESS_BAR_WIDTH = 30;
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

interface ProgressData {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  skipped?: number;
  retrying?: number;
  serverStats?: {
    [filename: string]: {
      successCount: number;
      totalServers: number;
    };
  };
}

/**
 * Progress renderer for terminal
 */
export class ProgressRenderer {
  private startTime: number = 0;
  private lastUpdate: number = 0;
  private intervalId: number | null = null;
  private barLength = 30;
  private status: string | null = null;
  private isFirstRender = true;
  private total: number;

  constructor(total: number = 0) {
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.total = total;
  }

  start(): void {
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.isFirstRender = true;
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
  update(dataOrCurrent: number | ProgressData, path?: string): void {
    if (this.isFirstRender) {
      Deno.stdout.writeSync(new TextEncoder().encode("\n"));
      this.isFirstRender = false;
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Handle the case where first parameter is a number (current progress)
    if (typeof dataOrCurrent === "number") {
      this.renderProgress({
        total: this.total,
        completed: dataOrCurrent,
        failed: 0,
        inProgress: this.total - dataOrCurrent,
        ...(path ? { serverStats: { [path]: { successCount: 1, totalServers: 1 } } } : {}),
      });
    } // Handle the case where first parameter is a ProgressData object
    else {
      this.renderProgress(dataOrCurrent);
    }
  }

  /**
   * Stop the progress renderer and clear any timers
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear the current line
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));
  }

  complete(success: boolean, message: string): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);

    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));

    if (success) {
      console.log(`${colors.green("✓ SUCCESS")}: ${message} (took ${elapsed}s)`);
    } else {
      console.log(`${colors.red("✗ ERROR")}: ${message} (took ${elapsed}s)`);
    }
  }

  private renderProgress(data: ProgressData): void {
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));

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

    const bar = colors.green("█".repeat(greenW))
      + colors.yellow("█".repeat(yellowW))
      + colors.red("█".repeat(redW))
      + "░".repeat(grayW);

    let serverInfo = "";
    if (data.serverStats) {
      const entries = Object.entries(data.serverStats);
      if (entries.length > 0) {
        const latestFile = entries[entries.length - 1];
        const [filename, stats] = latestFile;
        serverInfo = `${
          colors.cyan(`${stats.successCount}/${stats.totalServers}`)
        } servers for ${filename.split("/").pop()}`;
      }
    }

    const skipped = data.skipped ?? 0;
    const retrying = data.retrying ?? 0;

    // Build progress text with segments that can be dropped to fit terminal width
    const segments = [
      `[${bar}] ${percent}%`,
      `${done}/${data.total} files`,
      `${data.completed} ok, ${skipped} skip, ${retrying} retry, ${data.failed} fail, ${data.inProgress} active`,
      `${elapsed}s`,
      `ETA: ${eta}`,
    ];
    if (serverInfo) segments.push(serverInfo);

    let progressText = segments.join(" | ");

    // Truncate to terminal width to prevent line wrapping, which breaks \r overwrite
    try {
      const { columns } = Deno.consoleSize();
      if (columns > 0) {
        while (segments.length > 1 && stripAnsi(segments.join(" | ")).length > columns) {
          segments.pop();
        }
        progressText = segments.join(" | ");
      }
    } catch {
      // consoleSize() throws if not a TTY — just write the full text
    }

    Deno.stdout.writeSync(new TextEncoder().encode(progressText));

    this.lastUpdate = Date.now();
  }
}

/**
 * Format elapsed time in a human-readable format
 */
function formatElapsedTime(seconds: number): string {
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
