import { colors } from "@cliffy/ansi/colors";
import { getDisplayManager } from "../lib/display-mode.ts";

/**
 * A utility for displaying ephemeral status messages
 * that are overwritten as the process progresses
 */
export class StatusDisplay {
  private currentMessage = "";
  private isInteractive: boolean;
  
  constructor() {
    this.isInteractive = getDisplayManager().isInteractive();
  }
  
  /**
   * Update the status message
   */
  update(message: string): void {
    if (!this.isInteractive) {
      // In non-interactive mode, just print the message
      console.log(colors.cyan(message));
      return;
    }
    
    // Clear the current line
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));
    
    // Write the new message
    this.currentMessage = message;
    Deno.stdout.writeSync(new TextEncoder().encode(message));
  }
  
  /**
   * Display a success message and clear the status
   */
  success(message: string): void {
    this.complete(true, message);
  }
  
  /**
   * Display an error message and clear the status
   */
  error(message: string): void {
    this.complete(false, message);
  }
  
  /**
   * Clear the status display
   */
  clear(): void {
    if (!this.isInteractive) {
      return;
    }
    
    // Clear the current line
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));
    this.currentMessage = "";
  }
  
  /**
   * Complete the status display with a final message
   */
  complete(success: boolean, message: string): void {
    if (!this.isInteractive) {
      if (success) {
        console.log(colors.green(`✓ ${message}`));
      } else {
        console.log(colors.red(`✗ ${message}`));
      }
      return;
    }
    
    // Clear the current line
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));
    
    // Write the final message
    if (success) {
      console.log(colors.green(`✓ ${message}`));
    } else {
      console.log(colors.red(`✗ ${message}`));
    }
    
    this.currentMessage = "";
  }
} 