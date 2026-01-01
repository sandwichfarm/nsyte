import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
import { Keypress } from "@cliffy/keypress";
import { join } from "@std/path";
import { validateConfigWithFeedback } from "../lib/config-validator.ts";
import { handleError } from "../lib/error-utils.ts";
import { createLogger } from "../lib/logger.ts";
import {
  clearScreen,
  enterAlternateScreen,
  exitAlternateScreen,
  getTerminalSize,
  hideCursor,
  moveCursor,
  showCursor,
} from "../ui/browse/renderer.ts";
// No need for yaml import since we're using JSON
import { existsSync } from "@std/fs/exists";
import { decodePointer, npubEncode } from "applesauce-core/helpers";

const log = createLogger("config");

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description("Interactive configuration editor for nsyte project settings")
    .option("-p, --path <path:string>", "Path to config file (default: ./nsyte.yaml)")
    .action(command);
}

interface ConfigField {
  key: string;
  value: any;
  type: "string" | "number" | "boolean" | "array" | "object" | "special";
  description?: string;
  required?: boolean;
  editable?: boolean;
  specialHandler?: string;
}

interface ConfigState {
  fields: ConfigField[];
  selectedIndex: number;
  editingIndex: number | null;
  editValue: string;
  config: any;
  originalConfig: any;
  configPath: string;
  hasChanges: boolean;
  status: string;
  statusColor?: (str: string) => string;
  showHelp: boolean;
  expandedPaths: Set<string>;
  bunkerSelection?: BunkerSelectionState;
}

const FIELD_DESCRIPTIONS: Record<
  string,
  { description: string; required?: boolean; editable?: boolean; specialHandler?: string }
> = {
  bunkerPubkey: {
    description: "Nostr bunker public key for signing",
    required: false,
    editable: true,
    specialHandler: "bunker",
  },
  fallback: { description: "Fallback path for 404 errors", required: false, editable: true },
  id: {
    description: "Site identifier (empty string or null for root site)",
    required: false,
    editable: true,
  },
  title: { description: "Site title", required: false, editable: true },
  description: { description: "Site description", required: false, editable: true },
  relays: { description: "List of Nostr relays to use", required: false, editable: true },
  servers: {
    description: "List of Blossom servers for file storage",
    required: false,
    editable: true,
  },
};

function flattenConfig(
  config: any,
  prefix = "",
  expandedPaths: Set<string> = new Set(),
): ConfigField[] {
  const fields: ConfigField[] = [];

  for (const [key, value] of Object.entries(config)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const fieldInfo = FIELD_DESCRIPTIONS[fullKey] || FIELD_DESCRIPTIONS[key] || {};

    if (value === null || value === undefined) {
      fields.push({
        key: fullKey,
        value: "",
        type: "string",
        ...fieldInfo,
        editable: fieldInfo.editable !== false,
      });
    } else if (Array.isArray(value)) {
      // Add the array field itself
      fields.push({
        key: fullKey,
        value: value,
        type: "array",
        ...fieldInfo,
        editable: fieldInfo.editable !== false,
      });

      // If this array should be expanded, add individual items
      if (expandedPaths.has(fullKey)) {
        value.forEach((item, index) => {
          fields.push({
            key: `${fullKey}[${index}]`,
            value: item,
            type: typeof item === "object"
              ? "object"
              : typeof item as "string" | "number" | "boolean",
            description: `Item ${index + 1}`,
            editable: true,
          });
        });
        // Add option to add new item
        fields.push({
          key: `${fullKey}[+]`,
          value: "<Add new item>",
          type: "special" as any,
          description: "Add a new item to this array",
          editable: true,
        });
      }
    } else if (typeof value === "object") {
      // Check if this object should be expanded or if we want to treat it as editable
      const isExpandable = !fieldInfo.editable;

      fields.push({
        key: fullKey,
        value: value,
        type: "object",
        ...fieldInfo,
        editable: fieldInfo.editable || false,
      });

      // If expanded, show nested fields
      if (isExpandable && expandedPaths.has(fullKey)) {
        // Recursively flatten nested objects
        fields.push(...flattenConfig(value, fullKey, expandedPaths));

        // Add option to add new property (for certain objects)
        if (fullKey === "profile") {
          fields.push({
            key: `${fullKey}.+`,
            value: "<Add new property>",
            type: "special" as any,
            description: "Add a new property to this object",
            editable: true,
          });
        }
      }
    } else {
      fields.push({
        key: fullKey,
        value: value,
        type: typeof value as "string" | "number" | "boolean",
        ...fieldInfo,
        editable: fieldInfo.editable !== false,
      });
    }
  }

  return fields;
}

