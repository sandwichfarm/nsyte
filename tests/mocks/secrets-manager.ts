/**
 * Complete mock implementation of SecretsManager for tests
 * This prevents ANY access to the real singleton or keychain
 */

export interface MockSecretsManagerData {
  [pubkey: string]: string;
}

export class MockSecretsManager {
  private storage = new Map<string, string>();
  private initialized = false;

  constructor(initialData: MockSecretsManagerData = {}) {
    // Load initial data
    for (const [pubkey, nbunk] of Object.entries(initialData)) {
      this.storage.set(pubkey, nbunk);
    }
  }

  async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  async storeNbunk(pubkey: string, nbunksec: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    this.storage.set(pubkey, nbunksec);
    return true;
  }

  async getNbunk(pubkey: string): Promise<string | null> {
    if (!this.initialized) await this.initialize();
    return this.storage.get(pubkey) || null;
  }

  async deleteNbunk(pubkey: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    return this.storage.delete(pubkey);
  }

  async getAllPubkeys(): Promise<string[]> {
    if (!this.initialized) await this.initialize();
    return Array.from(this.storage.keys());
  }

  async clearAllSecrets(): Promise<void> {
    if (!this.initialized) await this.initialize();
    this.storage.clear();
  }

  // Test utilities
  getStorageContents(): MockSecretsManagerData {
    return Object.fromEntries(this.storage);
  }

  setStorageContents(data: MockSecretsManagerData): void {
    this.storage.clear();
    for (const [pubkey, nbunk] of Object.entries(data)) {
      this.storage.set(pubkey, nbunk);
    }
  }
}

/**
 * Create a fresh mock SecretsManager instance for tests
 */
export function createMockSecretsManager(
  initialData: MockSecretsManagerData = {}
): MockSecretsManager {
  return new MockSecretsManager(initialData);
}

/**
 * Mock the SecretsManager module completely
 * This replaces the singleton with a controllable mock
 */
export function mockSecretsManagerModule(mockInstance: MockSecretsManager) {
  return {
    SecretsManager: {
      getInstance: () => mockInstance,
      // Expose instance for direct access if needed
      instance: mockInstance,
    }
  };
}