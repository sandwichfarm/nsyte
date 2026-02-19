import { colors } from "@cliffy/ansi/colors";
import { createLogger } from "./logger.ts";

const log = createLogger("error-utils");

/**
 * Extracts a readable error message from an unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return "[unknown error]";
  }
}

/**
 * Logs an error with context and optionally outputs to console
 */
export function logError(
  context: string,
  error: unknown,
  options?: {
    showConsole?: boolean;
    color?: boolean;
    logger?: ReturnType<typeof createLogger>;
  },
): string {
  const message = getErrorMessage(error);
  const fullMessage = `${context}: ${message}`;

  const logger = options?.logger || log;
  logger.error(fullMessage);

  if (options?.showConsole) {
    const output = options.color !== false
      ? colors.red(`Error: ${fullMessage}`)
      : `Error: ${fullMessage}`;
    console.error(output);
  }

  return message;
}

/**
 * Handles an error by logging it and optionally exiting
 */
export function handleError(
  context: string,
  error: unknown,
  options?: {
    exit?: boolean;
    exitCode?: number;
    showConsole?: boolean;
    color?: boolean;
    logger?: ReturnType<typeof createLogger>;
  },
): void {
  logError(context, error, options);

  if (options?.exit) {
    Deno.exit(options.exitCode ?? 1);
  }
}

/**
 * Wraps an async function with error handling
 */
export async function withErrorHandling<T>(
  context: string,
  fn: () => Promise<T>,
  options?: {
    exit?: boolean;
    exitCode?: number;
    showConsole?: boolean;
    color?: boolean;
    logger?: ReturnType<typeof createLogger>;
  },
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    handleError(context, error, options);
    return undefined;
  }
}
