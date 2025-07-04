#!/usr/bin/env -S deno run --allow-all

/**
 * Linux Keystore Diagnostic Tool
 * Helps diagnose issues with the Linux secret-tool keystore integration
 */

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    const process = new Deno.Command("which", {
      args: [cmd],
      stdout: "piped",
      stderr: "piped",
    });
    const result = await process.output();
    const path = new TextDecoder().decode(result.stdout).trim();
    console.log(`✓ ${cmd} found at: ${path}`);
    return result.code === 0;
  } catch {
    console.log(`✗ ${cmd} not found`);
    return false;
  }
}

async function checkSecretService(): Promise<boolean> {
  try {
    const dbusSession = Deno.env.get("DBUS_SESSION_BUS_ADDRESS");
    if (!dbusSession) {
      console.log("✗ D-Bus session not available (DBUS_SESSION_BUS_ADDRESS not set)");
      return false;
    }
    console.log(`✓ D-Bus session available: ${dbusSession}`);

    const process = new Deno.Command("secret-tool", {
      args: ["search", "service", "test-probe"],
      stdout: "piped",
      stderr: "piped",
    });
    const result = await process.output();
    
    if (result.code === 0 || result.code === 1) {
      console.log("✓ Secret Service is accessible");
      return true;
    } else {
      const error = new TextDecoder().decode(result.stderr);
      console.log(`✗ Secret Service error: ${error}`);
      return false;
    }
  } catch (error) {
    console.log(`✗ Error checking Secret Service: ${error}`);
    return false;
  }
}

async function testSecretOperations(): Promise<void> {
  const testService = "nsyte-test";
  const testAccount = "test@example.com";
  const testPassword = "test-password-123";

  console.log("\nTesting secret operations:");

  try {
    console.log("1. Testing secret storage...");
    const storeProcess = new Deno.Command("secret-tool", {
      args: [
        "store",
        "--label",
        `${testService} - ${testAccount}`,
        "service",
        testService,
        "account",
        testAccount,
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const proc = storeProcess.spawn();
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(testPassword));
    await writer.close();

    const result = await proc.output();
    if (result.code === 0) {
      console.log("   ✓ Secret stored successfully");
    } else {
      const error = new TextDecoder().decode(result.stderr);
      console.log(`   ✗ Failed to store secret: ${error}`);
      return;
    }
  } catch (error) {
    console.log(`   ✗ Error storing secret: ${error}`);
    return;
  }

  try {
    console.log("2. Testing secret retrieval...");
    const retrieveProcess = new Deno.Command("secret-tool", {
      args: [
        "lookup",
        "service",
        testService,
        "account",
        testAccount,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await retrieveProcess.output();
    if (result.code === 0) {
      const retrieved = new TextDecoder().decode(result.stdout).trim();
      if (retrieved === testPassword) {
        console.log("   ✓ Secret retrieved successfully");
      } else {
        console.log(`   ✗ Retrieved password doesn't match (got: ${retrieved})`);
      }
    } else {
      const error = new TextDecoder().decode(result.stderr);
      console.log(`   ✗ Failed to retrieve secret: ${error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error retrieving secret: ${error}`);
  }

  try {
    console.log("3. Testing secret listing...");
    const listProcess = new Deno.Command("secret-tool", {
      args: [
        "search",
        "service",
        testService,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await listProcess.output();
    if (result.code === 0) {
      const output = new TextDecoder().decode(result.stdout);
      if (output.includes(testAccount)) {
        console.log("   ✓ Secret listed successfully");
      } else {
        console.log("   ✗ Secret not found in list");
      }
    } else {
      const error = new TextDecoder().decode(result.stderr);
      console.log(`   ✗ Failed to list secrets: ${error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error listing secrets: ${error}`);
  }

  try {
    console.log("4. Testing secret deletion...");
    const deleteProcess = new Deno.Command("secret-tool", {
      args: [
        "clear",
        "service",
        testService,
        "account",
        testAccount,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await deleteProcess.output();
    if (result.code === 0) {
      console.log("   ✓ Secret deleted successfully");
    } else {
      const error = new TextDecoder().decode(result.stderr);
      console.log(`   ✗ Failed to delete secret: ${error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error deleting secret: ${error}`);
  }
}

async function checkNsyteIntegration(): Promise<void> {
  console.log("\nChecking nsyte keychain integration:");
  
  try {
    const { getKeychainProvider } = await import("../src/lib/secrets/keychain.ts");
    const provider = await getKeychainProvider();
    
    if (provider) {
      console.log("✓ nsyte keychain provider initialized");
      
      const testCred = {
        service: "nsyte",
        account: "npub-test",
        password: "nbunksec-test",
      };
      
      console.log("Testing nsyte keychain operations:");
      const stored = await provider.store(testCred);
      console.log(`  Store: ${stored ? "✓" : "✗"}`);
      
      const retrieved = await provider.retrieve(testCred.service, testCred.account);
      console.log(`  Retrieve: ${retrieved === testCred.password ? "✓" : "✗"}`);
      
      const deleted = await provider.delete(testCred.service, testCred.account);
      console.log(`  Delete: ${deleted ? "✓" : "✗"}`);
    } else {
      console.log("✗ nsyte keychain provider not available");
    }
  } catch (error) {
    console.log(`✗ Error testing nsyte integration: ${error}`);
  }
}

async function main() {
  console.log("Linux Keystore Diagnostic Tool");
  console.log("==============================\n");

  console.log("System Information:");
  console.log(`  OS: ${Deno.build.os}`);
  console.log(`  Arch: ${Deno.build.arch}`);
  console.log(`  Desktop: ${Deno.env.get("XDG_CURRENT_DESKTOP") || "Unknown"}`);
  console.log(`  Session: ${Deno.env.get("XDG_SESSION_TYPE") || "Unknown"}`);

  console.log("\nChecking prerequisites:");
  
  const hasSecretTool = await checkCommand("secret-tool");
  if (!hasSecretTool) {
    console.log("\nInstall secret-tool with:");
    console.log("  Ubuntu/Debian: sudo apt-get install libsecret-tools");
    console.log("  Fedora: sudo dnf install libsecret");
    console.log("  Arch: sudo pacman -S libsecret");
    return;
  }

  const hasSecretService = await checkSecretService();
  if (!hasSecretService) {
    console.log("\nSecret Service not available. Make sure:");
    console.log("  - You're running in a desktop session");
    console.log("  - GNOME Keyring or KDE Wallet is installed and running");
    console.log("  - D-Bus session is available");
    return;
  }

  await testSecretOperations();
  await checkNsyteIntegration();

  console.log("\nDiagnostic complete!");
}

if (import.meta.main) {
  await main();
}