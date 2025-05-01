import { BunkerSigner } from "./src/lib/bunker.ts";
import { createLogger } from "./src/lib/logger.ts";

const log = createLogger("test");

// The bunker URL from the user's error message
const BUNKER_URL = "bunker://e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f?relay=wss://relay.nsec.app&relay=wss://relay.damus.io&secret=8a640b";

async function main() {
  log.info("Testing bunker connection...");
  
  try {
    const bunker = await BunkerSigner.connect(BUNKER_URL);
    log.info(`Connected successfully! User pubkey: ${bunker.getPublicKey()}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Connection failed: ${errorMessage}`);
  }
}

main(); 