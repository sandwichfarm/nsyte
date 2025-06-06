import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { stub, restore } from "std/testing/mock.ts";
import { Command } from "@cliffy/command";
import { registerDownloadCommand } from "../../src/commands/download.ts";

Deno.test("Download Command - Registration", async (t) => {
  await t.step("should register download command with correct structure", () => {
    const program = new Command();
    registerDownloadCommand(program);
    
    const commands = program.getCommands();
    const downloadCommand = commands.find(cmd => cmd.getName() === "download");
    
    assertExists(downloadCommand);
    assertEquals(downloadCommand.getName(), "download");
    assertEquals(downloadCommand.getDescription(), "Download files from the nostr network");
  });

  await t.step("should have correct command options", () => {
    const program = new Command();
    registerDownloadCommand(program);
    
    const commands = program.getCommands();
    const downloadCommand = commands.find(cmd => cmd.getName() === "download");
    
    assertExists(downloadCommand);
    
    const options = downloadCommand.getOptions();
    const optionNames = options.map(opt => opt.name);
    
    // Check for expected options
    assertEquals(optionNames.includes("output"), true);
    assertEquals(optionNames.includes("relays"), true);
    assertEquals(optionNames.includes("privatekey"), true);
    assertEquals(optionNames.includes("bunker"), true);
    assertEquals(optionNames.includes("pubkey"), true);
    assertEquals(optionNames.includes("nbunksec"), true);
  });

  await t.step("should have proper option configurations", () => {
    const program = new Command();
    registerDownloadCommand(program);
    
    const commands = program.getCommands();
    const downloadCommand = commands.find(cmd => cmd.getName() === "download");
    
    assertExists(downloadCommand);
    
    const options = downloadCommand.getOptions();
    
    // Check output option
    const outputOption = options.find(opt => opt.name === "output");
    assertExists(outputOption);
    assertEquals(outputOption.flags, ["-o", "--output"]);
    
    // Check relays option
    const relaysOption = options.find(opt => opt.name === "relays");
    assertExists(relaysOption);
    assertEquals(relaysOption.flags, ["-r", "--relays"]);
    
    // Check privatekey option
    const privkeyOption = options.find(opt => opt.name === "privatekey");
    assertExists(privkeyOption);
    assertEquals(privkeyOption.flags, ["-k", "--privatekey"]);
  });
});

