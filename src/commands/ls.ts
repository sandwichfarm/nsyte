import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { existsSync } from "std/fs/exists.ts";
import { join } from "std/path/mod.ts";
import { createLogger } from "../lib/logger.ts";
import { listRemoteFiles } from "../lib/nostr.ts";
import { DEFAULT_IGNORE_PATTERNS, parseIgnorePatterns, isIgnored, type IgnoreRule } from "../lib/files.ts";
import { resolveRelays, resolvePubkey } from "../lib/resolver-utils.ts";
import { handleError } from "../lib/error-utils.ts";

const log = createLogger("ls");

/**
 * Register the ls command
 */
export function registerLsCommand(program: Command): void {
  program
    .command("ls")
    .description("List files available on the nostr network")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-k, --privatekey <nsec:string>", "The private key (nsec/hex) to use for signing.")
    .option("-p, --pubkey <npub:string>", "The public key to list files for (if not using private key).")
    .action(command);
}

export async function command(options: any): Promise<void> {
  try {
    const cwd = Deno.cwd();
    const ignoreFilePath = join(cwd, ".nsite-ignore");

    const pubkey = await resolvePubkey(options);
    const relays = resolveRelays(options);

    let ignoreRules: IgnoreRule[] = parseIgnorePatterns(DEFAULT_IGNORE_PATTERNS);
    let ignoredFileCount = 0;

    console.log(colors.cyan(`Listing files for ${colors.bold(pubkey)} using relays: ${relays.join(", ")}`));

    if (existsSync(ignoreFilePath)) {
      try {
        const ignoreContent = await Deno.readTextFile(ignoreFilePath);
        const customPatterns = ignoreContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith("#"));
        ignoreRules = parseIgnorePatterns([...DEFAULT_IGNORE_PATTERNS, ...customPatterns]);
        log.info(`Loaded .nsite-ignore rules.`);
      } catch (error) {
        log.warn(`Failed to read .nsite-ignore file: ${error}. Using default ignore patterns.`);
      }
    } else {
      log.debug("No .nsite-ignore file found, using default patterns.");
    }

    const files = await listRemoteFiles(relays, pubkey);

    if (files.length === 0) {
      console.log(colors.yellow("\nNo files found for this user."));
    } else {
      console.log(colors.green(`\nFound ${files.length} files:`));

      files.sort((a, b) => a.path.localeCompare(b.path));

      files.forEach(file => {
        const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
        const shouldBeIgnored = isIgnored(relativePath, ignoreRules, false);

        if (shouldBeIgnored) {
          console.log(colors.red(file.path) + colors.gray(" (ignored locally)"));
          ignoredFileCount++;
        } else {
          console.log(colors.white(file.path));
        }
      });

      if (ignoredFileCount > 0) {
        console.log(colors.yellow(`\nNote: ${ignoredFileCount} file(s) marked red would be ignored by local .nsite-ignore rules during upload.`));
      }
    }

    Deno.exit(0);
  } catch (error: unknown) {
    handleError("Error listing files", error, {
      showConsole: true,
      exit: true,
      exitCode: 1
    });
  }
}