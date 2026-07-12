import { colors } from "@cliffy/ansi/colors";
import { Input, Secret, Select } from "@cliffy/prompt";
import { ensureDirSync } from "@std/fs/ensure-dir";
import { dirname, isAbsolute, join, resolve } from "@std/path";
import { NostrConnectSigner } from "applesauce-signers";
import { formatValidationErrors, validateConfigWithFeedback } from "./config-validator.ts";
import { createLogger } from "./logger.ts";
import { suggestIdentifier, validateDTag } from "./nip5a.ts";
import { getNbunkString, initiateNostrConnect } from "./nip46.ts";
import type { LangText, NappAsset, NappConfig } from "./napp/types.ts";
import { MAX_NAPP_CATEGORIES, NAPP_CATEGORIES } from "./napp/categories.ts";
import { validateNappConfig } from "./napp/detect.ts";
import {
  classifyAssetInput,
  deriveAssetMime,
  isRootSite,
  rootSiteMigrationNotice,
  uploadNappAsset,
} from "./napp/assets.ts";
import { createSigner } from "./auth/signer-factory.ts";
import { generateKeyPair } from "./nostr.ts";
import { SecretsManager } from "./secrets/mod.ts";

const log = createLogger("config");

export type ProjectConfig = {
  "$schema"?: string; // JSON Schema URL for IDE autocompletion
  bunkerPubkey?: string; // Only store the pubkey reference, not the full URL
  relays: string[];
  servers: string[];
  publishAppHandler?: boolean;
  publishProfile?: boolean; // Publish kind 0 profile metadata (root sites only)
  publishRelayList?: boolean; // Publish kind 10002 relay list (root sites only)
  publishServerList?: boolean; // Publish kind 10063 Blossom server list (root sites only)
  profile?: {
    // Profile metadata for kind 0 events
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    nip05?: string;
    lud16?: string;
    lud06?: string;
  };
  fallback?: string;
  gatewayHostnames?: string[];
  id?: string | "" | null; // Site identifier for named sites (kind 35128). Use empty string or null for root site (kind 15128)
  title?: string; // Optional site title for manifest
  description?: string; // Optional site description for manifest
  source?: string; // Optional repository URL for source tag in manifest
  appHandler?: {
    id?: string; // Optional unique identifier for this handler (defaults to site id)
    kinds: number[]; // Event kinds this nsite can handle/display
    name?: string; // Optional app name for the handler
    description?: string; // Optional description
    icon?: string; // Optional app icon URL
    platforms?: {
      web?: {
        patterns?: Array<{
          url: string; // Full URL pattern (e.g., "https://example.com/e/<bech32>")
          entities?: string[];
        }>;
      };
      android?: string;
      ios?: string;
      macos?: string;
      windows?: string;
      linux?: string;
    };
  };
  napp?: NappConfig; // NIP-5B napp listing section (optional). Present => this project is a napp. See src/lib/napp/.
};

export interface ProjectContext {
  config: ProjectConfig;
  authKeyHex?: string | null;
  privateKey?: string;
  error?: string;
}

export const configDir = ".nsite";
const projectFile = "config.json";

export const popularRelays = [
  "wss://nostr.cercatrova.me",
  "wss://relay.primal.net",
  "wss://relay.wellorder.net",
  "wss://nos.lol",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.damus.io",
];

export const popularBlossomServers = [
  "https://cdn.hzrd149.com",
  "https://cdn.sovbit.host",
  "https://cdn.nostrcheck.me",
  "https://nostr.download",
];

export const CONFIG_SCHEMA_URL = "https://nsyte.run/schemas/config.schema.json";

export const defaultConfig: ProjectConfig = {
  relays: [],
  servers: [],
  gatewayHostnames: [
    "nsite.lol",
  ],
  // appHandler is optional and not included by default
};

/**
 * Resolve the configuration file path
 * @param customPath - Optional custom path to config file (can be relative or absolute)
 * @returns Absolute path to the config file
 */
function resolveConfigPath(customPath?: string): string {
  if (customPath) {
    // If custom path is provided, resolve it relative to CWD
    return isAbsolute(customPath) ? customPath : resolve(Deno.cwd(), customPath);
  }
  // Default: .nsite/config.json in CWD
  return join(Deno.cwd(), configDir, projectFile);
}

/**
 * Sanitize a bunker URL for storage by removing the secret parameter
 */
function sanitizeBunkerUrl(url: string): string {
  try {
    // Skip if not a bunker URL
    if (!url || !url.startsWith("bunker://")) {
      return url;
    }

    // Parse the URL using URL class
    const parsedUrl = new URL(url.replace("bunker://", "https://"));

    // Remove any secret parameter
    parsedUrl.searchParams.delete("secret");

    // Reconstruct the bunker URL without the secret
    const sanitized = `bunker://${parsedUrl.hostname}${parsedUrl.pathname}`;

    // Append relay parameters
    const relays = parsedUrl.searchParams.getAll("relay");
    const relayParams = relays.map((r) => `relay=${encodeURIComponent(r)}`)
      .join("&");

    return relayParams ? `${sanitized}?${relayParams}` : sanitized;
  } catch (error) {
    log.warn(`Failed to sanitize bunker URL: ${error}`);
    return url; // Return original if parsing fails
  }
}

