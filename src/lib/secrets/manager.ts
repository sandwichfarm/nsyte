import { join } from "std/path/mod.ts";
import { createLogger } from "../logger.ts";
import { ensureSystemConfigDir, fileExists } from "./utils.ts";

const log = createLogger("secrets-manager");

// Filename for the system-wide secrets storage
const SECRETS_FILENAME = "secrets.json";

/**
 * Interface for the secrets storage file
 */
export interface SecretsStorage {
  // Map pubkeys to nbunk strings
  [pubkey: string]: string;
}

/**
 * Class that manages system-wide secrets for nsite
 */
export class SecretsManager {
  private static instance: SecretsManager;
  private secretsPath: string | null = null;
  private secrets: SecretsStorage = {};
  private initialized = false;

  private constructor() {
    // Private constructor for singleton pattern
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
   * Initialize the secrets manager
   * Creates the system directory if it doesn't exist
   * Loads existing secrets if they exist
   */
  public initialize(): boolean {
    if (this.initialized) return true;

    const configDir = ensureSystemConfigDir();
    if (!configDir) {
      log.error("Could not initialize secrets manager - no config directory");
      return false;
    }

    this.secretsPath = join(configDir, SECRETS_FILENAME);
    log.debug(`Secrets will be stored at: ${this.secretsPath}`);

    // Load existing secrets if available
    if (fileExists(this.secretsPath)) {
      try {
        const content = Deno.readTextFileSync(this.secretsPath);
        this.secrets = JSON.parse(content) as SecretsStorage;
        log.debug(`Loaded existing secrets for ${Object.keys(this.secrets).length} pubkeys`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.warn(`Failed to load existing secrets: ${errorMessage}`);
        this.secrets = {};
      }
    } else {
      log.debug("No existing secrets found, starting with empty storage");
      this.secrets = {};
    }

    this.initialized = true;
    return true;
  }

  /**
   * Store a nbunk string for a pubkey
   */
  public storeNbunk(pubkey: string, nbunk: string): boolean {
    if (!this.initialize()) return false;
    
    try {
      this.secrets[pubkey] = nbunk;
      this.save();
      log.debug(`Stored nbunk for pubkey ${pubkey.slice(0, 8)}...`);
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to store nbunk: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Retrieve a nbunk string for a pubkey
   */
  public getNbunk(pubkey: string): string | null {
    if (!this.initialize()) return null;
    
    return this.secrets[pubkey] || null;
  }

  /**
   * Get all stored pubkeys
   */
  public getAllPubkeys(): string[] {
    if (!this.initialize()) return [];
    
    return Object.keys(this.secrets);
  }

  /**
   * Delete a nbunk for a pubkey
   */
  public deleteNbunk(pubkey: string): boolean {
    if (!this.initialize()) return false;
    
    if (!(pubkey in this.secrets)) {
      return false;
    }
    
    delete this.secrets[pubkey];
    this.save();
    log.debug(`Deleted nbunk for pubkey ${pubkey.slice(0, 8)}...`);
    return true;
  }

  /**
   * Save the secrets to the file system
   */
  private save(): void {
    if (!this.secretsPath) {
      log.error("Cannot save secrets - no path set");
      return;
    }
    
    try {
      Deno.writeTextFileSync(this.secretsPath, JSON.stringify(this.secrets, null, 2));
      log.debug("Saved secrets to disk");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to save secrets: ${errorMessage}`);
    }
  }
} 