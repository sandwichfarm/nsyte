/**
 * Encrypted filesystem storage fallback for platforms without native keychain support
 * Uses AES-256-GCM encryption with a key derived from system-specific attributes
 */

import { join } from "@std/path";
import { ensureDirSync } from "@std/fs/ensure-dir";
import { createLogger } from "../logger.ts";
import { fileExists, getSystemConfigDir } from "./utils.ts";
import { decodeBase64, encodeBase64 } from "@std/encoding/base64";

const log = createLogger("encrypted-storage");

const ENCRYPTED_SECRETS_FILENAME = "secrets.enc";
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

interface EncryptedData {
  salt: string;
  iv: string;
  data: string;
  tag: string;
}

interface StorageData {
  version: number;
  credentials: {
    [key: string]: EncryptedData;
  };
}

export class EncryptedStorage {
  private storageFilePath: string | null = null;
  private masterKey: CryptoKey | null = null;
  private initialized = false;

  constructor() {}

  /**
   * Initialize the encrypted storage
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }
    const configDir = getSystemConfigDir();
    if (!configDir) {
      log.error("Could not determine system config directory");
      return false;
    }

    try {
      ensureDirSync(configDir);
      this.storageFilePath = join(configDir, ENCRYPTED_SECRETS_FILENAME);

      // Derive master key from system-specific attributes
      this.masterKey = await this.deriveMasterKey();

      this.initialized = true;
      return true;
    } catch (error) {
      log.error(`Failed to initialize encrypted storage: ${error}`);
      return false;
    }
  }

  /**
   * Derive a master key from system-specific attributes
   * This provides some protection but is not as secure as OS keychains
   */
  private async deriveMasterKey(): Promise<CryptoKey> {
    // Combine various system attributes to create a deterministic key
    let hostname = "unknown";
    try {
      hostname = Deno.hostname();
    } catch {
      // Fallback if hostname access is not permitted
      hostname = "fallback-host";
    }

    const systemInfo = [
      hostname,
      Deno.build.os,
      Deno.build.arch,
      Deno.env.get("USER") || Deno.env.get("USERNAME") || "default",
      // Add more system-specific attributes as needed
    ].join("-");

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(systemInfo),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"],
    );

    // Use a fixed salt for deterministic key derivation
    // In a more secure implementation, this could be stored separately
    const salt = encoder.encode("nsyte-encrypted-storage-v1");

    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private async encrypt(data: string): Promise<EncryptedData> {
    if (!this.masterKey) {
      throw new Error("Master key not initialized");
    }

    const encoder = new TextEncoder();
    const plaintext = encoder.encode(data);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Generate random salt for additional entropy
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: salt,
        tagLength: TAG_LENGTH * 8,
      },
      this.masterKey,
      plaintext,
    );

    // Extract ciphertext and tag
    const encryptedArray = new Uint8Array(encryptedData);
    const ciphertext = encryptedArray.slice(0, -TAG_LENGTH);
    const tag = encryptedArray.slice(-TAG_LENGTH);

    return {
      salt: encodeBase64(salt),
      iv: encodeBase64(iv),
      data: encodeBase64(ciphertext),
      tag: encodeBase64(tag),
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private async decrypt(encryptedData: EncryptedData): Promise<string> {
    if (!this.masterKey) {
      throw new Error("Master key not initialized");
    }

    const salt = decodeBase64(encryptedData.salt);
    const iv = decodeBase64(encryptedData.iv);
    const ciphertext = decodeBase64(encryptedData.data);
    const tag = decodeBase64(encryptedData.tag);

    // Combine ciphertext and tag for decryption
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);

    // Decrypt the data
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: salt,
        tagLength: TAG_LENGTH * 8,
      },
      this.masterKey,
      combined,
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  }

  /**
   * Load storage data from disk
   */
  private async loadStorage(): Promise<StorageData> {
    if (!this.storageFilePath || !fileExists(this.storageFilePath)) {
      return {
        version: 1,
        credentials: {},
      };
    }

    try {
      const content = await Deno.readTextFile(this.storageFilePath);
      return JSON.parse(content) as StorageData;
    } catch (error) {
      log.error(`Failed to load encrypted storage: ${error}`);
      return {
        version: 1,
        credentials: {},
      };
    }
  }

  /**
   * Save storage data to disk
   */
  private async saveStorage(data: StorageData): Promise<void> {
    if (!this.storageFilePath) {
      throw new Error("Storage file path not initialized");
    }

    await Deno.writeTextFile(
      this.storageFilePath,
      JSON.stringify(data, null, 2),
    );
  }

  /**
   * Store an encrypted credential
   */
  async store(service: string, account: string, password: string): Promise<boolean> {
    if (!this.initialized) {
      log.error("EncryptedStorage not initialized");
      return false;
    }

    try {
      const storage = await this.loadStorage();
      const key = `${service}:${account}`;

      // Encrypt the password
      storage.credentials[key] = await this.encrypt(password);

      // Save to disk
      await this.saveStorage(storage);

      log.debug(`Stored encrypted credential for ${account}`);
      return true;
    } catch (error) {
      log.error(`Failed to store encrypted credential: ${error}`);
      return false;
    }
  }

  /**
   * Retrieve a decrypted credential
   */
  async retrieve(service: string, account: string): Promise<string | null> {
    if (!this.initialized) {
      log.error("EncryptedStorage not initialized");
      return null;
    }

    try {
      const storage = await this.loadStorage();
      const key = `${service}:${account}`;

      const encryptedData = storage.credentials[key];
      if (!encryptedData) {
        return null;
      }

      // Decrypt the password
      return await this.decrypt(encryptedData);
    } catch (error) {
      log.error(`Failed to retrieve encrypted credential: ${error}`);
      return null;
    }
  }

  /**
   * Delete a credential
   */
  async delete(service: string, account: string): Promise<boolean> {
    if (!this.initialized) {
      log.error("EncryptedStorage not initialized");
      return false;
    }

    try {
      const storage = await this.loadStorage();
      const key = `${service}:${account}`;

      if (!(key in storage.credentials)) {
        return false;
      }

      delete storage.credentials[key];
      await this.saveStorage(storage);

      log.debug(`Deleted encrypted credential for ${account}`);
      return true;
    } catch (error) {
      log.error(`Failed to delete encrypted credential: ${error}`);
      return false;
    }
  }

  /**
   * List all accounts for a service
   */
  async list(service: string): Promise<string[]> {
    if (!this.initialized) {
      log.error("EncryptedStorage not initialized");
      return [];
    }

    try {
      const storage = await this.loadStorage();
      const accounts: string[] = [];

      for (const key of Object.keys(storage.credentials)) {
        if (key.startsWith(`${service}:`)) {
          const account = key.substring(service.length + 1);
          accounts.push(account);
        }
      }

      return accounts;
    } catch (error) {
      log.error(`Failed to list encrypted credentials: ${error}`);
      return [];
    }
  }
}
