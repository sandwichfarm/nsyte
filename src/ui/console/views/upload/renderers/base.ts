import { moveCursor } from '../../../../browse/renderer.ts'
import { UploadViewState } from '../state/types.ts'

export abstract class BaseRenderer {
  constructor(
    protected getState: () => UploadViewState
  ) {}
  
  /**
   * Clear a rectangular area on screen
   */
  protected clearArea(startRow: number, startCol: number, width: number, height: number): void {
    const encoder = new TextEncoder()
    const clearLine = ' '.repeat(width)
    
    for (let row = 0; row < height; row++) {
      moveCursor(startRow + row, startCol)
      Deno.stdout.writeSync(encoder.encode(clearLine))
    }
  }
  
  /**
   * Write text at a specific position
   */
  protected writeAt(row: number, col: number, text: string): void {
    moveCursor(row, col)
    Deno.stdout.writeSync(new TextEncoder().encode(text))
  }
  
  /**
   * Center text horizontally within a given width
   */
  protected centerText(text: string, width: number): number {
    // Remove ANSI color codes for accurate length calculation
    const plainText = text.replace(/\x1b\[[0-9;]*m/g, '')
    return Math.max(1, Math.floor((width - plainText.length) / 2))
  }
  
  /**
   * Draw a horizontal line
   */
  protected drawHorizontalLine(row: number, col: number, width: number, char: string = '─'): void {
    this.writeAt(row, col, char.repeat(width))
  }
}