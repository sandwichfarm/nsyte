import { assertEquals, assertExists } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";

Deno.test("UI Interactions - Progress Display", async (t) => {
  await t.step("should format progress bar correctly", () => {
    const formatProgressBar = (current: number, total: number, width = 20) => {
      const percentage = total === 0 ? 100 : Math.floor((current / total) * 100);
      const filledWidth = Math.floor((percentage / 100) * width);
      const emptyWidth = width - filledWidth;

      const filledPart = "█".repeat(filledWidth);
      const emptyPart = "░".repeat(emptyWidth);

      return `[${filledPart}${emptyPart}] ${percentage}%`;
    };

    // Test various progress states
    assertEquals(formatProgressBar(0, 10), "[░░░░░░░░░░░░░░░░░░░░] 0%");
    assertEquals(formatProgressBar(5, 10), "[██████████░░░░░░░░░░] 50%");
    assertEquals(formatProgressBar(10, 10), "[████████████████████] 100%");
    assertEquals(formatProgressBar(0, 0), "[████████████████████] 100%"); // Edge case: empty total
  });

  await t.step("should handle progress updates", () => {
    interface ProgressState {
      current: number;
      total: number;
      status: string;
      errors: string[];
    }

    const createProgressTracker = () => {
      let state: ProgressState = {
        current: 0,
        total: 0,
        status: "idle",
        errors: [],
      };

      return {
        setTotal: (total: number) => {
          state.total = total;
          state.status = "initialized";
        },
        increment: () => {
          state.current = Math.min(state.current + 1, state.total);
          if (state.current === state.total) {
            state.status = "completed";
          } else {
            state.status = "in_progress";
          }
        },
        addError: (error: string) => {
          state.errors.push(error);
          state.status = "error";
        },
        getState: () => ({ ...state }),
        getPercentage: () => {
          if (state.total === 0) return 0;
          return Math.round((state.current / state.total) * 100);
        },
      };
    };

    const tracker = createProgressTracker();

    // Test initialization
    tracker.setTotal(5);
    assertEquals(tracker.getState().status, "initialized");
    assertEquals(tracker.getPercentage(), 0);

    // Test progress updates
    tracker.increment();
    tracker.increment();
    assertEquals(tracker.getState().current, 2);
    assertEquals(tracker.getPercentage(), 40);
    assertEquals(tracker.getState().status, "in_progress");

    // Test completion
    tracker.increment();
    tracker.increment();
    tracker.increment();
    assertEquals(tracker.getState().status, "completed");
    assertEquals(tracker.getPercentage(), 100);

    // Test error handling
    tracker.addError("Upload failed");
    assertEquals(tracker.getState().status, "error");
    assertEquals(tracker.getState().errors.length, 1);
  });

  await t.step("should format status messages", () => {
    const formatStatusMessage = (
      type: "info" | "success" | "warning" | "error",
      message: string,
    ) => {
      const symbols = {
        info: "ℹ",
        success: "✓",
        warning: "⚠",
        error: "✗",
      };

      const colors = {
        info: (text: string) => `\x1b[36m${text}\x1b[0m`, // Cyan
        success: (text: string) => `\x1b[32m${text}\x1b[0m`, // Green
        warning: (text: string) => `\x1b[33m${text}\x1b[0m`, // Yellow
        error: (text: string) => `\x1b[31m${text}\x1b[0m`, // Red
      };

      const symbol = symbols[type];
      const colorFn = colors[type];

      return `${colorFn(symbol)} ${message}`;
    };

    const infoMsg = formatStatusMessage("info", "Starting upload...");
    const successMsg = formatStatusMessage("success", "Upload completed");
    const warningMsg = formatStatusMessage("warning", "Some files skipped");
    const errorMsg = formatStatusMessage("error", "Upload failed");

    assertEquals(infoMsg.includes("ℹ"), true);
    assertEquals(infoMsg.includes("Starting upload"), true);
    assertEquals(successMsg.includes("✓"), true);
    assertEquals(warningMsg.includes("⚠"), true);
    assertEquals(errorMsg.includes("✗"), true);
  });
});

