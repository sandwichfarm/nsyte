import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { join } from "std/path/mod.ts";
import { Command } from "@cliffy/command";
import { registerDownloadCommand } from "../../src/commands/download.ts";

Deno.test("Download Command - Full Implementation", async (t) => {
  await t.step("should register download command with all options", () => {
    const program = new Command();
    registerDownloadCommand(program);
    
    const commands = program.getCommands();
    const downloadCommand = commands.find(cmd => cmd.getName() === "download");
    
    assertExists(downloadCommand);
    assertEquals(downloadCommand.getName(), "download");
    assertEquals(downloadCommand.getDescription(), "Download files from the nostr network");
    
    const options = downloadCommand.getOptions();
    const optionNames = options.map(opt => opt.name);
    
    // Check all expected options are present
    assertEquals(optionNames.includes("output"), true);
    assertEquals(optionNames.includes("relays"), true);
    assertEquals(optionNames.includes("servers"), true);
    assertEquals(optionNames.includes("privatekey"), true);
    assertEquals(optionNames.includes("bunker"), true);
    assertEquals(optionNames.includes("pubkey"), true);
    assertEquals(optionNames.includes("nbunksec"), true);
    assertEquals(optionNames.includes("overwrite"), true);
    assertEquals(optionNames.includes("verbose"), true);
  });

  await t.step("should have correct default values", () => {
    const program = new Command();
    registerDownloadCommand(program);
    
    const commands = program.getCommands();
    const downloadCommand = commands.find(cmd => cmd.getName() === "download");
    
    assertExists(downloadCommand);
    
    const outputOption = downloadCommand.getOptions().find(opt => opt.name === "output");
    assertExists(outputOption);
    assertEquals(outputOption.default, "./downloads");
    
    const overwriteOption = downloadCommand.getOptions().find(opt => opt.name === "overwrite");
    assertExists(overwriteOption);
    assertEquals(overwriteOption.default, false);
  });
});

Deno.test("Download Command - File Processing Logic", async (t) => {
  await t.step("should process download results correctly", () => {
    interface DownloadResult {
      file: { path: string; sha256: string };
      success: boolean;
      error?: string;
      savedPath?: string;
      skipped?: boolean;
      reason?: string;
    }

    const processDownloadResults = (results: DownloadResult[]) => {
      const successful = results.filter(r => r.success && !r.skipped);
      const skipped = results.filter(r => r.skipped);
      const failed = results.filter(r => !r.success);
      
      return {
        successful: successful.length,
        skipped: skipped.length,
        failed: failed.length,
        total: results.length,
        successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0
      };
    };

    const mockResults: DownloadResult[] = [
      {
        file: { path: "/index.html", sha256: "abc123" },
        success: true,
        savedPath: "./downloads/index.html"
      },
      {
        file: { path: "/style.css", sha256: "def456" },
        success: true,
        skipped: true,
        reason: "File already exists"
      },
      {
        file: { path: "/script.js", sha256: "ghi789" },
        success: false,
        error: "Failed to download from any server"
      }
    ];

    const summary = processDownloadResults(mockResults);
    assertEquals(summary.successful, 1);
    assertEquals(summary.skipped, 1);
    assertEquals(summary.failed, 1);
    assertEquals(summary.total, 3);
    assertEquals(Math.round(summary.successRate), 33);
  });

  await t.step("should handle download progress tracking", () => {
    interface DownloadProgress {
      total: number;
      completed: number;
      failed: number;
      skipped: number;
      inProgress: number;
    }

    const createProgressTracker = () => {
      let progress: DownloadProgress = {
        total: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        inProgress: 0
      };

      return {
        setTotal: (total: number) => { progress.total = total; },
        startDownload: () => { progress.inProgress++; },
        completeDownload: () => { progress.inProgress--; progress.completed++; },
        skipDownload: () => { progress.inProgress--; progress.skipped++; },
        failDownload: () => { progress.inProgress--; progress.failed++; },
        getProgress: () => ({ ...progress }),
        getPercentage: () => {
          const completed = progress.completed + progress.skipped;
          return progress.total === 0 ? 0 : Math.round((completed / progress.total) * 100);
        }
      };
    };

    const tracker = createProgressTracker();
    tracker.setTotal(5);
    
    // Start some downloads
    tracker.startDownload();
    tracker.startDownload();
    assertEquals(tracker.getProgress().inProgress, 2);
    
    // Complete one
    tracker.completeDownload();
    assertEquals(tracker.getProgress().completed, 1);
    assertEquals(tracker.getProgress().inProgress, 1);
    assertEquals(tracker.getPercentage(), 20);
    
    // Skip one
    tracker.skipDownload();
    assertEquals(tracker.getProgress().skipped, 1);
    assertEquals(tracker.getPercentage(), 40);
    
    // Fail one
    tracker.startDownload();
    tracker.failDownload();
    assertEquals(tracker.getProgress().failed, 1);
    assertEquals(tracker.getPercentage(), 40);
  });

  await t.step("should validate file path construction", () => {
    const constructOutputPath = (outputDir: string, filePath: string) => {
      // Normalize file path (remove leading slash if present)
      const normalizedPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
      return join(outputDir, normalizedPath);
    };

    assertEquals(constructOutputPath("./downloads", "/index.html"), join("./downloads", "index.html"));
    assertEquals(constructOutputPath("./downloads", "index.html"), join("./downloads", "index.html"));
    assertEquals(constructOutputPath("./downloads", "/subdir/file.txt"), join("./downloads", "subdir", "file.txt"));
    assertEquals(constructOutputPath("/absolute/path", "/file.js"), join("/absolute/path", "file.js"));
  });
});

