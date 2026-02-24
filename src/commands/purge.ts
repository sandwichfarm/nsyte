import { colors } from "@cliffy/ansi/colors";
import { Confirm } from "@cliffy/prompt";
import { encodeBase64 } from "@std/encoding/base64";
import { createSigner } from "../lib/auth/signer-factory.ts";
import { readProjectFile } from "../lib/config.ts";
import { createLogger } from "../lib/logger.ts";
import {
  createDeleteEvent,
  getSiteManifestEvent,
  getUserDisplayName,
  publishEventsToRelays,
} from "../lib/nostr.ts";
import { resolvePubkey, resolveRelays } from "../lib/resolver-utils.ts";
import { formatSectionHeader } from "../ui/formatters.ts";
import nsyte from "./root.ts";

const log = createLogger("purge");

import type { ISigner } from "applesauce-signers";
import { handleError } from "../lib/error-utils.ts";

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
    content: "Delete blobs via nsyte",
  };

  const authEvent = await signer.signEvent(authTemplate);
  const encodedEvent = encodeBase64(JSON.stringify(authEvent));
  return `Nostr ${encodedEvent}`;
}

/**
 * Build a map of sha256 → Authorization header by signing batch delete tokens
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
 * Register the purge command
 */
export function registerPurgeCommand() {
  return nsyte
    .command("purge")
    .alias("prg")
    .description("Remove nsite events from relays and optionally blobs from servers")
    .option("-r, --relays <relays:string>", "The nostr relays to use (comma separated)")
    .option(
      "-s, --servers <servers:string>",
      "The blossom servers to delete blobs from (comma separated)",
    )
    .option("--include-blobs", "Also delete blobs from blossom servers", { default: false })
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-d, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, deletes root site (kind 15128).",
    )
    .option("-y, --yes", "Skip confirmation prompts", { default: false })
    .action(async (options) => {
      log.debug(`Starting purgeCommand with options: ${JSON.stringify(options)}`);
      console.log(colors.bold.magenta("\nnsyte purge\n"));

      // Get config
      log.debug("Reading project file...");
      const config = readProjectFile(options.config);
      if (!config) {
        console.log(colors.red("No .nsite/config.json found. Please run 'nsyte init' first."));
        return Deno.exit(1);
      }

      // If --name is provided, use simplified flow to delete specific named site
      if (options.name) {
        // Resolve pubkey
        const pubkey = await resolvePubkey(options);
        const relays = resolveRelays(options, config, false);

        if (relays.length === 0) {
          console.log(
            colors.red(
              "No relays configured. Please specify with --relays or configure in .nsite/config.json",
            ),
          );
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

        const { signer, pubkey: signerPubkey } = signerResult;
        // Verify pubkey matches
        if (signerPubkey !== pubkey) {
          console.log(colors.red("Pubkey mismatch between resolved pubkey and signer"));
          return Deno.exit(1);
        }

        const displayName = await getUserDisplayName(pubkey);

        console.log(formatSectionHeader("Configuration"));
        console.log(`User: ${colors.cyan(displayName)}`);
        console.log(`Relays: ${colors.cyan(relays.join(", "))}`);
        console.log(`Site: ${colors.cyan(options.name)}`);

        // Fetch the specific site manifest
        console.log(colors.cyan(`\nFetching site manifest for named site "${options.name}"...`));
        const manifest = await getSiteManifestEvent(relays, pubkey, options.name);

        if (!manifest) {
          const siteType = `named site "${options.name}"`;
          console.log(colors.red(`No manifest event found for ${siteType}`));
          return Deno.exit(1);
        }

        console.log(colors.gray(`Found manifest event: ${manifest.id}`));

        // Show what will be deleted
        const pathTags = manifest.tags.filter((tag) => tag[0] === "path");
        const fileCount = pathTags.length;

        console.log(
          colors.yellow(
            `\n⚠️  This will delete named site "${options.name}" (${fileCount} files):`,
          ),
        );

        // Show first few paths
        const paths = pathTags.slice(0, 5).map((tag) => tag[1]);
        paths.forEach((path) => console.log(`  - ${path}`));
        if (fileCount > 5) {
          console.log(`  ... and ${fileCount - 5} more files`);
        }

        // Confirm deletion
        if (!options.yes) {
          const confirm = await Confirm.prompt({
            message: "Are you sure you want to delete this site? This cannot be undone.",
            default: false,
          });

          if (!confirm) {
            console.log(colors.yellow("Purge cancelled."));
            return Deno.exit(0);
          }
        }

        // Create and publish delete event
        console.log(colors.cyan("\nCreating delete event..."));
        const deleteEvent = await createDeleteEvent(signer, [manifest.id]);

        console.log(colors.cyan("Publishing delete event to relays..."));
        const success = await publishEventsToRelays(relays, [deleteEvent]);

        if (success) {
          console.log(
            colors.green(
              `\n✓ Successfully purged named site "${options.name}" from relays`,
            ),
          );
          console.log(
            colors.dim(
              "Note: Relays may take time to process deletions, and some relays may not honor delete requests.",
            ),
          );
        } else {
          console.log(colors.red("\n✗ Failed to publish delete event to some or all relays"));
        }

        // Delete blobs from blossom servers if requested
        if (options.includeBlobs) {
          const servers = options.servers
            ? options.servers.split(",").map((s) => s.trim()).filter((s) => s)
            : (config.servers || []);

          if (servers.length > 0) {
            console.log(colors.cyan("\n🌸 Deleting blobs from blossom servers..."));

            // Extract blob hashes from manifest path tags
            const blobHashes = new Set<string>();
            for (const pathTag of pathTags) {
              // Path tag format: ["path", "/path", "sha256hash"]
              if (pathTag.length >= 3) {
                const sha256 = pathTag[2];
                if (sha256) {
                  blobHashes.add(sha256);
                }
              }
            }

            if (blobHashes.size === 0) {
              console.log(colors.yellow("No blob hashes found in manifest."));
            } else {
              console.log(
                `Found ${colors.bold(blobHashes.size.toString())} unique blobs to delete`,
              );

              let deletedCount = 0;
              let failedCount = 0;

              // Pre-sign batch delete auth tokens before the server loop so we
              // only need ceil(n / DELETE_AUTH_BATCH_SIZE) signer calls total.
              const hashArray = Array.from(blobHashes);
              const deleteAuthMap = await buildDeleteAuthMap(hashArray, signer);

              for (const server of servers) {
                console.log(colors.cyan(`\nDeleting from ${server}...`));

                for (const hash of blobHashes) {
                  try {
                    const authHeader = deleteAuthMap.get(hash)!;

                    const response = await fetch(`${server}/${hash}`, {
                      method: "DELETE",
                      headers: {
                        "Authorization": authHeader,
                      },
                    });

                    if (response.ok) {
                      deletedCount++;
                      console.log(colors.green(`  ✓ Deleted ${hash.substring(0, 8)}...`));
                    } else if (response.status === 404) {
                      console.log(colors.dim(`  - Not found ${hash.substring(0, 8)}...`));
                    } else {
                      failedCount++;
                      const errorText = await response.text().catch(() => "");
                      console.log(
                        colors.red(
                          `  ✗ Failed to delete ${hash.substring(0, 8)}... (${response.status}${
                            errorText ? `: ${errorText}` : ""
                          })`,
                        ),
                      );
                    }
                  } catch (error) {
                    failedCount++;
                    console.log(
                      colors.red(`  ✗ Error deleting ${hash.substring(0, 8)}...: ${error}`),
                    );
                  }
                }
              }

              console.log(colors.cyan(`\nBlob deletion summary:`));
              if (deletedCount > 0) {
                console.log(colors.green(`  ✓ ${deletedCount} blobs deleted`));
              }
              if (failedCount > 0) {
                console.log(colors.red(`  ✗ ${failedCount} deletions failed`));
              }
            }
          } else {
            console.log(colors.yellow("No blossom servers configured for blob deletion."));
          }
        }

        // Close signer if it's a bunker
        if ("close" in signer && typeof signer.close === "function") {
          await signer.close();
        }

        return Deno.exit(success ? 0 : 1);
      }

      // When --name is not provided, delete root site (kind 15128)
      const relays = resolveRelays(options, config, false);

      if (relays.length === 0) {
        console.log(
          colors.red(
            "No relays configured. Please specify with --relays or configure in .nsite/config.json",
          ),
        );
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
      // Use signer's pubkey (it's the source of truth for signing)
      const displayName = await getUserDisplayName(pubkey);

      console.log(formatSectionHeader("Configuration"));
      console.log(`User: ${colors.cyan(displayName)}`);
      console.log(`Relays: ${colors.cyan(relays.join(", "))}`);

      // Resolve servers if blob deletion is requested
      const servers = (options.includeBlobs && options.servers)
        ? options.servers.split(",").map((s) => s.trim()).filter((s) => s)
        : (options.includeBlobs ? config.servers || [] : []);

      if (options.includeBlobs && servers.length > 0) {
        console.log(`Blossom Servers: ${colors.cyan(servers.join(", "))}`);
      }

      // Fetch root site manifest (kind 15128, no d tag)
      console.log(colors.cyan("\nFetching root site manifest..."));
      const manifest = await getSiteManifestEvent(relays, pubkey);

      if (!manifest) {
        console.log(colors.red("No root site manifest event found."));
        return Deno.exit(1);
      }

      console.log(colors.gray(`Found manifest event: ${manifest.id}`));

      // Show what will be deleted
      const pathTags = manifest.tags.filter((tag) => tag[0] === "path");
      const fileCount = pathTags.length;

      console.log(
        colors.yellow(`\n⚠️  This will delete root site (${fileCount} files):`),
      );

      // Show first few paths
      const paths = pathTags.slice(0, 5).map((tag) => tag[1]);
      paths.forEach((path) => console.log(`  - ${path}`));
      if (fileCount > 5) {
        console.log(`  ... and ${fileCount - 5} more files`);
      }

      // Confirm deletion
      if (!options.yes) {
        const confirm = await Confirm.prompt({
          message: "Are you sure you want to delete the root site? This cannot be undone.",
          default: false,
        });

        if (!confirm) {
          console.log(colors.yellow("Purge cancelled."));
          return Deno.exit(0);
        }
      }

      // Create and publish delete event
      console.log(colors.cyan("\nCreating delete event..."));
      const deleteEvent = await createDeleteEvent(signer, [manifest.id]);

      console.log(colors.cyan("Publishing delete event to relays..."));
      const success = await publishEventsToRelays(relays, [deleteEvent]);

      if (success) {
        console.log(
          colors.green("\n✓ Successfully purged root site from relays"),
        );
        console.log(
          colors.dim(
            "Note: Relays may take time to process deletions, and some relays may not honor delete requests.",
          ),
        );
      } else {
        console.log(colors.red("\n✗ Failed to publish delete event to some or all relays"));
      }

      // Delete blobs from blossom servers if requested
      if (options.includeBlobs && servers.length > 0) {
        console.log(colors.cyan("\n🌸 Deleting blobs from blossom servers..."));

        // Extract blob hashes from manifest path tags
        const blobHashes = new Set<string>();
        for (const pathTag of pathTags) {
          // Path tag format: ["path", "/path", "sha256hash"]
          if (pathTag.length >= 3) {
            const sha256 = pathTag[2];
            if (sha256) {
              blobHashes.add(sha256);
            }
          }
        }

        if (blobHashes.size === 0) {
          console.log(colors.yellow("No blob hashes found in events."));
        } else {
          console.log(`Found ${colors.bold(blobHashes.size.toString())} unique blobs to delete`);

          let deletedCount = 0;
          let failedCount = 0;

          // Pre-sign batch delete auth tokens before the server loop so we
          // only need ceil(n / DELETE_AUTH_BATCH_SIZE) signer calls total.
          const hashArray = Array.from(blobHashes);
          const deleteAuthMap = await buildDeleteAuthMap(hashArray, signer);

          for (const server of servers) {
            console.log(colors.cyan(`\nDeleting from ${server}...`));

            for (const hash of blobHashes) {
              try {
                const authHeader = deleteAuthMap.get(hash)!;

                const response = await fetch(`${server}/${hash}`, {
                  method: "DELETE",
                  headers: {
                    "Authorization": authHeader,
                  },
                });

                if (response.ok) {
                  deletedCount++;
                  console.log(colors.green(`  ✓ Deleted ${hash.substring(0, 8)}...`));
                } else if (response.status === 404) {
                  console.log(colors.dim(`  - Not found ${hash.substring(0, 8)}...`));
                } else {
                  failedCount++;
                  const errorText = await response.text().catch(() => "");
                  console.log(
                    colors.red(
                      `  ✗ Failed to delete ${hash.substring(0, 8)}... (${response.status}${
                        errorText ? `: ${errorText}` : ""
                      })`,
                    ),
                  );
                }
              } catch (error) {
                failedCount++;
                console.log(colors.red(`  ✗ Error deleting ${hash.substring(0, 8)}...: ${error}`));
              }
            }
          }

          console.log(colors.cyan(`\nBlob deletion summary:`));
          if (deletedCount > 0) {
            console.log(colors.green(`  ✓ ${deletedCount} blobs deleted`));
          }
          if (failedCount > 0) {
            console.log(colors.red(`  ✗ ${failedCount} deletions failed`));
          }
        }
      }

      // Close signer if it's a bunker
      if ("close" in signer && typeof signer.close === "function") {
        await signer.close();
      }

      Deno.exit(success ? 0 : 1);
    }).error((error) => {
      handleError("Error purging", error, {
        showConsole: true,
        exit: true,
        exitCode: 1,
        logger: log,
      });
    });
}
