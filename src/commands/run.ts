import { colors } from "@cliffy/ansi/colors";
import nsyte from "./root.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { type AddressPointer, decodePointer, normalizeToPubkey } from "applesauce-core/helpers";
import { readProjectFile } from "../lib/config.ts";
import { handleError } from "../lib/error-utils.ts";
import { NsiteGatewayServer } from "../lib/gateway.ts";
import { createLogger } from "../lib/logger.ts";
import { resolveRelays, type ResolverOptions, resolveServers } from "../lib/resolver-utils.ts";
import { NSITE_NAME_SITE_KIND, NSITE_ROOT_SITE_KIND } from "../lib/manifest.ts";

const log = createLogger("run");

/**
 * Parse site identifier from various formats and return AddressPointer:
 * - naddr format: naddr1... (kind 15128 for root or 35128 for named sites)
 * - subdomain format: <name>.npub1... (kind 35128)
 * - regular npub: npub1... (kind 15128)
 */
function parseSiteIdentifier(input: string): AddressPointer | null {
  // 1. Check if naddr format
  if (input.startsWith("naddr1")) {
    try {
      const decoded = decodePointer(input);
      if (decoded.type === "naddr") {
        // Return the decoded pointer directly
        return decoded.data;
      }
    } catch (error) {
      throw new Error(`Invalid naddr format: ${input} - ${error}`);
    }
  }

  // 2. Check if subdomain format: <name>.npub1...
  const subdomainMatch = input.match(/^([a-zA-Z0-9_-]+)\.(npub1[a-z0-9]+)$/);
  if (subdomainMatch) {
    const npub = subdomainMatch[2];
    const identifier = subdomainMatch[1];
    const pubkey = normalizeToPubkey(npub);
    if (!pubkey) {
      throw new Error(`Invalid npub in subdomain format: ${npub}`);
    }
    // Construct AddressPointer for named site (kind 35128)
    return {
      pubkey,
      identifier,
      kind: 35128,
    };
  }

  // 3. Regular npub
  const pubkey = normalizeToPubkey(input);
  if (pubkey) {
    // Construct AddressPointer for root site (kind 15128)
    return {
      pubkey,
      kind: 15128,
      identifier: "",
    };
  }

  throw new Error(`Invalid site identifier format: ${input}`);
}

interface RunOptions extends ResolverOptions {
  config?: string;
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
export function registerRunCommand(): void {
  nsyte
    .command("run")
    .alias("rn")
    .description(
      "Run a resolver server that serves nsites via npub subdomains",
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
    .action(async (options: RunOptions, siteIdentifier?: string) => {
      const port = options.port || 6798;

      // Load project config early so it can inform the default target site
      const projectConfig = readProjectFile(options.config);

      // Parse site identifier if provided
      let targetSite: AddressPointer | null = null;
      if (siteIdentifier) {
        try {
          targetSite = parseSiteIdentifier(siteIdentifier);
        } catch (error) {
          console.log(colors.red(`✗ ${error instanceof Error ? error.message : String(error)}`));
          Deno.exit(1);
        }
      } else if (projectConfig?.bunkerPubkey) {
        // Default to the local .nsite/config.json site when available
        const siteId = projectConfig.id;
        const isNamedSite = siteId && siteId.length > 0;
        targetSite = {
          pubkey: projectConfig.bunkerPubkey,
          kind: isNamedSite ? NSITE_NAME_SITE_KIND : NSITE_ROOT_SITE_KIND,
          identifier: isNamedSite ? siteId! : "",
        };
        console.log(
          colors.cyan(
            `Using site from .nsite/config.json (${projectConfig.bunkerPubkey.slice(0, 8)}...)`,
          ),
        );
      } else {
        // Fall back to demo site
        const defaultPubkey = "1805301ca7c1ad2f9349076cf282f905b3c1e540e88675e14b95856c40b75e33";
        targetSite = {
          pubkey: defaultPubkey,
          kind: NSITE_ROOT_SITE_KIND,
          identifier: "",
        };
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
        targetSite,
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