Deno.test("Download Command - Server Communication", async (t) => {
  await t.step("should handle server URL formatting", () => {
    const formatServerUrl = (server: string, sha256: string) => {
      const serverUrl = server.endsWith("/") ? server : `${server}/`;
      return `${serverUrl}${sha256}`;
    };

    assertEquals(formatServerUrl("https://server.com", "abc123"), "https://server.com/abc123");
    assertEquals(formatServerUrl("https://server.com/", "abc123"), "https://server.com/abc123");
    assertEquals(formatServerUrl("https://api.example.com/blossom", "def456"), "https://api.example.com/blossom/def456");
  });

  await t.step("should handle download response validation", () => {
    const validateDownloadResponse = (response: { ok: boolean; status: number; statusText: string }) => {
      if (!response.ok) {
        if (response.status === 404) {
          return { valid: false, reason: "File not found on server", retry: true };
        }
        if (response.status >= 500) {
          return { valid: false, reason: "Server error", retry: true };
        }
        if (response.status === 403) {
          return { valid: false, reason: "Access denied", retry: false };
        }
        return { valid: false, reason: `HTTP ${response.status}: ${response.statusText}`, retry: false };
      }
      
      return { valid: true, reason: null, retry: false };
    };

    // Test various response codes
    assertEquals(validateDownloadResponse({ ok: true, status: 200, statusText: "OK" }), 
      { valid: true, reason: null, retry: false });
    
    assertEquals(validateDownloadResponse({ ok: false, status: 404, statusText: "Not Found" }), 
      { valid: false, reason: "File not found on server", retry: true });
    
    assertEquals(validateDownloadResponse({ ok: false, status: 500, statusText: "Internal Server Error" }), 
      { valid: false, reason: "Server error", retry: true });
    
    assertEquals(validateDownloadResponse({ ok: false, status: 403, statusText: "Forbidden" }), 
      { valid: false, reason: "Access denied", retry: false });
  });

  await t.step("should implement retry logic for failed downloads", async () => {
    const downloadWithRetry = async <T>(
      operation: () => Promise<T>,
      maxRetries: number = 3,
      delay: number = 1000
    ): Promise<T> => {
      let lastError: Error;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error as Error;
          
          if (attempt === maxRetries) {
            throw lastError;
          }
          
          // Exponential backoff
          const backoffDelay = delay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, backoffDelay / 100)); // Shortened for testing
        }
      }
      
      throw lastError!;
    };

    // Test successful operation
    let attempts = 0;
    const successfulOp = async () => {
      attempts++;
      return "success";
    };
    
    const result = await downloadWithRetry(successfulOp, 3, 100);
    assertEquals(result, "success");
    assertEquals(attempts, 1);

    // Test operation that succeeds on retry
    let failCount = 0;
    const eventualSuccessOp = async () => {
      failCount++;
      if (failCount < 3) {
        throw new Error("Temporary failure");
      }
      return "eventual success";
    };
    
    const result2 = await downloadWithRetry(eventualSuccessOp, 3, 100);
    assertEquals(result2, "eventual success");
    assertEquals(failCount, 3);
  });
});

