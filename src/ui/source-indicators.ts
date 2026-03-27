import { colors } from "@cliffy/ansi/colors";

export const RELAY_COLORS = [
  colors.cyan,
  colors.green,
  colors.yellow,
  colors.magenta,
  colors.blue,
  colors.brightCyan,
  colors.brightGreen,
  colors.brightYellow,
  colors.brightMagenta,
  colors.brightBlue,
];

export const SERVER_COLORS = [
  colors.red,
  colors.cyan,
  colors.yellow,
  colors.green,
  colors.magenta,
  colors.brightRed,
  colors.brightCyan,
  colors.brightYellow,
  colors.brightGreen,
  colors.brightMagenta,
];

export const RELAY_SYMBOL = "▲";
export const RELAY_SYMBOL_ALT = "▼";
export const SERVER_SYMBOLS = ["■", "●", "◆", "★", "▰"];

/** @deprecated Use SERVER_SYMBOLS[index] instead */
export const SERVER_SYMBOL = SERVER_SYMBOLS[0];

export function getServerSymbol(index: number): string {
  return SERVER_SYMBOLS[index % SERVER_SYMBOLS.length];
}
