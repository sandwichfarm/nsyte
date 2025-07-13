import { createLogger } from "./logger.ts";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { NostrEvent } from "nostr-tools";

const logger = createLogger("blossom-checker");

interface BlobCheckResult {
  hash: string;
  found: boolean;
  status?: number;
}

interface HashVerificationResult {
  hash: string;
  expectedHash: string;
  valid: boolean;
  downloadTime: number;
  fileSize: number;
}

interface BlossomServerResult {
  url: string;
  available: boolean;
  error?: string;
  responseTime?: number;
  blobChecks?: BlobCheckResult[];
  hashVerification?: HashVerificationResult;
  filesChecked?: number;
  filesFound?: number;
}

export async function checkBlossomServers(
  servers: string[], 
  nsiteEvents: NostrEvent[] = []
): Promise<BlossomServerResult[]> {
  const results: BlossomServerResult[] = [];
  
  for (const server of servers) {
    const result = await checkBlossomServer(server, nsiteEvents);
    results.push(result);
  }
  
  return results;
}

async function checkBlossomServer(
  serverUrl: string, 
  nsiteEvents: NostrEvent[] = []
): Promise<BlossomServerResult> {
  const startTime = Date.now();
  
  try {
    // Normalize the URL
    let url = serverUrl;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    
    // Remove trailing slash
    url = url.replace(/\/$/, "");
    
    // First check basic server availability
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    
    const responseTime = Date.now() - startTime;
    
    if (response.status >= 500) {
      return {
        url: serverUrl,
        available: false,
        error: `Server error: ${response.status}`,
        responseTime,
      };
    }

    // Server is available, now check blobs if we have nsite events
    const result: BlossomServerResult = {
      url: serverUrl,
      available: true,
      responseTime,
    };

    if (nsiteEvents.length > 0) {
      // Extract blob hashes from nsite events
      const blobHashes = extractBlobHashes(nsiteEvents);
      
      if (blobHashes.length > 0) {
        // Check up to 20 blobs for 404 status
        const maxChecks = Math.min(20, blobHashes.length);
        const hashesToCheck = blobHashes.slice(0, maxChecks);
        
        const blobChecks = await checkBlobsAvailability(url, hashesToCheck);
        const foundBlobs = blobChecks.filter(check => check.found);
        
        result.blobChecks = blobChecks;
        result.filesChecked = blobChecks.length;
        result.filesFound = foundBlobs.length;
        
        // Pick one random found blob to verify hash
        if (foundBlobs.length > 0) {
          const randomBlob = foundBlobs[Math.floor(Math.random() * foundBlobs.length)];
          result.hashVerification = await verifyBlobHash(url, randomBlob.hash);
        }
      }
    }

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "Timeout (5s)";
      } else if (error.message.includes("fetch failed")) {
        errorMessage = "Connection failed";
      } else {
        errorMessage = error.message;
      }
    }
    
    logger.debug(`Failed to check ${serverUrl}: ${errorMessage}`);
    
    return {
      url: serverUrl,
      available: false,
      error: errorMessage,
      responseTime,
    };
  }
}

function extractBlobHashes(nsiteEvents: NostrEvent[]): string[] {
  const hashes: string[] = [];
  
  for (const event of nsiteEvents) {
    // Look for 'x' tags which contain SHA-256 hashes
    const hashTags = event.tags.filter(tag => tag[0] === "x" && tag[1]);
    for (const tag of hashTags) {
      if (tag[1] && tag[1].length === 64) { // SHA-256 is 64 hex characters
        hashes.push(tag[1]);
      }
    }
  }
  
  return [...new Set(hashes)]; // Remove duplicates
}

async function checkBlobsAvailability(
  serverUrl: string, 
  hashes: string[]
): Promise<BlobCheckResult[]> {
  const results: BlobCheckResult[] = [];
  
  for (const hash of hashes) {
    try {
      const response = await fetch(`${serverUrl}/${hash}`, {
        method: "HEAD", // Use HEAD to avoid downloading
        signal: AbortSignal.timeout(3000),
      });
      
      results.push({
        hash,
        found: response.status === 200,
        status: response.status,
      });
    } catch (error) {
      results.push({
        hash,
        found: false,
      });
    }
  }
  
  return results;
}

async function verifyBlobHash(
  serverUrl: string, 
  expectedHash: string
): Promise<HashVerificationResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${serverUrl}/${expectedHash}`, {
      method: "GET",
      signal: AbortSignal.timeout(30000), // 30 second timeout for download
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const fileData = await response.arrayBuffer();
    const downloadTime = Date.now() - startTime;
    
    // Calculate SHA-256 hash
    const hashBytes = sha256(new Uint8Array(fileData));
    const actualHash = bytesToHex(hashBytes);
    
    return {
      hash: actualHash,
      expectedHash,
      valid: actualHash === expectedHash,
      downloadTime,
      fileSize: fileData.byteLength,
    };
  } catch (error) {
    const downloadTime = Date.now() - startTime;
    
    return {
      hash: "",
      expectedHash,
      valid: false,
      downloadTime,
      fileSize: 0,
    };
  }
}