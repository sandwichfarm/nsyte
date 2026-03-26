import { colors } from "@cliffy/ansi/colors";
import { ensureDir } from "@std/fs/ensure-dir";
import { dirname } from "@std/path";
import nsyte from "./root.ts";
import { readProjectFile } from "../lib/config.ts";
import { DownloadService } from "../lib/download.ts";
import { getErrorMessage } from "../lib/error-utils.ts";
import { createLogger } from "../lib/logger.ts";
import { getManifestFiles, getManifestServers } from "../lib/manifest.ts";
import { getUserBlossomServers, getUserDisplayName } from "../lib/nostr.ts";
import {
  resolvePubkey,
  resolveRelays,
  type ResolverOptions,
  resolveServers,
} from "../lib/resolver-utils.ts";
import { fetchTrustedSiteManifestEvent } from "../lib/site-manifest.ts";

const log = createLogger("get");

interface GetCommandOptions extends ResolverOptions {
  output?: string;
  name?: string;
  config?: string;
}

function normalizeSitePath(path: string): string {
  const normalized = path.trim().replace(/\\+/g, "/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/\/+/g, "/");
}

function mergeUniqueStrings(...values: Array<string[] | undefined>): string[] {
  const merged = new Set<string>();
  for (const group of values) {
    for (const value of group ?? []) {
      if (value) merged.add(value);
    }
  }
  return Array.from(merged);
}

export async function writeGetOutput(data: Uint8Array, output?: string): Promise<void> {
  if (!output) {
    Deno.stdout.writeSync(data);
    return;
  }

  await ensureDir(dirname(output));
  await Deno.writeFile(output, data);
}

export function registerGetCommand(): void {
  nsyte
    .command("get")
    .description("Download one file from a site manifest")
    .arguments("<remote-path:string>")
    .option("-o, --output <file:string>", "Write the downloaded file to disk instead of stdout.")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated).")
    .option("-s, --servers <servers:string>", "The blossom servers to try first (comma separated).")
    .option(
      "-p, --pubkey <npub:string>",
      "The public key to download from (npub, hex, or NIP-05 identifier like name@domain.com).",
    )
    .option(
      "-d, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, uses the root site (kind 15128).",
    )
    .action(async (options: GetCommandOptions, remotePath: string) => {
      try {
        const config = readProjectFile(options.config);
        const pubkey = await resolvePubkey(options, config, false);
        const relays = resolveRelays(options, config, true);
        const trustedManifest = await fetchTrustedSiteManifestEvent(relays, pubkey, options.name);
        const siteType = options.name ? `named site \"${options.name}\"` : "root site";

        if (!trustedManifest.event) {
          throw new Error(`No manifest found for ${siteType}.`);
        }

        const normalizedRemotePath = normalizeSitePath(remotePath);
        const fileEntry = getManifestFiles(trustedManifest.event).find((file) => {
          return normalizeSitePath(file.path) === normalizedRemotePath;
        });
        if (!fileEntry?.sha256) {
          throw new Error(`Path not found in ${siteType}: ${normalizedRemotePath}`);
        }

        const configuredServers = resolveServers(options, config);
        const manifestServers = getManifestServers(trustedManifest.event).map((url) =>
          url.toString()
        );
        const userServers = await getUserBlossomServers(pubkey) ?? [];
        const servers = mergeUniqueStrings(configuredServers, manifestServers, userServers);
        if (servers.length === 0) {
          throw new Error("No download servers found in options, manifest, or user server list.");
        }

        const downloadService = DownloadService.create();
        let downloadedData: Uint8Array | null = null;
        for (const server of servers) {
          downloadedData = await downloadService.downloadFromServer(server, fileEntry.sha256);
          if (downloadedData) {
            break;
          }
        }

        if (!downloadedData) {
          throw new Error(`Unable to download ${normalizedRemotePath} from any configured server.`);
        }

        await writeGetOutput(downloadedData, options.output);

        if (options.output) {
          console.log(colors.green(`Downloaded ${normalizedRemotePath} to ${options.output}`));
          console.log(colors.gray(`Site owner: ${await getUserDisplayName(pubkey)}`));
        }
      } catch (error) {
        const message = getErrorMessage(error);
        log.error(message);
        console.error(colors.red(`Error: ${message}`));
        Deno.exit(1);
      }
    });
}
