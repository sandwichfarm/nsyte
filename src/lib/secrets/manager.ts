import { join } from "@std/path";
import { createLogger } from "../logger.ts";
import { ensureSystemConfigDir, fileExists } from "./utils.ts";
import { getKeychainProvider, KeychainProvider } from "./keychain.ts";
import { EncryptedStorage } from "./encrypted-storage.ts";

const log = createLogger("secrets-manager");

const SECRETS_FILENAME = "secrets.json";
const SERVICE_NAME = "nsyte";
const BUNDLE_ACCOUNT = "bunker-bundle"; // Single keychain entry for all bunkers

/**
 * Interface for the secrets storage file (legacy)
 */
export interface SecretsStorage {
  [pubkey: string]: string;
}

/**
 * Storage backend interface
 */
interface StorageBackend {
  store(pubkey: string, nbunksec: string): Promise<boolean>;
  retrieve(pubkey: string): Promise<string | null>;
  delete(pubkey: string): Promise<boolean>;
  list(): Promise<string[]>;
}

/**
 * Keychain storage backend adapter
 */
class KeychainBackend implements StorageBackend {
  constructor(private provider: KeychainProvider) {}

  async store(pubkey: string, nbunksec: string): Promise<boolean> {
    return await this.provider.store({
      service: SERVICE_NAME,
      account: pubkey,
      password: nbunksec,
    });
  }

  async retrieve(pubkey: string): Promise<string | null> {
    return await this.provider.retrieve(SERVICE_NAME, pubkey);
  }

  async delete(pubkey: string): Promise<boolean> {
    return await this.provider.delete(SERVICE_NAME, pubkey);
  }

  async list(): Promise<string[]> {
    return await this.provider.list(SERVICE_NAME);
  }
}

/**
 * Encrypted storage backend adapter
 */
class EncryptedBackend implements StorageBackend {
  constructor(private storage: EncryptedStorage) {}

  async store(pubkey: string, nbunksec: string): Promise<boolean> {
    return await this.storage.store(SERVICE_NAME, pubkey, nbunksec);
  }

  async retrieve(pubkey: string): Promise<string | null> {
    return await this.storage.retrieve(SERVICE_NAME, pubkey);
  }

  async delete(pubkey: string): Promise<boolean> {
    return await this.storage.delete(SERVICE_NAME, pubkey);
  }

  async list(): Promise<string[]> {
    return await this.storage.list(SERVICE_NAME);
  }
}

/**
 * Class that manages system-wide secrets for nsite
 */
export class SecretsManager {
  private static instance: SecretsManager;
  private secretsPath: string | null = null;
  private storageBackend: StorageBackend | null = null;
  private initialized = false;
  private legacyMode = false;

  private constructor() {
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): SecretsManager {
    if (!SecretsManager.instance) {
      SecretsManager.instance = new SecretsManager();
    }
    return SecretsManager.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    SecretsManager.instance = null as any;
  }