function renderConfigEditor(state: ConfigState): void {
  clearScreen();
  const { rows, cols } = getTerminalSize();

  // Header (similar to browse)
  moveCursor(1, 1);
  const headerText = "nsyte config";
  const headerPadding = Math.floor((cols - headerText.length) / 2);
  console.log(colors.bgMagenta.white(" ".repeat(cols)));
  moveCursor(2, headerPadding);
  console.log(colors.bgMagenta.white.bold(headerText));

  // Config path
  moveCursor(3, 1);
  const pathText = `Config: ${state.configPath}`;
  console.log(colors.gray(pathText.padEnd(cols)));

  // Content area
  moveCursor(5, 1);

  // Calculate visible area (leave room for footer)
  const contentHeight = rows - 10; // Header (3) + spacing (2) + footer (5)

  // Adjust for description line if needed
  let visibleItems = contentHeight;
  if (state.fields[state.selectedIndex]?.description) {
    visibleItems = Math.floor(contentHeight * 0.8); // Leave some room for descriptions
  }

  const startIndex = Math.max(0, state.selectedIndex - Math.floor(visibleItems / 2));
  const endIndex = Math.min(state.fields.length, startIndex + visibleItems);

  // Show fields
  const maxKeyLength = Math.max(...state.fields.map((f) => f.key.length));

  state.fields.slice(startIndex, endIndex).forEach((field, relativeIndex) => {
    const index = startIndex + relativeIndex;
    const isSelected = index === state.selectedIndex;
    const isEditing = index === state.editingIndex;

    let line = "";
    const currentRow = 5 + relativeIndex;
    moveCursor(currentRow, 1);

    // Selection indicator
    if (isSelected) {
      line += colors.cyan("▶ ");
    } else {
      line += "  ";
    }

    // Key
    let displayKey = field.key;
    const depth = field.key.split(".").length - 1;

    // Indent based on depth
    if (field.key.includes("[") && !field.key.endsWith("[+]")) {
      // Array items
      displayKey = "  ".repeat(depth + 1) + field.key.substring(field.key.lastIndexOf(".") + 1);
    } else if (field.key.endsWith("[+]") || field.key.endsWith(".+")) {
      // Add new item button
      displayKey = "  ".repeat(depth + 1) + "+";
    } else if (depth > 0) {
      // Nested object properties
      displayKey = "  ".repeat(depth) + field.key.substring(field.key.lastIndexOf(".") + 1);
    }

    const paddedKey = displayKey.padEnd(maxKeyLength);
    if (isSelected) {
      line += colors.cyan.bold(paddedKey);
    } else if (field.key.endsWith("[+]")) {
      line += colors.green(paddedKey);
    } else {
      line += colors.gray(paddedKey);
    }

    line += " : ";

    // Value
    let valueStr = "";
    if (isEditing) {
      valueStr = state.editValue;
      if (Math.floor(Date.now() / 500) % 2 === 0) {
        valueStr += "_";
      }
    } else {
      if (field.type === "array" && !field.key.includes("[")) {
        const count = Array.isArray(field.value) ? field.value.length : 0;
        valueStr = `[${count} item${count !== 1 ? "s" : ""}]`;
        if (isSelected && !state.expandedPaths.has(field.key)) {
          valueStr += " (press ENTER to expand)";
        } else if (state.expandedPaths.has(field.key)) {
          valueStr += " (expanded)";
        }
      } else if (field.type === "object" && !field.key.includes(".") && !field.editable) {
        const keys = Object.keys(field.value || {});
        valueStr = `{${keys.length} field${keys.length !== 1 ? "s" : ""}}`;
        if (isSelected && !state.expandedPaths.has(field.key)) {
          valueStr += " (press ENTER to expand)";
        } else if (state.expandedPaths.has(field.key)) {
          valueStr += " (expanded)";
        }
      } else if (field.type === "object") {
        valueStr = "{...}";
      } else if (field.type === "boolean") {
        valueStr = String(field.value);
      } else if (
        field.type === "special" && (field.key.endsWith("[+]") || field.key.endsWith(".+"))
      ) {
        valueStr = field.value;
      } else {
        valueStr = field.value || "<empty>";
      }
    }

    if (isSelected || isEditing) {
      line += colors.white.bold(valueStr);
    } else if (!field.value || (Array.isArray(field.value) && field.value.length === 0)) {
      line += colors.gray.italic(valueStr);
    } else {
      line += colors.white(valueStr);
    }

    // Editable indicator
    if (field.editable && !isEditing) {
      line += colors.gray(" (editable)");
    }

    // Special handler indicator
    if (field.specialHandler) {
      line += colors.yellow(` [${field.specialHandler}]`);
    }

    console.log(line);

    // Description on next line if selected
    if (isSelected && field.description) {
      moveCursor(currentRow + 1, 1);
      console.log(colors.gray(`     ${field.description}`));
    }
  });

  // Footer
  const footerStart = rows - 4;
  moveCursor(footerStart, 1);
  console.log(colors.dim("─".repeat(cols)));

  // Status line
  moveCursor(footerStart + 1, 1);
  if (state.status) {
    const statusFn = state.statusColor || colors.white;
    console.log(statusFn(state.status));
  } else {
    console.log(colors.gray("Ready"));
  }

  // Changes indicator
  if (state.hasChanges) {
    const changesText = "* Unsaved changes";
    moveCursor(footerStart + 1, cols - changesText.length - 1);
    console.log(colors.yellow(changesText));
  }

  // Help line
  moveCursor(footerStart + 2, 1);
  if (state.editingIndex !== null) {
    console.log(colors.gray("ESC Cancel • ENTER Save • BACKSPACE Delete"));
  } else if (state.expandedPaths.size > 0) {
    console.log(
      colors.gray(
        "↑/↓ Navigate • ENTER Edit/Expand • DEL Delete • ESC Collapse all • s Save • q Quit",
      ),
    );
  } else if (state.showHelp) {
    console.log(
      colors.gray("↑/↓ Navigate • ENTER Edit/Expand • s Save • r Reset • h Hide help • q Quit"),
    );
  } else {
    console.log(colors.gray("↑/↓ Navigate • ENTER Edit/Expand • s Save • h Help • q Quit"));
  }

  // Render bunker selection overlay if active
  if (state.bunkerSelection?.active) {
    renderBunkerSelection(state.bunkerSelection, rows, cols);
  }
}