Deno.test("UI Interactions - Table Formatting", async (t) => {
  await t.step("should format data tables", () => {
    const formatTable = (headers: string[], rows: string[][]) => {
      // Calculate column widths
      const columnWidths = headers.map((header) => header.length);

      for (const row of rows) {
        row.forEach((cell, index) => {
          const cellLength = cell.replace(/\x1b\[[0-9;]*m/g, "").length; // Strip ANSI codes
          if (cellLength > columnWidths[index]) {
            columnWidths[index] = cellLength;
          }
        });
      }

      // Format header
      const headerRow = headers.map((header, index) => header.padEnd(columnWidths[index])).join(
        " | ",
      );

      // Format separator
      const separator = columnWidths.map((width) => "-".repeat(width)).join("-+-");

      // Format data rows
      const dataRows = rows.map((row) =>
        row.map((cell, index) => {
          const cleanCell = cell.replace(/\x1b\[[0-9;]*m/g, "");
          const padding = columnWidths[index] - cleanCell.length;
          return cell + " ".repeat(padding);
        }).join(" | ")
      );

      return [headerRow, separator, ...dataRows].join("\n");
    };

    const headers = ["File", "Size", "Status"];
    const rows = [
      ["index.html", "1.2 KB", "✓ Uploaded"],
      ["style.css", "856 B", "✗ Failed"],
      ["script.js", "3.4 KB", "⚠ Skipped"],
    ];

    const table = formatTable(headers, rows);

    assertEquals(table.includes("File"), true);
    assertEquals(table.includes("Size"), true);
    assertEquals(table.includes("Status"), true);
    assertEquals(table.includes("index.html"), true);
    assertEquals(table.includes("✓ Uploaded"), true);
    assertEquals(table.split("\n").length, 5); // Header + separator + 3 rows
  });

  await t.step("should handle empty tables", () => {
    const formatEmptyTable = (headers: string[]) => {
      if (headers.length === 0) {
        return "No data available";
      }

      const headerRow = headers.join(" | ");
      const separator = headers.map(() => "---").join("-+-");

      return `${headerRow}\n${separator}\n(no rows)`;
    };

    const emptyTable = formatEmptyTable(["Name", "Value"]);
    assertEquals(emptyTable.includes("Name | Value"), true);
    assertEquals(emptyTable.includes("(no rows)"), true);

    const noHeaders = formatEmptyTable([]);
    assertEquals(noHeaders, "No data available");
  });
});

Deno.test("UI Interactions - Interactive Elements", async (t) => {
  await t.step("should handle confirmation dialogs", () => {
    const simulateConfirmation = (question: string, defaultValue = false) => {
      // Simulate user input for testing
      const responses = new Map([
        ["Delete all files?", false],
        ["Continue with upload?", true],
        ["Overwrite existing config?", false],
      ]);

      return responses.get(question) ?? defaultValue;
    };

    assertEquals(simulateConfirmation("Delete all files?"), false);
    assertEquals(simulateConfirmation("Continue with upload?"), true);
    assertEquals(simulateConfirmation("Unknown question?"), false);
    assertEquals(simulateConfirmation("Unknown question?", true), true);
  });

  await t.step("should handle selection menus", () => {
    const simulateSelection = <T>(options: Array<{ name: string; value: T }>, question: string) => {
      // Simulate menu selection for testing
      const menuResponses = new Map([
        ["Choose relay", 0],
        ["Select server", 1],
        ["Pick action", 2],
      ]);

      const selectedIndex = menuResponses.get(question) ?? 0;
      return options[selectedIndex]?.value;
    };

    const relayOptions = [
      { name: "Default Relay", value: "wss://relay.default.com" },
      { name: "Custom Relay", value: "wss://relay.custom.com" },
    ];

    const serverOptions = [
      { name: "Server A", value: "https://server-a.com" },
      { name: "Server B", value: "https://server-b.com" },
      { name: "Server C", value: "https://server-c.com" },
    ];

    assertEquals(simulateSelection(relayOptions, "Choose relay"), "wss://relay.default.com");
    assertEquals(simulateSelection(serverOptions, "Select server"), "https://server-b.com");
  });

  await t.step("should handle text input validation", () => {
    const validateTextInput = (input: string, rules: {
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
    }) => {
      const errors: string[] = [];

      if (rules.required && !input.trim()) {
        errors.push("This field is required");
      }

      if (rules.minLength && input.length < rules.minLength) {
        errors.push(`Minimum length is ${rules.minLength} characters`);
      }

      if (rules.maxLength && input.length > rules.maxLength) {
        errors.push(`Maximum length is ${rules.maxLength} characters`);
      }

      if (rules.pattern && !rules.pattern.test(input)) {
        errors.push("Invalid format");
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    };

    // Test valid inputs
    const validName = validateTextInput("John Doe", {
      required: true,
      minLength: 2,
      maxLength: 50,
    });
    assertEquals(validName.isValid, true);
    assertEquals(validName.errors.length, 0);

    const validEmail = validateTextInput("test@example.com", {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    });
    assertEquals(validEmail.isValid, true);

    // Test invalid inputs
    const emptyRequired = validateTextInput("", { required: true });
    assertEquals(emptyRequired.isValid, false);
    assertEquals(emptyRequired.errors.includes("This field is required"), true);

    const tooShort = validateTextInput("Hi", { minLength: 5 });
    assertEquals(tooShort.isValid, false);
    assertEquals(tooShort.errors.some((e) => e.includes("Minimum length")), true);

    const invalidEmail = validateTextInput("not-an-email", {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    });
    assertEquals(invalidEmail.isValid, false);
    assertEquals(invalidEmail.errors.includes("Invalid format"), true);
  });
});

Deno.test("UI Interactions - Responsive Layout", async (t) => {
  await t.step("should adapt to terminal width", () => {
    const adaptToTerminalWidth = (content: string, maxWidth: number) => {
      const lines = content.split("\n");
      const adaptedLines: string[] = [];

      for (const line of lines) {
        if (line.length <= maxWidth) {
          adaptedLines.push(line);
        } else {
          // Word wrap long lines
          const words = line.split(" ");
          let currentLine = "";

          for (const word of words) {
            if ((currentLine + " " + word).length <= maxWidth) {
              currentLine += (currentLine ? " " : "") + word;
            } else {
              if (currentLine) {
                adaptedLines.push(currentLine);
              }
              currentLine = word;
            }
          }

          if (currentLine) {
            adaptedLines.push(currentLine);
          }
        }
      }

      return adaptedLines.join("\n");
    };

    const longContent =
      "This is a very long line that should be wrapped to fit within the specified terminal width";
    const wrapped = adaptToTerminalWidth(longContent, 40);

    const lines = wrapped.split("\n");
    assertEquals(lines.length > 1, true); // Should be wrapped
    assertEquals(lines.every((line) => line.length <= 40), true); // All lines should fit
  });

  await t.step("should handle different content types", () => {
    const formatContentForWidth = (content: any, width: number): any => {
      if (typeof content === "string") {
        return content.length > width ? content.substring(0, width - 3) + "..." : content;
      }

      if (Array.isArray(content)) {
        return content.map((item) => formatContentForWidth(item, width));
      }

      if (typeof content === "object" && content !== null) {
        const formatted: Record<string, any> = {};
        for (const [key, value] of Object.entries(content)) {
          formatted[key] = formatContentForWidth(value, width);
        }
        return formatted;
      }

      return String(content);
    };

    // Test string truncation
    const longString = "This is a very long string that needs truncation";
    const truncated = formatContentForWidth(longString, 20);
    assertEquals(truncated.length, 20);
    assertEquals(truncated.endsWith("..."), true);

    // Test array handling
    const array = ["short", "this is a much longer string"];
    const formattedArray = formatContentForWidth(array, 15);
    assertEquals(Array.isArray(formattedArray), true);
    assertEquals((formattedArray as string[])[1].length, 15);

    // Test object handling
    const obj = { short: "ok", long: "this is too long for the width" };
    const formattedObj = formatContentForWidth(obj, 10);
    assertEquals(typeof formattedObj, "object");
    assertEquals((formattedObj as any).long.length, 10);
  });
});

Deno.test("UI Interactions - Error Display", async (t) => {
  await t.step("should format error messages appropriately", () => {
    const formatError = (error: Error | string, context?: string) => {
      const message = typeof error === "string" ? error : error.message;
      const stack = typeof error === "object" && error.stack ? error.stack : null;

      let formatted = `❌ Error: ${message}`;

      if (context) {
        formatted = `❌ Error in ${context}: ${message}`;
      }

      // Add helpful suggestions based on error type
      if (message.toLowerCase().includes("permission denied")) {
        formatted += "\n💡 Suggestion: Check file permissions or run with appropriate privileges";
      } else if (
        message.toLowerCase().includes("network") || message.toLowerCase().includes("connection")
      ) {
        formatted += "\n💡 Suggestion: Check your internet connection and try again";
      } else if (message.toLowerCase().includes("not found")) {
        formatted += "\n💡 Suggestion: Verify the file or directory exists";
      }

      return formatted;
    };

    const networkError = formatError(new Error("Network connection failed"), "upload");
    assertEquals(networkError.includes("Error in upload"), true);
    assertEquals(networkError.includes("Check your internet connection"), true);

    const permissionError = formatError("Permission denied");
    assertEquals(permissionError.includes("Check file permissions"), true);

    const notFoundError = formatError(new Error("File not found"));
    assertEquals(notFoundError.includes("Verify the file"), true);
  });

  await t.step("should handle error recovery suggestions", () => {
    const getRecoverySuggestions = (errorType: string, context: string) => {
      const suggestions: Record<string, string[]> = {
        network: [
          "Check your internet connection",
          "Try again in a few moments",
          "Verify the server URL is correct",
        ],
        permission: [
          "Check file permissions",
          "Run with appropriate privileges",
          "Ensure the directory is writable",
        ],
        configuration: [
          "Run 'nsyte init' to create configuration",
          "Check your configuration file syntax",
          "Verify relay and server URLs",
        ],
        authentication: [
          "Check your private key or bunker connection",
          "Verify your credentials are correct",
          "Try reconnecting to the bunker",
        ],
      };

      const contextSpecific: Record<string, string[]> = {
        upload: ["Check if files exist", "Verify file permissions"],
        download: ["Ensure sufficient disk space", "Check download directory permissions"],
        init: ["Ensure directory is writable", "Remove existing config if corrupted"],
      };

      const generalSuggestions = suggestions[errorType] || ["Try again later"];
      const specificSuggestions = contextSpecific[context] || [];

      return [...generalSuggestions, ...specificSuggestions];
    };

    const networkSuggestions = getRecoverySuggestions("network", "upload");
    assertEquals(networkSuggestions.includes("Check your internet connection"), true);
    assertEquals(networkSuggestions.includes("Check if files exist"), true);

    const configSuggestions = getRecoverySuggestions("configuration", "init");
    assertEquals(configSuggestions.some((s) => s.includes("nsyte init")), true);
    assertEquals(configSuggestions.some((s) => s.includes("Remove existing config")), true);
  });
});
