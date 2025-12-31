import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { encodeBase64 } from "@std/encoding/base64";
import { npubEncode } from "applesauce-core/helpers";
import { createSigner as createSignerFromFactory } from "../lib/auth/signer-factory.ts";
import { readProjectFile } from "../lib/config.ts";
import { createLogger } from "../lib/logger.ts";
import { importFromNbunk } from "../lib/nip46.ts";
import { createDeleteEvent, fetchSiteManifestEvent, publishEventsToRelays } from "../lib/nostr.ts";
import { formatSectionHeader } from "../ui/formatters.ts";

const log = createLogger("purge");

import type { ISigner } from "applesauce-signers";

/**
 * Create a Blossom delete authorization for multiple blobs
 */
async function createBlossomAuth(blobSha256s: string[], signer: ISigner): Promise<string> {
  const currentTime = Math.floor(Date.now() / 1000);

  const tags: string[][] = [
    ["t", "delete"],
    ["expiration", (currentTime + 3600).toString()],
  ];

  // Add all blob hashes
  for (const hash of blobSha256s) {
    tags.push(["x", hash]);
  }

  const authTemplate = {
    kind: 24242,
    created_at: currentTime,
    tags,
    content: "",
  };

  const authEvent = await signer.signEvent(authTemplate);
  const encodedEvent = encodeBase64(JSON.stringify(authEvent));
  return `Nostr ${encodedEvent}`;
}

/**
 * Create a Blossom delete authorization for a single blob
 */
async function createSingleBlossomAuth(blobSha256: string, signer: ISigner): Promise<string> {
  const currentTime = Math.floor(Date.now() / 1000);

  const authTemplate = {
    kind: 24242,
    created_at: currentTime,
    tags: [
      ["t", "delete"],
      ["x", blobSha256],
      ["expiration", (currentTime + 3600).toString()],
    ],
    content: "",
  };

  const authEvent = await signer.signEvent(authTemplate);
  const encodedEvent = encodeBase64(JSON.stringify(authEvent));
  return `Nostr ${encodedEvent}`;
}

interface PurgeOptions {
  all: boolean;
  paths?: string[];
  relays?: string;
  servers?: string;
  /** Unified secret parameter (auto-detects format: nsec, nbunksec, bunker URL, or hex) */
  sec?: string;
  yes: boolean;
  includeBlobs: boolean;
}

/**
 * Register the purge command
 */
export function registerPurgeCommand(program: Command): void {
  program
    .command("purge")
    .alias("prg")
    .description("Remove nsite events from relays and optionally blobs from servers")
    .option("-a, --all", "Purge ALL nsite events for this pubkey", { default: false })
    .option("-p, --paths <paths:string>", "Path patterns to purge (supports wildcards: *, ?)", {
      collect: true,
    })
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
    .option("-y, --yes", "Skip confirmation prompts", { default: false })
    .action(async (options: PurgeOptions) => {
      await purgeCommand(options);
    });
}

