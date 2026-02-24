#!/usr/bin/env -S deno run --allow-net

/**
 * Pre-flight check: verify network access to a known Nostr relay and Blossom server.
 *
 * Exit 0: both endpoints are reachable.
 * Exit 1: one or both endpoints are unreachable.
 */

const RELAY_URL = "https://relay.damus.io";
const BLOSSOM_URL = "https://blossom.primal.net";

async function checkEndpoint(url: string, label: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    // Any HTTP response (including 4xx/5xx) means the server is reachable
    console.log(`✓ ${label}: reachable (HTTP ${response.status})`);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error(`✗ ${label}: timed out after 5s`);
    } else {
      console.error(`✗ ${label}: unreachable`);
    }
    return false;
  }
}

async function checkNetwork(): Promise<void> {
  const relayOk = await checkEndpoint(RELAY_URL, "Relay connectivity: relay.damus.io");
  const blossomOk = await checkEndpoint(BLOSSOM_URL, "Blossom connectivity: blossom.primal.net");

  if (!relayOk || !blossomOk) {
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await checkNetwork();
}
