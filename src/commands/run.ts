import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { normalizeToPubkey } from "applesauce-core/helpers";
import { readProjectFile } from "../lib/config.ts";
import { handleError } from "../lib/error-utils.ts";
import { NsiteGatewayServer } from "../lib/gateway.ts";
import { createLogger } from "../lib/logger.ts";
import { resolveRelays, type ResolverOptions, resolveServers } from "../lib/resolver-utils.ts";

const log = createLogger("run");

interface RunOptions extends ResolverOptions {
  port?: number;
  cacheDir?: string;
  noCache?: boolean;
  useFallbackRelays?: boolean;
  useFallbackServers?: boolean;
  useFallbacks?: boolean;
  noOpen?: boolean;
}

/**
 * Register the run command
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .alias("rn")
    .description(
      "Run a resolver server that serves nsites via npub subdomains. Optionally specify an npub to launch instead of default.",
    )
    .arguments("[npub:string]")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-p, --port <port:number>", "Port number for the resolver server.", { default: 6798 })
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-c, --cache-dir <dir:string>",
      "Directory to cache downloaded files (default: /tmp/nsyte)",
    )
    .option("--no-cache", "Disable file caching entirely")
    .option(
      "--use-fallback-relays",
      "Include default nsyte relays in addition to configured/user relays.",
    )
    .option(
      "--use-fallback-servers",
      "Include default blossom servers in addition to configured/user servers.",
    )
    .option("--use-fallbacks", "Enable both fallback relays and servers.")
    .option("--no-open", "Don't automatically open the browser")
    .action(async (options: RunOptions, npub?: string) => {
      const port = options.port || 6798;

      // Validate npub parameter if provided
      let targetNpub = "npub1rqznq898cxkjly6fqak09qheqkeure2qazr8tc2tjkzkcs9htces9rzvta"; // default
      if (npub) {
        if (!normalizeToPubkey(npub)) {
          console.log(colors.red(`✗ Invalid npub format: ${npub}`));
          Deno.exit(1);
        }
        targetNpub = npub;
      }

      // Set up cache directory
      let cacheDir: string | null = null;
      // Cliffy should set noCache=true when --no-cache is passed, but also honor the raw flag just
      // in case it's stripped by a wrapper.
      const disableCache = options.noCache === true ||
        Deno.args.includes("--no-cache");

      if (disableCache) {
        // Caching disabled
        console.log(colors.yellow(`⚠️  Caching disabled (--no-cache)`));
      } else if (options.cacheDir) {
        // Use specified cache directory
        cacheDir = options.cacheDir;
        await ensureDir(cacheDir);
        console.log(colors.cyan(`📂 Using cache directory: ${cacheDir}`));
      } else {
        // Use default temp directory
        const tempDir = Deno.build.os === "windows" ? Deno.env.get("TEMP") || "C:\\Temp" : "/tmp";
        cacheDir = join(tempDir, "nsyte");
        await ensureDir(cacheDir);
        console.log(colors.cyan(`📂 Using default cache directory: ${cacheDir}`));
      }

      // Use specific relays for profile/relay list resolution
      const profileRelays = ["wss://user.kindpag.es", "wss://purplepag.es"];
      // Default relays that actually host nsite file events (optional fallback)
      const defaultFileRelays = ["wss://relay.nsite.lol", "wss://relay.nosto.re"];
      const projectConfig = readProjectFile();
      let allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;
      let allowFallbackServers = options.useFallbacks || options.useFallbackServers || false;

      // Ensure relays are connected
      log.debug(`Connecting to profile relays: ${profileRelays.join(", ")}`);

      // Use configured relays for file events; optionally merge with defaults
      const resolvedRelays = resolveRelays(options, projectConfig, false);
      let relays = [...resolvedRelays];

      if (relays.length === 0) {
        allowFallbackRelays = true;
        console.log(colors.yellow("⚠️  No relays configured; using default nsyte relays."));
      }

      if (allowFallbackRelays && defaultFileRelays.length > 0) {
        relays = Array.from(new Set([...relays, ...defaultFileRelays]));
      }

      if (relays.length === 0) {
        console.log(
          colors.red("✗ No file relays available. Please configure relays or enable fallbacks."),
        );
        Deno.exit(1);
      }

      // Get blossom servers
      const configuredServers = resolveServers(options, projectConfig);
      let servers = [...configuredServers];

      if (servers.length === 0) {
        allowFallbackServers = true;
        console.log(colors.yellow("⚠️  No blossom servers configured; using defaults."));
      }

      if (allowFallbackServers) {
        const { DEFAULT_BLOSSOM_SERVERS } = await import("../lib/constants.ts");
        servers = Array.from(new Set([...servers, ...DEFAULT_BLOSSOM_SERVERS]));
      }

      if (servers.length === 0) {
        console.log(
          colors.red(
            "✗ No blossom servers available. Please configure servers or enable fallbacks.",
          ),
        );
        Deno.exit(1);
      }

      // Create and start the gateway server
      const server = new NsiteGatewayServer({
        port,
        targetNpub,
        profileRelays,
        fileRelays: relays,
        defaultFileRelays,
        servers,
        cacheDir,
        allowFallbackRelays,
        allowFallbackServers,
        noOpen: options.noOpen,
      });

      await server.start();
    }).error((error) => {
      handleError("Error running resolver server", error, {
        exit: true,
        showConsole: true,
        logger: log,
      });
    });
}
