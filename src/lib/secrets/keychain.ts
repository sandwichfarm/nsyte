/**
 * Native keychain integration for secure credential storage
 * This module provides a unified interface to platform-specific keychains:
 * - macOS: Keychain Services
 * - Windows: Credential Manager
 * - Linux: Secret Service API (libsecret)
 * - Fallback: Encrypted filesystem storage
 */

import { createLogger } from "../logger.ts";

const log = createLogger("keychain");

export interface KeychainCredential {
  service: string;
  account: string;
  password: string;
}

export interface KeychainProvider {
  isAvailable(): Promise<boolean>;
  store(credential: KeychainCredential): Promise<boolean>;
  retrieve(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<boolean>;
  list(service: string): Promise<string[]>;
}

/**
 * macOS Keychain implementation using the security command
 */
class MacOSKeychain implements KeychainProvider {
  async isAvailable(): Promise<boolean> {
    try {
      const process = new Deno.Command("which", {
        args: ["security"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await process.output();
      return result.code === 0;
    } catch {
      return false;
    }
  }

  async store(credential: KeychainCredential): Promise<boolean> {
    try {
      // First, try to delete any existing credential
      await this.delete(credential.service, credential.account);

      const process = new Deno.Command("security", {
        args: [
          "add-generic-password",
          "-a",
          credential.account,
          "-s",
          credential.service,
          "-w",
          credential.password,
          "-U", // Update if exists
          "-T",
          "", // Allow access by all applications
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      if (result.code !== 0) {
        const error = new TextDecoder().decode(result.stderr);
        log.error(`Failed to store credential in macOS Keychain: ${error}`);
        return false;
      }

      log.debug(`Stored credential for ${credential.account} in macOS Keychain`);
      return true;
    } catch (error) {
      log.error(`Error storing credential in macOS Keychain: ${error}`);
      return false;
    }
  }

  async retrieve(service: string, account: string): Promise<string | null> {
    try {
      const process = new Deno.Command("security", {
        args: [
          "find-generic-password",
          "-a",
          account,
          "-s",
          service,
          "-w", // Output password only
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      if (result.code !== 0) {
        return null;
      }

      const password = new TextDecoder().decode(result.stdout).trim();
      return password;
    } catch (error) {
      log.error(`Error retrieving credential from macOS Keychain: ${error}`);
      return null;
    }
  }

  async delete(service: string, account: string): Promise<boolean> {
    try {
      const process = new Deno.Command("security", {
        args: [
          "delete-generic-password",
          "-a",
          account,
          "-s",
          service,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      return result.code === 0;
    } catch {
      return false;
    }
  }

  async list(service: string): Promise<string[]> {
    try {
      // Use find-generic-password to get all matching items
      const process = new Deno.Command("security", {
        args: [
          "find-generic-password",
          "-s",
          service,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      
      // Output goes to stdout when successful
      const output = new TextDecoder().decode(result.stdout);
      const errorOutput = new TextDecoder().decode(result.stderr);
      
      log.debug(`macOS Keychain list - exit code: ${result.code}`);
      log.debug(`macOS Keychain list - stdout length: ${output.length}`);
      log.debug(`macOS Keychain list - stderr: ${errorOutput}`);
      
      const accounts: string[] = [];

      // Parse the output to find account names
      // Format is like: "acct"<blob>="account_name"
      const lines = output.split("\n");
      
      for (const line of lines) {
        // Match account entries
        const acctMatch = line.match(/"acct"<blob>="([^"]+)"/);
        if (acctMatch && acctMatch[1]) {
          log.debug(`Found account: ${acctMatch[1]}`);
          accounts.push(acctMatch[1]);
        }
      }

      log.debug(`macOS Keychain list - found ${accounts.length} accounts`);

      // If we found at least one account, return them
      if (accounts.length > 0) {
        return [...new Set(accounts)];
      }

      // If no accounts found in stdout, there might be none
      return [];
    } catch (error) {
      log.error(`Error listing credentials from macOS Keychain: ${error}`);
      return [];
    }
  }
}

/**
 * Windows Credential Manager implementation using cmdkey
 */
class WindowsCredentialManager implements KeychainProvider {
  async isAvailable(): Promise<boolean> {
    if (Deno.build.os !== "windows") return false;

    try {
      const process = new Deno.Command("where", {
        args: ["cmdkey"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await process.output();
      return result.code === 0;
    } catch {
      return false;
    }
  }

  private formatTargetName(service: string, account: string): string {
    return `${service}:${account}`;
  }

  async store(credential: KeychainCredential): Promise<boolean> {
    try {
      const target = this.formatTargetName(credential.service, credential.account);

      // First delete any existing credential
      await this.delete(credential.service, credential.account);

      const process = new Deno.Command("cmdkey", {
        args: [
          "/add:" + target,
          "/user:" + credential.account,
          "/pass:" + credential.password,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      if (result.code !== 0) {
        const error = new TextDecoder().decode(result.stderr);
        log.error(`Failed to store credential in Windows Credential Manager: ${error}`);
        return false;
      }

      log.debug(`Stored credential for ${credential.account} in Windows Credential Manager`);
      return true;
    } catch (error) {
      log.error(`Error storing credential in Windows Credential Manager: ${error}`);
      return false;
    }
  }

  async retrieve(service: string, account: string): Promise<string | null> {
    try {
      // Windows doesn't have a direct way to retrieve passwords via cmdkey
      // We'll need to use PowerShell for this
      const target = this.formatTargetName(service, account);

      const script = `
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;

        public class CredentialManager {
            [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
            public static extern bool CredRead(string target, int type, int flags, out IntPtr credentialPtr);

            [DllImport("advapi32.dll", SetLastError = true)]
            public static extern void CredFree([In] IntPtr cred);

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            public struct CREDENTIAL {
                public int Flags;
                public int Type;
                public IntPtr TargetName;
                public IntPtr Comment;
                public long LastWritten;
                public int CredentialBlobSize;
                public IntPtr CredentialBlob;
                public int Persist;
                public int AttributeCount;
                public IntPtr Attributes;
                public IntPtr TargetAlias;
                public IntPtr UserName;
            }

            public static string GetPassword(string target) {
                IntPtr credPtr;
                if (!CredRead(target, 1, 0, out credPtr)) {
                    return null;
                }

                try {
                    CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
                    byte[] passwordBytes = new byte[cred.CredentialBlobSize];
                    Marshal.Copy(cred.CredentialBlob, passwordBytes, 0, cred.CredentialBlobSize);
                    return Encoding.Unicode.GetString(passwordBytes);
                } finally {
                    CredFree(credPtr);
                }
            }
        }
"@
        [CredentialManager]::GetPassword("${target}")
      `;

      const process = new Deno.Command("powershell", {
        args: ["-Command", script],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      if (result.code !== 0) {
        return null;
      }

      const password = new TextDecoder().decode(result.stdout).trim();
      return password || null;
    } catch (error) {
      log.error(`Error retrieving credential from Windows Credential Manager: ${error}`);
      return null;
    }
  }

  async delete(service: string, account: string): Promise<boolean> {
    try {
      const target = this.formatTargetName(service, account);

      const process = new Deno.Command("cmdkey", {
        args: ["/delete:" + target],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      return result.code === 0;
    } catch {
      return false;
    }
  }

  async list(service: string): Promise<string[]> {
    try {
      const process = new Deno.Command("cmdkey", {
        args: ["/list"],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      if (result.code !== 0) {
        return [];
      }

      const output = new TextDecoder().decode(result.stdout);
      const accounts: string[] = [];

      // Parse cmdkey output to find matching entries
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.includes(`Target: ${service}:`)) {
          const match = line.match(/Target: [^:]+:(.+)/);
          if (match) {
            accounts.push(match[1].trim());
          }
        }
      }

      return accounts;
    } catch (error) {
      log.error(`Error listing credentials from Windows Credential Manager: ${error}`);
      return [];
    }
  }
}

/**
 * Linux Secret Service implementation using secret-tool
 */
class LinuxSecretService implements KeychainProvider {
  async isAvailable(): Promise<boolean> {
    try {
      // Check if secret-tool exists
      const whichProcess = new Deno.Command("which", {
        args: ["secret-tool"],
        stdout: "piped",
        stderr: "piped",
      });
      const whichResult = await whichProcess.output();
      if (whichResult.code !== 0) {
        log.debug("secret-tool command not found in PATH");
        return false;
      }

      // Check if D-Bus session is available
      const dbusSession = Deno.env.get("DBUS_SESSION_BUS_ADDRESS");
      if (!dbusSession) {
        log.debug("D-Bus session not available (DBUS_SESSION_BUS_ADDRESS not set)");
        return false;
      }

      // Test if secret service is actually accessible
      const testProcess = new Deno.Command("secret-tool", {
        args: ["search", "service", "nsyte-probe"],
        stdout: "piped",
        stderr: "piped",
      });
      const testResult = await testProcess.output();
      
      // Exit codes 0 or 1 are OK (0=found secrets, 1=no secrets found but service works)
      if (testResult.code === 0 || testResult.code === 1) {
        log.debug("Linux Secret Service is available and accessible");
        return true;
      } else {
        const error = new TextDecoder().decode(testResult.stderr);
        log.debug(`Linux Secret Service not accessible: ${error}`);
        return false;
      }
    } catch (error) {
      log.debug(`Error checking Linux Secret Service availability: ${error}`);
      return false;
    }
  }

  async store(credential: KeychainCredential): Promise<boolean> {
    try {
      const process = new Deno.Command("secret-tool", {
        args: [
          "store",
          "--label",
          `${credential.service} - ${credential.account}`,
          "service",
          credential.service,
          "account",
          credential.account,
        ],
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });

      const proc = process.spawn();
      const writer = proc.stdin.getWriter();
      await writer.write(new TextEncoder().encode(credential.password));
      await writer.close();

      const result = await proc.output();
      if (result.code !== 0) {
        const error = new TextDecoder().decode(result.stderr);
        const stdout = new TextDecoder().decode(result.stdout);
        log.error(`Failed to store credential in Linux Secret Service: ${error}`);
        if (stdout) {
          log.error(`stdout: ${stdout}`);
        }
        
        // Common error patterns
        if (error.includes("No such interface")) {
          log.error("Hint: Secret Service interface not available. Is GNOME Keyring or KDE Wallet running?");
        } else if (error.includes("Cannot autolaunch D-Bus")) {
          log.error("Hint: D-Bus session not available. Are you running in a desktop session?");
        } else if (error.includes("secret-tool: command not found")) {
          log.error("Hint: secret-tool not installed. Install libsecret-tools package.");
        }
        return false;
      }

      log.debug(`Stored credential for ${credential.account} in Linux Secret Service`);
      return true;
    } catch (error) {
      log.error(`Error storing credential in Linux Secret Service: ${error}`);
      return false;
    }
  }

  async retrieve(service: string, account: string): Promise<string | null> {
    try {
      const process = new Deno.Command("secret-tool", {
        args: [
          "lookup",
          "service",
          service,
          "account",
          account,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      if (result.code !== 0) {
        const error = new TextDecoder().decode(result.stderr);
        if (error && !error.includes("secret does not exist")) {
          log.debug(`Failed to retrieve credential from Linux Secret Service: ${error}`);
        }
        return null;
      }

      const password = new TextDecoder().decode(result.stdout).trim();
      return password || null;
    } catch (error) {
      log.error(`Error retrieving credential from Linux Secret Service: ${error}`);
      return null;
    }
  }

  async delete(service: string, account: string): Promise<boolean> {
    try {
      const process = new Deno.Command("secret-tool", {
        args: [
          "clear",
          "service",
          service,
          "account",
          account,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      return result.code === 0;
    } catch {
      return false;
    }
  }

  async list(service: string): Promise<string[]> {
    try {
      const process = new Deno.Command("secret-tool", {
        args: [
          "search",
          "service",
          service,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();
      if (result.code !== 0) {
        return [];
      }

      const output = new TextDecoder().decode(result.stdout);
      const accounts: string[] = [];

      // Parse secret-tool output to find account attributes
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.includes("attribute.account =")) {
          const match = line.match(/attribute\.account = (.+)/);
          if (match) {
            accounts.push(match[1].trim());
          }
        }
      }

      return [...new Set(accounts)]; // Remove duplicates
    } catch (error) {
      log.error(`Error listing credentials from Linux Secret Service: ${error}`);
      return [];
    }
  }
}

/**
 * Factory function to get the appropriate keychain provider for the current platform
 */
export async function getKeychainProvider(): Promise<KeychainProvider | null> {
  // Check if keychain is disabled (for testing)
  if (
    Deno.env.get("NSYTE_DISABLE_KEYCHAIN") === "true" ||
    Deno.env.get("NSYTE_TEST_MODE") === "true"
  ) {
    log.debug("Keychain access disabled by environment variable");
    return null;
  }

  let provider: KeychainProvider | null = null;

  switch (Deno.build.os) {
    case "darwin":
      provider = new MacOSKeychain();
      break;
    case "windows":
      provider = new WindowsCredentialManager();
      break;
    case "linux":
      provider = new LinuxSecretService();
      break;
    default:
      log.warn(`Unsupported platform: ${Deno.build.os}`);
      return null;
  }

  const isAvailable = await provider.isAvailable();
  if (!isAvailable) {
    log.debug(`Keychain provider for ${Deno.build.os} is not available`);
    return null;
  }

  return provider;
}
