import { assertEquals, assertExists, assertThrows } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { restore, stub } from "jsr:@std/testing/mock";
import {
  ensureSystemConfigDir,
  fileExists,
  getHomeDir,
  getSystemConfigDir,
} from "../../src/lib/secrets/utils.ts";
import * as fs from "@std/fs/ensure-dir";

describe("secrets/utils - comprehensive branch coverage", () => {
  const originalEnvGet = Deno.env.get;
  const originalBuildOS = Deno.build.os;
  let envGetStub: any;
  let buildStub: any;

  beforeEach(() => {
    // Create a map for environment variables
    const envVars = new Map<string, string>();

    // Mock Deno.env.get
    envGetStub = stub(Deno.env, "get", (key: string) => {
      return envVars.get(key) || undefined;
    });

    // Helper to set env vars in our mock
    (globalThis as any).mockEnv = (key: string, value: string | undefined) => {
      if (value === undefined) {
        envVars.delete(key);
      } else {
        envVars.set(key, value);
      }
    };
  });

  afterEach(() => {
    restore();
    delete (globalThis as any).mockEnv;
    // Reset Deno.build
    if (buildStub) {
      buildStub.restore();
    }
  });

  const mockOS = (os: string) => {
    // Create a new build object with mocked OS
    const mockBuild = {
      ...Deno.build,
      os: os as typeof Deno.build.os,
    };

    // Stub the entire build object
    if (buildStub) {
      buildStub.restore();
    }
    buildStub = stub(Deno, "build", mockBuild);
  };

  describe("getHomeDir", () => {
    it("should return USERPROFILE on Windows", () => {
      mockOS("windows");
      (globalThis as any).mockEnv("USERPROFILE", "C:\\Users\\TestUser");

      const result = getHomeDir();
      assertEquals(result, "C:\\Users\\TestUser");
    });

    it("should return null when USERPROFILE not set on Windows", () => {
      mockOS("windows");
      (globalThis as any).mockEnv("USERPROFILE", undefined);

      const result = getHomeDir();
      assertEquals(result, null);
    });

    it("should return HOME on Linux", () => {
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", "/home/testuser");

      const result = getHomeDir();
      assertEquals(result, "/home/testuser");
    });

    it("should return HOME on macOS", () => {
      mockOS("darwin");
      (globalThis as any).mockEnv("HOME", "/Users/testuser");

      const result = getHomeDir();
      assertEquals(result, "/Users/testuser");
    });

    it("should return null when HOME not set on non-Windows", () => {
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", undefined);

      const result = getHomeDir();
      assertEquals(result, null);
    });

    it("should handle other OS types", () => {
      mockOS("freebsd" as any);
      (globalThis as any).mockEnv("HOME", "/home/freebsduser");

      const result = getHomeDir();
      assertEquals(result, "/home/freebsduser");
    });
  });

  describe("getSystemConfigDir", () => {
    it("should return null when home dir is not available", () => {
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", undefined);

      const result = getSystemConfigDir();
      assertEquals(result, null);
    });

    describe("Linux", () => {
      it("should use XDG_CONFIG_HOME when set", () => {
        mockOS("linux");
        (globalThis as any).mockEnv("HOME", "/home/user");
        (globalThis as any).mockEnv("XDG_CONFIG_HOME", "/custom/config");

        const result = getSystemConfigDir();
        assertEquals(result, "/custom/config/nsite");
      });

      it("should use ~/.config when XDG_CONFIG_HOME not set", () => {
        mockOS("linux");
        (globalThis as any).mockEnv("HOME", "/home/user");
        (globalThis as any).mockEnv("XDG_CONFIG_HOME", undefined);

        const result = getSystemConfigDir();
        assertEquals(result, "/home/user/.config/nsite");
      });
    });

    describe("macOS", () => {
      it("should use Library/Application Support", () => {
        mockOS("darwin");
        (globalThis as any).mockEnv("HOME", "/Users/testuser");

        const result = getSystemConfigDir();
        assertEquals(result, "/Users/testuser/Library/Application Support/nsyte");
      });
    });

    describe("Windows", () => {
      it("should use APPDATA when set", () => {
        mockOS("windows");
        (globalThis as any).mockEnv("USERPROFILE", "C:\\Users\\TestUser");
        (globalThis as any).mockEnv("APPDATA", "C:\\Users\\TestUser\\AppData\\Roaming");

        const result = getSystemConfigDir();
        assertEquals(result, "C:\\Users\\TestUser\\AppData\\Roaming\\nsite");
      });

      it("should fallback to constructed path when APPDATA not set", () => {
        mockOS("windows");
        (globalThis as any).mockEnv("USERPROFILE", "C:\\Users\\TestUser");
        (globalThis as any).mockEnv("APPDATA", undefined);

        const result = getSystemConfigDir();
        assertEquals(result, "C:\\Users\\TestUser\\AppData\\Roaming\\nsite");
      });
    });

    describe("Other OS", () => {
      it("should use ~/.nsite for unknown OS", () => {
        mockOS("freebsd" as any);
        (globalThis as any).mockEnv("HOME", "/home/freebsduser");

        const result = getSystemConfigDir();
        assertEquals(result, "/home/freebsduser/.nsite");
      });

      it("should handle custom OS types", () => {
        mockOS("android" as any);
        (globalThis as any).mockEnv("HOME", "/data/user");

        const result = getSystemConfigDir();
        assertEquals(result, "/data/user/.nsite");
      });
    });
  });

  describe("ensureSystemConfigDir", () => {
    it("should return null when config dir cannot be determined", () => {
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", undefined);

      const result = ensureSystemConfigDir();
      assertEquals(result, null);
    });

    it("should create directory and return path on success", () => {
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", "/home/user");

      const ensureDirStub = stub(fs, "ensureDirSync", () => {});

      const result = ensureSystemConfigDir();
      assertEquals(result, "/home/user/.config/nsite");
      assertEquals(ensureDirStub.calls.length, 1);
      assertEquals(ensureDirStub.calls[0].args[0], "/home/user/.config/nsite");
    });

    it("should handle permission errors", () => {
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", "/home/user");

      const ensureDirStub = stub(fs, "ensureDirSync", () => {
        throw new Deno.errors.PermissionDenied("Permission denied");
      });

      const result = ensureSystemConfigDir();
      assertEquals(result, null);
    });

    it("should handle file system errors", () => {
      mockOS("darwin");
      (globalThis as any).mockEnv("HOME", "/Users/test");

      const ensureDirStub = stub(fs, "ensureDirSync", () => {
        throw new Error("Disk full");
      });

      const result = ensureSystemConfigDir();
      assertEquals(result, null);
    });

    it("should handle non-Error exceptions", () => {
      mockOS("windows");
      (globalThis as any).mockEnv("USERPROFILE", "C:\\Users\\Test");
      (globalThis as any).mockEnv("APPDATA", "C:\\Users\\Test\\AppData\\Roaming");

      const ensureDirStub = stub(fs, "ensureDirSync", () => {
        throw "String error";
      });

      const result = ensureSystemConfigDir();
      assertEquals(result, null);
    });

    it("should work across all platforms", () => {
      const platforms: Array<{ os: typeof Deno.build.os; path: string }> = [
        { os: "linux", path: "/home/user/.config/nsite" },
        { os: "darwin", path: "/Users/user/Library/Application Support/nsyte" },
        { os: "windows", path: "C:\\Users\\user\\AppData\\Roaming\\nsite" },
      ];

      for (const { os, path } of platforms) {
        mockOS(os);
        if (os === "windows") {
          (globalThis as any).mockEnv("USERPROFILE", "C:\\Users\\user");
          (globalThis as any).mockEnv("APPDATA", "C:\\Users\\user\\AppData\\Roaming");
        } else {
          (globalThis as any).mockEnv("HOME", os === "darwin" ? "/Users/user" : "/home/user");
        }

        const ensureDirStub = stub(fs, "ensureDirSync", () => {});

        const result = ensureSystemConfigDir();
        assertEquals(result, path);

        ensureDirStub.restore();
      }
    });
  });

  describe("fileExists", () => {
    it("should return true for existing file", () => {
      const statStub = stub(Deno, "statSync", () => ({
        isFile: true,
        isDirectory: false,
        isSymlink: false,
        size: 100,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      }));

      const result = fileExists("/path/to/file.txt");
      assertEquals(result, true);
      assertEquals(statStub.calls.length, 1);
      assertEquals(statStub.calls[0].args[0], "/path/to/file.txt");
    });

    it("should return false for directory", () => {
      const statStub = stub(Deno, "statSync", () => ({
        isFile: false,
        isDirectory: true,
        isSymlink: false,
        size: 0,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      }));

      const result = fileExists("/path/to/directory");
      assertEquals(result, false);
    });

    it("should return false for non-existent file", () => {
      const statStub = stub(Deno, "statSync", () => {
        throw new Deno.errors.NotFound("File not found");
      });

      const result = fileExists("/non/existent/file.txt");
      assertEquals(result, false);
    });

    it("should rethrow non-NotFound errors", () => {
      const statStub = stub(Deno, "statSync", () => {
        throw new Deno.errors.PermissionDenied("Permission denied");
      });

      assertThrows(
        () => fileExists("/protected/file.txt"),
        Deno.errors.PermissionDenied,
        "Permission denied",
      );
    });

    it("should handle generic errors", () => {
      const statStub = stub(Deno, "statSync", () => {
        throw new Error("Generic error");
      });

      assertThrows(
        () => fileExists("/error/file.txt"),
        Error,
        "Generic error",
      );
    });

    it("should handle symlinks", () => {
      const statStub = stub(Deno, "statSync", () => ({
        isFile: false,
        isDirectory: false,
        isSymlink: true,
        size: 0,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      }));

      const result = fileExists("/path/to/symlink");
      assertEquals(result, false);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty strings", () => {
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", "");

      const homeDir = getHomeDir();
      assertEquals(homeDir, "");

      // Empty home should lead to paths starting with /
      const configDir = getSystemConfigDir();
      assertExists(configDir);
    });

    it("should handle paths with spaces", () => {
      mockOS("windows");
      (globalThis as any).mockEnv("USERPROFILE", "C:\\Users\\Test User");
      (globalThis as any).mockEnv("APPDATA", "C:\\Users\\Test User\\AppData\\Roaming");

      const configDir = getSystemConfigDir();
      assertEquals(configDir, "C:\\Users\\Test User\\AppData\\Roaming\\nsite");
    });

    it("should handle Unicode in paths", () => {
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", "/home/用户");

      const configDir = getSystemConfigDir();
      assertEquals(configDir, "/home/用户/.config/nsite");
    });

    it("should handle very long paths", () => {
      const longPath = "/home/" + "a".repeat(200);
      mockOS("linux");
      (globalThis as any).mockEnv("HOME", longPath);

      const configDir = getSystemConfigDir();
      assertEquals(configDir, longPath + "/.config/nsite");
    });
  });
});
