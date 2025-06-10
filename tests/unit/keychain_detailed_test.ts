import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { restore, spy, stub } from "std/testing/mock.ts";
import {
  getKeychainProvider,
  type KeychainCredential,
  type KeychainProvider,
} from "../../src/lib/secrets/keychain.ts";

Deno.test("Keychain - getKeychainProvider", async (t) => {
  await t.step("should return MacOSKeychain on darwin", async () => {
    const originalOS = Deno.build.os;

    try {
      // Mock Deno.build.os
      Object.defineProperty(Deno.build, "os", {
        value: "darwin",
        configurable: true,
      });

      // Mock the which command to find security
      const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
        if (cmd === "which" && options?.args?.[0] === "security") {
          return {
            output: () =>
              Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
          };
        }
        return {
          output: () =>
            Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      });

      const provider = await getKeychainProvider();
      assertExists(provider);
    } finally {
      Object.defineProperty(Deno.build, "os", {
        value: originalOS,
        configurable: true,
      });
      restore();
    }
  });

  await t.step("should return WindowsCredentialManager on windows", async () => {
    const originalOS = Deno.build.os;

    try {
      Object.defineProperty(Deno.build, "os", {
        value: "windows",
        configurable: true,
      });

      // Mock the where command to find cmdkey
      const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
        if (cmd === "where" && options?.args?.[0] === "cmdkey") {
          return {
            output: () =>
              Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
          };
        }
        return {
          output: () =>
            Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      });

      const provider = await getKeychainProvider();
      assertExists(provider);
    } finally {
      Object.defineProperty(Deno.build, "os", {
        value: originalOS,
        configurable: true,
      });
      restore();
    }
  });

  await t.step("should return LinuxSecretService on linux", async () => {
    const originalOS = Deno.build.os;

    try {
      Object.defineProperty(Deno.build, "os", {
        value: "linux",
        configurable: true,
      });

      // Mock the which command to find secret-tool
      const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
        if (cmd === "which" && options?.args?.[0] === "secret-tool") {
          return {
            output: () =>
              Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
          };
        }
        return {
          output: () =>
            Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      });

      const provider = await getKeychainProvider();
      assertExists(provider);
    } finally {
      Object.defineProperty(Deno.build, "os", {
        value: originalOS,
        configurable: true,
      });
      restore();
    }
  });

  await t.step("should return null for unsupported platform", async () => {
    const originalOS = Deno.build.os;

    try {
      Object.defineProperty(Deno.build, "os", {
        value: "freebsd",
        configurable: true,
      });

      const provider = await getKeychainProvider();
      assertEquals(provider, null);
    } finally {
      Object.defineProperty(Deno.build, "os", {
        value: originalOS,
        configurable: true,
      });
    }
  });

  await t.step("should return null when provider is not available", async () => {
    const originalOS = Deno.build.os;

    try {
      Object.defineProperty(Deno.build, "os", {
        value: "darwin",
        configurable: true,
      });

      // Mock the which command to NOT find security
      const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
        return {
          output: () =>
            Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      });

      const provider = await getKeychainProvider();
      assertEquals(provider, null);
    } finally {
      Object.defineProperty(Deno.build, "os", {
        value: originalOS,
        configurable: true,
      });
      restore();
    }
  });
});

