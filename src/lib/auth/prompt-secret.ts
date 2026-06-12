import { colors } from "@cliffy/ansi/colors";
import { Confirm, Secret } from "@cliffy/prompt";
import { PrivateKeySigner } from "applesauce-signers";
import { getErrorMessage } from "../error-utils.ts";
import { createLogger } from "../logger.ts";
import { importFromNbunk } from "../nip46.ts";
import { createNip46ClientFromUrl } from "../nostr.ts";
import { detectSecretFormat } from "./secret-detector.ts";

const log = createLogger("prompt-secret");

/**
 * Options that support resolving the signing secret at runtime.
 *
 * Commands expose a `--sec` flag (value passed on the command line) and a
 * `--prompt-sec` flag (value typed in interactively). Both populate `sec`.
 */
export interface PromptSecOptions {
  /** Unified secret parameter (auto-detects format: nsec, nbunksec, bunker URL, or hex) */
  sec?: string;
  /** When true, prompt for the secret at runtime instead of reading it from --sec */
  promptSec?: boolean;
}

/** Short, human-readable form of a hex pubkey for display. */
function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
}

/**
 * Prompt the user to enter their secret (nsec / nbunksec / bunker:// URL / hex)
 * interactively, using a hidden input.
 *
 * Keeping the secret off the command line avoids it being captured by shell
 * history, process listings, or CI logs. The input is validated against the
 * same format detection used by `--sec`, re-prompting on invalid input.
 *
 * @returns the validated secret string
 */
export async function promptForSecret(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const entered = (await Secret.prompt({
      message: "Enter your nsec or nbunksec:",
    })).trim();

    if (detectSecretFormat(entered)) {
      return entered;
    }

    console.error(
      colors.red(
        "Invalid secret format. Expected nsec, nbunksec, bunker:// URL, or 64-character hex string.",
      ),
    );
  }

  throw new Error("Failed to read a valid secret after 3 attempts.");
}

/**
 * Derive the public key that a secret resolves to, without leaving any open
 * connections behind. Returns null if the pubkey can't be determined (e.g. an
 * unreachable bunker) so callers can skip the check rather than block.
 */
async function pubkeyFromSecret(secret: string): Promise<string | null> {
  const detected = detectSecretFormat(secret);
  if (!detected) {
    return null;
  }

  try {
    switch (detected.format) {
      case "nsec":
      case "hex":
        return await PrivateKeySigner.fromKey(detected.value).getPublicKey();
      case "nbunksec": {
        const signer = await importFromNbunk(detected.value);
        const pubkey = await signer.getPublicKey();
        if ("close" in signer && typeof signer.close === "function") {
          await signer.close();
        }
        return pubkey;
      }
      case "bunker-url": {
        const { client } = await createNip46ClientFromUrl(detected.value);
        const pubkey = await client.getPublicKey();
        if ("close" in client && typeof client.close === "function") {
          await client.close();
        }
        return pubkey;
      }
    }
  } catch (error) {
    log.debug(`Could not derive pubkey from entered secret: ${getErrorMessage(error)}`);
  }

  return null;
}

/**
 * Warn (and ask to continue) when the entered key resolves to a different
 * pubkey than the one the project is configured for. Exits if the user declines.
 */
async function confirmPubkeyMatch(secret: string, bunkerPubkey: string): Promise<void> {
  const pubkey = await pubkeyFromSecret(secret);
  if (!pubkey || pubkey === bunkerPubkey) {
    return;
  }

  console.warn(
    colors.yellow(
      `\n⚠️  The entered key belongs to ${shortPubkey(pubkey)}, but this project is ` +
        `configured for ${shortPubkey(bunkerPubkey)}.`,
    ),
  );
  console.warn(colors.yellow("This might be the wrong key.\n"));

  const proceed = await Confirm.prompt({
    message: "Continue anyway?",
    default: false,
  });

  if (!proceed) {
    console.error(colors.red("Aborted."));
    Deno.exit(1);
  }
}

/**
 * If `--prompt-sec` was passed and no `--sec` value is already present, prompt
 * the user for their secret at runtime and populate `options.sec` in place so
 * all downstream signer/pubkey resolution works unchanged.
 *
 * When `bunkerPubkey` is provided (from the project config), the entered key's
 * pubkey is compared against it and the user is warned before continuing if they
 * differ — guarding against accidentally signing with the wrong identity.
 *
 * No-op when `--prompt-sec` was not passed, or when `--sec` was already
 * provided (an explicit value always wins).
 */
export async function resolvePromptSec(
  options: PromptSecOptions,
  bunkerPubkey?: string | null,
): Promise<void> {
  if (!options.promptSec) {
    return;
  }

  if (options.sec) {
    log.debug("Ignoring --prompt-sec because --sec was provided explicitly.");
    return;
  }

  const secret = await promptForSecret();

  if (bunkerPubkey) {
    await confirmPubkeyMatch(secret, bunkerPubkey);
  }

  options.sec = secret;
}
