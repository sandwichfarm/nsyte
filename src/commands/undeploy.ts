import { colors } from "@cliffy/ansi/colors";
import { Input } from "@cliffy/prompt";
import { encodeBase64 } from "@std/encoding/base64";
import type { ISigner } from "applesauce-signers";
import { createSigner } from "../lib/auth/signer-factory.ts";
import { readProjectFile } from "../lib/config.ts";
import { handleError } from "../lib/error-utils.ts";
import { createLogger } from "../lib/logger.ts";
import { createDeleteEvent, getUserDisplayName, publishEventsToRelays } from "../lib/nostr.ts";
import { resolveRelays, resolveServers } from "../lib/resolver-utils.ts";
import { fetchTrustedSiteManifestEvent } from "../lib/site-manifest.ts";
import { formatSectionHeader } from "../ui/formatters.ts";
import { formatManifestIdWithAge } from "../ui/time-formatter.ts";
import nsyte from "./root.ts";

const log = createLogger("undeploy");

const DELETE_AUTH_BATCH_SIZE = 20;

/**
 * Sign a batch delete authorization covering up to DELETE_AUTH_BATCH_SIZE hashes.
 * Returns the full Authorization header value: "Nostr <base64-encoded-event>".
 */
async function createBatchDeleteAuth(blobSha256s: string[], signer: ISigner): Promise<string> {
  const currentTime = Math.floor(Date.now() / 1000);

  const tags: string[][] = [
    ["t", "delete"],
    ["expiration", (currentTime + 3600).toString()],
    ...blobSha256s.map((hash) => ["x", hash]),
  ];

  const authTemplate = {
    kind: 24242,
    created_at: currentTime,
    tags,
    content: "Delete blobs via nsyte undeploy",
  };

  const authEvent = await signer.signEvent(authTemplate);
  const encodedEvent = encodeBase64(JSON.stringify(authEvent));
  return `Nostr ${encodedEvent}`;
}

/**
 * Build a map of sha256 -> Authorization header by signing batch delete tokens
 * (up to DELETE_AUTH_BATCH_SIZE hashes per token).
 */
async function buildDeleteAuthMap(
  hashes: string[],
  signer: ISigner,
): Promise<Map<string, string>> {
  const authMap = new Map<string, string>();

  for (let i = 0; i < hashes.length; i += DELETE_AUTH_BATCH_SIZE) {
    const batch = hashes.slice(i, i + DELETE_AUTH_BATCH_SIZE);
    log.debug(
      `Signing batch delete auth token ${Math.floor(i / DELETE_AUTH_BATCH_SIZE) + 1}/${
        Math.ceil(hashes.length / DELETE_AUTH_BATCH_SIZE)
      } for ${batch.length} blobs`,
    );
    const authHeader = await createBatchDeleteAuth(batch, signer);
    for (const hash of batch) {
      authMap.set(hash, authHeader);
    }
  }

  log.info(
    `Signed ${
      Math.ceil(hashes.length / DELETE_AUTH_BATCH_SIZE)
    } batch delete auth token(s) for ${hashes.length} blobs`,
  );

  return authMap;
}

/**
 * Register the undeploy command
 */