/**
 * Write project configuration to file
 * @param config - The project configuration to write
 * @param configPath - Optional custom path to config file
 */
export function writeProjectFile(
  config: ProjectConfig,
  configPath?: string,
): void {
  const cwd = Deno.cwd();

  // Prevent tests from ever writing to the real project config.
  // Detect test environment via Deno.env or CWD heuristics.
  let hasDenoTestingEnv = false;
  try {
    hasDenoTestingEnv = typeof Deno.env.get("DENO_TESTING") === "string";
  } catch {
    // If env access is not permitted, treat as non-test environment.
    hasDenoTestingEnv = false;
  }
  const isTestEnv = hasDenoTestingEnv ||
    cwd.includes("nsyte-test-") || cwd.includes("/tmp/") ||
    cwd.includes("/var/folders/");

  if (isTestEnv && !configPath) {
    return;
  }

  // If a configPath is provided but resolves to the real project .nsite dir, block in tests
  if (isTestEnv && configPath) {
    const resolved = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
    // Block if the resolved path is inside the actual nsyte project directory
    if (
      !resolved.includes("nsyte-test-") && !resolved.startsWith("/tmp/") &&
      !resolved.startsWith("/var/")
    ) {
      log.warn(`Blocked test from writing config to project path: ${resolved}`);
      return;
    }
  }

  const projectPath = resolveConfigPath(configPath);

  try {
    // Validate the file extension to prevent accidental YAML file creation
    if (!projectPath.endsWith(".json")) {
      throw new Error(
        `Invalid config file path: ${projectPath}. Config must be a .json file.`,
      );
    }

    ensureDirSync(dirname(projectPath));

    // Clone the data to avoid modifying the original
    const sanitizedData = { ...config };

    // Validate required fields
    if (!sanitizedData.relays || !Array.isArray(sanitizedData.relays)) {
      throw new Error("Invalid config: 'relays' must be an array");
    }
    if (!sanitizedData.servers || !Array.isArray(sanitizedData.servers)) {
      throw new Error("Invalid config: 'servers' must be an array");
    }

    // Sanitize bunker URL if present to remove secrets
    if (sanitizedData.bunkerPubkey) {
      sanitizedData.bunkerPubkey = sanitizeBunkerUrl(
        sanitizedData.bunkerPubkey,
      );
    }

    // Create backup of existing config if it exists
    try {
      const existingContent = Deno.readTextFileSync(projectPath);
      const backupPath = `${projectPath}.backup`;
      Deno.writeTextFileSync(backupPath, existingContent);
    } catch {
      // No existing config to backup, which is fine
    }

    Deno.writeTextFileSync(projectPath, JSON.stringify(sanitizedData, null, 2));
    log.success(`Project configuration saved to ${configDir}/${projectFile}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to save project configuration: ${errorMessage}`);
    throw error;
  }
}

/**
 * Read project configuration from file
 * @param configPath - Optional custom path to config file
 * @param validateSchema - Whether to validate the config against the schema (default: true)
 * @returns The project configuration or null if not found
 */
