/**
 * NIP-46: Nostr Remote Signing implementation
 * Following the specification at https://nostr-nips.com/nip-46
 */
import { qrcode as generateQrCodeForTerminal } from "@libs/qrcode";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils";
import { bech32 } from "@scure/base";
import { NostrConnectSigner, SimpleSigner } from "applesauce-signers";
import { createLogger } from "./logger.ts";
import { SecretsManager } from "./secrets/mod.ts";
import { pool } from "./nostr.ts";

const log = createLogger("nip46");

export const PERMISSIONS = NostrConnectSigner.buildSigningPermissions([
  0,
  10002,
  10063,
  24242,
  34128,
]);

/** Setup NostrConnectSigner according to https://hzrd149.github.io/applesauce/signers/nostr-connect.html#relay-communication */
NostrConnectSigner.subscriptionMethod = pool.subscription.bind(pool);
NostrConnectSigner.publishMethod = pool.publish.bind(pool);

/**
 * Helper function to render a QR code boolean array with a quiet zone to the console.
 * Assumes true = dark module, false = light module in qrArray.
 * For dark terminals with light text, this will render an "inverted" style QR code
 * with a white quiet zone.
 */
function _renderQrArrayWithQuietZone(
  qrArray: boolean[][] | undefined,
  borderSize: number,
  lightCharPair = "\u2588\u2588", // Full blocks (appears as foreground color, e.g., white)
  darkCharPair = "  ", // Spaces (appears as background color, e.g., black)
): number {
  if (!qrArray || qrArray.length === 0) {
    log.warn("QR array is empty, cannot render.");
    return 0;
  }

  const qrWidth = qrArray[0].length;
  const totalWidthModules = qrWidth + 2 * borderSize;
  let linesPrinted = 0;

  // Top border
  for (let i = 0; i < borderSize; i++) {
    console.log(lightCharPair.repeat(totalWidthModules));
    linesPrinted++;
  }

  // QR content with side borders
  for (const row of qrArray) {
    let line = "";
    line += lightCharPair.repeat(borderSize); // Left border
    for (const cell of row) {
      line += cell ? darkCharPair : lightCharPair; // cell is true (dark) -> darkCharPair, cell is false (light) -> lightCharPair
    }
    line += lightCharPair.repeat(borderSize); // Right border
    console.log(line);
    linesPrinted++;
  }

  // Bottom border
  for (let i = 0; i < borderSize; i++) {
    console.log(lightCharPair.repeat(totalWidthModules));
    linesPrinted++;
  }
  return linesPrinted;
}

/**
 * Interface for a bunker connection information
 */
export interface BunkerPointer {
  pubkey: string;
  relays: string[];
  secret: string | null;
}

/**
 * Parse a bunker URL following NIP-46 format:
 * bunker://<remote-signer-pubkey>?relay=<wss://relay1>&relay=<wss://relay2>&secret=<optional>
 */
