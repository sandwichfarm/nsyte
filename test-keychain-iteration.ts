#!/usr/bin/env -S deno run --allow-all

/**
 * Test different approaches to list all keychain entries
 */

async function testKeychainApproaches() {
  console.log("Testing different keychain listing approaches...\n");

  // Approach 1: Use security find-generic-password -a (all)
  console.log("Approach 1: Using -a flag (find all)");
  const process1 = new Deno.Command("security", {
    args: ["find-generic-password", "-s", "nsyte", "-a"],
    stdout: "piped",
    stderr: "piped",
  });

  const result1 = await process1.output();
  const output1 = new TextDecoder().decode(result1.stdout);
  const error1 = new TextDecoder().decode(result1.stderr);

  console.log(`Exit code: ${result1.code}`);
  
  // Count matches
  const accounts1 = output1.match(/"acct"<blob>="([^"]+)"/g);
  console.log(`Found ${accounts1?.length || 0} accounts with -a flag`);
  
  if (accounts1 && accounts1.length > 0) {
    console.log("\nFirst few accounts:");
    accounts1.slice(0, 3).forEach(match => {
      const account = match.match(/"acct"<blob>="([^"]+)"/)?.[1];
      if (account) {
        console.log(`- ${account.slice(0, 8)}...${account.slice(-4)}`);
      }
    });
  }

  // Approach 2: Use security find-generic-password -j (JSON output)
  console.log("\n\nApproach 2: Using -j flag (JSON output)");
  const process2 = new Deno.Command("security", {
    args: ["find-generic-password", "-s", "nsyte", "-j"],
    stdout: "piped", 
    stderr: "piped",
  });

  const result2 = await process2.output();
  const output2 = new TextDecoder().decode(result2.stdout);
  console.log(`Exit code: ${result2.code}`);
  console.log(`Output length: ${output2.length} chars`);
  
  // Approach 3: Iterate with specific query
  console.log("\n\nApproach 3: Use security list-keychains");
  const process3 = new Deno.Command("security", {
    args: ["list-keychains"],
    stdout: "piped",
    stderr: "piped",
  });

  const result3 = await process3.output();
  const output3 = new TextDecoder().decode(result3.stdout);
  console.log("Available keychains:");
  console.log(output3);
}

if (import.meta.main) {
  await testKeychainApproaches();
}