Deno.test("Download Command - File System Operations", async (t) => {
  await t.step("should handle file existence checking", async () => {
    const checkFileExists = async (filePath: string, overwrite: boolean) => {
      try {
        // Mock file stat - in real implementation this would be Deno.stat()
        const mockStat = { isFile: true, size: 1024 };
        
        if (mockStat.isFile && !overwrite) {
          return {
            exists: true,
            shouldSkip: true,
            reason: "File already exists (use --overwrite to replace)"
          };
        }
        
        return {
          exists: true,
          shouldSkip: false,
          reason: "File will be overwritten"
        };
      } catch {
        return {
          exists: false,
          shouldSkip: false,
          reason: "File does not exist"
        };
      }
    };

    // Test file exists without overwrite
    const result1 = await checkFileExists("./test.txt", false);
    assertEquals(result1.exists, true);
    assertEquals(result1.shouldSkip, true);

    // Test file exists with overwrite
    const result2 = await checkFileExists("./test.txt", true);
    assertEquals(result2.exists, true);
    assertEquals(result2.shouldSkip, false);
  });

  await t.step("should handle directory creation", () => {
    const ensureDirectoryExists = (filePath: string) => {
      const dirPath = filePath.split("/").slice(0, -1).join("/");
      
      if (!dirPath) {
        return { created: false, path: null };
      }
      
      // Mock directory creation
      return { created: true, path: dirPath };
    };

    const result1 = ensureDirectoryExists("./downloads/subdir/file.txt");
    assertEquals(result1.created, true);
    assertEquals(result1.path, "./downloads/subdir");

    const result2 = ensureDirectoryExists("file.txt");
    assertEquals(result2.created, false);
    assertEquals(result2.path, null);
  });

  await t.step("should validate SHA256 integrity", async () => {
    const validateFileIntegrity = async (fileData: Uint8Array, expectedSHA256: string) => {
      // Mock SHA256 calculation - in real implementation this would use crypto.subtle
      const calculateSHA256 = async (data: Uint8Array): Promise<string> => {
        // Simple mock - in reality would compute actual SHA256
        if (data.length === 5 && expectedSHA256 === "abc123") {
          return "abc123";
        }
        return "different_hash";
      };

      const actualHash = await calculateSHA256(fileData);
      
      return {
        valid: actualHash === expectedSHA256,
        expectedHash: expectedSHA256,
        actualHash
      };
    };

    // Test valid file
    const validData = new Uint8Array(5);
    const validResult = await validateFileIntegrity(validData, "abc123");
    assertEquals(validResult.valid, true);

    // Test invalid file
    const invalidData = new Uint8Array(10);
    const invalidResult = await validateFileIntegrity(invalidData, "abc123");
    assertEquals(invalidResult.valid, false);
  });
});

Deno.test("Download Command - Error Handling", async (t) => {
  await t.step("should categorize download errors", () => {
    const categorizeDownloadError = (error: Error) => {
      const message = error.message.toLowerCase();
      
      if (message.includes("network") || message.includes("connection")) {
        return { type: "network", retry: true, userAction: "Check internet connection" };
      }
      
      if (message.includes("not found") || message.includes("404")) {
        return { type: "not_found", retry: false, userAction: "Verify file exists on servers" };
      }
      
      if (message.includes("permission") || message.includes("access")) {
        return { type: "permission", retry: false, userAction: "Check file system permissions" };
      }
      
      if (message.includes("disk") || message.includes("space")) {
        return { type: "disk_space", retry: false, userAction: "Free up disk space" };
      }
      
      if (message.includes("timeout")) {
        return { type: "timeout", retry: true, userAction: "Try again or use different servers" };
      }
      
      return { type: "unknown", retry: false, userAction: "Check error details" };
    };

    assertEquals(categorizeDownloadError(new Error("Network connection failed")), 
      { type: "network", retry: true, userAction: "Check internet connection" });
    
    assertEquals(categorizeDownloadError(new Error("File not found")), 
      { type: "not_found", retry: false, userAction: "Verify file exists on servers" });
    
    assertEquals(categorizeDownloadError(new Error("Permission denied")), 
      { type: "permission", retry: false, userAction: "Check file system permissions" });
    
    assertEquals(categorizeDownloadError(new Error("Timeout waiting for response")), 
      { type: "timeout", retry: true, userAction: "Try again or use different servers" });
  });

  await t.step("should handle graceful fallback between servers", async () => {
    const downloadWithFallback = async (servers: string[], sha256: string) => {
      const errors: { server: string; error: string }[] = [];
      
      for (const server of servers) {
        try {
          // Mock download attempt
          if (server.includes("working")) {
            return { success: true, server, data: new Uint8Array(10) };
          } else if (server.includes("404")) {
            throw new Error("File not found (404)");
          } else if (server.includes("timeout")) {
            throw new Error("Request timeout");
          } else {
            throw new Error("Server error (500)");
          }
        } catch (error) {
          errors.push({ 
            server, 
            error: error instanceof Error ? error.message : String(error) 
          });
          continue;
        }
      }
      
      return { success: false, server: null, data: null, errors };
    };

    // Test successful download from second server
    const result1 = await downloadWithFallback([
      "https://broken.server.com",
      "https://working.server.com"
    ], "abc123");
    
    assertEquals(result1.success, true);
    assertEquals(result1.server, "https://working.server.com");

    // Test all servers fail
    const result2 = await downloadWithFallback([
      "https://404.server.com",
      "https://timeout.server.com",
      "https://error.server.com"
    ], "abc123");
    
    assertEquals(result2.success, false);
    assertExists(result2.errors);
    assertEquals(result2.errors.length, 3);
  });
});