export function parseBunkerUrl(url: string): BunkerPointer {
  if (!url.startsWith("bunker://")) {
    throw new Error("Invalid bunker URL format. Must start with bunker://");
  }

  try {
    const parsedUrl = new URL(url.replace("bunker://", "https://"));

    const pubkey = parsedUrl.hostname;

    const relays = parsedUrl.searchParams.getAll("relay");
    if (relays.length === 0) {
      throw new Error("Bunker URL must include at least one relay parameter");
    }

    const secret = parsedUrl.searchParams.get("secret");

    return { pubkey, relays, secret };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse bunker URL: ${errorMessage}`);
  }
}

/**
 * Bundle of information for bunker connections
 */
export interface BunkerInfo {
  pubkey: string;
  relays: string[];
  local_key: string;
  secret?: string;
}

/**
 * Generate a TLV encoded string for storing bunker connection info
 */
export function encodeBunkerInfo(info: BunkerInfo): string {
  try {
    const encodedData: Uint8Array[] = [];

    const pubkeyBytes = new Uint8Array(
      info.pubkey.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );
    encodedData.push(new Uint8Array([0, pubkeyBytes.length]));
    encodedData.push(pubkeyBytes);

    const localKeyBytes = new Uint8Array(
      info.local_key.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );
    encodedData.push(new Uint8Array([1, localKeyBytes.length]));
    encodedData.push(localKeyBytes);

    for (const relay of info.relays) {
      const relayBytes = new TextEncoder().encode(relay);
      encodedData.push(new Uint8Array([2, relayBytes.length]));
      encodedData.push(relayBytes);
    }

    if (info.secret) {
      const secretBytes = new TextEncoder().encode(info.secret);
      encodedData.push(new Uint8Array([3, secretBytes.length]));
      encodedData.push(secretBytes);
    }

    const combinedLength = encodedData.reduce(
      (sum, part) => sum + part.length,
      0,
    );
    const combinedData = new Uint8Array(combinedLength);

    let offset = 0;
    for (const part of encodedData) {
      combinedData.set(part, offset);
      offset += part.length;
    }

    return bech32.encode("nbunksec", bech32.toWords(combinedData), 1000);
  } catch (error: unknown) {
    log.error(`Failed to encode bunker info: ${error}`);
    throw new Error(`Failed to encode bunker info: ${error}`);
  }
}

/**
 * Decode a nbunksec string into bunker information
 */
export function decodeBunkerInfo(nbunkString: string): BunkerInfo {
  try {
    if (!nbunkString.startsWith("nbunksec")) {
      throw new Error("Not a valid nbunksec string. Must start with nbunksec");
    }

    const decoded = bech32.decodeUnsafe(nbunkString, 1000);
    if (!decoded || decoded.prefix !== "nbunksec") {
      throw new Error(
        `Invalid prefix: ${decoded?.prefix || "none"}, expected nbunksec`,
      );
    }

    const data = bech32.fromWords(decoded.words);

    const result: BunkerInfo = {
      pubkey: "",
      relays: [],
      local_key: "",
    };

    let i = 0;
    while (i < data.length) {
      const type = data[i];
      const length = data[i + 1];

      if (i + 2 + length > data.length) {
        throw new Error("Invalid data: incomplete TLV record");
      }

      const value = data.slice(i + 2, i + 2 + length);

      if (type === 0) {
        result.pubkey = bytesToHex(new Uint8Array(value));
      } else if (type === 1) {
        result.local_key = bytesToHex(new Uint8Array(value));
      } else if (type === 2) {
        const relay = new TextDecoder().decode(new Uint8Array(value));
        result.relays.push(relay);
      } else if (type === 3) {
        result.secret = new TextDecoder().decode(new Uint8Array(value));
      }

      i += 2 + length;
    }

    if (!result.pubkey) {
      throw new Error("Invalid nbunksec: missing pubkey");
    }
    if (!result.local_key) {
      throw new Error("Invalid nbunksec: missing local_key");
    }
    if (result.relays.length === 0) {
      throw new Error("Invalid nbunksec: missing relays");
    }

    return result;
  } catch (error: unknown) {
    log.error(`Failed to decode nbunksec string: ${error}`);
    throw new Error(`Failed to decode nbunksec string: ${error}`);
  }
}

/**
 * Bunker management functions for secrets storage
 */
export async function getBunkerInfo(bunkerPubkey: string): Promise<
  {
    clientKey: Uint8Array;
    bunkerUrl: string;
    nbunkString?: string;
  } | null
> {
  try {
    const secretsManager = SecretsManager.getInstance();
    const nbunkString = await secretsManager.getNbunk(bunkerPubkey);

    if (!nbunkString) {
      return null;
    }

    const info = decodeBunkerInfo(nbunkString);

    const clientKey = new Uint8Array(
      info.local_key.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );

    const relayParams = info.relays
      .map((r) => `relay=${encodeURIComponent(r)}`)
      .join("&");
    const bunkerUrl = `bunker://${info.pubkey}?${relayParams}`;

    return {
      clientKey,
      bunkerUrl,
      nbunkString,
    };
  } catch (error) {
    log.debug(
      `No existing bunker info found for bunker ${bunkerPubkey}: ${error}`,
    );
    return null;
  }
}

/**
 * Store bunker information
 */
export async function saveBunkerInfo(
  bunkerPubkey: string,
  clientKey: Uint8Array,
  bunkerUrl: string,
): Promise<void> {
  try {
    const bunkerInfo: BunkerInfo = {
      pubkey: bunkerPubkey,
      relays: parseBunkerUrl(bunkerUrl).relays,
      local_key: bytesToHex(clientKey),
    };

    const nbunkString = encodeBunkerInfo(bunkerInfo);

    const secretsManager = SecretsManager.getInstance();
    await secretsManager.storeNbunk(bunkerPubkey, nbunkString);

    log.debug(`Saved bunker info for ${bunkerPubkey.slice(0, 8)}...`);
  } catch (error) {
    log.warn(`Failed to save bunker info: ${error}`);
  }
}

/**
 * Store a bunker URL in the secrets system
 * This function is used by the config system
 */
export async function storeBunkerUrl(
  bunkerPubkey: string,
  bunkerUrl: string,
): Promise<void> {
  try {
    const tempClientKey = randomBytes(32);

    await saveBunkerInfo(bunkerPubkey, tempClientKey, bunkerUrl);

    log.debug(`Created nbunksec for bunker ${bunkerPubkey.slice(0, 8)}...`);
  } catch (error) {
    log.warn(`Failed to create nbunksec: ${error}`);
  }
}

/**
 * Reconnect to a bunker using a previously stored nbunksec
 * This should be used for reconnections after initial pairing
 */
