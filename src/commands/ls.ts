import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import type { NostrConnectSigner } from "applesauce-signers";
import { globToRegExp } from "jsr:@std/path/glob-to-regexp";
import { existsSync } from "std/fs/exists.ts";
import { join } from "std/path/mod.ts";
import { readProjectFile, setupProject, defaultConfig } from "../lib/config.ts";
import { createLogger } from "../lib/logger.ts";
import { importFromNbunk } from "../lib/nip46.ts";
import { listRemoteFiles, NSYTE_BROADCAST_RELAYS, RELAY_DISCOVERY_RELAYS } from "../lib/nostr.ts";
import { SecretsManager } from "../lib/secrets/mod.ts";
import { PrivateKeySigner } from "../lib/signer.ts";
import { Select, Secret } from "@cliffy/prompt";
import { generateKeyPair } from "../lib/nostr.ts";

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

export async function getPubkey(options: any): Promise<string> {
  let pubkey: string | undefined;
  let signer: PrivateKeySigner | NostrConnectSigner | undefined;

  if (options.pubkey) {
    log.debug(`Using explicit pubkey: ${options.pubkey}`);
    return options.pubkey;
  } else if (options.privatekey) {
    signer = new PrivateKeySigner(options.privatekey);
    pubkey = await signer.getPublicKey();
    log.debug(`Using private key from args: ${pubkey.slice(0,8)}...`);
    return pubkey;
  } else {
    log.debug("No explicit key/pubkey provided, checking project config...");
    const config = readProjectFile() || defaultConfig;

    if (config.bunkerPubkey) return config.bunkerPubkey;

    const secretsManager = SecretsManager.getInstance();
    const existingBunkers = secretsManager.getAllPubkeys();
    const hasBunkers = existingBunkers.length > 0;
    
    const keyOptions = [
      { name: "Generate a new private key", value: "generate" },
      { name: "Use an existing private key", value: "existing" }
    ];

    if (hasBunkers) {
      keyOptions.push(
        { name: "Use an existing NSEC bunker", value: "existing_bunker" },
        { name: "Connect to a new NSEC bunker", value: "new_bunker" }
      );
    } else {
      keyOptions.push({ name: "Connect to an NSEC bunker", value: "new_bunker" });
    }

    type KeyChoice = "generate" | "existing" | "new_bunker" | "existing_bunker";

    const keyChoice = await Select.prompt<KeyChoice>({
      message: "How would you like to manage your nostr key?",
      options: keyOptions,
    });

    if (keyChoice === "generate") {
      const keyPair = generateKeyPair();
      signer = new PrivateKeySigner(keyPair.privateKey);
      pubkey = await signer.getPublicKey();
      console.log(colors.green(`Generated new private key: ${keyPair.privateKey}`));
      console.log(colors.yellow("IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!"));
      console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
      return pubkey;
    } else if (keyChoice === "existing_bunker") {
      const bunkerOptions = existingBunkers.map((pubkey: string) => {
        return {
          name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
          value: pubkey
        };
      });

      const selectedPubkey = await Select.prompt<string>({
        message: "Select an existing bunker:",
        options: bunkerOptions,
      });

      const nbunkString = secretsManager.getNbunk(selectedPubkey);
      if (nbunkString) {
        try {
          log.info("Attempting connection using stored nbunksec...");
          signer = await importFromNbunk(nbunkString);
          pubkey = await signer.getPublicKey();
          log.info(`Session established with bunker, user pubkey: ${pubkey.slice(0,8)}...`);
          return pubkey;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log.error(`Failed to connect using stored nbunksec: ${errorMsg}`);
          console.error(colors.red(`Error connecting to configured bunker: ${errorMsg}`));
          console.log(colors.yellow("Try running 'nsyte bunker connect' again."));
          Deno.exit(1);
        }
      }
    } else if (keyChoice === "existing") {
      const nsec = await Secret.prompt({
        message: "Enter your private key (nsec/hex):",
      });
      signer = new PrivateKeySigner(nsec);
      pubkey = await signer.getPublicKey();
      return pubkey;
    } else if (keyChoice === "new_bunker") {
      console.error(colors.yellow("Please use 'nsyte bunker connect' to connect to a new bunker."));
      Deno.exit(1);
    } else {
      Deno.exit(1);
    }
  }
  
  throw new Error("Could not determine public key");
}

export function getRelays(options: any): string[] {
  let relays: string[] = [];

  if (options.relays) {
    relays = options.relays.split(",");
  } else {
    const config = readProjectFile();
    if (config && config.relays && config.relays.length > 0) {
      relays = config.relays;
    } else {
      log.info("No project relays configured, using default discovery relays.");
      relays = NSYTE_BROADCAST_RELAYS;
    }
  }

  return relays;
}

export async function command (options: any): Promise<void> {
  try {
    const cwd = Deno.cwd();
    const ignoreFilePath = join(cwd, ".nsite-ignore");

    const pubkey = await getPubkey(options);
    const relays = getRelays(options);

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(colors.red(`\nError listing files: ${errorMessage}`));
    Deno.exit(1);
  }
}