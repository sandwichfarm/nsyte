import { Command } from "@cliffy/command";
import { createLogger } from "../lib/logger.ts";
import { hexToBytes } from "@noble/hashes/utils";
import { nip19, type NostrEvent } from "nostr-tools";
import { colors } from "@cliffy/ansi/colors";
import { RelayPool } from "applesauce-relay/pool";
import { schnorr } from "@noble/curves/secp256k1";
import { encodeHex } from "@std/encoding/hex";
import {
  fetchEventsWithTimer,
  fetchKind0Event,
  fetchRelayListEvents,
  fetchServerListEvents,
  fetchNsiteEvents,
  fetchAppHandlerEvents,
} from "../lib/debug-helpers.ts";
import { checkBlossomServers } from "../lib/blossom-checker.ts";
import { USER_BLOSSOM_SERVER_LIST_KIND, NSITE_KIND } from "../lib/nostr.ts";
import { readProjectFile } from "../lib/config.ts";

const logger = createLogger("debug");

interface DebugResult {
  success: boolean;
  message: string;
  details?: any;
}

interface DebugReport {
  npub: string;
  pubkey: string;
  relays: {
    provided: string[];
    found: string[];
    kind10002?: any;
  };
  profile: DebugResult;
  nsiteEvents: DebugResult;
  blossomServers: DebugResult;
  appHandlers: DebugResult;
}