export function registerUndeployCommand() {
  return nsyte
    .command("undeploy")
    .description(
      "Completely remove a deployed site: delete all blobs from blossom servers and remove the site manifest from relays",
    )
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated)")
    .option(
      "-s, --servers <servers:string>",
      "The blossom servers to delete blobs from (comma separated)",
    )
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-d, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, undeploys root site (kind 15128).",
    )
    .option("-y, --yes", "Skip confirmation prompts", { default: false })
    .action(async (options) => {
      log.debug(`Starting undeploy with options: ${JSON.stringify(options)}`);
      console.log(colors.bold.magenta("\nnsyte undeploy\n"));

      // Read config
      log.debug("Reading project file...");
      const config = readProjectFile(options.config);
      if (!config) {
        console.log(colors.red("No .nsite/config.json found. Please run 'nsyte init' first."));
        return Deno.exit(1);
      }

      // Initialize signer
      const signerResult = await createSigner({
        sec: options.sec,
        bunkerPubkey: config?.bunkerPubkey,
      });

      if ("error" in signerResult) {
        console.log(colors.red(`Failed to create signer: ${signerResult.error}`));
        return Deno.exit(1);
      }

      const { signer, pubkey } = signerResult;

      // Resolve relays and servers
      const relays = resolveRelays(options, config, false);
      if (relays.length === 0) {
        console.log(
          colors.red(
            "No relays configured. Please specify with --relays or configure in .nsite/config.json",
          ),
        );
        return Deno.exit(1);
      }

      const servers = resolveServers(options, config);

      const displayName = await getUserDisplayName(pubkey);

      console.log(formatSectionHeader("Configuration"));
      console.log(`  User:    ${colors.cyan(displayName)}`);
      console.log(`  Relays:  ${colors.cyan(relays.join(", "))}`);
      if (servers.length > 0) {
        console.log(`  Servers: ${colors.cyan(servers.join(", "))}`);
      }
      if (options.name) {
        console.log(`  Site:    ${colors.cyan(options.name)}`);
      }

      // Fetch site manifest
      const siteLabel = options.name ? `named site "${options.name}"` : "root site";
      console.log(colors.cyan(`\nFetching manifest for ${siteLabel}...`));
      const trustedManifest = await fetchTrustedSiteManifestEvent(relays, pubkey, options.name);

      if (!trustedManifest.event) {
        console.log(colors.red(`No manifest event found for ${siteLabel}.`));
        // Close signer if it's a bunker
        if ("close" in signer && typeof signer.close === "function") {
          await signer.close();
        }
        return Deno.exit(1);
      }

      const manifest = trustedManifest.event;

      console.log(
        colors.gray(
          `Found manifest event: ${formatManifestIdWithAge(manifest.id, manifest.created_at)}`,
        ),
      );

      // Extract all file hashes from manifest path tags
      const pathTags = manifest.tags.filter((tag) => tag[0] === "path");
      const blobHashes = new Set<string>();
      for (const pathTag of pathTags) {
        // Path tag format: ["path", "/path", "sha256hash"]
        if (pathTag.length >= 3 && pathTag[2]) {
          blobHashes.add(pathTag[2]);
        }
      }

      const fileCount = pathTags.length;
      const uniqueBlobCount = blobHashes.size;

      // Show summary
      console.log(
        colors.yellow(
          `\n\u26a0 This will delete ${colors.bold(uniqueBlobCount.toString())} blobs from ${
            colors.bold(servers.length.toString())
          } servers and remove the site manifest from ${
            colors.bold(trustedManifest.relays.length.toString())
          } relays.`,
        ),
      );

      // Show first few paths
      const paths = pathTags.slice(0, 5).map((tag) => tag[1]);
      paths.forEach((path) => console.log(`  - ${path}`));
      if (fileCount > 5) {
        console.log(`  ... and ${fileCount - 5} more files`);
      }

      // Type-to-confirm
      if (!options.yes) {
        const confirmString = options.name || "undeploy";

        console.log("");
        const typed = await Input.prompt({
          message: `Type "${confirmString}" to confirm`,
        });

        if (typed !== confirmString) {
          console.log(colors.yellow("Undeploy cancelled."));
          // Close signer if it's a bunker
          if ("close" in signer && typeof signer.close === "function") {
            await signer.close();
          }
          return Deno.exit(0);
        }
      }

      // Delete all blobs from all blossom servers
      if (servers.length > 0 && blobHashes.size > 0) {
        console.log(colors.cyan("\nDeleting blobs from blossom servers..."));

        const hashArray = Array.from(blobHashes);
        const deleteAuthMap = await buildDeleteAuthMap(hashArray, signer);

        let deletedCount = 0;
        let failedCount = 0;

        for (const server of servers) {
          console.log(colors.cyan(`\nDeleting from ${server}...`));

          const normalizedServer = server.endsWith("/") ? server : server + "/";

          for (const hash of blobHashes) {
            try {
              const authHeader = deleteAuthMap.get(hash)!;

              const response = await fetch(`${normalizedServer}${hash}`, {
                method: "DELETE",
                headers: {
                  "Authorization": authHeader,
                },
              });

              if (response.ok) {
                deletedCount++;
                console.log(colors.green(`  \u2713 Deleted ${hash.substring(0, 8)}...`));
              } else if (response.status === 404) {
                console.log(colors.dim(`  - Not found ${hash.substring(0, 8)}...`));
              } else {
                failedCount++;
                const errorText = await response.text().catch(() => "");
                console.log(
                  colors.red(
                    `  \u2717 Failed to delete ${hash.substring(0, 8)}... (${response.status}${
                      errorText ? `: ${errorText}` : ""
                    })`,
                  ),
                );
              }
            } catch (error) {
              failedCount++;
              console.log(
                colors.red(`  \u2717 Error deleting ${hash.substring(0, 8)}...: ${error}`),
              );
            }
          }
        }

        console.log(colors.cyan(`\nBlob deletion summary:`));
        if (deletedCount > 0) {
          console.log(colors.green(`  \u2713 ${deletedCount} blobs deleted`));
        }
        if (failedCount > 0) {
          console.log(colors.red(`  \u2717 ${failedCount} deletions failed`));
        }
      } else if (servers.length === 0) {
        console.log(
          colors.yellow("\nNo blossom servers configured. Skipping blob deletion."),
        );
      } else {
        console.log(colors.yellow("\nNo blob hashes found in manifest. Skipping blob deletion."));
      }

      // Publish NIP-09 delete event for the manifest
      console.log(colors.cyan("\nCreating delete event for site manifest..."));
      const deleteEvent = await createDeleteEvent(signer, [manifest.id]);

      console.log(colors.cyan("Publishing delete event to relays..."));
      const success = await publishEventsToRelays(trustedManifest.relays, [deleteEvent]);

      // Results summary
      console.log(formatSectionHeader("\nResults"));
      if (success) {
        console.log(
          colors.green(`\u2713 Successfully removed ${siteLabel} from relays`),
        );
      } else {
        console.log(
          colors.red(`\u2717 Failed to publish delete event to some or all relays`),
        );
      }

      console.log(
        colors.dim(
          "Note: Relays may take time to process deletions, and some relays may not honor delete requests.",
        ),
      );

      // Close signer if it's a bunker
      if ("close" in signer && typeof signer.close === "function") {
        await signer.close();
      }

      Deno.exit(success ? 0 : 1);
    })
    .error((error) => {
      handleError("Error undeploying", error, {
        showConsole: true,
        exit: true,
        exitCode: 1,
        logger: log,
      });
    });
}
