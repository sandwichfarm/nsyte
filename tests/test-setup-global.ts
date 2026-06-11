/**
 * GLOBAL TEST SETUP - BLOCKS ALL SYSTEM ACCESS
 * This must be imported before ANY other imports in test files
 */

// Set environment variables to block all system access
Deno.env.set("NSYTE_DISABLE_KEYCHAIN", "true");
Deno.env.set("NSYTE_TEST_MODE", "true");

console.log("🔒 Test environment: Keychain access BLOCKED");

// Mock the keychain module at the module level to prevent ANY native calls
const originalDynamicImport = (globalThis as any).import;
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
class MockCommand extends originalCommand {
  constructor(command: string | URL, options?: Deno.CommandOptions) {
    const commandName = command instanceof URL ? command.toString() : command;

    // Block any security-related commands
    if (commandName === "security" || commandName === "cmdkey" || commandName === "secret-tool") {
      throw new Error(`Command '${commandName}' blocked in tests - no keychain access allowed`);
    }
    super(command, options);
  }
}

Object.defineProperty(Deno, "Command", {
  value: MockCommand,
  configurable: true,
  writable: true,
});

console.log("🔒 Test environment setup complete - all keychain access blocked");

export {}; // Make this a module