export function registerDebugCommand(program: Command): void {
  program
    .command("debug")
    .description("Debug an nsite by checking relays, blossom servers, and event kinds")
    .arguments("[npub:string]")
    .option("-r, --relays <relays:string>", "Comma-separated list of relay URLs")
    .option("-v, --verbose", "Show detailed debug information", { default: false })
    .action(async (options, npub?: string) => {
      try {
        logger.info("Starting nsite debug...");
        
        // Load config if available
        let config: any = null;
        try {
          config = readProjectFile(false);
        } catch (e) {
          logger.debug("No config file found, continuing without it");
        }

        // Determine npub from argument or config
        let targetNpub: string;
        if (npub) {
          targetNpub = npub;
        } else if (config?.bunkerPubkey) {
          targetNpub = nip19.npubEncode(config.bunkerPubkey);
          logger.info(`Using npub from bunker config: ${targetNpub}`);
        } else {
          console.error(colors.red("Error: No npub provided and no bunkerPubkey in config"));
          Deno.exit(1);
        }

        // Validate npub
        let pubkey: string;
        try {
          const decoded = nip19.decode(targetNpub);
          if (decoded.type !== "npub") {
            throw new Error("Invalid npub format");
          }
          pubkey = decoded.data as string;
        } catch (e) {
          console.error(colors.red(`Error: Invalid npub: ${e instanceof Error ? e.message : String(e)}`));
          Deno.exit(1);
        }

        // Determine relays
        let relays: string[] = [];
        if (options.relays) {
          relays = options.relays.split(",").map((r: string) => r.trim());
          logger.info("Using relays from command line");
        } else if (config?.relays && config.relays.length > 0) {
          relays = config.relays;
          logger.info("Using relays from config");
        } else {
          console.error(colors.red("Error: No relays configured and none provided via --relays"));
          Deno.exit(1);
        }

        const report: DebugReport = {
          npub: targetNpub,
          pubkey,
          relays: {
            provided: relays,
            found: []
          },
          profile: { success: false, message: "Not checked" },
          nsiteEvents: { success: false, message: "Not checked" },
          blossomServers: { success: false, message: "Not checked" },
          appHandlers: { success: false, message: "Not checked" }
        };

        console.log("\n" + colors.bold("=== NSITE DEBUG REPORT ==="));
        console.log(colors.gray(`npub: ${targetNpub}`));
        console.log(colors.gray(`pubkey: ${pubkey}`));
        console.log(colors.gray(`Initial relays: ${relays.join(", ")}`));
        console.log("");

        const pool = new RelayPool();

        // Step 1: Check profile (kind 0)
        console.log(colors.yellow("1. Checking profile (kind 0)..."));
        
        // Use specialized profile relays for better results
        const profileRelays = [
          "wss://purplepag.es",
          "wss://user.kindpag.es",
          ...relays
        ];
        
        const profileEvent = await fetchKind0Event(pool, profileRelays, pubkey);
        if (profileEvent) {
          report.profile = {
            success: true,
            message: "Profile found",
            details: JSON.parse(profileEvent.content)
          };
          console.log(colors.green("✓ Profile found"));
          if (options.verbose) {
            console.log(colors.gray(JSON.stringify(report.profile.details, null, 2)));
          }
        } else {
          report.profile = {
            success: false,
            message: "Profile not found on any relay"
          };
          console.log(colors.red("✗ Profile not found"));
        }

        // Step 2: Check relay list (kind 10002)
        console.log("\n" + colors.yellow("2. Checking relay list (kind 10002)..."));
        
        // Use specialized relay list relays
        const relayListRelays = [
          "wss://purplepag.es",
          "wss://user.kindpag.es",
          "wss://relay.nsite.lol",
          ...relays
        ];
        
        const relayListEvents = await fetchRelayListEvents(pool, relayListRelays, pubkey);
        if (relayListEvents.length > 0) {
          const latestRelayList = relayListEvents[0];
          const relayTags = latestRelayList.tags.filter(tag => tag[0] === "r");
          const foundRelays = relayTags.map(tag => tag[1]);
          report.relays.found = foundRelays;
          report.relays.kind10002 = latestRelayList;
          
          console.log(colors.green(`✓ Found ${foundRelays.length} relays in kind 10002`));
          if (options.verbose) {
            foundRelays.forEach(relay => {
              console.log(colors.gray(`  - ${relay}`));
            });
          }
          
          // Use found relays for subsequent checks if available
          if (foundRelays.length > 0) {
            relays = [...new Set([...relays, ...foundRelays])];
            console.log(colors.cyan(`  Using ${relays.length} total relays for further checks`));
          }
        } else {
          console.log(colors.red("✗ No relay list (kind 10002) found"));
          console.log(colors.yellow("  ⚠ Cannot discover user's preferred relays"));
        }

        // Get nsite events first for both blossom checking and step 4
        console.log(colors.gray("Fetching nsite events for blob verification..."));
        const nsiteRelays = [
          "wss://relay.nsite.lol",
          ...relays
        ];
        const nsiteEvents = await fetchNsiteEvents(pool, nsiteRelays, pubkey);
        
        // Step 3: Check blossom servers
        console.log("\n" + colors.yellow("3. Checking blossom servers..."));
        
        // First check config servers
        if (config?.servers && config.servers.length > 0) {
          console.log(colors.cyan(`Checking ${config.servers.length} servers from config...`));
          
          const serverResults = await checkBlossomServers(config.servers, nsiteEvents);
          
          let workingServers = 0;
          serverResults.forEach(result => {
            if (result.available) {
              workingServers++;
              let message = `  ✓ ${result.url} - Available`;
              
              if (result.filesChecked !== undefined) {
                message += ` (${result.filesFound}/${result.filesChecked} files found)`;
                
                if (result.hashVerification) {
                  if (result.hashVerification.valid) {
                    message += colors.green(` ✓ Hash verified`);
                    if (options.verbose) {
                      message += colors.gray(` [${result.hashVerification.hash.substring(0, 8)}...]`);
                    }
                  } else {
                    message += colors.red(` ✗ Hash mismatch!`);
                    if (options.verbose) {
                      message += colors.red(` Expected: ${result.hashVerification.expectedHash.substring(0, 8)}..., Got: ${result.hashVerification.hash.substring(0, 8)}...`);
                    }
                  }
                }
              }
              
              console.log(colors.green(message));
            } else {
              console.log(colors.red(`  ✗ ${result.url} - ${result.error}`));
            }
          });
          
          report.blossomServers = {
            success: workingServers > 0,
            message: `${workingServers}/${config.servers.length} config servers available`,
            details: serverResults
          };
          
          if (workingServers === 0) {
            console.log(colors.red("  ⚠ No blossom servers are available - blobs cannot be served!"));
          }
        } else {
          report.blossomServers = {
            success: false,
            message: "No blossom servers configured"
          };
          console.log(colors.red("✗ No blossom servers configured"));
        }
        
        // Also check if user published a server list (kind 10063) for reference
        console.log(colors.gray("  Checking for published server list (kind 10063)..."));
        const serverListEvents = await fetchServerListEvents(pool, relayListRelays, pubkey);
        if (serverListEvents.length > 0) {
          const latestServerList = serverListEvents[0];
          const serverTags = latestServerList.tags.filter(tag => tag[0] === "server");
          const publishedServers = serverTags.map(tag => tag[1]);
          console.log(colors.gray(`  ℹ Found published server list with ${publishedServers.length} servers`));
          
          // Compare with config (normalize URLs for comparison)
          if (config?.servers) {
            const normalizeUrl = (url: string) => new URL(url).toString();
            
            const configServersNormalized = config.servers.map(normalizeUrl);
            const publishedServersNormalized = publishedServers.map(normalizeUrl);
            
            const configServersSet = new Set(configServersNormalized);
            const publishedServersSet = new Set(publishedServersNormalized);
            
            const onlyInConfig = config.servers.filter((s: string) => !publishedServersSet.has(normalizeUrl(s)));
            const onlyInPublished = publishedServers.filter((s: string) => !configServersSet.has(normalizeUrl(s)));
            
            if (onlyInConfig.length > 0) {
              console.log(colors.yellow(`  ⚠ Servers in config but not published: ${onlyInConfig.join(", ")}`));
            }
            if (onlyInPublished.length > 0) {
              console.log(colors.yellow(`  ⚠ Servers published but not in config: ${onlyInPublished.join(", ")}`));
            }
            if (onlyInConfig.length === 0 && onlyInPublished.length === 0) {
              console.log(colors.green("  ✓ Config and published server lists match"));
            }
          }
        } else {
          console.log(colors.gray("  ℹ No published server list (kind 10063) found"));
        }

        // Step 4: Check nsite events (kind 34128)
        console.log("\n" + colors.yellow("4. Checking nsite events (kind 34128)..."));
        if (nsiteEvents.length > 0) {
          console.log(colors.green(`✓ Found ${nsiteEvents.length} nsite file events`));
          
          if (options.verbose) {
            console.log(colors.gray("  Recent files:"));
            nsiteEvents.slice(0, 5).forEach(event => {
              const pathTag = event.tags.find(tag => tag[0] === "x");
              const path = pathTag ? pathTag[1] : "unknown";
              console.log(colors.gray(`  - ${path}`));
            });
          }
          
          report.nsiteEvents = {
            success: true,
            message: `Found ${nsiteEvents.length} file events`,
            details: { count: nsiteEvents.length }
          };
        } else {
          report.nsiteEvents = {
            success: false,
            message: "No nsite events found"
          };
          console.log(colors.red("✗ No nsite events found"));
          console.log(colors.yellow("  ⚠ No files have been uploaded to this nsite"));
        }

        // Step 5: Check app handler events (kinds 31989, 31990)
        console.log("\n" + colors.yellow("5. Checking app handler events..."));
        const appHandlerEvents = await fetchAppHandlerEvents(pool, relays, pubkey);
        if (appHandlerEvents.length > 0) {
          const kind31989 = appHandlerEvents.filter(e => e.kind === 31989);
          const kind31990 = appHandlerEvents.filter(e => e.kind === 31990);
          
          console.log(colors.green(`✓ Found ${appHandlerEvents.length} app handler events`));
          if (kind31989.length > 0) {
            console.log(colors.gray(`  - ${kind31989.length} app recommendations (kind 31989)`));
          }
          if (kind31990.length > 0) {
            console.log(colors.gray(`  - ${kind31990.length} app announcements (kind 31990)`));
          }
          
          report.appHandlers = {
            success: true,
            message: `Found ${appHandlerEvents.length} app handler events`,
            details: {
              kind31989: kind31989.length,
              kind31990: kind31990.length
            }
          };
        } else {
          report.appHandlers = {
            success: false,
            message: "No app handler events found"
          };
          console.log(colors.yellow("⚠ No app handler events found"));
          console.log(colors.gray("  This is optional - app handlers help with nsite discovery"));
        }

        // Summary
        console.log("\n" + colors.bold("=== SUMMARY ==="));
        
        const criticalIssues: string[] = [];
        const warnings: string[] = [];
        
        if (!report.profile.success) {
          warnings.push("No profile found (kind 0)");
        }
        
        if (report.relays.found.length === 0) {
          criticalIssues.push("No relay list found (kind 10002) - cannot discover user's relays");
        }
        
        if (!report.blossomServers.success) {
          if (report.blossomServers.message.includes("No blossom server list")) {
            criticalIssues.push("No blossom server list found (kind 10063) - cannot serve blobs");
          } else if (report.blossomServers.message.includes("0/")) {
            criticalIssues.push("All blossom servers are unavailable - blobs cannot be served");
          }
        }
        
        if (!report.nsiteEvents.success) {
          warnings.push("No nsite events found (kind 34128) - no files uploaded yet");
        }
        
        if (!report.appHandlers.success) {
          warnings.push("No app handler events found - optional for discovery");
        }

        if (criticalIssues.length === 0 && warnings.length === 0) {
          console.log(colors.green("✓ All checks passed! The nsite appears to be properly configured."));
        } else {
          if (criticalIssues.length > 0) {
            console.log(colors.red("\nCritical Issues:"));
            criticalIssues.forEach(issue => {
              console.log(colors.red(`  ✗ ${issue}`));
            });
          }
          
          if (warnings.length > 0) {
            console.log(colors.yellow("\nWarnings:"));
            warnings.forEach(warning => {
              console.log(colors.yellow(`  ⚠ ${warning}`));
            });
          }
        }

        // Close relay pool connections
        // pool.close();
        console.log("\n" + colors.gray("Debug complete."));
        
        Deno.exit(criticalIssues.length > 0 ? 1 : 0);
        
      } catch (error) {
        logger.error(`Debug command failed: ${error}`);
        console.error(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        Deno.exit(1);
      }
    });
}