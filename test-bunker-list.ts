#!/usr/bin/env -S deno run --allow-all

/**
 * Test script to demonstrate the issue with listing multiple bunkers
 * from the macOS keychain
 */

import { SecretsManager } from "./src/lib/secrets/manager.ts";
import { createLogger } from "./src/lib/logger.ts";

const log = createLogger("test-bunker-list");

async function testBunkerList() {
  console.log("Testing bunker list functionality...\n");

  const secretsManager = SecretsManager.getInstance();
  await secretsManager.initialize();

  // List all currently stored bunkers
  console.log("Fetching all stored bunkers...");
  const pubkeys = await secretsManager.getAllPubkeys();
  console.log(`Found ${pubkeys.length} bunkers:\n`);

  for (const pubkey of pubkeys) {
    console.log(`- ${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`);
  }

  // Test the macOS keychain directly
  console.log("\n\nTesting macOS keychain directly...");
  console.log("Running: security find-generic-password -s nsyte");
  
  const process = new Deno.Command("security", {
    args: ["find-generic-password", "-s", "nsyte"],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await process.output();
  const output = new TextDecoder().decode(result.stdout);
  const error = new TextDecoder().decode(result.stderr);

  console.log(`Exit code: ${result.code}`);
  if (output) {
    console.log("\nOutput (first match only):");
    const lines = output.split("\n").slice(0, 10);
    for (const line of lines) {
      if (line.includes("acct") || line.includes("svce")) {
        console.log(line);
      }
    }
  }
  if (error) {
    console.log("\nError:", error);
  }

  // Test with dump-keychain (may require authorization)
  console.log("\n\nAlternative: List all entries with security dump-keychain");
  console.log("Note: This requires keychain access authorization\n");

  const dumpProcess = new Deno.Command("security", {
    args: ["dump-keychain"],
    stdout: "piped",
    stderr: "piped",
  });

  try {
    const dumpResult = await dumpProcess.output();
    const dumpOutput = new TextDecoder().decode(dumpResult.stdout);
    
    // Count nsyte entries
    let nsyteCount = 0;
    const lines = dumpOutput.split("\n");
    const nsyteAccounts: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('"svce"<blob>="nsyte"')) {
        nsyteCount++;
        // Look for the account in nearby lines
        for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 5); j++) {
          const acctMatch = lines[j].match(/"acct"<blob>="([^"]+)"/);
          if (acctMatch && acctMatch[1]) {
            nsyteAccounts.push(acctMatch[1]);
            break;
          }
        }
      }
    }

    console.log(`Found ${nsyteCount} nsyte entries in keychain dump`);
    if (nsyteAccounts.length > 0) {
      console.log("\nAccounts found:");
      for (const account of [...new Set(nsyteAccounts)]) {
        console.log(`- ${account.slice(0, 8)}...${account.slice(-4)}`);
      }
    }
  } catch (e) {
    console.log("Could not dump keychain (requires authorization):", e);
  }

  console.log("\n\nAnalysis:");
  console.log("The macOS 'security find-generic-password' command only returns the FIRST match.");
  console.log("This is why the list() method in MacOSKeychain only shows one bunker.");
  console.log("To list all entries, we would need to use 'security dump-keychain' or iterate with specific account names.");
}

if (import.meta.main) {
  await testBunkerList();
}