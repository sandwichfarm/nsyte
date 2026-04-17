/**
 * Parses a timestamp string into a Unix epoch seconds number.
 * Accepts Unix epoch seconds (integer) or ISO 8601 datetime strings.
 * ISO strings without timezone are treated as UTC.
 * Rejects negative timestamps and non-integer epoch values.
 *
 * @param value - The raw string from --created-at CLI argument
 * @returns Unix epoch seconds as a number
 * @throws Error with descriptive message for invalid input
 */
export function parseTimestamp(value: string): number {
  const invalid = (v: string): never => {
    throw new Error(
      `Invalid --created-at value "${v}". Expected Unix epoch seconds or ISO 8601 datetime.`,
    );
  };

  // Year 5000 in Unix seconds — sanity check for far-future values
  const MAX_TIMESTAMP = 95617584000;

  // Try parsing as a non-negative integer (Unix epoch seconds)
  if (/^\d+$/.test(value)) {
    const n = parseInt(value, 10);
    if (n > MAX_TIMESTAMP) {
      invalid(value);
    }
    return n;
  }

  // Reject negative numbers explicitly (they don't match /^\d+$/ but we want a clear error)
  if (/^-/.test(value)) {
    invalid(value);
  }

  // Try parsing as ISO 8601 datetime string.
  // If no timezone indicator is present (no trailing Z, no +HH:MM, no -HH:MM after T),
  // append "Z" to interpret as UTC rather than local time.
  let dateStr = value;
  if (value.length > 0) {
    // Check if the string has a time component (contains "T")
    const hasTimeComponent = value.includes("T");
    if (hasTimeComponent) {
      // Look for timezone indicator after the time portion
      // Pattern: ends with Z, or has +HH or -HH after the time digits
      const hasTimezone = /Z$|[+-]\d{2}(:\d{2})?$/.test(value);
      if (!hasTimezone) {
        dateStr = value + "Z";
      }
    } else {
      // Date-only string like "2024-01-15" — append time+UTC to force UTC midnight
      dateStr = value + "T00:00:00Z";
    }
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    invalid(value);
  }

  const seconds = Math.floor(date.getTime() / 1000);
  if (seconds < 0 || seconds > MAX_TIMESTAMP) {
    invalid(value);
  }

  return seconds;
}
