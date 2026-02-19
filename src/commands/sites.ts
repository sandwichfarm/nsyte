import { colors } from "@cliffy/ansi/colors";
import { mapEventsToStore, mapEventsToTimeline, simpleTimeout } from "applesauce-core";
import { type NostrEvent, relaySet } from "applesauce-core/helpers";
import { lastValueFrom, timer } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { readProjectFile } from "../lib/config.ts";
import { NSYTE_BROADCAST_RELAYS } from "../lib/constants.ts";
import { handleError } from "../lib/error-utils.ts";
import { log } from "../lib/logger.ts";
import {
  getManifestDescription,
  getManifestFiles,
  getManifestTitle,
  NSITE_NAME_SITE_KIND,
  NSITE_ROOT_SITE_KIND,
} from "../lib/manifest.ts";
import { getUserDisplayName, getUserOutboxes, pool, store } from "../lib/nostr.ts";
import { resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
import { formatTimestamp } from "../ui/time-formatter.ts";
import nsyte from "./root.ts";

/**
 * Interface for site information
 */
interface SiteInfo {
  event: NostrEvent;
  type: "root" | "named";
  identifier?: string;
  title?: string;
  description?: string;
  updatedAt: number;
  fileCount: number;
}

/**
 * Sites command options
 */
interface SitesCommandOptions {
  config?: string;
  relays?: string;
  sec?: string;
  pubkey?: string;
  useFallbackRelays?: boolean;
  useFallbacks?: boolean;
}

/**
 * Register the sites command
 */
export function registerSitesCommand() {
  return nsyte
    .command("sites")
    .description(
      "List all root and named sites published by a pubkey, showing titles, descriptions, and update times.",
    )
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-p, --pubkey <npub:string>",
      "The public key to list sites for (npub, hex, or NIP-05 identifier like name@domain.com).",
    )
    .option(
      "--use-fallback-relays",
      "Include default nsyte relays in addition to configured/user relays.",
    )
    .option("--use-fallbacks", "Enable all fallbacks (currently only relays for this command).")
    .action(async (options: SitesCommandOptions) => {
      const pubkey = await resolvePubkey(options);
      const projectConfig = readProjectFile(options.config);
      const allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;
      const configuredRelays = options.relays !== undefined
        ? resolveRelays(options, projectConfig, false)
        : (projectConfig?.relays || []);
      let relays = relaySet(configuredRelays);

      if (allowFallbackRelays) {
        relays = relaySet(relays, NSYTE_BROADCAST_RELAYS);
      }

      if (relays.length === 0) {
        if (allowFallbackRelays) {
          relays = NSYTE_BROADCAST_RELAYS;
          console.log(colors.yellow("⚠️  Using default relays because none were configured."));
        } else {
          console.log(colors.red("✗ No relays configured and fallbacks disabled."));
          Deno.exit(1);
        }
      }

      console.log(
        colors.cyan(
          `Fetching outbox relays for ${colors.bold(await getUserDisplayName(pubkey))}`,
        ),
      );

      // Get user's outbox relays and merge
      const outboxes = await getUserOutboxes(pubkey);
      if (outboxes) relays = relaySet(relays, outboxes);

      console.log(
        colors.cyan(
          `Fetching sites for ${colors.bold(await getUserDisplayName(pubkey))} from relays: ${
            relays.join(" ")
          }`,
        ),
      );

      // Fetch all site manifest events (both root and named)
      const REQUEST_TIMEOUT_MS = 15000;

      let events: NostrEvent[] = [];
      try {
        const filter = {
          kinds: [NSITE_ROOT_SITE_KIND, NSITE_NAME_SITE_KIND],
          authors: [pubkey],
        };

        log.debug(`Filter: ${JSON.stringify(filter)}`);
        log.debug(`Relays: ${relays.join(" ")}`);

        events = await lastValueFrom(
          pool
            .request(relays, filter)
            .pipe(
              simpleTimeout(REQUEST_TIMEOUT_MS),
              mapEventsToStore(store),
              mapEventsToTimeline(),
              takeUntil(timer(REQUEST_TIMEOUT_MS)),
            ),
          { defaultValue: [] },
        );
      } catch (error) {
        console.log(
          colors.yellow(
            `Warning: Error fetching events: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }

      if (events.length === 0) {
        console.log(colors.yellow("\nNo sites found for this pubkey."));
        Deno.exit(0);
      }

      // Process events into SiteInfo objects
      const sites: SiteInfo[] = [];
      const rootSites: NostrEvent[] = [];
      const namedSitesMap = new Map<string, NostrEvent>(); // Map identifier -> latest event

      for (const event of events) {
        if (event.kind === NSITE_ROOT_SITE_KIND) {
          // For root sites, keep only the latest one
          if (rootSites.length === 0 || event.created_at > rootSites[0].created_at) {
            rootSites[0] = event;
          }
        } else if (event.kind === NSITE_NAME_SITE_KIND) {
          // For named sites, keep the latest for each identifier
          const identifier = event.tags.find((tag) => tag[0] === "d")?.[1];
          if (identifier) {
            const existing = namedSitesMap.get(identifier);
            if (!existing || event.created_at > existing.created_at) {
              namedSitesMap.set(identifier, event);
            }
          }
        }
      }

      // Convert to SiteInfo objects
      if (rootSites.length > 0) {
        const event = rootSites[0];
        sites.push({
          event,
          type: "root",
          title: getManifestTitle(event),
          description: getManifestDescription(event),
          updatedAt: event.created_at,
          fileCount: getManifestFiles(event).length,
        });
      }

      for (const [identifier, event] of namedSitesMap) {
        sites.push({
          event,
          type: "named",
          identifier,
          title: getManifestTitle(event),
          description: getManifestDescription(event),
          updatedAt: event.created_at,
          fileCount: getManifestFiles(event).length,
        });
      }

      // Sort by updatedAt descending (most recent first)
      sites.sort((a, b) => b.updatedAt - a.updatedAt);

      // Display sites
      console.log(colors.green(`\nFound ${sites.length} site(s):`));
      console.log(colors.gray("─".repeat(100)));

      for (const site of sites) {
        const typeLabel = site.type === "root"
          ? colors.cyan("ROOT")
          : colors.magenta(`NAMED:${site.identifier}`);
        const title = site.title || colors.gray("Untitled");
        const description = site.description
          ? (site.description.length > 60
            ? site.description.substring(0, 57) + "..."
            : site.description)
          : colors.gray("No description");
        const updated = formatTimestamp(site.updatedAt);

        // Calculate padding width based on actual text (not ANSI codes)
        const typeLabelText = site.type === "root" ? "ROOT" : `NAMED:${site.identifier}`;
        const paddingWidth = Math.max(20, typeLabelText.length + 1);

        console.log(
          `\n${typeLabel}${" ".repeat(paddingWidth - typeLabelText.length)}${colors.bold(title)}`,
        );
        console.log(`${" ".repeat(paddingWidth)}${description}`);
        console.log(
          `${" ".repeat(paddingWidth)}${
            colors.gray(`Files: ${site.fileCount} | Updated: ${updated}`)
          }`,
        );
        console.log(`${" ".repeat(paddingWidth)}${colors.gray(`Event ID: ${site.event.id}`)}`);
      }

      console.log(colors.gray("\n" + "─".repeat(100)));

      Deno.exit(0);
    }).error((error) => {
      handleError("Error listing sites", error, {
        showConsole: true,
        exit: true,
        exitCode: 1,
      });
    });
}
