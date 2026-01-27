import { assertEquals, assertExists, type assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import {
  getKeychainProvider,
  type KeychainCredential,
  type KeychainProvider,
} from "../../src/lib/secrets/keychain.ts";

describe("keychain - comprehensive branch coverage", () => {
  let commandStub: any;
  let buildStub: any;
  let envGetStub: any;
  const originalBuildOS = Deno.build.os;
  const originalEnvGet = Deno.env.get;

  beforeEach(() => {
    // Default env stub
    envGetStub = stub(Deno.env, "get", (key: string) => {
      if (key === "NSYTE_DISABLE_KEYCHAIN" || key === "NSYTE_TEST_MODE") {
        return undefined; // Allow keychain by default in tests
      }
      return originalEnvGet.call(Deno.env, key);
    });
  });

  afterEach(() => {
    restore();
  });

  const mockOS = (os: string) => {
    if (buildStub) buildStub.restore();
    buildStub = stub(Deno, "build", {
      ...Deno.build,
      os: os as typeof Deno.build.os,
    });
  };

  const mockCommand = (
    expectedCmd: string,
    responses: Record<string, { code: number; stdout?: string; stderr?: string }>,
  ) => {
    if (commandStub) commandStub.restore();

    commandStub = stub(
      Deno,
      "Command",
      class MockCommand {
        constructor(public cmd: string, public options?: any) {}

        async output() {
          const args = this.options?.args || [];
          const key = `${this.cmd}:${args.join(":")}`;

          // Check for exact match first
          if (responses[key]) {
            const response = responses[key];
            return {
              code: response.code,
              stdout: new TextEncoder().encode(response.stdout || ""),
              stderr: new TextEncoder().encode(response.stderr || ""),
            };
          }

          // Check for partial matches
          for (const [pattern, response] of Object.entries(responses)) {
            if (key.startsWith(pattern)) {
              return {
                code: response.code,
                stdout: new TextEncoder().encode(response.stdout || ""),
                stderr: new TextEncoder().encode(response.stderr || ""),
              };
            }
          }

          // Default response
          return {
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode("Command not found"),
          };
        }

        spawn() {
          const stdin = {
            getWriter: () => ({
              write: async () => {},
              close: async () => {},
            }),
          };

          return {
            stdin,
            output: async () => this.output(),
          };
        }
      } as any,
    );
  };

  describe("getKeychainProvider", () => {
    it("should return null when NSYTE_DISABLE_KEYCHAIN is true", async () => {
      envGetStub.restore();
      envGetStub = stub(Deno.env, "get", (key: string) => {
        if (key === "NSYTE_DISABLE_KEYCHAIN") return "true";
        return undefined;
      });

      const provider = await getKeychainProvider();
      assertEquals(provider, null);
    });

    it("should return null when NSYTE_TEST_MODE is true", async () => {
      envGetStub.restore();
      envGetStub = stub(Deno.env, "get", (key: string) => {
        if (key === "NSYTE_TEST_MODE") return "true";
        return undefined;
      });

      const provider = await getKeychainProvider();
      assertEquals(provider, null);
    });

    it("should return null for unsupported OS", async () => {
      mockOS("freebsd");

      const provider = await getKeychainProvider();
      assertEquals(provider, null);
    });

    it("should return null when provider is not available", async () => {
      mockOS("darwin");
      mockCommand("which", {
        "which:security": { code: 1 },
      });

      const provider = await getKeychainProvider();
      assertEquals(provider, null);
    });

    it("should return MacOSKeychain for darwin when available", async () => {
      mockOS("darwin");
      mockCommand("which", {
        "which:security": { code: 0, stdout: "/usr/bin/security" },
      });

      const provider = await getKeychainProvider();
      assertExists(provider);
    });

    it("should return WindowsCredentialManager for windows when available", async () => {
      mockOS("windows");
      mockCommand("where", {
        "where:cmdkey": { code: 0, stdout: "C:\\Windows\\System32\\cmdkey.exe" },
      });

      const provider = await getKeychainProvider();
      assertExists(provider);
    });

    it("should return LinuxSecretService for linux when available", async () => {
      mockOS("linux");
      mockCommand("which", {
        "which:secret-tool": { code: 0, stdout: "/usr/bin/secret-tool" },
      });

      const provider = await getKeychainProvider();
      assertExists(provider);
    });
  });

  describe("MacOSKeychain", () => {
    beforeEach(() => {
      mockOS("darwin");
    });

    describe("isAvailable", () => {
      it("should return true when security command exists", async () => {
        mockCommand("which", {
          "which:security": { code: 0, stdout: "/usr/bin/security" },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);
        const available = await provider.isAvailable();
        assertEquals(available, true);
      });

      it("should return false when security command not found", async () => {
        mockCommand("which", {
          "which:security": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertEquals(provider, null);
      });

      it("should handle command exception", async () => {
        mockCommand("which", {
          "which:security": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        // Mock command to throw
        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const available = await provider.isAvailable();
        assertEquals(available, false);
      });
    });

    describe("store", () => {
      it("should store credential successfully", async () => {
        mockCommand("security", {
          "which:security": { code: 0 },
          "security:delete-generic-password": { code: 0 },
          "security:add-generic-password": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, true);
      });

      it("should handle store failure", async () => {
        mockCommand("security", {
          "which:security": { code: 0 },
          "security:delete-generic-password": { code: 1 },
          "security:add-generic-password": {
            code: 1,
            stderr: "Failed to add password",
          },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, false);
      });

      it("should handle store exception", async () => {
        mockCommand("which", {
          "which:security": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        // Mock command to throw on add-generic-password
        commandStub.restore();
        let callCount = 0;
        commandStub = stub(
          Deno,
          "Command",
          class {
            constructor(public cmd: string, public options?: any) {}
            async output() {
              callCount++;
              if (callCount === 1) {
                // First call is delete (let it succeed)
                return { code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
              }
              throw new Error("Command error");
            }
          } as any,
        );

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, false);
      });
    });

    describe("retrieve", () => {
      it("should retrieve password successfully", async () => {
        mockCommand("security", {
          "which:security": { code: 0 },
          "security:find-generic-password": {
            code: 0,
            stdout: "test-password\n",
          },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, "test-password");
      });

      it("should return null when password not found", async () => {
        mockCommand("security", {
          "which:security": { code: 0 },
          "security:find-generic-password": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, null);
      });

      it("should handle retrieve exception", async () => {
        mockCommand("which", {
          "which:security": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, null);
      });
    });

    describe("delete", () => {
      it("should delete credential successfully", async () => {
        mockCommand("security", {
          "which:security": { code: 0 },
          "security:delete-generic-password": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const result = await provider.delete("test-service", "test-account");
        assertEquals(result, true);
      });

      it("should return false when delete fails", async () => {
        mockCommand("security", {
          "which:security": { code: 0 },
          "security:delete-generic-password": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const result = await provider.delete("test-service", "test-account");
        assertEquals(result, false);
      });

      it("should handle delete exception", async () => {
        mockCommand("which", {
          "which:security": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const result = await provider.delete("test-service", "test-account");
        assertEquals(result, false);
      });
    });

    describe("list", () => {
      it("should list accounts successfully", async () => {
        const dumpOutput = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    svce<blob>="test-service"
    acct<blob>="account1"
class: "genp"
attributes:
    svce<blob>="test-service"
    acct<blob>="account2"
class: "genp"
attributes:
    svce<blob>="other-service"
    acct<blob>="account3"
`;

        mockCommand("security", {
          "which:security": { code: 0 },
          "security:find-generic-password": { code: 1 }, // Not found with empty account
          "security:dump-keychain": { code: 0, stdout: dumpOutput },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const accounts = await provider.list("test-service");
        assertEquals(accounts.length, 2);
        assertEquals(accounts.includes("account1"), true);
        assertEquals(accounts.includes("account2"), true);
      });

      it("should handle dump-keychain failure", async () => {
        mockCommand("security", {
          "which:security": { code: 0 },
          "security:find-generic-password": { code: 1 },
          "security:dump-keychain": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const accounts = await provider.list("test-service");
        assertEquals(accounts, []);
      });

      it("should handle list exception", async () => {
        mockCommand("which", {
          "which:security": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const accounts = await provider.list("test-service");
        assertEquals(accounts, []);
      });

      it("should remove duplicate accounts", async () => {
        const dumpOutput = `
svce<blob>="test-service"
acct<blob>="account1"
svce<blob>="test-service"
acct<blob>="account1"
`;

        mockCommand("security", {
          "which:security": { code: 0 },
          "security:find-generic-password": { code: 1 },
          "security:dump-keychain": { code: 0, stdout: dumpOutput },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const accounts = await provider.list("test-service");
        assertEquals(accounts.length, 1);
        assertEquals(accounts[0], "account1");
      });
    });
  });

  describe("WindowsCredentialManager", () => {
    beforeEach(() => {
      mockOS("windows");
    });

    describe("isAvailable", () => {
      it("should return false on non-Windows", async () => {
        mockOS("linux");
        mockCommand("where", {
          "where:cmdkey": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertEquals(provider, null); // Linux would get LinuxSecretService
      });

      it("should return true when cmdkey exists", async () => {
        mockCommand("where", {
          "where:cmdkey": { code: 0, stdout: "C:\\Windows\\System32\\cmdkey.exe" },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);
      });

      it("should handle where command exception", async () => {
        mockCommand("where", {
          "where:cmdkey": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const available = await provider.isAvailable();
        assertEquals(available, false);
      });
    });

    describe("store", () => {
      it("should store credential successfully", async () => {
        mockCommand("cmdkey", {
          "where:cmdkey": { code: 0 },
          "cmdkey:/delete:test-service:test-account": { code: 0 },
          "cmdkey:/add:test-service:test-account": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, true);
      });

      it("should handle store failure with error message", async () => {
        mockCommand("cmdkey", {
          "where:cmdkey": { code: 0 },
          "cmdkey:/delete:test-service:test-account": { code: 1 },
          "cmdkey:/add:test-service:test-account": {
            code: 1,
            stderr: "Access denied",
          },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, false);
      });

      it("should handle store exception", async () => {
        mockCommand("where", {
          "where:cmdkey": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, false);
      });
    });

    describe("retrieve", () => {
      it("should retrieve password successfully", async () => {
        mockCommand("powershell", {
          "where:cmdkey": { code: 0 },
          "powershell:-Command": {
            code: 0,
            stdout: "test-password\n",
          },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, "test-password");
      });

      it("should return null when retrieval fails", async () => {
        mockCommand("powershell", {
          "where:cmdkey": { code: 0 },
          "powershell:-Command": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, null);
      });

      it("should return null for empty password", async () => {
        mockCommand("powershell", {
          "where:cmdkey": { code: 0 },
          "powershell:-Command": { code: 0, stdout: "" },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, null);
      });

      it("should handle retrieve exception", async () => {
        mockCommand("where", {
          "where:cmdkey": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, null);
      });
    });

    describe("delete", () => {
      it("should delete credential successfully", async () => {
        mockCommand("cmdkey", {
          "where:cmdkey": { code: 0 },
          "cmdkey:/delete:test-service:test-account": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const result = await provider.delete("test-service", "test-account");
        assertEquals(result, true);
      });

      it("should handle delete exception", async () => {
        mockCommand("where", {
          "where:cmdkey": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const result = await provider.delete("test-service", "test-account");
        assertEquals(result, false);
      });
    });

    describe("list", () => {
      it("should list accounts successfully", async () => {
        const listOutput = `
Currently stored credentials:

    Target: test-service:account1
    Type: Generic
    User: account1

    Target: test-service:account2
    Type: Generic
    User: account2

    Target: other-service:account3
    Type: Generic
    User: account3
`;

        mockCommand("cmdkey", {
          "where:cmdkey": { code: 0 },
          "cmdkey:/list": { code: 0, stdout: listOutput },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const accounts = await provider.list("test-service");
        assertEquals(accounts.length, 2);
        assertEquals(accounts.includes("account1"), true);
        assertEquals(accounts.includes("account2"), true);
      });

      it("should handle list failure", async () => {
        mockCommand("cmdkey", {
          "where:cmdkey": { code: 0 },
          "cmdkey:/list": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const accounts = await provider.list("test-service");
        assertEquals(accounts, []);
      });

      it("should handle list exception", async () => {
        mockCommand("where", {
          "where:cmdkey": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const accounts = await provider.list("test-service");
        assertEquals(accounts, []);
      });
    });
  });

  describe("LinuxSecretService", () => {
    beforeEach(() => {
      mockOS("linux");
    });

    describe("isAvailable", () => {
      it("should return true when secret-tool exists", async () => {
        mockCommand("which", {
          "which:secret-tool": { code: 0, stdout: "/usr/bin/secret-tool" },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);
      });

      it("should handle which command exception", async () => {
        mockCommand("which", {
          "which:secret-tool": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const available = await provider.isAvailable();
        assertEquals(available, false);
      });
    });

    describe("store", () => {
      it("should store credential successfully", async () => {
        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:store": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, true);
      });

      it("should handle store failure", async () => {
        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:store": {
            code: 1,
            stderr: "Failed to store secret",
          },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, false);
      });

      it("should handle store exception", async () => {
        mockCommand("which", {
          "which:secret-tool": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const credential: KeychainCredential = {
          service: "test-service",
          account: "test-account",
          password: "test-password",
        };

        const result = await provider.store(credential);
        assertEquals(result, false);
      });
    });

    describe("retrieve", () => {
      it("should retrieve password successfully", async () => {
        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:lookup": {
            code: 0,
            stdout: "test-password\n",
          },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, "test-password");
      });

      it("should return null when password not found", async () => {
        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:lookup": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, null);
      });

      it("should return null for empty password", async () => {
        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:lookup": { code: 0, stdout: "" },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, null);
      });

      it("should handle retrieve exception", async () => {
        mockCommand("which", {
          "which:secret-tool": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const password = await provider.retrieve("test-service", "test-account");
        assertEquals(password, null);
      });
    });

    describe("delete", () => {
      it("should delete credential successfully", async () => {
        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:clear": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const result = await provider.delete("test-service", "test-account");
        assertEquals(result, true);
      });

      it("should handle delete failure", async () => {
        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:clear": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const result = await provider.delete("test-service", "test-account");
        assertEquals(result, false);
      });

      it("should handle delete exception", async () => {
        mockCommand("which", {
          "which:secret-tool": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const result = await provider.delete("test-service", "test-account");
        assertEquals(result, false);
      });
    });

    describe("list", () => {
      it("should list accounts successfully", async () => {
        const searchOutput = `
[/org/freedesktop/secrets/collection/login/1]
label = test-service - account1
secret =
created = 2024-01-01 00:00:00
modified = 2024-01-01 00:00:00
schema = org.freedesktop.Secret.Generic
attribute.service = test-service
attribute.account = account1

[/org/freedesktop/secrets/collection/login/2]
label = test-service - account2
secret =
created = 2024-01-01 00:00:00
modified = 2024-01-01 00:00:00
schema = org.freedesktop.Secret.Generic
attribute.service = test-service
attribute.account = account2
`;

        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:search": { code: 0, stdout: searchOutput },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const accounts = await provider.list("test-service");
        assertEquals(accounts.length, 2);
        assertEquals(accounts.includes("account1"), true);
        assertEquals(accounts.includes("account2"), true);
      });

      it("should handle list failure", async () => {
        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:search": { code: 1 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const accounts = await provider.list("test-service");
        assertEquals(accounts, []);
      });

      it("should remove duplicate accounts", async () => {
        const searchOutput = `
attribute.account = account1
attribute.account = account1
`;

        mockCommand("secret-tool", {
          "which:secret-tool": { code: 0 },
          "secret-tool:search": { code: 0, stdout: searchOutput },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        const accounts = await provider.list("test-service");
        assertEquals(accounts.length, 1);
        assertEquals(accounts[0], "account1");
      });

      it("should handle list exception", async () => {
        mockCommand("which", {
          "which:secret-tool": { code: 0 },
        });

        const provider = await getKeychainProvider();
        assertExists(provider);

        commandStub.restore();
        commandStub = stub(Deno, "Command", () => {
          throw new Error("Command error");
        });

        const accounts = await provider.list("test-service");
        assertEquals(accounts, []);
      });
    });
  });
});
