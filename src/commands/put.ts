import { colors } from "@cliffy/ansi/colors";
import { basename, extname, isAbsolute, resolve } from "@std/path";
import { contentType } from "@std/media-types";
import { encodeHex } from "@std/encoding/hex";
import type { NostrEvent } from "applesauce-core/helpers";
import type { NostrEventTemplate } from "../lib/nostr.ts";
import nsyte from "./root.ts";
import { readProjectFile } from "../lib/config.ts";
import { createSigner } from "../lib/auth/signer-factory.ts";
import { getErrorMessage } from "../lib/error-utils.ts";
import { createLogger } from "../lib/logger.ts";
import { getManifestServers } from "../lib/manifest.ts";
import { getUserBlossomServers, publishEventsToRelaysDetailed } from "../lib/nostr.ts";
import { processUploads } from "../lib/upload.ts";
import { resolveRelays } from "../lib/resolver-utils.ts";
import { fetchTrustedSiteManifestEvent } from "../lib/site-manifest.ts";

const log = createLogger("put");

interface PutCommandOptions {
  name?: string;
  sec?: string;
  config?: string;
  /** Override created_at timestamp for nostr events (from --created-at global option) */
  createdAt?: number;
}

function normalizeSitePath(path: string): string {
  const normalized = path.trim().replace(/\\+/g, "/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/\/+/g, "/");
}

export function resolvePutRemotePath(localFilePath: string, remotePath: string): string {
  const fileName = basename(localFilePath.replace(/\\+/g, "/"));
  const normalizedRemotePath = normalizeSitePath(remotePath);
  const looksLikeDirectory = normalizedRemotePath.endsWith("/") ||
    extname(normalizedRemotePath) === "";

  if (!looksLikeDirectory) {
    return normalizedRemotePath;
  }

  const trimmedDirectory = normalizedRemotePath.replace(/\/+$/g, "") || "/";
  return `${trimmedDirectory === "/" ? "" : trimmedDirectory}/${fileName}`;
}

function buildUpdatedManifestTemplate(
  existingManifest: { kind: number; pubkey: string; content: string; tags: string[][] },
  path: string,
  sha256: string,
  createdAt?: number,
): NostrEventTemplate {
  const normalizedPath = normalizeSitePath(path);
  const tags = existingManifest.tags.filter((tag) => {
    return !(tag[0] === "path" && normalizeSitePath(tag[1]) === normalizedPath);
  });

  tags.push(["path", normalizedPath, sha256]);

  return {
    kind: existingManifest.kind,
    pubkey: existingManifest.pubkey,
    created_at: createdAt ?? Math.floor(Date.now() / 1000),
    content: existingManifest.content,
    tags,
  };
}

async function loadLocalFileForPut(localFilePath: string, remotePath: string) {
  const resolvedPath = isAbsolute(localFilePath)
    ? localFilePath
    : resolve(Deno.cwd(), localFilePath);
  const stat = await Deno.stat(resolvedPath);
  if (!stat.isFile) {
    throw new Error(`Local path is not a file: ${localFilePath}`);
  }

  const data = await Deno.readFile(resolvedPath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const sha256 = encodeHex(new Uint8Array(hashBuffer));

  return {
    path: remotePath,
    data,
    sha256,
    size: data.length,
    contentType: contentType(extname(resolvedPath)) || "application/octet-stream",
  };
}

async function resolvePutServers(
  manifest: NostrEvent,
  pubkey: string,
): Promise<string[]> {
  const manifestServers = getManifestServers(manifest).map((url) => url.toString());
  if (manifestServers.length > 0) {
    return manifestServers;
  }

  return await getUserBlossomServers(pubkey) ?? [];
}

export interface PutSuccessOutput {
  siteType: string;
  localFile: string;
  remotePath: string;
  blobHash: string;
  manifestId: string;
  successfulServers: string[];
  successfulRelays: string[];
}

export function formatPutSuccessOutput(result: PutSuccessOutput): string[] {
  return [
    colors.green(`Updated ${result.siteType}: ${result.remotePath}`),
    colors.gray(`Uploaded from: ${result.localFile}`),
    colors.cyan(`Blob: ${result.blobHash}`),
    colors.cyan(`Manifest: ${result.manifestId}`),
    colors.gray(
      `Servers: ${
        result.successfulServers.length > 0 ? result.successfulServers.join(", ") : "none"
      }`,
    ),
    colors.gray(
      `Relays: ${result.successfulRelays.length > 0 ? result.successfulRelays.join(", ") : "none"}`,
    ),
  ];
}

export function registerPutCommand(): void {
  nsyte
    .command("put")
    .description("Upload one file and update an existing site manifest")
    .arguments("<local-file:string> <remote-path:string>")
    .option(
      "--sec <secret:string>",
      "Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or 64-char hex).",
    )
    .option(
      "-n, --name <name:string>",
      "The site identifier for named sites (kind 35128). If not provided, updates the root site (kind 15128).",
    )
    .action(async (options: PutCommandOptions, localFile: string, remotePath: string) => {
      try {
        const config = readProjectFile(options.config);
        if (!config) {
          throw new Error("No .nsite/config.json found. Run 'nsyte init' first.");
        }

        const signerResult = await createSigner({
          sec: options.sec,
          bunkerPubkey: config.bunkerPubkey,
        });
        if ("error" in signerResult) {
          throw new Error(signerResult.error);
        }

        const relays = resolveRelays({}, config, true);
        const siteType = options.name ? `named site \"${options.name}\"` : "root site";
        const trustedManifest = await fetchTrustedSiteManifestEvent(
          relays,
          signerResult.pubkey,
          options.name,
        );

        if (!trustedManifest.event) {
          throw new Error(`No existing manifest found for ${siteType}.`);
        }

        const finalRemotePath = resolvePutRemotePath(localFile, remotePath);
        const uploadFile = await loadLocalFileForPut(localFile, finalRemotePath);
        const servers = await resolvePutServers(trustedManifest.event, signerResult.pubkey);
        if (servers.length === 0) {
          throw new Error("No upload servers found in the manifest or your Blossom server list.");
        }

        const uploadResponses = await processUploads(
          [uploadFile],
          Deno.cwd(),
          servers,
          signerResult.signer,
          trustedManifest.relays,
          1,
        );

        const successfulUpload = uploadResponses.find((response) => response.success);
        if (!successfulUpload) {
          throw new Error(uploadResponses[0]?.error || "Failed to upload file to any server.");
        }

        const updatedManifest = await signerResult.signer.signEvent(
          buildUpdatedManifestTemplate(
            trustedManifest.event,
            finalRemotePath,
            successfulUpload.file.sha256,
            options.createdAt,
          ),
        );

        const publishResult = await publishEventsToRelaysDetailed(trustedManifest.relays, [
          updatedManifest,
        ]);
        const eventResult = publishResult.eventResults[0];
        if (!eventResult || eventResult.successCount === 0) {
          throw new Error("Failed to publish updated site manifest.");
        }

        const successfulServers = Object.entries(successfulUpload.serverResults)
          .filter(([, result]) => result.success)
          .map(([server]) => server);
        const successfulRelays = eventResult.relayResults
          .filter((result) => result.ok)
          .map((result) => result.relay);

        for (
          const line of formatPutSuccessOutput({
            siteType,
            localFile,
            remotePath: finalRemotePath,
            blobHash: successfulUpload.file.sha256,
            manifestId: updatedManifest.id,
            successfulServers,
            successfulRelays,
          })
        ) {
          console.log(line);
        }
      } catch (error) {
        const message = getErrorMessage(error);
        log.error(message);
        console.error(colors.red(`Error: ${message}`));
        Deno.exit(1);
      }
    });
}
