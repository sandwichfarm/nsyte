#!/usr/bin/env -S deno run --allow-net

/**
 * Pre-flight check: verify network access to a known Nostr relay and Blossom server.
 *
 * Exit 0: both endpoints are reachable.
 * Exit 1: one or both endpoints are unreachable.
 */

const RELAY_URL = "wss://relay.damus.io";
const BLOSSOM_URL = "https://blossom.primal.net";

function checkRelay(url: string, label: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`✗ ${label}: timed out after 5s`);
      resolve(false);
    }, 5000);

    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        clearTimeout(timeout);
        console.log(`✓ ${label}: reachable (WebSocket open)`);
        ws.close();
        resolve(true);
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        console.error(`✗ ${label}: unreachable`);
        resolve(false);
      };
    } catch {
      clearTimeout(timeout);
      console.error(`✗ ${label}: unreachable`);
      resolve(false);
    }
  });
}

async function checkHttp(url: string, label: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
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
  const [relayOk, blossomOk] = await Promise.all([
    checkRelay(RELAY_URL, "Relay connectivity: relay.damus.io"),
    checkHttp(BLOSSOM_URL, "Blossom connectivity: blossom.primal.net"),
  ]);

  if (!relayOk || !blossomOk) {
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await checkNetwork();
}
