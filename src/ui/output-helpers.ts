/**
 * Shared output helpers for CLI and demo to ensure consistency
 */

import { colors } from "@cliffy/ansi/colors";
import { header } from "./header.ts";
import {
  formatConfigValue,
  formatRelayList,
  formatSectionHeader,
  formatTitle,
} from "./formatters.ts";

/**
 * Display the nsyte header in a random color
 */
export function displayColorfulHeader(): string {
  const colorFunctions = [
    colors.red,
    colors.green,
    colors.blue,
    colors.yellow,
    colors.magenta,
    colors.cyan,
    colors.brightRed,
    colors.brightGreen,
    colors.brightBlue,
    colors.brightYellow,
    colors.brightMagenta,
    colors.brightCyan,
  ];

  const randomColorFn = colorFunctions[Math.floor(Math.random() * colorFunctions.length)];

  return randomColorFn(header);
}

/**
 * Get the ASCII header without colors (for demo purposes)
 */
export function getHeader(): string {
  return header;
}

/**
 * Display upload configuration table
 */
export function displayUploadConfigTable(config: {
  publisherPubkey: string;
  relays: string[];
  servers: string[];
  force: boolean;
  purge: boolean;
  concurrency: number;
  fallback?: string;
}): string[] {
  const lines = [];

  lines.push(formatTitle("Upload Configuration"));
  lines.push(formatConfigValue("User", config.publisherPubkey, false));
  lines.push(formatConfigValue("Relays", formatRelayList(config.relays), false));
  lines.push(formatConfigValue("Servers", formatRelayList(config.servers), false));
  lines.push(formatConfigValue("Force Upload", config.force, config.force === false));
  lines.push(formatConfigValue("Purge Old Files", config.purge, config.purge === false));
  lines.push(formatConfigValue("Concurrency", config.concurrency, config.concurrency === 4));
  lines.push(formatConfigValue("404 Fallback", config.fallback || "None", !config.fallback));
  lines.push("");

  return lines;
}

/**
 * Get upload section headers with proper formatting
 */
export function getUploadSections() {
  return {
    blobsHeader: formatSectionHeader("Blobs Upload Results (🌸 Blossom)"),
    serverHeader: formatSectionHeader("Blossom Server Summary"),
    eventsHeader: formatSectionHeader("Nsite Events Publish Results (𓅦 nostr)"),
  };
}

/**
 * Format upload results
 */
export function formatUploadResults(uploaded: number, total: number): string {
  if (uploaded === total) {
    return colors.green(`✓ All ${uploaded} files successfully uploaded`);
  } else {
    return colors.yellow(`${uploaded}/${total} files successfully uploaded`);
  }
}

/**
 * Format server results
 */
export function formatServerResult(server: string, success: number, total: number): string {
  const status = success === total
    ? colors.green("✓")
    : success === 0
    ? colors.red("✗")
    : colors.yellow("!");
  const percentage = Math.round((success / total) * 100);
  return `${status} ${server}        ${success}/${total} (${percentage}%)`;
}

/**
 * Format events publish results
 */
export function formatEventsResult(published: number, total: number): string {
  if (published === total) {
    return colors.green(`✓ All ${published} file events successfully published to relays`);
  } else {
    return colors.yellow(`${published}/${total} events published to relays`);
  }
}

/**
 * Get upload complete message
 */
export function getUploadCompleteMessage(): string {
  return colors.green("✅ Upload complete!");
}

/**
 * Get success message
 */
export function getSuccessMessage(): string {
  return colors.green.bold("🎉 Your site is now live on the decentralized web!");
}

/**
 * Format help command output
 */
export function formatHelpOutput(): string[] {
  const lines = [];

  lines.push(colors.cyan.bold("nsyte - Publish your site to nostr and blossom servers"));
  lines.push("");
  lines.push("Usage: nsyte [command] [options]");
  lines.push("");
  lines.push(colors.yellow("Commands:"));
  lines.push("  init       Initialize a new project configuration");
  lines.push("  upload     Upload files to blossom servers");
  lines.push("  ls         List files from nostr relays");
  lines.push("  download   Download files from blossom servers");
  lines.push("  bunker     Connect to an nsec bunker");
  lines.push("  ci         Generate CI/CD-friendly bunker connection");
  lines.push("");
  lines.push(colors.yellow("Options:"));
  lines.push("  -h, --help     Display this help message");
  lines.push("  -v, --version  Display version information");
  lines.push("");
  lines.push(colors.yellow("Examples:"));
  lines.push("  nsyte init             # Set up a new project");
  lines.push("  nsyte upload .         # Upload current directory");
  lines.push("  nsyte ls               # List published files");
  lines.push("  nsyte bunker connect   # Connect to bunker");
  lines.push("");

  return lines;
}

/**
 * Format QR code instruction messages
 */
export function getQRMessages() {
  return {
    connecting: colors.cyan("Initiating Nostr Connect as 'nsyte' on relays: wss://relay.nsec.app"),
    instruction:
      "Please scan the QR code with your NIP-46 compatible signer (e.g., mobile wallet):",
    uri: "Or copy-paste this URI: nostr+walletconnect://b22f...",
    waiting: "Waiting for Signer to connect (timeout in 120s)...",
    connected: colors.green("✓ Connected!"),
    disconnecting: "Disconnecting from bunker...",
    disconnected: "Disconnected from bunker.",
    success: colors.green("Successfully connected to bunker a8c7d3f2..."),
    stored: "Generated and stored nbunksec string.",
  };
}