Deno.test("MacOSKeychain", async (t) => {
  const originalOS = Deno.build.os;

  // Set up for macOS tests
  Object.defineProperty(Deno.build, "os", {
    value: "darwin",
    configurable: true,
  });

  await t.step("should check availability correctly", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which" && options?.args?.[0] === "security") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }
      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);
      const isAvailable = await provider.isAvailable();
      assertEquals(isAvailable, true);
    } finally {
      restore();
    }
  });

  await t.step("should store credential successfully", async () => {
    let deleteCallCount = 0;
    let addCallCount = 0;

    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "security" && options?.args?.[0] === "delete-generic-password") {
        deleteCallCount++;
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "security" && options?.args?.[0] === "add-generic-password") {
        addCallCount++;
        // Verify correct arguments
        assertEquals(options.args[2], "testaccount"); // -a account
        assertEquals(options.args[4], "testservice"); // -s service
        assertEquals(options.args[6], "testpassword"); // -w password
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const credential: KeychainCredential = {
        service: "testservice",
        account: "testaccount",
        password: "testpassword",
      };

      const result = await provider.store(credential);
      assertEquals(result, true);
      assertEquals(deleteCallCount, 1); // Should delete first
      assertEquals(addCallCount, 1); // Then add
    } finally {
      restore();
    }
  });

  await t.step("should retrieve credential successfully", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "security" && options?.args?.[0] === "find-generic-password") {
        // Verify correct arguments
        assertEquals(options.args[2], "testaccount"); // -a account
        assertEquals(options.args[4], "testservice"); // -s service
        assertEquals(options.args[5], "-w"); // password only flag

        const password = new TextEncoder().encode("retrievedpassword\n");
        return {
          output: () => Promise.resolve({ code: 0, stdout: password, stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const password = await provider.retrieve("testservice", "testaccount");
      assertEquals(password, "retrievedpassword");
    } finally {
      restore();
    }
  });

  await t.step("should return null when credential not found", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "security" && options?.args?.[0] === "find-generic-password") {
        return {
          output: () =>
            Promise.resolve({ code: 44, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const password = await provider.retrieve("testservice", "testaccount");
      assertEquals(password, null);
    } finally {
      restore();
    }
  });

  await t.step("should delete credential successfully", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "security" && options?.args?.[0] === "delete-generic-password") {
        // Verify correct arguments
        assertEquals(options.args[2], "testaccount"); // -a account
        assertEquals(options.args[4], "testservice"); // -s service
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const result = await provider.delete("testservice", "testaccount");
      assertEquals(result, true);
    } finally {
      restore();
    }
  });

  await t.step("should list credentials for service", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "security" && options?.args?.[0] === "dump-keychain") {
        const output = `keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    0x00000007 <blob>="testservice"
    "acct"<blob>="account1"
    "svce"<blob>="testservice"
class: "genp"
attributes:
    0x00000007 <blob>="otherservice"
    "acct"<blob>="otheraccount"
    "svce"<blob>="otherservice"
class: "genp"
attributes:
    0x00000007 <blob>="testservice"
    "acct"<blob>="account2"
    "svce"<blob>="testservice"`;

        const outputBytes = new TextEncoder().encode(output);
        return {
          output: () => Promise.resolve({ code: 0, stdout: outputBytes, stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const accounts = await provider.list("testservice");
      assertEquals(accounts.sort(), ["account1", "account2"]);
    } finally {
      restore();
    }
  });

  // Restore original OS
  Object.defineProperty(Deno.build, "os", {
    value: originalOS,
    configurable: true,
  });
});