function renderBunkerSelection(
  bunkerState: BunkerSelectionState,
  rows: number,
  cols: number,
): void {
  // Calculate overlay dimensions
  const maxWidth = 60;
  const width = Math.min(maxWidth, cols - 10);
  const height = Math.min(bunkerState.options.length + 6, rows - 10);

  const startCol = Math.floor((cols - width) / 2);
  const startRow = Math.floor((rows - height) / 2);

  // Draw box
  moveCursor(startRow, startCol);
  console.log(colors.bgBlack.white("┌" + "─".repeat(width - 2) + "┐"));

  // Title
  moveCursor(startRow + 1, startCol);
  console.log(colors.bgBlack.white("│" + " ".repeat(width - 2) + "│"));
  moveCursor(startRow + 1, startCol + 2);
  console.log(colors.bgBlack.cyan.bold("Select Bunker"));

  // Separator
  moveCursor(startRow + 2, startCol);
  console.log(colors.bgBlack.white("├" + "─".repeat(width - 2) + "┤"));

  // Options
  if (bunkerState.enteringManual) {
    // Manual entry mode
    moveCursor(startRow + 3, startCol);
    console.log(colors.bgBlack.white("│" + " ".repeat(width - 2) + "│"));
    moveCursor(startRow + 3, startCol + 2);
    console.log(colors.bgBlack.white("Enter npub:"));

    moveCursor(startRow + 4, startCol);
    console.log(colors.bgBlack.white("│" + " ".repeat(width - 2) + "│"));
    moveCursor(startRow + 4, startCol + 2);
    const inputDisplay = bunkerState.manualInput +
      (Math.floor(Date.now() / 500) % 2 === 0 ? "_" : "");
    console.log(colors.bgBlack.green(inputDisplay.substring(0, width - 4)));

    // Help text
    moveCursor(startRow + 5, startCol);
    console.log(colors.bgBlack.white("│" + " ".repeat(width - 2) + "│"));
    moveCursor(startRow + 6, startCol);
    console.log(colors.bgBlack.white("│" + " ".repeat(width - 2) + "│"));
    moveCursor(startRow + 6, startCol + 2);
    console.log(colors.bgBlack.gray("ENTER Confirm • ESC Cancel"));
  } else {
    // List mode
    bunkerState.options.forEach((option, index) => {
      const row = startRow + 3 + index;
      moveCursor(row, startCol);
      console.log(colors.bgBlack.white("│" + " ".repeat(width - 2) + "│"));

      moveCursor(row, startCol + 2);
      const isSelected = index === bunkerState.selectedIndex;
      const displayName = option.name.length > width - 6
        ? option.name.substring(0, width - 9) + "..."
        : option.name;

      if (isSelected) {
        console.log(colors.bgBlack.bgMagenta.white(" " + displayName + " "));
      } else {
        console.log(colors.bgBlack.white(displayName));
      }
    });

    // Help text
    const helpRow = startRow + 3 + bunkerState.options.length;
    moveCursor(helpRow, startCol);
    console.log(colors.bgBlack.white("├" + "─".repeat(width - 2) + "┤"));
    moveCursor(helpRow + 1, startCol);
    console.log(colors.bgBlack.white("│" + " ".repeat(width - 2) + "│"));
    moveCursor(helpRow + 1, startCol + 2);
    console.log(colors.bgBlack.gray("↑/↓ Navigate • ENTER Select • ESC Cancel"));
  }

  // Bottom border
  const bottomRow = startRow + (bunkerState.enteringManual ? 7 : 4 + bunkerState.options.length);
  moveCursor(bottomRow, startCol);
  console.log(colors.bgBlack.white("└" + "─".repeat(width - 2) + "┘"));
}

