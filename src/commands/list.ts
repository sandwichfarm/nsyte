import { colors } from "@cliffy/ansi/colors";
import { readProjectFile } from "../lib/config.ts";
import { NSYTE_BROADCAST_RELAYS } from "../lib/constants.ts";
import { handleError } from "../lib/error-utils.ts";
import { getManifestFiles } from "../lib/manifest.ts";
import { getUserDisplayName } from "../lib/nostr.ts";
import { resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
import { fetchTrustedSiteManifestEvent } from "../lib/site-manifest.ts";
import { buildListTreeItems } from "../ui/file-tree.ts";
import { formatManifestIdWithAge } from "../ui/time-formatter.ts";
import nsyte from "./root.ts";

interface ListCommandOptions {
  config?: string;
  relays?: string;
  sec?: string;
  pubkey?: string;
  name?: string;
  useFallbackRelays?: boolean;
  useFallbacks?: boolean;
}

function normalizePathFilter(pathFilter?: string): string | undefined {
  if (!pathFilter) {
    return undefined;
  }

  let normalizedPathFilter = pathFilter.startsWith("/") ? pathFilter.substring(1) : pathFilter;
  if (!normalizedPathFilter.includes(".") && !normalizedPathFilter.endsWith("/")) {
    normalizedPathFilter += "/";
  }

  return normalizedPathFilter;
}

function matchesPathFilter(filePath: string, pathFilter?: string): boolean {
  if (!pathFilter) {
    return true;
  }

  const normalizedPath = filePath.startsWith("/") ? filePath.substring(1) : filePath;
  if (pathFilter.endsWith("/")) {
    return normalizedPath.startsWith(pathFilter);
  }

  return normalizedPath === pathFilter || normalizedPath.startsWith(pathFilter + ".") ||
    normalizedPath.startsWith(pathFilter + "/");
}

export function registerListCommand() {
  return nsyte
    .command("list")
    .alias("ls")
    .description("List files from a site manifest. Optionally filter by path.")
    .arguments("[path:string]")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-p, --pubkey <npub:string>",
      "The public key to list files for (npub, hex, or NIP-05 identifier like name@domain.com).",
    )
    .option(
      "-d, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, lists root site (kind 15128).",
    )
    .option(
      "--use-fallback-relays",
      "Include default nsyte relays in addition to configured/user relays.",
    )
    .option("--use-fallbacks", "Enable all fallbacks (currently only relays for this command).")
    .action(async (options: ListCommandOptions, pathFilter?: string) => {
      const pubkey = await resolvePubkey(options);
      const projectConfig = readProjectFile(options.config);
      const allowFallbackRelays = options.useFallbacks || options.useFallbackRelays || false;
      const configuredRelays = options.relays !== undefined
        ? resolveRelays(options, projectConfig, false)
        : (projectConfig?.relays || []);
      let relays = [...configuredRelays];

      if (allowFallbackRelays) {
        relays = [...new Set([...relays, ...NSYTE_BROADCAST_RELAYS])];
      }

      if (relays.length === 0) {
        if (allowFallbackRelays) {
          relays = NSYTE_BROADCAST_RELAYS;
          console.log(colors.yellow("Using default relays because none were configured."));
        } else {
          console.log(colors.red("No relays configured and fallbacks disabled."));
          Deno.exit(1);
        }
      }

      const normalizedPathFilter = normalizePathFilter(pathFilter);
      const siteType = options.name ? `named site \"${options.name}\"` : "root site";
      const displayName = await getUserDisplayName(pubkey);

      console.log(
        colors.cyan(
          `Listing files for ${siteType} owned by ${colors.bold(displayName)} on relays: ${
            relays.join(", ")
          }`,
        ),
      );

      if (normalizedPathFilter) {
        console.log(colors.cyan(`Filtering by path: ${normalizedPathFilter}`));
      }

      const trustedManifest = await fetchTrustedSiteManifestEvent(relays, pubkey, options.name);
      if (!trustedManifest.event) {
        console.log(colors.red(`No manifest event found for ${siteType}`));
        Deno.exit(1);
      }

      const manifest = trustedManifest.event;
      let files = getManifestFiles(manifest).map((file) => ({
        path: file.path,
        sha256: file.sha256,
        eventId: manifest.id,
        event: manifest,
        foundOnRelays: [...trustedManifest.relays],
        availableOnServers: [],
      })).filter((file) => matchesPathFilter(file.path, normalizedPathFilter));

      console.log("\n" + colors.bold("Manifest:"));
      console.log(colors.cyan(formatManifestIdWithAge(manifest.id, manifest.created_at)));
      console.log(colors.gray("─".repeat(80)));

      if (files.length === 0) {
        const emptyMessage = normalizedPathFilter
          ? `No files found matching path: ${normalizedPathFilter}`
          : "No files found in this manifest.";
        console.log(colors.yellow(emptyMessage));
        return;
      }

      const treeItems = buildListTreeItems(files);

      console.log(colors.bold("Files:"));
      treeItems.forEach((item) => {
        const name = item.path.split("/").pop() || item.path;
        let treePrefix = item.parentPrefix;
        if (item.depth > 0) {
          treePrefix += item.isLast ? "└─ " : "├─ ";
        }

        if (item.isDirectory) {
          console.log(`${colors.gray(treePrefix)}${colors.gray(name + "/")}`);
          return;
        }

        console.log(`${colors.gray(treePrefix)}${colors.white(name)}`);
      });

      console.log(colors.gray("─".repeat(80)));
      console.log(`Total files: ${files.length}`);
    }).error((error) => {
      handleError("Error listing files", error, {
        showConsole: true,
        exit: true,
        exitCode: 1,
      });
    });
}
