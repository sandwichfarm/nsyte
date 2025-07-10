import Ajv from "https://esm.sh/ajv@8.17.1";
import addFormats from "https://esm.sh/ajv-formats@3.0.1";
import configSchema from "../schemas/config.schema.json" with { type: "json" };
import { createLogger } from "./logger.ts";

const log = createLogger("config-validator");

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
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strictSchema: true,
    addUsedSchema: false,
  });
  
  // Add format validators for uri, hostname, etc.
  addFormats(ajv);
  
  return ajv;
}

/**
 * Validate a configuration object against the schema
 */
export function validateConfig(config: unknown): ValidationResult {
  const ajv = createValidator();
  const validate = ajv.compile(configSchema);
  
  const valid = validate(config);
  
  if (!valid && validate.errors) {
    const errors: ValidationError[] = validate.errors.map(err => ({
      path: err.instancePath || "/",
      message: err.message || "Unknown validation error",
    }));
    
    return { valid: false, errors };
  }
  
  return { valid: true, errors: [] };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map(err => `  - ${err.path}: ${err.message}`)
    .join("\n");
}

/**
 * Check if config has deprecated fields and return warnings
 */
export function checkDeprecatedFields(config: any): string[] {
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
    if (error.path.includes("/kinds/") && (error.message.includes("must be <=") || error.message.includes("must be >="))) {
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