import { colors } from "@cliffy/ansi/colors";
import { createSigner } from "../lib/auth/signer-factory.ts";
import { readProjectFile } from "../lib/config.ts";
import { NSYTE_BROADCAST_RELAYS } from "../lib/constants.ts";
import { getErrorMessage, handleError } from "../lib/error-utils.ts";
import {
  createSnapshotTemplate,
  getOrComputeManifestAggregateTag,
  NSITE_SNAPSHOT_KIND,
} from "../lib/manifest.ts";
import { createLogger } from "../lib/logger.ts";
import { publishEventsToRelaysDetailed } from "../lib/nostr.ts";
import { resolveRelays } from "../lib/resolver-utils.ts";
import { resolveSiteIdentifier } from "../lib/site-identifier.ts";
import { fetchTrustedSiteManifestEvent } from "../lib/site-manifest.ts";
import { formatSectionHeader } from "../ui/formatters.ts";
import { formatManifestIdWithAge, formatTimestamp } from "../ui/time-formatter.ts";
import nsyte from "./root.ts";

const log = createLogger("snapshot");

interface SnapshotCommandOptions {
  config?: string | false;
  relays?: string;
  sec?: string;
  name?: string;
  dryRun?: boolean;
  useFallbackRelays?: boolean;
  useFallbacks?: boolean;
}

export function formatSnapshotCreatedAt(createdAt: number): string {
  return `${createdAt} (${formatTimestamp(createdAt)})`;
}

export function registerSnapshotCommand(): void {
  nsyte
    .command("snapshot")
    .description("Create an immutable snapshot event for the current root or named site.")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-d, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, snapshots the root site (kind 15128).",
    )
    .option("--dry-run", "Preview the snapshot event without signing or publishing it.")
    .option("--no-config", "Ignore config file and use only CLI arguments.", { default: false })
    .option(
      "--use-fallback-relays",
      "Include default nsyte relays in addition to configured relays.",
    )
    .option("--use-fallbacks", "Enable all fallbacks (currently only relays for this command).")
    .action(async (options: SnapshotCommandOptions) => {
      try {
        await snapshotCommand(options);
      } catch (error) {
        const message = getErrorMessage(error);
        log.error(message);
        console.error(colors.red(`Error: ${message}`));
        Deno.exit(1);
      }
    })
    .error((error) => {
      handleError("Error creating snapshot", error, {
        showConsole: true,
        exit: true,
        exitCode: 1,
      });
    });
}

export async function snapshotCommand(options: SnapshotCommandOptions): Promise<void> {
  const configPath = typeof options.config === "string" ? options.config : undefined;
  const config = options.config === false ? null : readProjectFile(configPath);
  const signerResult = await createSigner({
    sec: options.sec,
    bunkerPubkey: config?.bunkerPubkey,
  });

  if ("error" in signerResult) {
    throw new Error(signerResult.error);
  }

  const siteName = resolveSiteIdentifier(options.name, config);
  const allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;
  const configuredRelays = options.relays !== undefined
    ? resolveRelays(options, config, false)
    : (config?.relays || []);
  let relays = [...configuredRelays];

  if (allowFallbackRelays) {
    relays = [...new Set([...relays, ...NSYTE_BROADCAST_RELAYS])];
  }

  if (relays.length === 0) {
    if (!allowFallbackRelays) {
      throw new Error("No relays configured and fallbacks disabled.");
    }

    relays = NSYTE_BROADCAST_RELAYS;
    console.log(colors.yellow("Using default relays because none were configured."));
  }

  const siteType = siteName ? `named site \"${siteName}\"` : "root site";
  console.log(formatSectionHeader("Snapshot Source"));
  console.log(colors.cyan(`Fetching ${siteType} manifest from relays: ${relays.join(", ")}`));

  const trustedManifest = await fetchTrustedSiteManifestEvent(
    relays,
    signerResult.pubkey,
    siteName,
  );
  if (!trustedManifest.event) {
    throw new Error(`No manifest found for ${siteType}.`);
  }

  const sourceManifest = trustedManifest.event;
  const aggregateTag = await getOrComputeManifestAggregateTag(sourceManifest);
  const snapshotTemplate = await createSnapshotTemplate(sourceManifest);

  console.log(
    colors.gray(
      `Source manifest: ${formatManifestIdWithAge(sourceManifest.id, sourceManifest.created_at)}`,
    ),
  );
  console.log(colors.cyan(`Aggregate hash: ${aggregateTag[1]}`));
  console.log(colors.cyan(`Snapshot kind: ${NSITE_SNAPSHOT_KIND}`));
  console.log(
    colors.cyan(`Snapshot created_at: ${formatSnapshotCreatedAt(snapshotTemplate.created_at)}`),
  );
  console.log("");

  if (options.dryRun) {
    console.log(colors.yellow("Dry run only: snapshot was not signed or published."));
    return;
  }

  console.log(formatSectionHeader("Publishing Snapshot"));
  const snapshotEvent = await signerResult.signer.signEvent(snapshotTemplate);
  const publishResult = await publishEventsToRelaysDetailed(trustedManifest.relays, [
    snapshotEvent,
  ]);
  const eventResult = publishResult.eventResults[0];
  const successCount = eventResult?.successCount ?? 0;
  const successfulRelays =
    eventResult?.relayResults.filter((result) => result.ok).map((result) => result.relay) ?? [];

  if (successCount === 0) {
    throw new Error("Failed to publish snapshot event to any relay.");
  }

  console.log(colors.green(`Created snapshot for ${siteType}`));
  console.log(colors.cyan(`Snapshot event: ${snapshotEvent.id}`));
  console.log(colors.gray(`Published to ${successCount} relay(s): ${successfulRelays.join(", ")}`));
}