async function purgeCommand(options: PurgeOptions): Promise<void> {
  try {
    log.debug(`Starting purgeCommand with options: ${JSON.stringify(options)}`);
    console.log(colors.bold.magenta("\nnsyte purge\n"));

    // Get config
    log.debug("Reading project file...");
    const config = readProjectFile();
    if (!config) {
      console.log(colors.red("No .nsite/config.json found. Please run 'nsyte init' first."));
      return Deno.exit(1);
    }

    // Resolve relays
    const relays = options.relays
      ? options.relays.split(",").map((r) => r.trim()).filter((r) => r)
      : config.relays || [];

    if (relays.length === 0) {
      console.log(
        colors.red(
          "No relays configured. Please specify with --relays or configure in .nsite/config.json",
        ),
      );
      return Deno.exit(1);
    }

    // Initialize signer
    const signer = await initSigner(options, config);
    if (!signer) {
      console.log(colors.red("Failed to initialize signer"));
      return Deno.exit(1);
    }

    const pubkey = await signer.getPublicKey();
    const npub = npubEncode(pubkey);

    console.log(formatSectionHeader("Configuration"));
    console.log(`User: ${colors.cyan(npub)}`);
    console.log(`Relays: ${colors.cyan(relays.join(", "))}`);

    // Resolve servers if blob deletion is requested
    const servers = (options.includeBlobs && options.servers)
      ? options.servers.split(",").map((s) => s.trim()).filter((s) => s)
      : (options.includeBlobs ? config.servers || [] : []);

    if (options.includeBlobs && servers.length > 0) {
      console.log(`Blossom Servers: ${colors.cyan(servers.join(", "))}`);
    }

    // Fetch all site manifest events
    console.log(colors.cyan("\nFetching site manifest events..."));
    const manifestEvents = await fetchSiteManifestEvent(relays, pubkey);

    if (manifestEvents.length === 0) {
      console.log(colors.yellow("No site manifest events found to purge."));
      return Deno.exit(0);
    }

    console.log(`Found ${colors.bold(manifestEvents.length.toString())} site manifest event(s)`);

    // Filter manifest events based on options
    let manifestsToDelete = manifestEvents;

    if (!options.all && options.paths && options.paths.length > 0) {
      const patterns = options.paths;
      manifestsToDelete = manifestEvents.filter((manifestEvent) => {
        // Extract all path tags from the manifest
        const pathTags = manifestEvent.tags.filter((tag) => tag[0] === "path");

        // Check if any path in this manifest matches any pattern
        return pathTags.some((pathTag) => {
          if (pathTag.length < 2) return false;
          const path = pathTag[1];

          // Check if any pattern matches this path
          return patterns.some((pattern) => {
            // Exact match
            if (pattern === path) return true;

            // Convert glob pattern to regex
            const regexPattern = pattern
              .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
              .replace(/\*/g, ".*") // * matches any characters
              .replace(/\?/g, "."); // ? matches single character

            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(path);
          });
        });
      });

      console.log(
        `Filtered to ${
          colors.bold(manifestsToDelete.length.toString())
        } manifest event(s) matching specified patterns`,
      );
    } else if (!options.all && !options.paths) {
      // Interactive mode - let user select what to purge
      const choice = await Select.prompt({
        message: "What would you like to purge?",
        options: [
          { name: "All site manifest events", value: "all" },
          { name: "Select specific paths", value: "paths" },
          { name: "Cancel", value: "cancel" },
        ],
      });

      if (choice === "cancel") {
        console.log(colors.yellow("Purge cancelled."));
        return Deno.exit(0);
      }

      if (choice === "all") {
        options.all = true;
      } else if (choice === "paths") {
        // Show available paths from all manifests
        const paths = new Set<string>();
        for (const manifestEvent of manifestEvents) {
          const pathTags = manifestEvent.tags.filter((tag) => tag[0] === "path");
          for (const pathTag of pathTags) {
            if (pathTag.length >= 2) {
              paths.add(pathTag[1]);
            }
          }
        }

        console.log(colors.cyan("\nAvailable paths:"));
        const sortedPaths = Array.from(paths).sort();
        sortedPaths.forEach((path) => console.log(`  ${path}`));

        const pathInput = await Input.prompt({
          message: "Enter paths/patterns to purge (comma-separated, supports wildcards):",
          hint: "Examples: /site/*, *.html, /test.txt, /site/**/*.css",
          validate: (input) => {
            const inputPaths = input.split(",").map((p) => p.trim()).filter((p) => p);
            return inputPaths.length > 0 || "Please enter at least one path or pattern";
          },
        });

        const patterns = pathInput.split(",").map((p) => p.trim());
        manifestsToDelete = manifestEvents.filter((manifestEvent) => {
          // Extract all path tags from the manifest
          const pathTags = manifestEvent.tags.filter((tag) => tag[0] === "path");

          // Check if any path in this manifest matches any pattern
          return pathTags.some((pathTag) => {
            if (pathTag.length < 2) return false;
            const path = pathTag[1];

            // Check if any pattern matches this path
            return patterns.some((pattern) => {
              // Exact match
              if (pattern === path) return true;

              // Convert glob pattern to regex
              const regexPattern = pattern
                .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
                .replace(/\*/g, ".*") // * matches any characters
                .replace(/\?/g, "."); // ? matches single character

              const regex = new RegExp(`^${regexPattern}$`);
              return regex.test(path);
            });
          });
        });
      }
    }

    if (manifestsToDelete.length === 0) {
      console.log(colors.yellow("No manifest events match the criteria."));
      return Deno.exit(0);
    }

    // Show what will be deleted
    console.log(
      colors.yellow(`\n⚠️  This will delete ${manifestsToDelete.length} site manifest event(s):`),
    );

    // Show files in each manifest that will be deleted
    for (const manifestEvent of manifestsToDelete) {
      const siteIdentifier = manifestEvent.tags.find((tag) => tag[0] === "d")?.[1];
      const pathTags = manifestEvent.tags.filter((tag) => tag[0] === "path");
      const fileCount = pathTags.length;

      if (siteIdentifier) {
        console.log(`  Named site "${siteIdentifier}" (${fileCount} files)`);
      } else {
        console.log(`  Root site (${fileCount} files)`);
      }

      // Show first few paths
      const paths = pathTags.slice(0, 5).map((tag) => tag[1]);
      paths.forEach((path) => console.log(`    - ${path}`));
      if (fileCount > 5) {
        console.log(`    ... and ${fileCount - 5} more files`);
      }
    }

    // Confirm deletion
    if (!options.yes) {
      const confirm = await Confirm.prompt({
        message: "Are you sure you want to delete these events? This cannot be undone.",
        default: false,
      });

      if (!confirm) {
        console.log(colors.yellow("Purge cancelled."));
        return Deno.exit(0);
      }
    }

    // Create and publish delete events
    console.log(colors.cyan("\nCreating delete events..."));

    const eventIds = manifestsToDelete.map((e) => e.id);
    const deleteEvent = await createDeleteEvent(signer, eventIds);

    console.log(colors.cyan("Publishing delete events to relays..."));
    const success = await publishEventsToRelays(relays, [deleteEvent]);

    if (success) {
      console.log(
        colors.green(
          `\n✓ Successfully purged ${manifestsToDelete.length} manifest event(s) from relays`,
        ),
      );
      console.log(
        colors.dim(
          "Note: Relays may take time to process deletions, and some relays may not honor delete requests.",
        ),
      );
    } else {
      console.log(colors.red("\n✗ Failed to publish delete events to some or all relays"));
    }

    // Delete blobs from blossom servers if requested
    if (options.includeBlobs && servers.length > 0) {
      console.log(colors.cyan("\n🌸 Deleting blobs from blossom servers..."));

      // Extract blob hashes from manifest path tags
      const blobHashes = new Set<string>();
      for (const manifestEvent of manifestsToDelete) {
        const pathTags = manifestEvent.tags.filter((tag) => tag[0] === "path");
        for (const pathTag of pathTags) {
          // Path tag format: ["path", "/path", "sha256hash"]
          if (pathTag.length >= 3) {
            const sha256 = pathTag[2];
            if (sha256) {
              blobHashes.add(sha256);
            }
          }
        }
      }

      if (blobHashes.size === 0) {
        console.log(colors.yellow("No blob hashes found in events."));
      } else {
        console.log(`Found ${colors.bold(blobHashes.size.toString())} unique blobs to delete`);

        let deletedCount = 0;
        let failedCount = 0;

        // Convert Set to Array for batch auth
        const hashArray = Array.from(blobHashes);

        for (const server of servers) {
          console.log(colors.cyan(`\nDeleting from ${server}...`));

          // Try batch deletion first
          let useBatchAuth = true;
          const batchAuthHeader = await createBlossomAuth(hashArray, signer);

          for (const hash of blobHashes) {
            try {
              // Use batch auth or create individual auth
              const authHeader = useBatchAuth
                ? batchAuthHeader
                : await createSingleBlossomAuth(hash, signer);

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
                // If batch auth failed, try individual auth
                if (
                  useBatchAuth &&
                  (response.status === 400 || response.status === 401 || response.status === 500)
                ) {
                  log.debug(`Batch auth failed for ${server}, falling back to individual auth`);
                  useBatchAuth = false;

                  // Retry with individual auth
                  const individualAuthHeader = await createSingleBlossomAuth(hash, signer);
                  const retryResponse = await fetch(`${server}/${hash}`, {
                    method: "DELETE",
                    headers: {
                      "Authorization": individualAuthHeader,
                    },
                  });

                  if (retryResponse.ok) {
                    deletedCount++;
                    console.log(
                      colors.green(`  ✓ Deleted ${hash.substring(0, 8)}... (individual auth)`),
                    );
                  } else if (retryResponse.status === 404) {
                    console.log(colors.dim(`  - Not found ${hash.substring(0, 8)}...`));
                  } else {
                    failedCount++;
                    const errorText = await retryResponse.text().catch(() => "");
                    console.log(
                      colors.red(
                        `  ✗ Failed to delete ${hash.substring(0, 8)}... (${retryResponse.status}${
                          errorText ? `: ${errorText}` : ""
                        })`,
                      ),
                    );
                  }
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
  } catch (error) {
    log.error(`Purge command failed: ${error}`);
    console.error(colors.red(`Error: ${error}`));
    Deno.exit(1);
  }
}

async function initSigner(options: PurgeOptions, config: any): Promise<ISigner | null> {
  // Use the unified signer factory for CLI-provided secrets
  const signerResult = await createSignerFromFactory({
    sec: options.sec,
    bunkerPubkey: config?.bunkerPubkey,
  });

  // If signer factory succeeded, return it
  if (!("error" in signerResult)) {
    return signerResult.signer;
  }

  // If signer factory failed but we have a stored bunker, try to use it
  if (config?.bunkerPubkey) {
    try {
      log.info(`Using configured bunker: ${config.bunkerPubkey.substring(0, 8)}...`);
      const secretsManager = (await import("../lib/secrets/mod.ts")).SecretsManager.getInstance();
      const nbunkString = await secretsManager.getNbunk(config.bunkerPubkey);
      if (nbunkString) {
        log.debug("Retrieved nbunk from secrets manager, creating signer...");
        const bunkerSigner = await importFromNbunk(nbunkString);
        log.debug("Bunker signer created, getting public key...");

        try {
          await bunkerSigner.getPublicKey();
          log.debug("Got public key from bunker signer");
          console.log(colors.green("✓ Connection approved"));
          return bunkerSigner;
        } catch (error) {
          console.log(colors.red("✗ Connection failed or timed out"));
          throw error;
        }
      } else {
        log.error("No nbunk found in secrets manager for configured bunker");
      }
    } catch (e) {
      log.error(`Failed to use configured bunker: ${e}`);
    }
  }

  return null;
}