  /**
   * Initialize the secrets manager
   * Attempts to use keychain first, falls back to encrypted storage, then plain JSON
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    const configDir = ensureSystemConfigDir();
    if (!configDir) {
      log.error("Could not initialize secrets manager - no config directory");
      return false;
    }

    this.secretsPath = join(configDir, SECRETS_FILENAME);

    // Try to initialize secure storage backend
    const forceEncrypted = Deno.env.get("NSYTE_FORCE_ENCRYPTED_STORAGE") === "true";
    const keychainProvider = !forceEncrypted ? await getKeychainProvider() : null;
    
    if (keychainProvider) {
      log.debug("Using native keychain for secure storage");
      this.storageBackend = new KeychainBackend(keychainProvider);
    } else {
      log.debug("Native keychain not available, using encrypted file storage");
      const encryptedStorage = new EncryptedStorage();
      const encryptedInitialized = await encryptedStorage.initialize();

      if (encryptedInitialized) {
        this.storageBackend = new EncryptedBackend(encryptedStorage);
      } else {
        log.warn(
          "Failed to initialize encrypted storage, falling back to legacy plain JSON storage",
        );
        log.warn(
          "⚠️  Secrets will be stored in plain text. This is not recommended for production use.",
        );
        this.legacyMode = true;
      }
    }

    // Check for legacy secrets that need migration
    await this.migrateLegacySecrets();
    
    // Rebuild index for existing keychain entries
    await this.rebuildKeychainIndex();

    this.initialized = true;
    return true;
  }

  /**
   * Rebuild the encrypted storage index for existing keychain entries
   * This is needed when upgrading from older versions that didn't maintain an index
   */
  private async rebuildKeychainIndex(): Promise<void> {
    // Only rebuild if we're using keychain backend
    if (!(this.storageBackend instanceof KeychainBackend)) {
      return;
    }

    try {
      log.debug("Checking if keychain index needs to be rebuilt");
      
      // Initialize encrypted storage to check/build index
      const encryptedStorage = new EncryptedStorage();
      if (!await encryptedStorage.initialize()) {
        log.warn("Could not initialize encrypted storage for index");
        return;
      }
      
      const encryptedBackend = new EncryptedBackend(encryptedStorage);
      const indexedPubkeys = await encryptedBackend.list();
      
      // Try to find known pubkeys in keychain by checking common patterns
      // Since we can't list the keychain, we'll check for known pubkeys from config files
      const knownPubkeys = new Set<string>();
      
      // Check project configs for bunker pubkeys
      const projectPaths = [
        Deno.cwd(),
        join(Deno.env.get("HOME") || "", "Develop"),
      ];
      
      for (const basePath of projectPaths) {
        try {
          // Look for .nsite directories
          for await (const entry of Deno.readDir(basePath)) {
            if (entry.isDirectory) {
              const configPath = join(basePath, entry.name, ".nsite", "config.json");
              try {
                const config = JSON.parse(await Deno.readTextFile(configPath));
                if (config.bunkerPubkey) {
                  knownPubkeys.add(config.bunkerPubkey);
                }
              } catch {
                // Ignore files that don't exist or can't be parsed
              }
            }
          }
        } catch {
          // Ignore directories we can't read
        }
      }
      
      // Also check for a migration marker file
      const migrationMarkerPath = join(Deno.env.get("HOME") || "", "Library", "Application Support", "nsyte", ".index-migration-done");
      
      try {
        await Deno.stat(migrationMarkerPath);
        // Migration already done
        log.debug("Keychain index migration already completed");
        return;
      } catch {
        // Migration not done yet, continue
      }
      
      // Since we can't list keychain entries on macOS without full access,
      // we'll use a different approach: prompt the user to run a one-time migration
      if (knownPubkeys.size > 0 || indexedPubkeys.length === 0) {
        log.warn("Keychain index needs to be rebuilt for multiple bunker support");
        log.warn("Run 'nsyte bunker migrate' to rebuild the index with your existing bunkers");
        
        // Skip automatic index rebuilding to avoid hanging during normal operations
        // The user should run 'nsyte bunker migrate' manually
        log.debug("Skipping automatic index rebuilding to avoid keychain access delays");
      }
      
      // Don't create marker yet - wait for full migration
    } catch (error) {
      log.error(`Failed to rebuild keychain index: ${error}`);
    }
  }

