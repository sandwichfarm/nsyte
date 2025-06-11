import { assertEquals, assertExists, assertInstanceOf } from "std/assert/mod.ts";
import { stub, restore, returnsNext } from "std/testing/mock.ts";
import { 
  getKeychainProvider, 
  type KeychainProvider,
  type KeychainCredential
} from "../../src/lib/secrets/keychain.ts";

// Mock implementations to test internal classes
async function getMacOSKeychainClass() {
  const module = await import("../../src/lib/secrets/keychain.ts");
  return (module as any).MacOSKeychain;
}

async function getWindowsCredentialManagerClass() {
  const module = await import("../../src/lib/secrets/keychain.ts");
  return (module as any).WindowsCredentialManager;
}

async function getLinuxSecretServiceClass() {
  const module = await import("../../src/lib/secrets/keychain.ts");
  return (module as any).LinuxSecretService;
}

Deno.test("MacOSKeychain", async (t) => {
  const MacOSKeychain = await getMacOSKeychainClass();
  
  await t.step("isAvailable", async () => {
    const keychain = new MacOSKeychain();
    
    // Mock successful which command
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const available = await keychain.isAvailable();
    assertEquals(available, true);
    
    commandStub.restore();
    
    // Mock failed which command
    const failedStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const notAvailable = await keychain.isAvailable();
    assertEquals(notAvailable, false);
    
    failedStub.restore();
    
    // Mock exception
    const errorStub = stub(Deno, "Command", function() {
      throw new Error("Command not found");
    });
    
    const errorCase = await keychain.isAvailable();
    assertEquals(errorCase, false);
    
    errorStub.restore();
  });

  await t.step("store", async () => {
    const keychain = new MacOSKeychain();
    const credential: KeychainCredential = {
      service: "test-service",
      account: "test-account",
      password: "test-password"
    };
    
    // Mock successful store
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const stored = await keychain.store(credential);
    assertEquals(stored, true);
    
    commandStub.restore();
    
    // Mock failed store
    const failedStub = stub(Deno, "Command", function(cmd: string, options: any) {
      if (options.args.includes("delete-generic-password")) {
        return {
          output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
        };
      }
      return {
        output: () => Promise.resolve({ 
          code: 1, 
          stdout: new Uint8Array(), 
          stderr: new TextEncoder().encode("Error storing password") 
        })
      };
    });
    
    const failed = await keychain.store(credential);
    assertEquals(failed, false);
    
    failedStub.restore();
    
    // Mock exception
    const errorStub = stub(Deno, "Command", function() {
      throw new Error("Command failed");
    });
    
    const errorCase = await keychain.store(credential);
    assertEquals(errorCase, false);
    
    errorStub.restore();
  });

  await t.step("retrieve", async () => {
    const keychain = new MacOSKeychain();
    
    // Mock successful retrieve
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ 
          code: 0, 
          stdout: new TextEncoder().encode("test-password\n"), 
          stderr: new Uint8Array() 
        })
      };
    });
    
    const password = await keychain.retrieve("test-service", "test-account");
    assertEquals(password, "test-password");
    
    commandStub.restore();
    
    // Mock not found
    const notFoundStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const notFound = await keychain.retrieve("test-service", "test-account");
    assertEquals(notFound, null);
    
    notFoundStub.restore();
    
    // Mock exception
    const errorStub = stub(Deno, "Command", function() {
      throw new Error("Command failed");
    });
    
    const errorCase = await keychain.retrieve("test-service", "test-account");
    assertEquals(errorCase, null);
    
    errorStub.restore();
  });

  await t.step("delete", async () => {
    const keychain = new MacOSKeychain();
    
    // Mock successful delete
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const deleted = await keychain.delete("test-service", "test-account");
    assertEquals(deleted, true);
    
    commandStub.restore();
    
    // Mock failed delete
    const failedStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const failed = await keychain.delete("test-service", "test-account");
    assertEquals(failed, false);
    
    failedStub.restore();
    
    // Mock exception
    const errorStub = stub(Deno, "Command", function() {
      throw new Error("Command failed");
    });
    
    const errorCase = await keychain.delete("test-service", "test-account");
    assertEquals(errorCase, false);
    
    errorStub.restore();
  });

  await t.step("list", async () => {
    const keychain = new MacOSKeychain();
    
    // Mock successful list with dump output
    const dumpOutput = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    0x00000007 <blob>="test-service"
    "acct"<blob>="test-account1"
    "svce"<blob>="test-service"
class: "genp"
attributes:
    0x00000007 <blob>="other-service"
    "acct"<blob>="other-account"
    "svce"<blob>="other-service"
class: "genp"
attributes:
    0x00000007 <blob>="test-service"
    "acct"<blob>="test-account2"
    "svce"<blob>="test-service"
`;
    
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      if (options.args.includes("dump-keychain")) {
        return {
          output: () => Promise.resolve({ 
            code: 0, 
            stdout: new TextEncoder().encode(dumpOutput), 
            stderr: new Uint8Array() 
          })
        };
      }
      return {
        output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const accounts = await keychain.list("test-service");
    assertEquals(accounts.length, 2);
    assertEquals(accounts.includes("test-account1"), true);
    assertEquals(accounts.includes("test-account2"), true);
    assertEquals(accounts.includes("other-account"), false);
    
    commandStub.restore();
    
    // Mock failed list
    const failedStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const failed = await keychain.list("test-service");
    assertEquals(failed, []);
    
    failedStub.restore();
    
    // Mock exception
    const errorStub = stub(Deno, "Command", function() {
      throw new Error("Command failed");
    });
    
    const errorCase = await keychain.list("test-service");
    assertEquals(errorCase, []);
    
    errorStub.restore();
  });
});

Deno.test("WindowsCredentialManager", async (t) => {
  const WindowsCredentialManager = await getWindowsCredentialManagerClass();
  
  await t.step("isAvailable", async () => {
    const manager = new WindowsCredentialManager();
    
    // Mock Windows OS
    const osStub = stub(Deno.build, "os", "windows");
    
    // Mock successful where command
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const available = await manager.isAvailable();
    assertEquals(available, true);
    
    commandStub.restore();
    osStub.restore();
    
    // Mock non-Windows OS
    const nonWindowsStub = stub(Deno.build, "os", "darwin");
    const notWindows = await manager.isAvailable();
    assertEquals(notWindows, false);
    nonWindowsStub.restore();
  });

  await t.step("formatTargetName", () => {
    const manager = new WindowsCredentialManager();
    const target = (manager as any).formatTargetName("service", "account");
    assertEquals(target, "service:account");
  });

  await t.step("store", async () => {
    const manager = new WindowsCredentialManager();
    const credential: KeychainCredential = {
      service: "test-service",
      account: "test-account",
      password: "test-password"
    };
    
    // Mock successful store
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const stored = await manager.store(credential);
    assertEquals(stored, true);
    
    commandStub.restore();
  });

  await t.step("retrieve", async () => {
    const manager = new WindowsCredentialManager();
    
    // Mock successful retrieve with PowerShell
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      if (cmd === "powershell") {
        return {
          output: () => Promise.resolve({ 
            code: 0, 
            stdout: new TextEncoder().encode("test-password\r\n"), 
            stderr: new Uint8Array() 
          })
        };
      }
      return {
        output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const password = await manager.retrieve("test-service", "test-account");
    assertEquals(password, "test-password");
    
    commandStub.restore();
  });

  await t.step("list", async () => {
    const manager = new WindowsCredentialManager();
    
    // Mock successful list
    const listOutput = `
Currently stored credentials:

    Target: test-service:test-account1
    Type: Generic
    User: test-account1
    
    Target: other-service:other-account
    Type: Generic  
    User: other-account
    
    Target: test-service:test-account2
    Type: Generic
    User: test-account2
`;
    
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ 
          code: 0, 
          stdout: new TextEncoder().encode(listOutput), 
          stderr: new Uint8Array() 
        })
      };
    });
    
    const accounts = await manager.list("test-service");
    assertEquals(accounts.length, 2);
    assertEquals(accounts.includes("test-account1"), true);
    assertEquals(accounts.includes("test-account2"), true);
    
    commandStub.restore();
  });
});

Deno.test("LinuxSecretService", async (t) => {
  const LinuxSecretService = await getLinuxSecretServiceClass();
  
  await t.step("isAvailable", async () => {
    const service = new LinuxSecretService();
    
    // Mock successful which command
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const available = await service.isAvailable();
    assertEquals(available, true);
    
    commandStub.restore();
  });

  await t.step("store", async () => {
    const service = new LinuxSecretService();
    const credential: KeychainCredential = {
      service: "test-service",
      account: "test-account",
      password: "test-password"
    };
    
    // Mock successful store with stdin
    const mockStdin = {
      getWriter: () => ({
        write: async (data: Uint8Array) => {},
        close: async () => {}
      })
    };
    
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        spawn: () => ({
          stdin: mockStdin,
          output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
        })
      };
    });
    
    const stored = await service.store(credential);
    assertEquals(stored, true);
    
    commandStub.restore();
  });

  await t.step("retrieve", async () => {
    const service = new LinuxSecretService();
    
    // Mock successful retrieve
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ 
          code: 0, 
          stdout: new TextEncoder().encode("test-password\n"), 
          stderr: new Uint8Array() 
        })
      };
    });
    
    const password = await service.retrieve("test-service", "test-account");
    assertEquals(password, "test-password");
    
    commandStub.restore();
    
    // Mock empty password
    const emptyStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ 
          code: 0, 
          stdout: new TextEncoder().encode(""), 
          stderr: new Uint8Array() 
        })
      };
    });
    
    const empty = await service.retrieve("test-service", "test-account");
    assertEquals(empty, null);
    
    emptyStub.restore();
  });

  await t.step("list", async () => {
    const service = new LinuxSecretService();
    
    // Mock successful list
    const listOutput = `
[/org/freedesktop/secrets/collection/login/2]
label = test-service - test-account1
secret = 
created = 2024-01-01 00:00:00
modified = 2024-01-01 00:00:00
schema = org.freedesktop.Secret.Generic
attribute.account = test-account1
attribute.service = test-service

[/org/freedesktop/secrets/collection/login/3]
label = test-service - test-account2
secret = 
created = 2024-01-01 00:00:00
modified = 2024-01-01 00:00:00
schema = org.freedesktop.Secret.Generic
attribute.account = test-account2
attribute.service = test-service
`;
    
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ 
          code: 0, 
          stdout: new TextEncoder().encode(listOutput), 
          stderr: new Uint8Array() 
        })
      };
    });
    
    const accounts = await service.list("test-service");
    assertEquals(accounts.length, 2);
    assertEquals(accounts.includes("test-account1"), true);
    assertEquals(accounts.includes("test-account2"), true);
    
    commandStub.restore();
  });
});

Deno.test("getKeychainProvider", async (t) => {
  await t.step("returns MacOSKeychain on darwin", async () => {
    const osStub = stub(Deno.build, "os", "darwin");
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const provider = await getKeychainProvider();
    assertExists(provider);
    
    osStub.restore();
    commandStub.restore();
  });

  await t.step("returns WindowsCredentialManager on windows", async () => {
    const osStub = stub(Deno.build, "os", "windows");
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const provider = await getKeychainProvider();
    assertExists(provider);
    
    osStub.restore();
    commandStub.restore();
  });

  await t.step("returns LinuxSecretService on linux", async () => {
    const osStub = stub(Deno.build, "os", "linux");
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const provider = await getKeychainProvider();
    assertExists(provider);
    
    osStub.restore();
    commandStub.restore();
  });

  await t.step("returns null on unsupported platform", async () => {
    const osStub = stub(Deno.build, "os", "freebsd" as any);
    
    const provider = await getKeychainProvider();
    assertEquals(provider, null);
    
    osStub.restore();
  });

  await t.step("returns null when provider is not available", async () => {
    const osStub = stub(Deno.build, "os", "darwin");
    const commandStub = stub(Deno, "Command", function(cmd: string, options: any) {
      return {
        output: () => Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() })
      };
    });
    
    const provider = await getKeychainProvider();
    assertEquals(provider, null);
    
    osStub.restore();
    commandStub.restore();
  });
});

// Clean up
Deno.test("Cleanup", () => {
  restore();
});