export async function importFromNbunk(
  nbunkString: string,
): Promise<NostrConnectSigner> {
  try {
    const info = decodeBunkerInfo(nbunkString);
    const clientKey = hexToBytes(info.local_key);

    const signer = new NostrConnectSigner({
      remote: info.pubkey,
      relays: info.relays,
      signer: new SimpleSigner(clientKey),
    });

    try {
      await signer.connect();
      log.info("Session established from nbunksec");

      const dummyUrl = `bunker://${info.pubkey}?${
        info.relays
          .map((r) => `relay=${encodeURIComponent(r)}`)
          .join("&")
      }`;
      await saveBunkerInfo(info.pubkey, clientKey, dummyUrl);

      return signer;
    } catch (error: unknown) {
      await signer.close();

      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(
        `Failed to establish session with bunker from nbunksec: ${errorMessage}`,
      );
      throw error;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to import from nbunksec: ${errorMessage}`);
    throw error;
  }
}

/**
 * Get the encoded bunker info for this connection
 */
export function getNbunkString(signer: NostrConnectSigner): string {
  if (!signer.remote) throw new Error("Cant save bunker when its not setup");

  const bunkerInfo: BunkerInfo = {
    pubkey: signer.remote,
    relays: signer.relays,
    local_key: bytesToHex(signer.signer.key),
  };

  return encodeBunkerInfo(bunkerInfo);
}

/**
 * Initiate a connection using Nostr Connect (NIP-46 QR Code flow)
 * @param appName - Name of this application, to be shown in the Signer
 * @param appRelays - Relays this application will listen on for the Signer's response
 */
export async function initiateNostrConnect(
  appName: string,
  appRelays: string[],
  connectTimeoutMs = 120000, // 2 minutes
): Promise<NostrConnectSigner> {
  log.debug(
    `Initiating Nostr Connect with app name: ${appName}, relays: ${
      appRelays.join(
        ", ",
      )
    }`,
  );

  const signer = new NostrConnectSigner({ relays: appRelays });

  const nostrConnectUri = signer.getNostrConnectURI({
    name: appName,
    permissions: PERMISSIONS,
  });
  log.debug(`Generated Nostr Connect URI: ${nostrConnectUri}`);

  log.info(
    "Please scan the QR code with your NIP-46 compatible signer (e.g., mobile wallet):",
  );
  let qrLines = 0;
  try {
    const qrArray: boolean[][] | undefined = await generateQrCodeForTerminal(
      nostrConnectUri,
      { output: "array" },
    );
    qrLines = _renderQrArrayWithQuietZone(qrArray, 2);
    log.debug(`QR code rendered with ${qrLines} lines`);
  } catch (qrError) {
    log.error(
      `Failed to generate QR code: ${qrError}. Please copy the URI manually.`,
    );
    qrLines = -1;
  }
  log.info(`Or copy-paste this URI: ${nostrConnectUri}`);
  log.info(
    `Waiting for Signer to connect (timeout in ${connectTimeoutMs / 1000}s)...`,
  );

  const linesToClearAfterScanOrTimeout = qrLines >= 0 ? qrLines + 3 : 3;

  const clearConsoleMessages = (lines: number) => {
    if (Deno.env.get("LOG_LEVEL") === "debug") {
      return;
    }
    if (lines > 0 && Deno.stdout.isTerminal()) {
      const encoder = new TextEncoder();
      Deno.stdout.writeSync(encoder.encode(`\x1b[${lines}A`));
      for (let i = 0; i < lines; i++) {
        Deno.stdout.writeSync(encoder.encode("\x1b[2K\x1b[B"));
      }
      Deno.stdout.writeSync(encoder.encode(`\x1b[${lines}A`));
    }
  };

  let timeoutHandle: number | undefined = undefined;

  const signerPromise = signer
    .waitForSigner()
    .then(() => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      log.debug(
        "Signer connected successfully via waitForSigner. Returning the signer instance.",
      );
      return signer;
    })
    .catch((error) => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      log.error(`Error in signer.waitForSigner(): ${error}`);
      throw error;
    });

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      log.error(
        `Connection explicitly timed out after ${connectTimeoutMs / 1000} seconds`,
      );
      reject(
        new Error(
          `Connection timed out after ${connectTimeoutMs / 1000} seconds`,
        ),
      );
    }, connectTimeoutMs);
  });

  try {
    log.debug("Racing signerPromise against timeoutPromise...");
    const resultSigner = await Promise.race([signerPromise, timeoutPromise]);
    log.debug("Promise.race settled. Clearing messages and returning signer.");
    clearConsoleMessages(linesToClearAfterScanOrTimeout);
    return resultSigner;
  } catch (error) {
    log.error(`Failed to connect to signer (outer catch): ${error}`);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    clearConsoleMessages(linesToClearAfterScanOrTimeout);
    throw error;
  }
}