  /**
   * Migrate legacy plain JSON secrets to secure storage
   */
  private async migrateLegacySecrets(): Promise<void> {
    if (!this.secretsPath || !fileExists(this.secretsPath) || this.legacyMode) {
      return;
    }

    try {
      const content = await Deno.readTextFile(this.secretsPath);
      const legacySecrets = JSON.parse(content) as SecretsStorage;
      const pubkeys = Object.keys(legacySecrets);

      if (pubkeys.length === 0) {
        return;
      }

      log.info(`Found ${pubkeys.length} legacy secrets to migrate`);

      let migrated = 0;
      for (const pubkey of pubkeys) {
        const nbunksec = legacySecrets[pubkey];
        if (nbunksec && this.storageBackend) {
          const success = await this.storageBackend.store(pubkey, nbunksec);
          if (success) {
            migrated++;
            log.debug(`Migrated secret for pubkey ${pubkey.slice(0, 8)}...`);
          }
        }
      }

      if (migrated === pubkeys.length) {
        // All secrets migrated successfully, remove legacy file
        await Deno.remove(this.secretsPath);
        log.info(`Successfully migrated all ${migrated} secrets to secure storage`);
      } else {
        log.warn(`Only migrated ${migrated} out of ${pubkeys.length} secrets`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to migrate legacy secrets: ${errorMessage}`);
    }
  }

  /**
   * Legacy storage implementation for fallback
   */
  private legacySecrets: SecretsStorage = {};

  /**
   * Load legacy secrets from disk
   */
  private loadLegacySecrets(): void {
    if (!this.secretsPath || !fileExists(this.secretsPath)) {
      this.legacySecrets = {};
      return;
    }

    try {
      const content = Deno.readTextFileSync(this.secretsPath);
      this.legacySecrets = JSON.parse(content) as SecretsStorage;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn(`Failed to load legacy secrets: ${errorMessage}`);
      this.legacySecrets = {};
    }
  }

  /**
   * Save legacy secrets to disk
   */
  private saveLegacySecrets(): void {
    if (!this.secretsPath) {
      return;
    }

    try {
      Deno.writeTextFileSync(this.secretsPath, JSON.stringify(this.legacySecrets, null, 2));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to save legacy secrets: ${errorMessage}`);
    }
  }

  /**
   * Store a nbunksec string for a pubkey
   */
  public async storeNbunk(pubkey: string, nbunksec: string): Promise<boolean> {
    if (!await this.initialize()) return false;

    try {
      if (this.storageBackend) {
        const success = await this.storageBackend.store(pubkey, nbunksec);
        if (success) {
          log.debug(`Stored nbunksec for pubkey ${pubkey.slice(0, 8)}...`);
          
          // If using keychain backend, also store in encrypted storage for indexing
          if (this.storageBackend instanceof KeychainBackend) {
            log.debug("Also storing in encrypted storage for indexing");
            const encryptedStorage = new EncryptedStorage();
            if (await encryptedStorage.initialize()) {
              const encryptedBackend = new EncryptedBackend(encryptedStorage);
              // Store a placeholder value just for indexing
              await encryptedBackend.store(pubkey, "stored-in-keychain");
            }
          }
        }
        return success;
      } else if (this.legacyMode) {
        // Fallback to legacy storage
        this.loadLegacySecrets();
        this.legacySecrets[pubkey] = nbunksec;
        this.saveLegacySecrets();
        log.debug(`Stored nbunksec for pubkey ${pubkey.slice(0, 8)}... (legacy mode)`);
        return true;
      }
      return false;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to store nbunksec: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Retrieve a nbunksec string for a pubkey
   */
  public async getNbunk(pubkey: string): Promise<string | null> {
    if (!await this.initialize()) return null;

    try {
      if (this.storageBackend) {
        return await this.storageBackend.retrieve(pubkey);
      } else if (this.legacyMode) {
        // Fallback to legacy storage
        this.loadLegacySecrets();
        return this.legacySecrets[pubkey] || null;
      }
      return null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to retrieve nbunksec: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get all stored pubkeys
   */
  public async getAllPubkeys(): Promise<string[]> {
    if (!await this.initialize()) {
      log.debug("getAllPubkeys: Failed to initialize");
      return [];
    }

    try {
      if (this.storageBackend) {
        log.debug("getAllPubkeys: Using storage backend to list");
        let pubkeys = await this.storageBackend.list();
        log.debug(`getAllPubkeys: Storage backend returned ${pubkeys.length} pubkeys`);
        
        // If keychain returns empty but we're using keychain backend,
        // also check encrypted storage as a fallback for the list
        if (pubkeys.length === 0 && this.storageBackend instanceof KeychainBackend) {
          log.debug("Keychain list returned empty, checking encrypted storage for index");
          const encryptedStorage = new EncryptedStorage();
          if (await encryptedStorage.initialize()) {
            const encryptedBackend = new EncryptedBackend(encryptedStorage);
            const encryptedPubkeys = await encryptedBackend.list();
            if (encryptedPubkeys.length > 0) {
              log.debug(`Found ${encryptedPubkeys.length} pubkeys in encrypted storage index`);
              pubkeys = encryptedPubkeys;
            }
          }
        }
        
        return pubkeys;
      } else if (this.legacyMode) {
        // Fallback to legacy storage
        log.debug("getAllPubkeys: Using legacy mode");
        this.loadLegacySecrets();
        return Object.keys(this.legacySecrets);
      }
      log.debug("getAllPubkeys: No storage backend available");
      return [];
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to list pubkeys: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Delete a nbunksec for a pubkey
   */
  public async deleteNbunk(pubkey: string): Promise<boolean> {
    if (!await this.initialize()) return false;

    try {
      if (this.storageBackend) {
        const success = await this.storageBackend.delete(pubkey);
        if (success) {
          log.debug(`Deleted nbunksec for pubkey ${pubkey.slice(0, 8)}...`);
          
          // If using keychain backend, also delete from encrypted storage index
          if (this.storageBackend instanceof KeychainBackend) {
            log.debug("Also deleting from encrypted storage index");
            const encryptedStorage = new EncryptedStorage();
            if (await encryptedStorage.initialize()) {
              const encryptedBackend = new EncryptedBackend(encryptedStorage);
              await encryptedBackend.delete(pubkey);
            }
          }
        }
        return success;
      } else if (this.legacyMode) {
        // Fallback to legacy storage
        this.loadLegacySecrets();
        if (!(pubkey in this.legacySecrets)) {
          return false;
        }
        delete this.legacySecrets[pubkey];
        this.saveLegacySecrets();
        log.debug(`Deleted nbunksec for pubkey ${pubkey.slice(0, 8)}... (legacy mode)`);
        return true;
      }
      return false;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to delete nbunksec: ${errorMessage}`);
      return false;
    }
  }
}
