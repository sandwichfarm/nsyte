import { createLogger } from "./logger.ts";

const log = createLogger("display");

/**
 * Display modes for the CLI
 */
export enum DisplayMode {
  /**
   * Clean, formatted output with pretty formatting
   */
  INTERACTIVE = "interactive",
  
  /**
   * Raw log output suitable for scripts
   */
  NON_INTERACTIVE = "non-interactive",
  
  /**
   * Detailed debug output
   */
  DEBUG = "debug"
}

/**
 * Class to manage the current display mode
 */
export class DisplayManager {
  private static instance: DisplayManager;
  private currentMode: DisplayMode = DisplayMode.INTERACTIVE;
  private verbose: boolean = false;
  
  /**
   * Create a new DisplayManager
   */
  private constructor() {
    const envMode = Deno.env.get("NSITE_DISPLAY_MODE");
    if (envMode) {
      switch (envMode.toLowerCase()) {
        case "interactive":
          this.currentMode = DisplayMode.INTERACTIVE;
          break;
        case "non-interactive":
          this.currentMode = DisplayMode.NON_INTERACTIVE;
          break;
        case "debug":
          this.currentMode = DisplayMode.DEBUG;
          break;
      }
    }
    
    log.debug(`Display mode initialized to ${this.currentMode}`);
  }
  
  /**
   * Get the DisplayManager instance
   */
  public static getInstance(): DisplayManager {
    if (!DisplayManager.instance) {
      DisplayManager.instance = new DisplayManager();
    }
    return DisplayManager.instance;
  }
  
  /**
   * Set the display mode
   */
  public setMode(mode: DisplayMode): void {
    this.currentMode = mode;
    log.debug(`Display mode set to ${mode}`);
  }
  
  /**
   * Get the current display mode
   */
  public getMode(): DisplayMode {
    return this.currentMode;
  }
  
  /**
   * Set whether we're in verbose mode
   */
  public setVerbose(verbose: boolean): void {
    this.verbose = verbose;
    log.debug(`Verbose mode set to ${verbose}`);
  }
  
  /**
   * Check if we're in verbose mode
   */
  public isVerbose(): boolean {
    return this.verbose;
  }
  
  /**
   * Check if we're in interactive mode
   */
  public isInteractive(): boolean {
    return this.currentMode === DisplayMode.INTERACTIVE;
  }
  
  /**
   * Check if we're in non-interactive mode
   */
  public isNonInteractive(): boolean {
    return this.currentMode === DisplayMode.NON_INTERACTIVE;
  }
  
  /**
   * Check if we're in debug mode
   */
  public isDebug(): boolean {
    return this.currentMode === DisplayMode.DEBUG;
  }
  
  /**
   * Configure display mode from command options
   */
  public configureFromOptions(options: { verbose?: boolean; nonInteractive?: boolean }): void {
    if (options.nonInteractive) {
      this.setMode(DisplayMode.NON_INTERACTIVE);
    }
    
    if (options.verbose) {
      this.setVerbose(true);
      if (!this.isDebug() && !this.isNonInteractive()) {
        this.setMode(DisplayMode.DEBUG);
      }
    }
  }
}

/**
 * Get the DisplayManager instance
 */
export function getDisplayManager(): DisplayManager {
  return DisplayManager.getInstance();
} 