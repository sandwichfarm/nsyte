import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import type { NostrConnectSigner } from "applesauce-signers";
import { globToRegExp } from "jsr:@std/path/glob-to-regexp"; // Use correct JSR import
import { existsSync } from "std/fs/exists.ts";
import { join } from "std/path/mod.ts";
import { readProjectFile, setupProject } from "../lib/config.ts";
import { createLogger } from "../lib/logger.ts";
import { importFromNbunk } from "../lib/nip46.ts";
import { listRemoteFiles, RELAY_DISCOVERY_RELAYS } from "../lib/nostr.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { PrivateKeySigner } from "../lib/signer.ts";

const log = createLogger("ls");

// --- Copied/Adapted from src/lib/files.ts ---
interface IgnoreRule {
  pattern: string;
  regex: RegExp;
  negates: boolean;
  appliesToDir: boolean;
}

const DEFAULT_IGNORE_PATTERNS = [
  ".git/**", ".DS_Store", "node_modules/**", ".nsite-ignore", ".nsite/config.json", ".vscode/**",
];

function parseIgnorePatterns(patterns: string[]): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (let pattern of patterns) {
    let negates = false;
    if (pattern.startsWith("!")) {
      negates = true;
      pattern = pattern.substring(1);
    }
    let appliesToDir = false;
    if (pattern.endsWith("/")) {
      appliesToDir = true;
    }
    try {
      const regex = globToRegExp(pattern.endsWith('/') ? pattern.slice(0, -1) : pattern, {
          extended: true, globstar: true, caseInsensitive: false
      });
      rules.push({ pattern, regex, negates, appliesToDir });
    } catch (e) {
      // Safely get error message
      const errorMessage = e instanceof Error ? e.message : String(e);
      log.warn(`Invalid pattern in .nsite-ignore, skipping: "${pattern}" - Error: ${errorMessage}`);
    }
  }
  return rules;
}

function isIgnored(relativePath: string, rules: IgnoreRule[], isDirectory: boolean): boolean {
  let ignored = false;
  let matchedRule = false;
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const checkPath = isDirectory && !normalizedPath.endsWith("/") ? normalizedPath + "/" : normalizedPath;
  for (const rule of rules) {
    let match = false;
    if (rule.appliesToDir) {
        if (checkPath === rule.pattern || checkPath.startsWith(rule.pattern)) match = true;
    } else {
        if (rule.regex.test(checkPath)) match = true;
    }
    if (match) {
        matchedRule = true;
        ignored = !rule.negates;
    }
  }
  if (!matchedRule && checkPath.startsWith(".") && !checkPath.startsWith(".well-known/")) {
      log.debug(`Implicitly ignoring dotfile/dir: ${checkPath}`);
      return true;
  }
  return ignored;
}
// --- End Copied/Adapted ---

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
    .action(async (options) => {
      try {

        let pubkey: string | undefined;
        let signer: PrivateKeySigner | NostrConnectSigner | undefined;

        if (options.pubkey) {
          pubkey = options.pubkey;
          log.debug(`Using explicit pubkey: ${pubkey}`)
        }
        else if (options.privatekey) {
          signer = new PrivateKeySigner(options.privatekey);
          pubkey = signer.getPublicKey();
          log.debug(`Using private key from args: ${pubkey.slice(0,8)}...`)
        } else {
          log.debug("No explicit key/pubkey provided, checking project config...")
          const projectContext = await setupProject();
          const projectData = projectContext.projectData;

          if (projectContext.privateKey) {
            signer = new PrivateKeySigner(projectContext.privateKey);
            pubkey = signer.getPublicKey();
            log.debug(`Using private key from project setup: ${pubkey.slice(0,8)}...`)
          } else if (projectData.bunkerPubkey) {
            log.debug(`Project configured with bunker pubkey: ${projectData.bunkerPubkey.slice(0,8)}...`)
            const secretsManager = SecretsManager.getInstance();
            const nbunkString = secretsManager.getNbunk(projectData.bunkerPubkey);

            if (nbunkString) {
              try {
                log.info("Attempting connection using stored nbunksec...");
                signer = await importFromNbunk(nbunkString);
                pubkey = await signer.getPublicKey();
                log.info(`Session established with bunker, user pubkey: ${pubkey.slice(0,8)}...`);
                await signer.close();
                log.debug("Disconnected bunker signer after getting pubkey.")
              } catch (error) {
                  const errorMsg = error instanceof Error ? error.message : String(error);
                  log.error(`Failed to connect using stored nbunksec: ${errorMsg}`);
                  console.error(colors.red(`Error connecting to configured bunker: ${errorMsg}`));
                  console.log(colors.yellow("Try running 'nsyte bunker connect' again."));
                  Deno.exit(1);
              }
            } else {
              log.error(`Project configured for bunker ${projectData.bunkerPubkey} but no nbunksec found.`);
              console.error(colors.red(`Stored connection info not found for bunker ${projectData.bunkerPubkey.slice(0,8)}...`));
              console.log(colors.yellow("Please run 'nsyte bunker connect' or 'nsyte bunker import'."));
              Deno.exit(1);
            }
          }
        }

        if (!pubkey) {
          console.error(colors.red("Could not determine public key. Use --pubkey, --privatekey, or configure a project key."));
          Deno.exit(1);
        }

        let relays: string[] = [];

        if (options.relays) {
          relays = options.relays.split(",");
        } else {
          const projectData = readProjectFile();
          if (projectData && projectData.relays && projectData.relays.length > 0) {
            relays = projectData.relays;
          } else {
            log.info("No project relays configured, using default discovery relays.")
            relays = RELAY_DISCOVERY_RELAYS;
          }
        }

        console.log(colors.cyan(`Listing files for ${colors.bold(pubkey)} using relays: ${relays.join(", ")}`));

        // --- Load .nsite-ignore rules ---
        const cwd = Deno.cwd();
        const ignoreFilePath = join(cwd, ".nsite-ignore");
        let ignoreRules: IgnoreRule[] = parseIgnorePatterns(DEFAULT_IGNORE_PATTERNS);
        let ignoredFileCount = 0;

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
        // --- End ignore rule loading ---

        const files = await listRemoteFiles(relays, pubkey);

        if (files.length === 0) {
          console.log(colors.yellow("\nNo files found for this user."));
        } else {
          console.log(colors.green(`\nFound ${files.length} files:`));

          files.sort((a, b) => a.path.localeCompare(b.path));

          files.forEach(file => {
            // Remove leading slash for local ignore check
            const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
            // isIgnored expects isDirectory hint, assume false for ls output
            const shouldBeIgnored = isIgnored(relativePath, ignoreRules, false);

            if (shouldBeIgnored) {
              console.log(colors.red(file.path) + colors.gray(" (ignored locally)"));
              ignoredFileCount++;
            } else {
              // Use white for standard files
              console.log(colors.white(file.path));
            }
          });

          if (ignoredFileCount > 0) {
              console.log(colors.yellow(`\nNote: ${ignoredFileCount} file(s) marked red would be ignored by local .nsite-ignore rules during upload.`));
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(colors.red(`\nError listing files: ${errorMessage}`));
        Deno.exit(1);
      }
    });
}
