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
          "-a", credential.account,
          "-s", credential.service,
          "-w", credential.password,
          "-U", // Update if exists
          "-T", "", // Allow access by all applications
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
          "-a", account,
          "-s", service,
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
          "-a", account,
          "-s", service,
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
      // Use find-generic-password to search for entries with our service name
      const process = new Deno.Command("security", {
        args: [
          "find-generic-password",
          "-s", service,
          "-a", "", // Empty account to match all accounts for this service
        ],
        stdout: "piped",
        stderr: "piped",
      });
      
      const result = await process.output();
      
      // Even if no specific entry is found, we can try a different approach
      // Use dump-keychain and filter for our service
      const dumpProcess = new Deno.Command("security", {
        args: [
          "dump-keychain",
        ],
        stdout: "piped",
        stderr: "piped",
      });
      
      const dumpResult = await dumpProcess.output();
      if (dumpResult.code !== 0) {
        return [];
      }
      
      const output = new TextDecoder().decode(dumpResult.stdout);
      const accounts: string[] = [];
      
      // Parse the keychain dump to find matching service entries
      const lines = output.split('\n');
      let currentService = '';
      
      for (const line of lines) {
        if (line.includes('svce<blob>="')) {
          const match = line.match(/svce<blob>="([^"]+)"/);
          if (match) {
            currentService = match[1];
          }
        } else if (line.includes('acct<blob>="') && currentService === service) {
          const match = line.match(/acct<blob>="([^"]+)"/);
          if (match) {
            accounts.push(match[1]);
          }
        }
      }
      
      return [...new Set(accounts)]; // Remove duplicates
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
      const lines = output.split('\n');
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
      const process = new Deno.Command("which", {
        args: ["secret-tool"],
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
      const process = new Deno.Command("secret-tool", {
        args: [
          "store",
          "--label", `${credential.service} - ${credential.account}`,
          "service", credential.service,
          "account", credential.account,
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
        log.error(`Failed to store credential in Linux Secret Service: ${error}`);
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
          "service", service,
          "account", account,
        ],
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
      log.error(`Error retrieving credential from Linux Secret Service: ${error}`);
      return null;
    }
  }

  async delete(service: string, account: string): Promise<boolean> {
    try {
      const process = new Deno.Command("secret-tool", {
        args: [
          "clear",
          "service", service,
          "account", account,
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
          "service", service,
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
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('attribute.account =')) {
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