function updateConfigValue(state: ConfigState, fieldIndex: number, newValue: any): void {
  const field = state.fields[fieldIndex];
  const keys = field.key.split(".");

  // Update the actual config object
  let current = state.config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = newValue;

  // Update the field value
  field.value = newValue;

  // Mark as changed
  state.hasChanges = true;
}

interface BunkerSelectionState {
  active: boolean;
  options: Array<{ name: string; value: string }>;
  selectedIndex: number;
  enteringManual: boolean;
  manualInput: string;
}

async function handleBunkerSpecial(state: ConfigState): Promise<BunkerSelectionState> {
  // Get available bunkers for TUI display
  try {
    const { SecretsManager } = await import("../lib/secrets/mod.ts");

    const secretsManager = SecretsManager.getInstance();
    const bunkerPubkeys = await secretsManager.getAllPubkeys();

    const currentValue = state.fields[state.selectedIndex].value;

    // Build options
    const options: Array<{ name: string; value: string }> = bunkerPubkeys.map((pubkey) => ({
      name: npubEncode(pubkey),
      value: pubkey,
    }));

    // Add manual entry option
    options.push({
      name: "Enter npub manually",
      value: "manual",
    });

    // Find current selection
    let selectedIndex = options.findIndex((opt) => opt.value === currentValue);
    if (selectedIndex === -1) selectedIndex = 0;

    return {
      active: true,
      options,
      selectedIndex,
      enteringManual: false,
      manualInput: "",
    };
  } catch (error) {
    log.error(`Failed to load bunkers: ${error}`);
    state.status = "Failed to load bunkers";
    state.statusColor = colors.red;
    return {
      active: false,
      options: [],
      selectedIndex: 0,
      enteringManual: false,
      manualInput: "",
    };
  }
}