Deno.test("Download Command - Options Validation", async (t) => {
  await t.step("should validate output directory option", () => {
    const validateOutputDir = (outputDir?: string) => {
      if (!outputDir) {
        return { valid: true, dir: "." }; // Default to current directory
      }
      
      if (outputDir.trim() === "") {
        throw new Error("Output directory cannot be empty");
      }
      
      return { valid: true, dir: outputDir };
    };

    // Valid cases
    assertEquals(validateOutputDir(), { valid: true, dir: "." });
    assertEquals(validateOutputDir("./downloads"), { valid: true, dir: "./downloads" });
    assertEquals(validateOutputDir("/absolute/path"), { valid: true, dir: "/absolute/path" });
    
    // Invalid cases
    assertRejects(async () => validateOutputDir(""), Error, "cannot be empty");
    assertRejects(async () => validateOutputDir("   "), Error, "cannot be empty");
  });

  await t.step("should validate relay URLs", () => {
    const validateRelays = (relaysString?: string) => {
      if (!relaysString) {
        return []; // No relays specified
      }
      
      const relays = relaysString.split(",").map(r => r.trim()).filter(r => r.length > 0);
      
      for (const relay of relays) {
        try {
          const url = new URL(relay);
          if (!["ws:", "wss:"].includes(url.protocol)) {
            throw new Error(`Invalid relay protocol: ${relay}`);
          }
        } catch {
          throw new Error(`Invalid relay URL: ${relay}`);
        }
      }
      
      return relays;
    };

    // Valid cases
    assertEquals(validateRelays(), []);
    assertEquals(validateRelays("wss://relay.example.com"), ["wss://relay.example.com"]);
    assertEquals(validateRelays("wss://relay1.com,wss://relay2.com"), ["wss://relay1.com", "wss://relay2.com"]);
    assertEquals(validateRelays("wss://relay.com, ws://localhost:8080"), ["wss://relay.com", "ws://localhost:8080"]);
    
    // Invalid cases
    assertRejects(async () => validateRelays("https://not-a-relay.com"), Error, "Invalid relay protocol");
    assertRejects(async () => validateRelays("invalid-url"), Error, "Invalid relay URL");
    assertRejects(async () => validateRelays("wss://relay.com,invalid"), Error, "Invalid relay URL");
  });

  await t.step("should validate public key formats", () => {
    const validatePubkey = (pubkey?: string) => {
      if (!pubkey) {
        return null; // No pubkey specified
      }
      
      // Check npub format
      if (pubkey.startsWith("npub1")) {
        if (pubkey.length !== 63) {
          throw new Error("Invalid npub format: incorrect length");
        }
        return { type: "npub", value: pubkey };
      }
      
      // Check hex format
      if (/^[0-9a-fA-F]{64}$/.test(pubkey)) {
        return { type: "hex", value: pubkey };
      }
      
      throw new Error("Invalid public key format");
    };

    // Valid cases
    assertEquals(validatePubkey(), null);
    assertEquals(validatePubkey("npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq92l2sj"), 
      { type: "npub", value: "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq92l2sj" });
    assertEquals(validatePubkey("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"), 
      { type: "hex", value: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" });
    
    // Invalid cases
    assertRejects(async () => validatePubkey("npub1short"), Error, "incorrect length");
    assertRejects(async () => validatePubkey("invalid-key"), Error, "Invalid public key format");
    assertRejects(async () => validatePubkey("123"), Error, "Invalid public key format");
  });

  await t.step("should validate private key formats", () => {
    const validatePrivateKey = (privkey?: string) => {
      if (!privkey) {
        return null; // No private key specified
      }
      
      // Check nsec format
      if (privkey.startsWith("nsec1")) {
        if (privkey.length !== 63) {
          throw new Error("Invalid nsec format: incorrect length");
        }
        return { type: "nsec", value: privkey };
      }
      
      // Check hex format
      if (/^[0-9a-fA-F]{64}$/.test(privkey)) {
        return { type: "hex", value: privkey };
      }
      
      throw new Error("Invalid private key format");
    };

    // Valid cases
    assertEquals(validatePrivateKey(), null);
    assertEquals(validatePrivateKey("nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsscfuwn"), 
      { type: "nsec", value: "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsscfuwn" });
    assertEquals(validatePrivateKey("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"), 
      { type: "hex", value: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" });
    
    // Invalid cases
    assertRejects(async () => validatePrivateKey("nsec1short"), Error, "incorrect length");
    assertRejects(async () => validatePrivateKey("invalid-key"), Error, "Invalid private key format");
  });
});

Deno.test("Download Command - Workflow Logic", async (t) => {
  await t.step("should validate authentication requirements", () => {
    const validateAuth = (options: { privatekey?: string; bunker?: string; nbunksec?: string; pubkey?: string }) => {
      const hasPrivateAuth = !!(options.privatekey || options.bunker || options.nbunksec);
      const hasPubkeyOnly = !!options.pubkey && !hasPrivateAuth;
      
      if (!hasPrivateAuth && !hasPubkeyOnly) {
        throw new Error("Must provide either authentication (private key/bunker) or a public key to download from");
      }
      
      if (hasPrivateAuth && options.pubkey) {
        throw new Error("Cannot specify both authentication and pubkey - use auth to download your own files, or pubkey to download someone else's");
      }
      
      return {
        mode: hasPrivateAuth ? "authenticated" : "public",
        canDownloadPrivate: hasPrivateAuth
      };
    };

    // Valid cases
    assertEquals(validateAuth({ privatekey: "nsec123..." }), { mode: "authenticated", canDownloadPrivate: true });
    assertEquals(validateAuth({ bunker: "bunker://..." }), { mode: "authenticated", canDownloadPrivate: true });
    assertEquals(validateAuth({ nbunksec: "nbunk..." }), { mode: "authenticated", canDownloadPrivate: true });
    assertEquals(validateAuth({ pubkey: "npub123..." }), { mode: "public", canDownloadPrivate: false });
    
    // Invalid cases
    assertRejects(async () => validateAuth({}), Error, "Must provide either");
    assertRejects(async () => validateAuth({ privatekey: "nsec123...", pubkey: "npub123..." }), Error, "Cannot specify both");
  });

  await t.step("should handle download target resolution", () => {
    const resolveDownloadTarget = (options: { pubkey?: string; privatekey?: string }) => {
      if (options.pubkey) {
        return {
          targetPubkey: options.pubkey,
          downloadingOwnFiles: false
        };
      }
      
      if (options.privatekey) {
        // In real implementation, this would derive pubkey from private key
        const derivedPubkey = "derived_pubkey_from_private_key";
        return {
          targetPubkey: derivedPubkey,
          downloadingOwnFiles: true
        };
      }
      
      throw new Error("No target specified for download");
    };

    // Test cases
    const result1 = resolveDownloadTarget({ pubkey: "npub123..." });
    assertEquals(result1.targetPubkey, "npub123...");
    assertEquals(result1.downloadingOwnFiles, false);
    
    const result2 = resolveDownloadTarget({ privatekey: "nsec123..." });
    assertEquals(result2.targetPubkey, "derived_pubkey_from_private_key");
    assertEquals(result2.downloadingOwnFiles, true);
    
    assertRejects(async () => resolveDownloadTarget({}), Error, "No target specified");
  });

  await t.step("should plan download strategy", () => {
    const planDownloadStrategy = (files: Array<{ name: string; size: number; path: string }>, outputDir: string) => {
      const strategy = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        outputDir,
        batches: [] as Array<Array<{ name: string; size: number; path: string }>>,
        conflicts: [] as string[]
      };
      
      // Check for potential conflicts (files with same name)
      const nameMap = new Map<string, number>();
      for (const file of files) {
        const count = nameMap.get(file.name) || 0;
        nameMap.set(file.name, count + 1);
        if (count > 0) {
          strategy.conflicts.push(file.name);
        }
      }
      
      // Create batches (max 10 files per batch for this test)
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        strategy.batches.push(files.slice(i, i + batchSize));
      }
      
      return strategy;
    };

    const testFiles = [
      { name: "index.html", size: 1024, path: "/index.html" },
      { name: "style.css", size: 512, path: "/style.css" },
      { name: "script.js", size: 2048, path: "/script.js" },
      { name: "index.html", size: 1000, path: "/subdir/index.html" }, // Conflict
    ];

    const strategy = planDownloadStrategy(testFiles, "./downloads");
    
    assertEquals(strategy.totalFiles, 4);
    assertEquals(strategy.totalSize, 4584);
    assertEquals(strategy.outputDir, "./downloads");
    assertEquals(strategy.batches.length, 1); // All files fit in one batch
    assertEquals(strategy.conflicts, ["index.html"]);
  });
});

Deno.test("Download Command - Error Scenarios", async (t) => {
  await t.step("should handle network connectivity issues", () => {
    const handleNetworkError = (error: Error) => {
      const message = error.message.toLowerCase();
      
      if (message.includes("network") || message.includes("connection")) {
        return {
          type: "network",
          suggestion: "Check your internet connection and relay availability",
          retry: true
        };
      }
      
      if (message.includes("timeout")) {
        return {
          type: "timeout",
          suggestion: "Try again or use different relays",
          retry: true
        };
      }
      
      if (message.includes("not found")) {
        return {
          type: "not_found",
          suggestion: "Verify the public key has published files",
          retry: false
        };
      }
      
      return {
        type: "unknown",
        suggestion: "Check error details and try again",
        retry: false
      };
    };

    const networkError = handleNetworkError(new Error("Network connection failed"));
    assertEquals(networkError.type, "network");
    assertEquals(networkError.retry, true);

    const timeoutError = handleNetworkError(new Error("Request timeout"));
    assertEquals(timeoutError.type, "timeout");
    assertEquals(timeoutError.retry, true);

    const notFoundError = handleNetworkError(new Error("Files not found"));
    assertEquals(notFoundError.type, "not_found");
    assertEquals(notFoundError.retry, false);
  });

  await t.step("should handle file system errors", () => {
    const handleFileSystemError = (error: Error, context: string) => {
      const message = error.message.toLowerCase();
      
      if (message.includes("permission denied") || message.includes("eacces")) {
        return {
          type: "permission",
          suggestion: `Check write permissions for ${context}`,
          canContinue: false
        };
      }
      
      if (message.includes("no space") || message.includes("enospc")) {
        return {
          type: "disk_space",
          suggestion: "Free up disk space and try again",
          canContinue: false
        };
      }
      
      if (message.includes("file exists") || message.includes("eexist")) {
        return {
          type: "file_exists",
          suggestion: "Use --force to overwrite existing files",
          canContinue: true
        };
      }
      
      return {
        type: "unknown_fs",
        suggestion: "Check file system and try again",
        canContinue: false
      };
    };

    const permError = handleFileSystemError(new Error("Permission denied"), "./downloads");
    assertEquals(permError.type, "permission");
    assertEquals(permError.canContinue, false);

    const spaceError = handleFileSystemError(new Error("No space left on device"), "./downloads");
    assertEquals(spaceError.type, "disk_space");
    assertEquals(spaceError.canContinue, false);

    const existsError = handleFileSystemError(new Error("File exists"), "./downloads/file.txt");
    assertEquals(existsError.type, "file_exists");
    assertEquals(existsError.canContinue, true);
  });

  await t.step("should handle malformed file data", () => {
    const validateFileData = (fileData: { content?: Uint8Array; hash?: string; size?: number }) => {
      const issues: string[] = [];
      
      if (!fileData.content) {
        issues.push("Missing file content");
      }
      
      if (!fileData.hash) {
        issues.push("Missing file hash");
      } else if (fileData.hash.length !== 64) {
        issues.push("Invalid hash format");
      }
      
      if (fileData.size !== undefined && fileData.content && fileData.content.length !== fileData.size) {
        issues.push("Content size mismatch");
      }
      
      return {
        valid: issues.length === 0,
        issues
      };
    };

    // Valid file data
    const validData = {
      content: new Uint8Array([1, 2, 3, 4]),
      hash: "a".repeat(64),
      size: 4
    };
    const validResult = validateFileData(validData);
    assertEquals(validResult.valid, true);
    assertEquals(validResult.issues, []);

    // Invalid file data
    const invalidData = {
      content: undefined,
      hash: "short",
      size: 10
    };
    const invalidResult = validateFileData(invalidData);
    assertEquals(invalidResult.valid, false);
    assertEquals(invalidResult.issues.length, 3);
  });
});