export function readProjectFile(
  configPath?: string,
  validateSchema = true,
): ProjectConfig | null {
  const projectPath = resolveConfigPath(configPath);
  const cwd = Deno.cwd();

  // Check for common config file mistakes
  const configDirPath = join(cwd, configDir);
  if (fileExists(configDirPath)) {
    // Check for YAML files that shouldn't exist
    const yamlPath = join(configDirPath, "config.yaml");
    const ymlPath = join(configDirPath, "config.yml");

    if (fileExists(yamlPath) || fileExists(ymlPath)) {
      console.error(
        colors.red("\n⚠️  Found config.yaml/yml file in .nsite directory!"),
      );
      console.error(
        colors.yellow(
          "nsyte uses config.json, not YAML. The YAML file may be from another tool.",
        ),
      );
      console.error(
        colors.yellow("Please remove the YAML file to avoid confusion.\n"),
      );
    }
  }

  try {
    if (!fileExists(projectPath)) {
      log.debug(`Project file not found at ${projectPath}`);
      return null;
    }

    const fileContent = Deno.readTextFileSync(projectPath);
    let config: unknown;

    try {
      config = JSON.parse(fileContent);
    } catch (e) {
      console.error(colors.red("\nFailed to parse configuration file:"));
      console.error(
        colors.red(`  ${e instanceof Error ? e.message : String(e)}`),
      );
      console.error(
        colors.yellow(
          "\nPlease ensure .nsite/config.json contains valid JSON.",
        ),
      );
      throw new Error("Invalid JSON in configuration file");
    }

    // Validate configuration if requested
    if (validateSchema) {
      const validation = validateConfigWithFeedback(config);

      if (!validation.valid) {
        console.error(
          colors.red(
            "\nConfiguration validation failed in .nsite/config.json:",
          ),
        );
        console.error(formatValidationErrors(validation.errors));

        if (validation.suggestions.length > 0) {
          console.log(colors.yellow("\nSuggestions:"));
          validation.suggestions.forEach((s) => console.log(`  - ${s}`));
        }

        console.log(
          colors.dim(
            "\nYou can run 'nsyte validate' for more detailed validation information.",
          ),
        );

        throw new Error("Invalid configuration format");
      }

      if (validation.warnings.length > 0) {
        console.warn(colors.yellow("Configuration warnings:"));
        validation.warnings.forEach((w) => console.warn(`  - ${w}`));
      }
    }

    return config as ProjectConfig;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to read project file: ${errorMessage}`);

    // Re-throw validation errors so they can be handled properly
    if (
      error instanceof Error && (
        error.message === "Invalid configuration format" ||
        error.message === "Invalid JSON in configuration file"
      )
    ) {
      throw error;
    }

    return null;
  }
}

/**
 * Check if a file exists
 */
function fileExists(filePath: string): boolean {
  try {
    const stats = Deno.statSync(filePath);
    return stats.isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

/**
 * Setup project interactively
 * @param skipInteractive If true, will return a basic configuration without prompting
 * @param configPath - Optional custom path to config file
 */
export async function setupProject(
  skipInteractive = false,
  configPath?: string,
): Promise<ProjectContext> {
  let config: ProjectConfig | null = null;
  let privateKey: string | undefined;

  try {
    config = readProjectFile(configPath);
  } catch (error) {
    // If there's a validation error, don't proceed with setup
    if (
      error instanceof Error && (
        error.message === "Invalid configuration format" ||
        error.message === "Invalid JSON in configuration file"
      )
    ) {
      throw error;
    }
    // For other errors, continue with setup
    config = null;
  }

  if (!config) {
    if (skipInteractive) {
      // Return a basic configuration without prompting
      config = {
        relays: [],
        servers: [],
      };
      log.debug(
        "Running in non-interactive mode with no existing configuration",
      );
      return { config, privateKey: undefined };
    }

    console.log(
      colors.cyan(
        "No existing project configuration found. Setting up a new one:",
      ),
    );
    const setupResult = await interactiveSetup();
    config = setupResult.config;
    privateKey = setupResult.privateKey;
    writeProjectFile(config, configPath);
  }

  // In non-interactive mode, don't proceed with key setup prompts
  if (skipInteractive) {
    if (!config.bunkerPubkey && !privateKey) {
      log.error(
        "No key configuration found and running in non-interactive mode. Please provide key configuration via CLI arguments.",
      );
      Deno.exit(1);
    }
    return { config, privateKey };
  }

  // Only proceed with interactive key setup if we're in interactive mode
  if (!config.bunkerPubkey && !privateKey) {
    const keyResult = await selectKeySource(config, configPath);
    config = keyResult.config;
    privateKey = keyResult.privateKey;
  }

  return { config, privateKey };
}

async function connectToBunkerWithQR(): Promise<NostrConnectSigner> {
  const appName = "nsyte";
  const defaultRelays = ["wss://relay.nsec.app"];

  const relayInput = await Input.prompt({
    message: `Enter relays (comma-separated), or press Enter for default (${
      defaultRelays.join(", ")
    }):`,
    default: defaultRelays.join(", "),
  });

  let chosenRelays: string[];
  if (
    relayInput.trim() === "" || relayInput.trim() === defaultRelays.join(", ")
  ) {
    chosenRelays = defaultRelays;
  } else {
    chosenRelays = relayInput.split(",").map((r) => r.trim()).filter((r) => r.length > 0);
  }

  if (chosenRelays.length === 0) {
    console.log(colors.yellow("No relays provided. Using default relays."));
    chosenRelays = defaultRelays;
  }

  console.log(
    colors.cyan(
      `Initiating Nostr Connect as '${appName}' on relays: ${chosenRelays.join(", ")}`,
    ),
  );
  return initiateNostrConnect(appName, chosenRelays);
}

async function connectToBunkerWithURI(): Promise<NostrConnectSigner> {
  const bunkerUrl = await Input.prompt({
    message: "Enter the bunker URL (bunker://...):",
    validate: (input: string) => {
      return input.trim().startsWith("bunker://") ||
        "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
    },
  });

  console.log(colors.cyan("Connecting to bunker via URL..."));
  return NostrConnectSigner.fromBunkerURI(bunkerUrl);
}

async function newBunker(): Promise<NostrConnectSigner | undefined> {
  let signer: NostrConnectSigner | null = null;

  const choice = await Select.prompt<string>({
    message: "How would you like to connect to the bunker?",
    options: [
      { name: "Scan QR Code (Nostr Connect)", value: "qr" },
      { name: "Enter Bunker URL manually", value: "url" },
    ],
  });

  try {
    signer = choice === "qr" ? await connectToBunkerWithQR() : await connectToBunkerWithURI();

    if (!signer) {
      throw new Error("Failed to establish signer connection");
    }

    return signer;
  } catch (error) {
    log.error(`Failed to connect to bunker: ${error}`);
    console.error(
      colors.red(
        `Failed to connect to bunker: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    Deno.exit(1);
  } finally {
    if (signer) {
      try {
        console.log(colors.cyan("Disconnecting from bunker..."));
        await signer.close();
        console.log(colors.green("Disconnected from bunker."));
      } catch (err) {
        console.error(colors.red(`Error during disconnect: ${err}`));
      }
    }
  }
}

