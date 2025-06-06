import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { Secret } from "@cliffy/prompt";
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { resolvePubkey, resolveRelays, type ResolverOptions } from "../lib/resolver-utils.ts";
import { bech32Decode, npubEncode } from "../lib/utils.ts";
import { listRemoteFiles } from "../lib/nostr.ts";

const log = createLogger("run");

interface RunOptions extends ResolverOptions {
  port?: number;
}

/**
 * Register the run command
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run [npub:string]")
    .description("Simulate a resolver by fetching blossom hashes for an npub")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-p, --port <port:number>", "Port number for the simulated resolver.", { default: 8080 })
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-b, --bunker <url:string>", "The NIP-46 bunker URL to use for signing.")
    .option("--nbunksec <nbunksec:string>", "The nbunksec string to use for authentication.")
    .action(async (options: RunOptions, npubArg?: string) => {
      await runCommand(options, npubArg);
    });
}

/**
 * Validates an npub string format
 */
export function validateNpub(npub: string): boolean {
  try {
    const decoded = bech32Decode(npub);
    return decoded.prefix === "npub" && decoded.data.length === 32;
  } catch {
    return false;
  }
}

/**
 * Converts npub to hex pubkey
 */
export function npubToHex(npub: string): string {
  const decoded = bech32Decode(npub);
  return Array.from(decoded.data, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Gets npub interactively from user
 */
async function getInteractiveNpub(): Promise<string> {
  while (true) {
    const npub = await Secret.prompt({
      message: "Enter an npub to fetch files for:",
      validate: (value: string) => {
        if (!value.trim()) {
          return "Please enter an npub.";
        }
        if (!validateNpub(value.trim())) {
          return "Invalid npub format. Please enter a valid npub (starts with 'npub1').";
        }
        return true;
      }
    });
    
    return npub.trim();
  }
}

/**
 * Main run command implementation
 */
export async function runCommand(options: RunOptions, npubArg?: string): Promise<void> {
  try {
    let npub: string;
    let pubkeyHex: string;

    // Handle npub parameter
    if (npubArg) {
      if (!validateNpub(npubArg)) {
        console.error(colors.red(`Invalid npub format: ${npubArg}`));
        console.error(colors.yellow("An npub should start with 'npub1' and be properly encoded."));
        Deno.exit(1);
      }
      npub = npubArg;
      pubkeyHex = npubToHex(npub);
      log.debug(`Using provided npub: ${npub}`);
    } else {
      // Try to detect npub from config
      try {
        pubkeyHex = await resolvePubkey(options, null, false);
        npub = npubEncode(pubkeyHex);
        console.log(colors.cyan(`Detected npub from configuration: ${npub}`));
      } catch {
        // No config found, ask interactively
        console.log(colors.yellow("No npub found in configuration."));
        npub = await getInteractiveNpub();
        pubkeyHex = npubToHex(npub);
      }
    }

    // Resolve relays
    const relays = resolveRelays(options, null, true);
    
    if (relays.length === 0) {
      console.error(colors.red("No relays available for fetching files."));
      Deno.exit(1);
    }

    console.log(colors.green(`\n🚀 Starting nsyte resolver simulation`));
    console.log(colors.cyan(`📍 Resolver URL: ${npub}.localhost:${options.port}`));
    console.log(colors.cyan(`🔍 Fetching files for: ${npub}`));
    console.log(colors.cyan(`📡 Using relays: ${relays.join(", ")}`));
    console.log("");

    // Fetch remote files to get blossom hashes
    console.log(colors.yellow("🔄 Fetching blossom hashes from nostr relays..."));
    
    try {
      const remoteFiles = await listRemoteFiles(relays, pubkeyHex);
      
      if (remoteFiles.length === 0) {
        console.log(colors.yellow("📭 No files found for this npub."));
        console.log(colors.cyan("The user hasn't uploaded any files yet, or they're using different relays."));
      } else {
        console.log(colors.green(`✅ Found ${remoteFiles.length} files:`));
        console.log("");
        
        // Display files with their blossom hashes
        for (const file of remoteFiles) {
          const hash = file.sha256 || "unknown";
          const size = file.size ? ` (${formatFileSize(file.size)})` : "";
          console.log(colors.white(`  📄 ${file.path}${size}`));
          console.log(colors.gray(`     🌸 ${hash}`));
        }
        
        console.log("");
        console.log(colors.green(`📊 Total: ${remoteFiles.length} files available for download`));
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(colors.red(`❌ Failed to fetch files: ${errorMessage}`));
      console.log(colors.yellow("This could be due to:"));
      console.log(colors.yellow("  • Relay connectivity issues"));
      console.log(colors.yellow("  • The npub hasn't published any files"));
      console.log(colors.yellow("  • The files are on different relays"));
      Deno.exit(1);
    }

    console.log("");
    console.log(colors.cyan(`🌐 Resolver simulation complete!`));
    console.log(colors.gray(`Access files via: https://${npub}.{gateway-hostname}/path/to/file`));
    
  } catch (error: unknown) {
    handleError("Error running resolver simulation", error, {
      exit: true,
      showConsole: true,
      logger: log
    });
  }
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}