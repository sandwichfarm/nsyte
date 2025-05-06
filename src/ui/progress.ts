import { colors } from "@cliffy/ansi/colors";
import { UploadProgress } from "../lib/upload.ts";

const PROGRESS_BAR_WIDTH = 30;
const PROGRESS_CHAR = "█";
const INCOMPLETE_CHAR = "░";

/**
 * Format a progress bar with colored output
 */
export function formatProgressBar(
  current: number,
  total: number,
  width = PROGRESS_BAR_WIDTH
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
  const inProgressStr = inProgress > 0 ? colors.cyan(`${inProgress} in progress`) : `${inProgress} in progress`;
  
  return `${progressBar} ${completedStr}, ${failedStr}, ${inProgressStr} (${total} total)`;
}

interface ProgressData {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  serverStats?: {
    [filename: string]: {
      successCount: number;
      totalServers: number;
    }
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

  constructor() {
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
  }

  update(data: ProgressData): void {
    if (this.isFirstRender) {
      Deno.stdout.writeSync(new TextEncoder().encode("\n"));
      this.isFirstRender = false;
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.renderProgress(data);
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
    
    const percent = data.total === 0 ? 0 : Math.floor((data.completed / data.total) * 100);
    
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    
    let eta = "calculating...";
    if (data.completed > 0) {
      const timePerItem = elapsed / data.completed;
      const remainingItems = data.total - data.completed;
      const etaSeconds = Math.floor(timePerItem * remainingItems);
      eta = etaSeconds <= 0 ? "0s" : `${etaSeconds}s`;
    }

    const filledLength = Math.floor((percent * this.barLength) / 100);
    const bar = "█".repeat(filledLength) + "░".repeat(this.barLength - filledLength);

    let serverInfo = "";
    if (data.serverStats) {
      const entries = Object.entries(data.serverStats);
      if (entries.length > 0) {
        const latestFile = entries[entries.length - 1];
        const [filename, stats] = latestFile;
        serverInfo = ` | ${colors.cyan(`${stats.successCount}/${stats.totalServers}`)} servers for ${filename.split('/').pop()}`;
      }
    }
    
    const progressText = `[${bar}] ${percent}% | ${data.completed}/${data.total} files | ${data.failed} failed, ${data.inProgress} in progress | Elapsed: ${elapsed}s | ETA: ${eta}${serverInfo}`;
    
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