async function selectKeySource(
  existingConfig?: ProjectConfig,
  configPath?: string,
): Promise<{ config: ProjectConfig; privateKey?: string }> {
  console.log(colors.yellow("No key configuration found. Let's set that up:"));

  let privateKey: string | undefined;
  const config: ProjectConfig = existingConfig
    ? structuredClone(existingConfig)
    : structuredClone(defaultConfig);

  // Store the original bunkerPubkey to check if it changed
  const originalBunkerPubkey = config.bunkerPubkey;
  let configChanged = false;

  // Check if there are any existing bunkers
  const secretsManager = SecretsManager.getInstance();
  const existingBunkers = await secretsManager.getAllPubkeys();
  const hasBunkers = existingBunkers.length > 0;

  // Prepare options based on whether bunkers exist
  const keyOptions = [
    { name: "Generate a new private key", value: "generate" },
    { name: "Use an existing private key", value: "existing" },
  ];

  if (hasBunkers) {
    keyOptions.push(
      { name: "Use an existing NSEC bunker", value: "existing_bunker" },
      { name: "Connect to a new NSEC bunker", value: "new_bunker" },
    );
  } else {
    keyOptions.push({ name: "Connect to an NSEC bunker", value: "new_bunker" });
  }

  // Define the type for the key choice to avoid type errors
  type KeyChoice = "generate" | "existing" | "new_bunker" | "existing_bunker";

  const keyChoice = await Select.prompt<KeyChoice>({
    message: "How would you like to manage your nostr key?",
    options: keyOptions,
  });

  if (keyChoice === "generate") {
    const keyPair = generateKeyPair();
    privateKey = keyPair.privateKey;
    console.log(
      colors.green(`Generated new private key: ${keyPair.privateKey}`),
    );
    console.log(
      colors.yellow(
        "IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!",
      ),
    );
    console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
    // Note: privateKey is returned but not stored in config, so no config change
  } else if (keyChoice === "existing") {
    privateKey = await Secret.prompt({
      message: "Enter your nostr private key (nsec/hex):",
    });
    // Note: privateKey is returned but not stored in config, so no config change
  } else if (keyChoice === "new_bunker") {
    const signer = await newBunker();
    if (signer) {
      config.bunkerPubkey = await signer.getPublicKey();
      const nbunkString = getNbunkString(signer);
      await secretsManager.storeNbunk(config.bunkerPubkey, nbunkString);
      console.log(
        colors.green(
          `Successfully connected to bunker ${
            config.bunkerPubkey.slice(0, 8)
          }... \nGenerated and stored nbunksec string.`,
        ),
      );
      configChanged = true;
    }
  } else if (keyChoice === "existing_bunker") {
    // Present a list of existing bunkers to choose from
    const bunkerOptions = existingBunkers.map((pubkey: string) => {
      return {
        name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        value: pubkey,
      };
    });

    const selectedPubkey = await Select.prompt<string>({
      message: "Select an existing bunker:",
      options: bunkerOptions,
    });

    config.bunkerPubkey = selectedPubkey;
    console.log(
      colors.green(
        `Using existing bunker with pubkey: ${selectedPubkey.slice(0, 8)}...`,
      ),
    );
    configChanged = originalBunkerPubkey !== selectedPubkey;
  }

  // Only write config if it actually changed
  if (configChanged || !existingConfig) {
    writeProjectFile(config, configPath);
    console.log(colors.green("Key configuration set up successfully!"));
  } else {
    console.log(colors.green("Key configuration completed."));
  }

  return { config, privateKey };
}

/**
 * Build a `napp.<category>:<subcategory>` label from a category + subcategory.
 *
 * PURE string join — no validation here (the caller validates the assembled label or
 * the whole config via validateCategoryLabel/validateNappConfig). Subcategories are
 * stored verbatim, including spaces (e.g. `categoryLabel("utilities", "text editor")`
 * yields `napp.utilities:text editor`).
 */
export function categoryLabel(category: string, subcategory: string): string {
  return `napp.${category}:${subcategory}`;
}

/**
 * The SINGLE pure assembly helper that shapes wizard/`napp init` answers into a
 * {@link NappConfig}. Reused verbatim by the `nsyte init` project-type wizard AND by
 * `nsyte napp init`.
 *
 * This is a PURE shaper: it does NOT validate or throw. Callers run
 * {@link validateNappConfig} on the result before writing, warning (wizard) or
 * refusing to write (`napp init`) on errors.
 *
 * - `name` -> `{ value, lang? }` (lang only when provided)
 * - `icon.mime` defaults to `"image/png"` when omitted/blank
 * - `countries` defaults to `["*"]` when omitted/empty
 * - `summary`/`description` are included ONLY when non-empty (never `{ value: "" }`),
 *   each carrying `lang` only when provided
 * - `self`/`keyart`/`screenshots`/`tags`/`indexerRelays` are included ONLY when present
 *   and non-empty
 *
 * All Phase-25 fields are OPTIONAL so every pre-existing call site keeps working unchanged.
 */
