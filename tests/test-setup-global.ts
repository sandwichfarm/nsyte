/**
 * GLOBAL TEST SETUP - BLOCKS ALL SYSTEM ACCESS
 * This must be imported before ANY other imports in test files
 */

// Set environment variables to block all system access
Deno.env.set("NSYTE_DISABLE_KEYCHAIN", "true");
Deno.env.set("NSYTE_TEST_MODE", "true");

console.log("🔒 Test environment: Keychain access BLOCKED");

// Mock the keychain module at the module level to prevent ANY native calls
const originalDynamicImport = globalThis.import;
(globalThis as any).import = async (specifier: string) => {
  if (specifier.includes("secrets/keychain")) {
    console.log("🚫 Blocked keychain import, returning mock");
    return {
      getKeychainProvider: async () => {
        console.log("🚫 Mock getKeychainProvider called - returning null");
        return null;
      },
      MacOSKeychain: class MockMacOSKeychain {
        async isAvailable() {
          return false;
        }
        async store() {
          throw new Error("Keychain access blocked in tests");
        }
        async retrieve() {
          throw new Error("Keychain access blocked in tests");
        }
        async delete() {
          throw new Error("Keychain access blocked in tests");
        }
        async list() {
          throw new Error("Keychain access blocked in tests");
        }
      },
      WindowsCredentialManager: class MockWindowsCredentialManager {
        async isAvailable() {
          return false;
        }
        async store() {
          throw new Error("Keychain access blocked in tests");
        }
        async retrieve() {
          throw new Error("Keychain access blocked in tests");
        }
        async delete() {
          throw new Error("Keychain access blocked in tests");
        }
        async list() {
          throw new Error("Keychain access blocked in tests");
        }
      },
      LinuxSecretService: class MockLinuxSecretService {
        async isAvailable() {
          return false;
        }
        async store() {
          throw new Error("Keychain access blocked in tests");
        }
        async retrieve() {
          throw new Error("Keychain access blocked in tests");
        }
        async delete() {
          throw new Error("Keychain access blocked in tests");
        }
        async list() {
          throw new Error("Keychain access blocked in tests");
        }
      },
    };
  }
  return originalDynamicImport(specifier);
};

// Mock Deno commands that could access system resources
const originalCommand = Deno.Command;
Deno.Command = class MockCommand extends originalCommand {
  constructor(command: string, options?: any) {
    // Block any security-related commands
    if (command === "security" || command === "cmdkey" || command === "secret-tool") {
      throw new Error(`Command '${command}' blocked in tests - no keychain access allowed`);
    }
    super(command, options);
  }
} as any;

console.log("🔒 Test environment setup complete - all keychain access blocked");

export {}; // Make this a module
