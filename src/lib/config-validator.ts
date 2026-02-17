import Ajv from "ajv";
import addFormats from "ajv-formats";
import configSchema from "../schemas/config.schema.json" with { type: "json" };
const AjvConstructor = Ajv as unknown as typeof Ajv.default;
const addFormatsFunction = addFormats as unknown as typeof addFormats.default;

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Create and configure AJV validator instance
 */
function createValidator() {
  const ajv = new AjvConstructor({
    allErrors: true,
    verbose: true,
    strictSchema: true,
    addUsedSchema: false,
  });

  // Add format validators for uri, hostname, etc.
  addFormatsFunction(ajv);

  return ajv;
}

/**
 * Validate a configuration object against the schema
 */
export function validateConfig(config: unknown): ValidationResult {
  const ajv = createValidator();
  const validate = ajv.compile(configSchema);

  const valid = validate(config);
  const errors: ValidationError[] = [];

  if (!valid && validate.errors) {
    errors.push(...validate.errors.map((err) => ({
      path: err.instancePath || "/",
      message: err.message || "Unknown validation error",
    })));
  }

  // Custom validation: root sites with app handlers must have appHandler.id
  if (config && typeof config === "object") {
    const cfg = config as {
      id?: string | null;
      publishAppHandler?: boolean;
      publishProfile?: boolean;
      publishRelayList?: boolean;
      publishServerList?: boolean;
      appHandler?: { id?: string };
      profile?: Record<string, unknown>;
    };
    const isRootSite = cfg.id === null || cfg.id === "" || cfg.id === undefined;
    const hasAppHandler = cfg.appHandler && cfg.publishAppHandler === true;

    if (isRootSite && hasAppHandler && !cfg.appHandler?.id) {
      errors.push({
        path: "/appHandler/id",
        message:
          "is required for root sites (sites without an 'id' field). Root sites must specify 'appHandler.id' to publish app handlers.",
      });
    }

    // Custom validation: metadata publishing only allowed for root sites
    const wantsToPublishMetadata =
      cfg.publishProfile === true ||
      cfg.publishRelayList === true ||
      cfg.publishServerList === true;

    if (!isRootSite && wantsToPublishMetadata) {
      const requested = [];
      if (cfg.publishProfile) requested.push("publishProfile");
      if (cfg.publishRelayList) requested.push("publishRelayList");
      if (cfg.publishServerList) requested.push("publishServerList");

      errors.push({
        path: `/${requested[0]}`,
        message:
          `Publishing profile, relay list, and server list is only allowed for root sites. Named sites cannot override user-level metadata. Remove ${
            requested.join(", ")
          } from your config or set 'id' to null/empty string to make this a root site.`,
      });
    }

    // Custom validation: profile object required when publishProfile is enabled
    if (cfg.publishProfile && (!cfg.profile || Object.keys(cfg.profile).length === 0)) {
      errors.push({
        path: "/profile",
        message:
          "is required when 'publishProfile' is true. Add a 'profile' object with at least one field (name, about, picture, etc.).",
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((err) => `  - ${err.path}: ${err.message}`)
    .join("\n");
}

/**
 * Check if config has deprecated fields and return warnings
 */
export function checkDeprecatedFields(_config: unknown): string[] {
  const warnings: string[] = [];

  // Add deprecation checks here as needed in the future
  // Example:
  // if (config.oldFieldName) {
  //   warnings.push("'oldFieldName' is deprecated, use 'newFieldName' instead");
  // }

  return warnings;
}

/**
 * Suggest fixes for common configuration errors
 */
export function suggestConfigFixes(errors: ValidationError[]): string[] {
  const suggestions: string[] = [];

  for (const error of errors) {
    // Relay URL format
    if (error.path.includes("/relays/") && error.message.includes("pattern")) {
      suggestions.push("Relay URLs must start with 'wss://' or 'ws://'");
    }

    // Server URL format
    if (error.path.includes("/servers/") && error.message.includes("pattern")) {
      suggestions.push("Server URLs must start with 'https://' or 'http://'");
    }

    // Bunker pubkey format
    if (error.path === "/bunkerPubkey" && error.message.includes("pattern")) {
      suggestions.push("Bunker public key must be a 64-character hex string");
    }

    // Missing required fields
    if (error.message.includes("must have required property")) {
      const field = error.message.match(/'([^']+)'/)?.[1];
      if (field === "relays") {
        suggestions.push("Add at least one relay URL to the 'relays' array");
      } else if (field === "servers") {
        suggestions.push("Add at least one Blossom server URL to the 'servers' array");
      }
    }

    // Platform enum values
    if (error.path.includes("/platforms/") && error.message.includes("must be equal to one of")) {
      suggestions.push("Valid platforms are: web, linux, windows, macos, android, ios");
    }

    // Event kinds range
    if (
      error.path.includes("/kinds/") &&
      (error.message.includes("must be <=") || error.message.includes("must be >="))
    ) {
      suggestions.push("Event kinds must be between 0 and 65535");
    }
  }

  return [...new Set(suggestions)]; // Remove duplicates
}

/**
 * Validate config file and provide detailed feedback
 */
export function validateConfigWithFeedback(config: unknown): {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  suggestions: string[];
} {
  const result = validateConfig(config);
  const warnings = checkDeprecatedFields(config);
  const suggestions = result.valid ? [] : suggestConfigFixes(result.errors);

  return {
    valid: result.valid,
    errors: result.errors,
    warnings,
    suggestions,
  };
}