export function buildNappConfigFromAnswers(answers: {
  name: string;
  nameLang?: string;
  iconHash: string;
  iconMime?: string;
  categories: string[];
  countries?: string[];
  summary?: string;
  summaryLang?: string;
  description?: string;
  descriptionLang?: string;
  self?: string;
  keyart?: NappAsset;
  screenshots?: NappAsset[];
  tags?: string[];
  indexerRelays?: string[];
}): NappConfig {
  const name: LangText = { value: answers.name.trim() };
  if (answers.nameLang && answers.nameLang.trim()) {
    name.lang = answers.nameLang.trim();
  }

  const napp: NappConfig = {
    name,
    icon: {
      hash: answers.iconHash.trim(),
      mime: answers.iconMime && answers.iconMime.trim() ? answers.iconMime.trim() : "image/png",
    },
    categories: answers.categories,
    countries: (answers.countries && answers.countries.length) ? answers.countries : ["*"],
  };

  if (answers.summary && answers.summary.trim()) {
    napp.summary = { value: answers.summary.trim() };
    if (answers.summaryLang && answers.summaryLang.trim()) {
      napp.summary.lang = answers.summaryLang.trim();
    }
  }
  if (answers.description && answers.description.trim()) {
    napp.description = { value: answers.description.trim() };
    if (answers.descriptionLang && answers.descriptionLang.trim()) {
      napp.description.lang = answers.descriptionLang.trim();
    }
  }

  if (answers.self && answers.self.trim()) {
    napp.self = answers.self.trim();
  }
  if (answers.keyart) {
    napp.keyart = answers.keyart;
  }
  if (answers.screenshots && answers.screenshots.length > 0) {
    napp.screenshots = answers.screenshots;
  }
  if (answers.tags && answers.tags.length > 0) {
    napp.tags = answers.tags;
  }
  if (answers.indexerRelays && answers.indexerRelays.length > 0) {
    napp.indexerRelays = answers.indexerRelays;
  }

  return napp;
}

/**
 * Flag/wizard-provided values fed into {@link collectNappListing}. Asset fields carry the
 * RAW input string (a sha256 hash, a URL, or a local path); the injected `resolveAsset`
 * turns each into a {@link NappAsset}. Already-parsed listing fields (categories as labels,
 * countries as an array) are passed through verbatim.
 */
export interface NappListingPrefill {
  name?: string;
  nameLang?: string;
  icon?: string;
  iconMime?: string;
  categories?: string[];
  countries?: string[];
  summary?: string;
  summaryLang?: string;
  description?: string;
  descriptionLang?: string;
  self?: string;
  keyart?: string;
  screenshots?: string[];
  tags?: string[];
  indexerRelays?: string[];
}

/** A resolver turning a raw asset input (hash/URL/path) into a {@link NappAsset}. */
export type NappAssetResolver = (value: string) => Promise<NappAsset>;

/**
 * The SHARED napp-listing collector used by BOTH `nsyte napp init` (prefill = parsed flags,
 * resolveAsset uploads) and the `nsyte init` wizard napp branch (prefill = {}, interactive,
 * resolveAsset = hash/URL-or-upload). For each field: use prefill when present; else, when
 * `interactive`, prompt; else leave unset. Asset strings are turned into {@link NappAsset}
 * via the injected `resolveAsset`. Returns the assembled config via
 * {@link buildNappConfigFromAnswers} (PURE assembly; validation is the caller's job).
 *
 * Dependency-light by design: `resolveAsset` is injected so this module never imports
 * upload.ts.
 */