Deno.test("LinuxSecretService", async (t) => {
  const originalOS = Deno.build.os;

  // Set up for Linux tests
  Object.defineProperty(Deno.build, "os", {
    value: "linux",
    configurable: true,
  });

  await t.step("should store credential successfully", async () => {
    let spawnCalled = false;

    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "secret-tool" && options?.args?.[0] === "store") {
        // Verify correct arguments
        assertEquals(options.args[2], "testservice - testaccount"); // --label
        assertEquals(options.args[4], "testservice"); // service
        assertEquals(options.args[6], "testaccount"); // account

        return {
          spawn: () => {
            spawnCalled = true;
            return {
              stdin: {
                getWriter: () => ({
                  write: async (data: Uint8Array) => {
                    const password = new TextDecoder().decode(data);
                    assertEquals(password, "testpassword");
                  },
                  close: async () => {},
                }),
              },
              output: () =>
                Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
            };
          },
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const credential: KeychainCredential = {
        service: "testservice",
        account: "testaccount",
        password: "testpassword",
      };

      const result = await provider.store(credential);
      assertEquals(result, true);
      assertEquals(spawnCalled, true);
    } finally {
      restore();
    }
  });

  await t.step("should retrieve credential successfully", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "secret-tool" && options?.args?.[0] === "lookup") {
        // Verify correct arguments
        assertEquals(options.args[2], "testservice"); // service
        assertEquals(options.args[4], "testaccount"); // account

        const password = new TextEncoder().encode("retrievedpassword\n");
        return {
          output: () => Promise.resolve({ code: 0, stdout: password, stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const password = await provider.retrieve("testservice", "testaccount");
      assertEquals(password, "retrievedpassword");
    } finally {
      restore();
    }
  });

  await t.step("should list credentials for service", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "which") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "secret-tool" && options?.args?.[0] === "search") {
        assertEquals(options.args[2], "testservice"); // service

        const output = `[/org/freedesktop/secrets/collection/login/1]
label = testservice - account1
secret = 
created = 2024-01-01 00:00:00
modified = 2024-01-01 00:00:00
schema = org.freedesktop.Secret.Generic
attribute.service = testservice
attribute.account = account1

[/org/freedesktop/secrets/collection/login/2]
label = testservice - account2
secret = 
created = 2024-01-01 00:00:00
modified = 2024-01-01 00:00:00
schema = org.freedesktop.Secret.Generic
attribute.service = testservice
attribute.account = account2`;

        const outputBytes = new TextEncoder().encode(output);
        return {
          output: () => Promise.resolve({ code: 0, stdout: outputBytes, stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const accounts = await provider.list("testservice");
      assertEquals(accounts.sort(), ["account1", "account2"]);
    } finally {
      restore();
    }
  });

  // Restore original OS
  Object.defineProperty(Deno.build, "os", {
    value: originalOS,
    configurable: true,
  });
});

Deno.test("WindowsCredentialManager", async (t) => {
  const originalOS = Deno.build.os;

  // Set up for Windows tests
  Object.defineProperty(Deno.build, "os", {
    value: "windows",
    configurable: true,
  });

  await t.step("should check availability correctly", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "where" && options?.args?.[0] === "cmdkey") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }
      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);
      const isAvailable = await provider.isAvailable();
      assertEquals(isAvailable, true);
    } finally {
      restore();
    }
  });

  await t.step("should format target name correctly", async () => {
    let targetName = "";

    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "where") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "cmdkey" && options?.args?.[0]?.startsWith("/add:")) {
        targetName = options.args[0].substring(5); // Remove "/add:"
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const credential: KeychainCredential = {
        service: "testservice",
        account: "testaccount",
        password: "testpassword",
      };

      await provider.store(credential);
      assertEquals(targetName, "testservice:testaccount");
    } finally {
      restore();
    }
  });

  await t.step("should list credentials for service", async () => {
    const commandStub = stub(Deno, "Command", function (cmd: string, options?: any) {
      if (cmd === "where") {
        return {
          output: () =>
            Promise.resolve({ code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        };
      }

      if (cmd === "cmdkey" && options?.args?.[0] === "/list") {
        const output = `Currently stored credentials:

    Target: testservice:account1
    Type: Generic
    User: account1
    
    Target: otherservice:otheraccount
    Type: Generic
    User: otheraccount
    
    Target: testservice:account2
    Type: Generic
    User: account2`;

        const outputBytes = new TextEncoder().encode(output);
        return {
          output: () => Promise.resolve({ code: 0, stdout: outputBytes, stderr: new Uint8Array() }),
        };
      }

      return {
        output: () =>
          Promise.resolve({ code: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }),
      };
    });

    try {
      const provider = await getKeychainProvider();
      assertExists(provider);

      const accounts = await provider.list("testservice");
      assertEquals(accounts.sort(), ["account1", "account2"]);
    } finally {
      restore();
    }
  });

  // Restore original OS
  Object.defineProperty(Deno.build, "os", {
    value: originalOS,
    configurable: true,
  });
});