async function saveConfig(state: ConfigState): Promise<boolean> {
  try {
    // Validate the config before saving
    const validationResult = validateConfigWithFeedback(state.config);
    if (!validationResult.valid) {
      state.status = `Validation failed: ${
        validationResult.errors?.map((e) => e.message).join(", ")
      }`;
      state.statusColor = colors.red;
      return false;
    }

    // Convert to JSON with nice formatting
    const jsonContent = JSON.stringify(state.config, null, 2);

    // Write to file
    await Deno.writeTextFile(state.configPath, jsonContent);

    state.hasChanges = false;
    state.originalConfig = structuredClone(state.config);
    state.status = "Configuration saved successfully";
    state.statusColor = colors.green;

    return true;
  } catch (error) {
    log.error(`Failed to save config: ${error}`);
    state.status = `Save failed: ${error}`;
    state.statusColor = colors.red;
    return false;
  }
}

export async function command(options: any): Promise<void> {
  try {
    // Check if we're in a TTY environment
    if (!Deno.stdout.isTerminal()) {
      throw new Error("Config editor requires an interactive terminal");
    }

    // Determine config path
    const configPath = options.path || join(Deno.cwd(), ".nsite", "config.json");

    // Enter TUI mode immediately for all messages
    enterAlternateScreen();
    hideCursor();

    // Check if config exists
    if (!existsSync(configPath)) {
      clearScreen();
      moveCursor(1, 1);
      console.log(colors.red("━".repeat(80)));
      console.log(colors.red.bold("  Configuration Error"));
      console.log(colors.red("━".repeat(80)));
      console.log();
      console.log(colors.red(`Config file not found: ${configPath}`));
      console.log();
      console.log(colors.yellow("Run 'nsyte init' to create a new project configuration"));
      console.log();
      console.log(colors.gray("Exiting in 3 seconds..."));

      await new Promise((resolve) => setTimeout(resolve, 3000));
      exitAlternateScreen();
      showCursor();
      Deno.exit(1);
    }

    // Read and parse config
    let config: any;
    try {
      const configContent = await Deno.readTextFile(configPath);
      config = JSON.parse(configContent) || {};
    } catch (error) {
      clearScreen();
      moveCursor(1, 1);
      console.log(colors.red("━".repeat(80)));
      console.log(colors.red.bold("  Configuration Error"));
      console.log(colors.red("━".repeat(80)));
      console.log();
      console.log(colors.red(`Failed to read config file: ${error}`));
      console.log();
      console.log(colors.gray("Exiting in 3 seconds..."));

      await new Promise((resolve) => setTimeout(resolve, 3000));
      exitAlternateScreen();
      showCursor();
      Deno.exit(1);
    }

    // Validate config
    const validationResult = validateConfigWithFeedback(config);
    if (!validationResult.valid) {
      clearScreen();
      moveCursor(1, 1);
      console.log(colors.yellow("━".repeat(80)));
      console.log(colors.yellow.bold("  Configuration Validation Issues"));
      console.log(colors.yellow("━".repeat(80)));
      console.log();
      console.log(colors.yellow("The following validation issues were found:"));
      console.log();
      validationResult.errors?.forEach((error: any) => {
        console.log(colors.red(`  • ${error.message || error}`));
      });
      console.log();
      console.log(colors.cyan("Opening editor to fix these issues..."));
      console.log();
      console.log(colors.gray("Starting in 3 seconds..."));

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Initialize state
    const expandedPaths = new Set<string>();
    const state: ConfigState = {
      fields: flattenConfig(config, "", expandedPaths),
      selectedIndex: 0,
      editingIndex: null,
      editValue: "",
      config: structuredClone(config),
      originalConfig: structuredClone(config),
      configPath,
      hasChanges: false,
      status: validationResult.valid
        ? "Configuration loaded"
        : "Configuration has validation errors",
      statusColor: validationResult.valid ? colors.green : colors.yellow,
      showHelp: false,
      expandedPaths,
    };

    // Initial render
    renderConfigEditor(state);

    // Handle keyboard input
    const keypress = new Keypress();

    for await (const event of keypress) {
      const key = event.key || "";
      const sequence = event.sequence || "";

      if (state.bunkerSelection?.active) {
        // Bunker selection mode
        if (state.bunkerSelection.enteringManual) {
          // Manual entry mode
          if (key === "escape") {
            state.bunkerSelection.enteringManual = false;
            state.bunkerSelection.manualInput = "";
          } else if (key === "return") {
            // Validate and apply
            try {
              const decoded = decodePointer(state.bunkerSelection.manualInput);
              if (decoded.type === "npub") {
                updateConfigValue(state, state.selectedIndex, decoded.data);
                state.status = "Bunker pubkey updated";
                state.statusColor = colors.green;
                state.bunkerSelection = undefined;
              } else {
                state.status = "Invalid npub format";
                state.statusColor = colors.red;
              }
            } catch {
              state.status = "Invalid npub format";
              state.statusColor = colors.red;
            }
          } else if (key === "backspace") {
            state.bunkerSelection.manualInput = state.bunkerSelection.manualInput.slice(0, -1);
          } else if (sequence && sequence.length === 1 && sequence >= " ") {
            state.bunkerSelection.manualInput += sequence;
          }
        } else {
          // List selection mode
          if (key === "up") {
            state.bunkerSelection.selectedIndex = Math.max(
              0,
              state.bunkerSelection.selectedIndex - 1,
            );
          } else if (key === "down") {
            state.bunkerSelection.selectedIndex = Math.min(
              state.bunkerSelection.options.length - 1,
              state.bunkerSelection.selectedIndex + 1,
            );
          } else if (key === "return") {
            const selected = state.bunkerSelection.options[state.bunkerSelection.selectedIndex];
            if (selected.value === "manual") {
              state.bunkerSelection.enteringManual = true;
              state.bunkerSelection.manualInput = "";
            } else {
              updateConfigValue(state, state.selectedIndex, selected.value);
              state.status = "Bunker pubkey updated";
              state.statusColor = colors.green;
              state.bunkerSelection = undefined;
            }
          } else if (key === "escape") {
            state.bunkerSelection = undefined;
            state.status = "Bunker selection cancelled";
            state.statusColor = colors.yellow;
          }
        }
      } else if (state.editingIndex !== null) {
        // Editing mode
        if (key === "escape") {
          state.editingIndex = null;
          state.editValue = "";
          state.status = "Edit cancelled";
          state.statusColor = colors.yellow;
        } else if (key === "return") {
          const field = state.fields[state.editingIndex];

          // Parse the value based on type
          let newValue: any = state.editValue;
          if (field.type === "number") {
            newValue = Number(state.editValue);
            if (isNaN(newValue)) {
              state.status = "Invalid number";
              state.statusColor = colors.red;
              renderConfigEditor(state);
              continue;
            }
          } else if (field.type === "boolean") {
            newValue = state.editValue.toLowerCase() === "true";
          } else if (field.type === "array") {
            newValue = state.editValue.split(",").map((s) => s.trim()).filter((s) => s);
          }

          // Handle array item editing differently
          if (field.key.includes("[") && !field.key.endsWith("[+]")) {
            // Parse array index
            const match = field.key.match(/\[(\d+)\]$/);
            if (match) {
              const index = parseInt(match[1]);
              const arrayKey = field.key.substring(0, field.key.lastIndexOf("["));
              const keys = arrayKey.split(".");

              // Navigate to array in config
              let current = state.config;
              for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
              }
              const lastKey = keys[keys.length - 1];

              // Update array item
              if (Array.isArray(current[lastKey])) {
                current[lastKey][index] = newValue;
                state.hasChanges = true;

                // Update fields to reflect change
                state.expandedPaths.add(arrayKey);
                state.fields = flattenConfig(state.config, "", state.expandedPaths);
              }
            }
          } else {
            updateConfigValue(state, state.editingIndex, newValue);
          }

          state.editingIndex = null;
          state.editValue = "";
          state.status = "Value updated";
          state.statusColor = colors.green;
        } else if (key === "backspace") {
          state.editValue = state.editValue.slice(0, -1);
        } else if (sequence && sequence.length === 1 && sequence >= " ") {
          state.editValue += sequence;
        }
      } else {
        // Navigation mode
        switch (key) {
          case "up":
            if (state.selectedIndex > 0) {
              state.selectedIndex--;
            }
            break;

          case "down":
            if (state.selectedIndex < state.fields.length - 1) {
              state.selectedIndex++;
            }
            break;

          case "return": {
            const field = state.fields[state.selectedIndex];

            // Handle array/object expansion/collapse
            if (
              (field.type === "array" || (field.type === "object" && !field.editable)) &&
              !field.key.includes("[") && !field.key.includes(".profile.")
            ) {
              // Toggle expansion
              if (state.expandedPaths.has(field.key)) {
                // Collapse
                state.expandedPaths.delete(field.key);
                state.status = field.type === "array" ? "Array collapsed" : "Object collapsed";
              } else {
                // Expand
                state.expandedPaths.add(field.key);
                state.status = field.type === "array" ? "Array expanded" : "Object expanded";
              }
              state.statusColor = colors.cyan;
              state.fields = flattenConfig(state.config, "", state.expandedPaths);
            } else if (field.key.endsWith("[+]")) {
              // Add new array item
              exitAlternateScreen();
              showCursor();

              const { Input } = await import("@cliffy/prompt");
              const newValue = await Input.prompt({
                message: "Enter new value:",
              });

              enterAlternateScreen();
              hideCursor();

              if (newValue) {
                // Get array key
                const arrayKey = field.key.substring(0, field.key.length - 3);
                const keys = arrayKey.split(".");

                // Navigate to array in config
                let current = state.config;
                for (let i = 0; i < keys.length - 1; i++) {
                  current = current[keys[i]];
                }
                const lastKey = keys[keys.length - 1];

                // Add to array
                if (!Array.isArray(current[lastKey])) {
                  current[lastKey] = [];
                }
                current[lastKey].push(newValue);

                // Update fields
                state.expandedPaths.add(arrayKey);
                state.fields = flattenConfig(state.config, "", state.expandedPaths);
                state.hasChanges = true;
                state.status = "Item added";
                state.statusColor = colors.green;
              }
            } else if (field.key.endsWith(".+")) {
              // Add new property to object
              exitAlternateScreen();
              showCursor();

              const { Input } = await import("@cliffy/prompt");
              const propertyName = await Input.prompt({
                message: "Enter property name:",
                validate: (value) => {
                  if (!value || value.includes(".") || value.includes("[") || value.includes("]")) {
                    return "Invalid property name";
                  }
                  return true;
                },
              });

              if (propertyName) {
                const propertyValue = await Input.prompt({
                  message: `Enter value for ${propertyName}:`,
                });

                enterAlternateScreen();
                hideCursor();

                if (propertyValue !== undefined) {
                  // Get object key
                  const objectKey = field.key.substring(0, field.key.length - 2);
                  const keys = objectKey.split(".");

                  // Navigate to object in config
                  let current = state.config;
                  for (let i = 0; i < keys.length - 1; i++) {
                    current = current[keys[i]];
                  }
                  const lastKey = keys[keys.length - 1];

                  // Add to object
                  if (!current[lastKey]) {
                    current[lastKey] = {};
                  }
                  current[lastKey][propertyName] = propertyValue;

                  // Update fields
                  state.expandedPaths.add(objectKey);
                  state.fields = flattenConfig(state.config, "", state.expandedPaths);
                  state.hasChanges = true;
                  state.status = "Property added";
                  state.statusColor = colors.green;
                }
              } else {
                enterAlternateScreen();
                hideCursor();
              }
            } else if (field.editable) {
              if (field.specialHandler === "bunker") {
                state.bunkerSelection = await handleBunkerSpecial(state);
                state.status = "Select a bunker";
                state.statusColor = colors.cyan;
              } else {
                state.editingIndex = state.selectedIndex;
                if (field.type === "array") {
                  state.editValue = Array.isArray(field.value) ? field.value.join(", ") : "";
                } else {
                  state.editValue = String(field.value || "");
                }
                state.status = `Editing ${field.key}`;
                state.statusColor = colors.cyan;
              }
            } else {
              state.status = "Field is not editable";
              state.statusColor = colors.red;
            }
            break;
          }

          case "s":
            if (state.hasChanges) {
              await saveConfig(state);
            } else {
              state.status = "No changes to save";
              state.statusColor = colors.yellow;
            }
            break;

          case "r":
            if (state.hasChanges) {
              state.config = structuredClone(state.originalConfig);
              state.fields = flattenConfig(state.config);
              state.hasChanges = false;
              state.status = "Configuration reset to original";
              state.statusColor = colors.yellow;
            }
            break;

          case "delete":
          case "backspace": {
            const deleteField = state.fields[state.selectedIndex];
            // Allow deleting array items and object properties
            if (
              (deleteField.key.includes("[") && !deleteField.key.endsWith("[+]")) ||
              (deleteField.key.includes(".") && deleteField.key.split(".").length > 1 &&
                !deleteField.key.endsWith(".+") && deleteField.editable)
            ) {
              exitAlternateScreen();
              showCursor();

              const { Confirm } = await import("@cliffy/prompt");
              const shouldDelete = await Confirm.prompt({
                message: `Delete "${deleteField.value}"?`,
                default: false,
              });

              enterAlternateScreen();
              hideCursor();

              if (shouldDelete) {
                // Check if it's an array item or object property
                const arrayMatch = deleteField.key.match(/\[(\d+)\]$/);
                if (arrayMatch) {
                  // Array item deletion
                  const index = parseInt(arrayMatch[1]);
                  const arrayKey = deleteField.key.substring(0, deleteField.key.lastIndexOf("["));
                  const keys = arrayKey.split(".");

                  // Navigate to array in config
                  let current = state.config;
                  for (let i = 0; i < keys.length - 1; i++) {
                    current = current[keys[i]];
                  }
                  const lastKey = keys[keys.length - 1];

                  // Remove from array
                  if (Array.isArray(current[lastKey])) {
                    current[lastKey].splice(index, 1);

                    // Update fields
                    state.expandedPaths.add(arrayKey);
                    state.fields = flattenConfig(state.config, "", state.expandedPaths);
                    state.hasChanges = true;
                    state.status = "Item deleted";
                    state.statusColor = colors.green;

                    // Adjust selected index if needed
                    if (state.selectedIndex >= state.fields.length) {
                      state.selectedIndex = Math.max(0, state.fields.length - 1);
                    }
                  }
                } else {
                  // Object property deletion
                  const keys = deleteField.key.split(".");
                  const propertyName = keys[keys.length - 1];

                  // Navigate to parent object
                  let current = state.config;
                  for (let i = 0; i < keys.length - 2; i++) {
                    current = current[keys[i]];
                  }
                  const parentKey = keys[keys.length - 2];

                  // Delete property
                  if (current[parentKey] && typeof current[parentKey] === "object") {
                    delete current[parentKey][propertyName];

                    // Update fields
                    const parentPath = keys.slice(0, -1).join(".");
                    state.expandedPaths.add(parentPath);
                    state.fields = flattenConfig(state.config, "", state.expandedPaths);
                    state.hasChanges = true;
                    state.status = "Property deleted";
                    state.statusColor = colors.green;

                    // Adjust selected index if needed
                    if (state.selectedIndex >= state.fields.length) {
                      state.selectedIndex = Math.max(0, state.fields.length - 1);
                    }
                  }
                }
              }
            }
            break;
          }

          case "h":
            state.showHelp = !state.showHelp;
            break;

          case "escape":
            // If any paths are expanded, collapse them all
            if (state.expandedPaths.size > 0) {
              state.expandedPaths.clear();
              state.fields = flattenConfig(state.config, "", state.expandedPaths);
              state.status = "All sections collapsed";
              state.statusColor = colors.cyan;
              break;
            }
            // Otherwise fall through to quit
          case "q":
            if (state.hasChanges) {
              exitAlternateScreen();
              showCursor();
              console.log(colors.yellow("You have unsaved changes."));
              console.log("Save before exiting? (y/n)");

              // Use Confirm prompt instead of raw stdin
              const { Confirm } = await import("@cliffy/prompt");
              const shouldSave = await Confirm.prompt({
                message: "Save before exiting?",
                default: true,
              });

              if (shouldSave) {
                enterAlternateScreen();
                hideCursor();
                await saveConfig(state);
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }

            keypress.dispose();
            exitAlternateScreen();
            showCursor();
            Deno.exit(0);
            break;
        }
      }

      renderConfigEditor(state);
    }
  } catch (error: unknown) {
    exitAlternateScreen();
    showCursor();
    handleError("Error in config editor", error, {
      showConsole: true,
      exit: true,
      exitCode: 1,
    });
  }
}
