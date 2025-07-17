import { encodeBase64 } from "@std/encoding/base64";
import { createLogger } from "./logger.ts";
import type { Signer } from "./upload.ts";

const log = createLogger("blossom");

/**
 * Create a Blossom delete authorization for a single blob
 */
async function createDeleteAuth(blobSha256: string, signer: Signer): Promise<string> {
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

/**
 * Delete a blob from a Blossom server
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteBlob(
  server: string,
  blobSha256: string,
  signer: Signer
): Promise<boolean> {
  try {
    const authHeader = await createDeleteAuth(blobSha256, signer);
    
    const response = await fetch(`${server}/${blobSha256}`, {
      method: "DELETE",
      headers: {
        "Authorization": authHeader,
      },
    });

    if (response.ok) {
      log.info(`Successfully deleted ${blobSha256} from ${server}`);
      return true;
    } else if (response.status === 404) {
      log.debug(`Blob ${blobSha256} not found on ${server}`);
      return true; // Consider not found as success
    } else {
      const errorText = await response.text().catch(() => "");
      log.error(`Failed to delete ${blobSha256} from ${server}: ${response.status} ${errorText}`);
      return false;
    }
  } catch (error) {
    log.error(`Error deleting blob from ${server}: ${error}`);
    throw error;
  }
}