export async function collectNappListing(opts: {
  prefill: NappListingPrefill;
  interactive: boolean;
  resolveAsset: NappAssetResolver;
}): Promise<NappConfig> {
  const { prefill, interactive, resolveAsset } = opts;

  // --- name ---
  let name = prefill.name;
  if (name === undefined && interactive) {
    name = await Input.prompt({
      message: "App name:",
      validate: (v: string) => v.trim().length > 0 || "Name is required",
    });
  }

  // --- icon (raw input) ---
  let iconInput = prefill.icon;
  let iconMime = prefill.iconMime;
  if (iconInput === undefined && interactive) {
    iconInput = await Input.prompt({
      message: "Icon (sha256 hash, URL, or local file path):",
      validate: (v: string) => v.trim().length > 0 || "Icon is required",
    });
    iconMime = await Input.prompt({
      message: "Icon MIME type (used for hash/URL inputs):",
      default: "image/png",
    });
  }

  // --- categories (labels) ---
  let categories = prefill.categories;
  if ((categories === undefined || categories.length === 0) && interactive) {
    categories = [];
    while (categories.length < MAX_NAPP_CATEGORIES) {
      const category = await Select.prompt<string>({
        message: categories.length === 0
          ? "Category"
          : `Category (${categories.length}/${MAX_NAPP_CATEGORIES}, choose "done" to finish)`,
        options: [
          ...Object.keys(NAPP_CATEGORIES).map((c) => ({ name: c, value: c })),
          ...(categories.length > 0 ? [{ name: "done", value: "__done__" }] : []),
        ],
      });
      if (category === "__done__") break;
      const subcategory = await Select.prompt<string>({
        message: "Subcategory",
        options: NAPP_CATEGORIES[category].map((s) => ({ name: s, value: s })),
      });
      categories.push(categoryLabel(category, subcategory));
    }
  }

  // --- countries ---
  let countries = prefill.countries;
  if ((countries === undefined || countries.length === 0) && interactive) {
    const countriesInput = await Input.prompt({
      message: "Countries (comma-separated ISO codes, or * for worldwide):",
      default: "*",
    });
    const parts = countriesInput.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
    countries = (parts.length === 0 || (parts.length === 1 && parts[0] === "*")) ? ["*"] : parts;
  }

  // --- summary / description ---
  let summary = prefill.summary;
  let description = prefill.description;
  if (summary === undefined && interactive) {
    summary = await Input.prompt({ message: "Summary (optional):" });
  }
  if (description === undefined && interactive) {
    description = await Input.prompt({ message: "Description (optional):" });
  }

  // --- self ---
  let self = prefill.self;
  if (self === undefined && interactive) {
    const v = await Input.prompt({
      message: "Author pubkey (64-hex, optional):",
    });
    self = v.trim() || undefined;
  }

  // --- keyart / screenshots (raw inputs) ---
  let keyartInput = prefill.keyart;
  let screenshotInputs = prefill.screenshots;
  if (keyartInput === undefined && interactive) {
    const v = await Input.prompt({
      message: "Key art (sha256 hash, URL, or local path; optional):",
    });
    keyartInput = v.trim() || undefined;
  }
  if (screenshotInputs === undefined && interactive) {
    const collected: string[] = [];
    while (true) {
      const v = await Input.prompt({
        message: "Screenshot (hash/URL/path; blank to finish):",
      });
      if (!v || !v.trim()) break;
      collected.push(v.trim());
    }
    screenshotInputs = collected;
  }

  // --- tags / indexerRelays ---
  let tags = prefill.tags;
  if (tags === undefined && interactive) {
    const v = await Input.prompt({
      message: "Tags (comma-separated, optional):",
    });
    tags = v.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  }
  const indexerRelays = prefill.indexerRelays;

  // --- resolve assets via the injected resolver ---
  let icon: NappAsset | undefined;
  if (iconInput && iconInput.trim()) {
    icon = await resolveAsset(iconInput.trim());
  }
  let keyart: NappAsset | undefined;
  if (keyartInput && keyartInput.trim()) {
    keyart = await resolveAsset(keyartInput.trim());
  }
  const screenshots: NappAsset[] = [];
  for (const s of screenshotInputs ?? []) {
    if (s && s.trim()) screenshots.push(await resolveAsset(s.trim()));
  }

  return buildNappConfigFromAnswers({
    name: name ?? "",
    nameLang: prefill.nameLang,
    iconHash: icon?.hash ?? "",
    iconMime: icon?.mime ?? iconMime,
    categories: categories ?? [],
    countries,
    summary,
    summaryLang: prefill.summaryLang,
    description,
    descriptionLang: prefill.descriptionLang,
    self,
    keyart,
    screenshots: screenshots.length > 0 ? screenshots : undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    indexerRelays: indexerRelays && indexerRelays.length > 0 ? indexerRelays : undefined,
  });
}

/**
 * Interactive project setup
 */
async function interactiveSetup(): Promise<ProjectContext> {
  console.log(colors.cyan("Welcome to nsyte setup!"));

  // Check if there are any existing bunkers
  const secretsManager = SecretsManager.getInstance();
  const existingBunkers = await secretsManager.getAllPubkeys();
  const hasBunkers = existingBunkers.length > 0;

  // Prepare options based on whether bunkers exist
  const keyOptions = [
    { name: "Generate a new private key", value: "generate" },
    { name: "Use an existing private key", value: "existing" },
  ];

  if (hasBunkers) {
    keyOptions.push(
      { name: "Use an existing NSEC bunker", value: "existing_bunker" },
      { name: "Connect to a new NSEC bunker", value: "new_bunker" },
    );
  } else {
    keyOptions.push({ name: "Connect to an NSEC bunker", value: "new_bunker" });
  }

  // Define the type for the key choice to avoid type errors
  type KeyChoice = "generate" | "existing" | "new_bunker" | "existing_bunker";

  const keyChoice = await Select.prompt<KeyChoice>({
    message: "How would you like to manage your nostr key?",
    options: keyOptions,
  });

  let privateKey: string | undefined;
  let bunkerPubkey: string | undefined;

  if (keyChoice === "generate") {
    const keyPair = generateKeyPair();
    privateKey = keyPair.privateKey;
    console.log(
      colors.green(`Generated new private key: ${keyPair.privateKey}`),
    );
    console.log(
      colors.yellow(
        "IMPORTANT: Save this key securely. It will not be stored and cannot be recovered!",
      ),
    );
    console.log(colors.green(`Your public key is: ${keyPair.publicKey}`));
  } else if (keyChoice === "existing") {
    privateKey = await Secret.prompt({
      message: "Enter your nostr private key (nsec/hex):",
    });
  } else if (keyChoice === "new_bunker") {
    const choice = await Select.prompt<string>({
      message: "How would you like to connect to the bunker?",
      options: [
        { name: "Scan QR Code (Nostr Connect)", value: "qr" },
        { name: "Enter Bunker URL manually", value: "url" },
      ],
    });

    let signer: NostrConnectSigner | null = null;

    try {
      if (choice === "qr") {
        const appName = "nsyte";
        const defaultRelays = ["wss://relay.nsec.app"];

        const relayInput = await Input.prompt({
          message: `Enter relays (comma-separated), or press Enter for default (${
            defaultRelays.join(", ")
          }):`,
          default: defaultRelays.join(", "),
        });

        let chosenRelays: string[];
        if (
          relayInput.trim() === "" ||
          relayInput.trim() === defaultRelays.join(", ")
        ) {
          chosenRelays = defaultRelays;
        } else {
          chosenRelays = relayInput.split(",").map((r) => r.trim()).filter((
            r,
          ) => r.length > 0);
        }

        if (chosenRelays.length === 0) {
          console.log(
            colors.yellow("No relays provided. Using default relays."),
          );
          chosenRelays = defaultRelays;
        }

        console.log(
          colors.cyan(
            `Initiating Nostr Connect as '${appName}' on relays: ${chosenRelays.join(", ")}`,
          ),
        );
        signer = await initiateNostrConnect(appName, chosenRelays);
      } else {
        const bunkerUrl = await Input.prompt({
          message: "Enter the bunker URL (bunker://...):",
          validate: (input: string) => {
            return input.trim().startsWith("bunker://") ||
              "Bunker URL must start with bunker:// (format: bunker://<pubkey>?relay=...)";
          },
        });

        console.log(colors.cyan("Connecting to bunker via URL..."));
        signer = await NostrConnectSigner.fromBunkerURI(bunkerUrl);
      }

      if (!signer) {
        throw new Error("Failed to establish signer connection");
      }

      bunkerPubkey = await signer.getPublicKey();
      const nbunkString = getNbunkString(signer);
      await secretsManager.storeNbunk(bunkerPubkey, nbunkString);

      console.log(
        colors.green(
          `Successfully connected to bunker ${bunkerPubkey.slice(0, 8)}...
Generated and stored nbunksec string.`,
        ),
      );
    } catch (error) {
      log.error(`Failed to connect to bunker: ${error}`);
      console.error(
        colors.red(
          `Failed to connect to bunker: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      Deno.exit(1);
    } finally {
      if (signer) {
        try {
          console.log(colors.cyan("Disconnecting from bunker..."));
          await signer.close();
          console.log(colors.green("Disconnected from bunker."));
        } catch (err) {
          console.error(colors.red(`Error during disconnect: ${err}`));
        }
      }
    }
  } else if (keyChoice === "existing_bunker") {
    // Present a list of existing bunkers to choose from
    const bunkerOptions = existingBunkers.map((pubkey: string) => {
      return {
        name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        value: pubkey,
      };
    });

    const selectedPubkey = await Select.prompt<string>({
      message: "Select an existing bunker:",
      options: bunkerOptions,
    });

    bunkerPubkey = selectedPubkey;
    console.log(
      colors.green(
        `Using existing bunker with pubkey: ${selectedPubkey.slice(0, 8)}...`,
      ),
    );
  }

  // Ask if this is a root site or named site
  const siteType = await Select.prompt<string>({
    message: "What type of site are you creating?",
    options: [
      { name: "Root site - e.g., npub1xxxx.nsite.lol", value: "root" },
      {
        name: "Named site - e.g., {base36pubkey}blog.nsite.lol",
        value: "named",
      },
    ],
  });

  let siteId: string | null | undefined;
  if (siteType === "named") {
    const identifier = await Input.prompt({
      message: "Enter site identifier (lowercase, max 13 chars, e.g., blog, my-site):",
      validate: (input: string) => {
        const trimmed = input.trim();
        if (!trimmed) {
          return "Site identifier is required";
        }
        const result = validateDTag(trimmed);
        if (!result.valid) {
          const suggestion = suggestIdentifier(trimmed);
          return `${result.error}${suggestion !== trimmed ? `. Try "${suggestion}"` : ""}`;
        }
        return true;
      },
    });
    siteId = identifier.trim();
  } else {
    // Root site: set id to null or empty string
    siteId = null;
  }

  const siteTitle = await Input.prompt({
    message: "Enter site title (optional):",
  });

  const siteDescription = await Input.prompt({
    message: "Enter site description (optional):",
  });

  console.log(colors.cyan("\nEnter nostr relay URLs (leave empty when done):"));
  const relays = await promptForUrls("Enter relay URL:", popularRelays);

  console.log(
    colors.cyan("\nEnter blossom server URLs (leave empty when done):"),
  );
  const servers = await promptForUrls(
    "Enter blossom server URL:",
    popularBlossomServers,
  );

  const config: ProjectConfig = {
    "$schema": CONFIG_SCHEMA_URL,
    bunkerPubkey,
    relays,
    servers,
    id: siteId,
    title: siteTitle || undefined,
    description: siteDescription || undefined,
  };

  // Project-type step (additive, nsite-default). The nsite branch returns the EXACT
  // pre-phase config above (zero regression); the napp branch only ADDS `config.napp`.
  const projectType = await Select.prompt<string>({
    message: "Project type",
    options: [
      { name: "nsite (static site)", value: "nsite" },
      { name: "napp (discoverable app)", value: "napp" },
    ],
    default: "nsite",
  });

  if (projectType === "napp") {
    // Plan-check #4: the napp branch MUST degrade gracefully. An asset/upload failure
    // WARNS and still lets `nsyte init` finish (consistent with warn-but-write); it must
    // NOT throw out of interactiveSetup and abort the whole `nsyte init`.
    try {
      // Root-site guidance: a napp needs a NAMED site to be discoverable. We WARN and
      // (interactive) offer to set an id, but NEVER auto-migrate (no consent => no id).
      if (isRootSite(config)) {
        console.log(colors.yellow(rootSiteMigrationNotice()));
        const setIdNow = await Select.prompt<string>({
          message: "Set a site identifier now? (required for `nsyte napp id`)",
          options: [
            { name: "No — leave as a root site for now", value: "no" },
            { name: "Yes — set a named site identifier", value: "yes" },
          ],
          default: "no",
        });
        if (setIdNow === "yes") {
          const identifier = await Input.prompt({
            message: "Enter site identifier (lowercase, max 13 chars):",
            validate: (input: string) => {
              const trimmed = input.trim();
              if (!trimmed) return "Site identifier is required";
              const result = validateDTag(trimmed);
              if (!result.valid) {
                const suggestion = suggestIdentifier(trimmed);
                return `${result.error}${suggestion !== trimmed ? `. Try "${suggestion}"` : ""}`;
              }
              return true;
            },
          });
          config.id = identifier.trim();
        } else {
          console.log(
            colors.yellow(
              "Leaving this as a root site — `nsyte napp id` will not work until you set an id.",
            ),
          );
        }
      }

      // Wizard asset resolver: hash/URL pass through ({hash, mime}); a local path is
      // uploaded via uploadNappAsset when blossom servers + a signer are available, else
      // a clear error tells the author to configure servers or paste a hash/URL.
      const resolveAsset: NappAssetResolver = async (value: string) => {
        if (classifyAssetInput(value) !== "path") {
          return { hash: value, mime: deriveAssetMime(value) };
        }
        if (!config.servers || config.servers.length === 0) {
          throw new Error(
            `Cannot upload "${value}": configure blossom servers (or paste a sha256 hash / URL) for assets.`,
          );
        }
        const signerResult = await createSigner({
          sec: privateKey,
          bunkerPubkey,
        });
        if ("error" in signerResult) {
          throw new Error(
            `Cannot upload "${value}": ${signerResult.error} (or paste a sha256 hash / URL).`,
          );
        }
        return await uploadNappAsset(value, {
          servers: config.servers,
          relays: config.relays,
          signer: signerResult.signer,
        });
      };

      const napp = await collectNappListing({
        prefill: {},
        interactive: true,
        resolveAsset,
      });

      // Validate before writing. On errors, WARN but still attach the scaffold so the
      // author can fix `.nsite/config.json` by hand rather than losing their answers.
      const nappErrors = validateNappConfig(napp);
      if (nappErrors.length > 0) {
        for (const e of nappErrors) {
          console.log(colors.yellow(`  ${e.path}: ${e.message}`));
        }
        console.log(
          colors.yellow(
            "The napp section may need manual fixes in .nsite/config.json before deploying.",
          ),
        );
      }
      config.napp = napp;
    } catch (e) {
      // Graceful degradation: warn and still finish `nsyte init`.
      const msg = e instanceof Error ? e.message : String(e);
      console.log(
        colors.yellow(
          `Skipped napp section (you can add it later with \`nsyte napp init\`): ${msg}`,
        ),
      );
    }
  }

  return { config, privateKey };
}

/**
 * Prompt for URLs with suggestions
 */
async function promptForUrls(
  message: string,
  suggestions: string[],
): Promise<string[]> {
  const urls: string[] = [];

  while (true) {
    const url = await Input.prompt({
      message,
      suggestions,
      list: true,
    });

    if (!url) break;

    if (
      url.startsWith("http://") || url.startsWith("https://") ||
      url.startsWith("ws://") || url.startsWith("wss://")
    ) {
      urls.push(url);
    } else {
      console.log(
        colors.yellow(
          "Invalid URL format. Please include the protocol (http://, https://, ws://, wss://)",
        ),
      );
    }
  }

  return urls;
}
