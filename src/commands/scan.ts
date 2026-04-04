import { colors } from "@cliffy/ansi/colors";
import { normalize } from "@std/path";
import nsyte from "./root.ts";
import {
  scanDirectory,
  type ScanFinding,
  type ScanLevel,
  type ScanResult,
} from "../lib/scanner/mod.ts";

/**
 * Format scan findings for display.
 * Groups by severity and shows file:line with color-coded pattern name.
 */
export function formatFindings(
  findings: ScanFinding[],
  verbose = false,
): string[] {
  const lines: string[] = [];

  // Sort by severity (high first, then medium, then low), then by file path
  const severityOrder: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  const sorted = [...findings].sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.filePath.localeCompare(b.filePath);
  });

  for (const finding of sorted) {
    const severityColor =
      finding.severity === "high"
        ? colors.red
        : finding.severity === "medium"
          ? colors.yellow
          : colors.dim;

    const locationStr =
      finding.line > 0
        ? `${finding.filePath}:${finding.line}`
        : finding.filePath;

    const tag = severityColor(`[${finding.severity.toUpperCase()}]`);
    const patternName = severityColor(finding.patternName);
    const preview = colors.dim(finding.matchPreview);

    lines.push(`  ${locationStr}  ${tag} ${patternName}`);
    lines.push(`    ${preview}`);
    if (verbose) {
      lines.push(""); // Extra spacing in verbose mode
    }
  }

  return lines;
}

/**
 * Format the scan summary table.
 */
export function formatSummary(result: ScanResult): string[] {
  const lines: string[] = [];
  const highCount = result.findings.filter((f) => f.severity === "high").length;
  const mediumCount = result.findings.filter(
    (f) => f.severity === "medium",
  ).length;
  const lowCount = result.findings.filter((f) => f.severity === "low").length;

  lines.push("");
  lines.push(colors.bold("  Scan Results"));
  lines.push(colors.dim("  " + "\u2500".repeat(40)));
  lines.push(`  Files scanned:    ${result.filesScanned}`);
  lines.push(`  Files skipped:    ${result.filesSkipped} (binary)`);

  if (result.findings.length > 0) {
    lines.push(
      `  Findings:         ${colors.bold(String(result.findings.length))}`,
    );
    if (highCount > 0) {
      lines.push(`    ${colors.red("High severity:")}  ${highCount}`);
    }
    if (mediumCount > 0) {
      lines.push(`    ${colors.yellow("Medium severity:")} ${mediumCount}`);
    }
    if (lowCount > 0) {
      lines.push(`    ${colors.dim("Low severity:")}    ${lowCount}`);
    }
  } else {
    lines.push(colors.green(`  Findings:         0`));
  }

  lines.push(colors.dim(`  Scan level:       ${result.scanLevel}`));
  lines.push(colors.dim(`  Duration:         ${result.duration}ms`));
  lines.push(colors.dim("  " + "\u2500".repeat(40)));
  lines.push("");

  return lines;
}

/**
 * Display the full scan report: summary + optional findings detail.
 */
export function displayScanReport(
  result: ScanResult,
  quiet = false,
  verbose = false,
): void {
  // Always show summary
  const summaryLines = formatSummary(result);
  for (const line of summaryLines) {
    console.log(line);
  }

  // Show findings detail unless --quiet
  if (!quiet && result.findings.length > 0) {
    console.log(colors.bold("  Findings:"));
    console.log("");
    const findingLines = formatFindings(result.findings, verbose);
    for (const line of findingLines) {
      console.log(line);
    }
    console.log("");
  }

  // Final verdict
  if (result.findings.length === 0) {
    console.log(colors.green("  No secrets detected."));
  } else {
    console.log(
      colors.yellow(
        `  ${result.findings.length} potential secret(s) found. Review before deploying.`,
      ),
    );
  }
  console.log("");
}

/**
 * Register the scan command
 */
export function registerScanCommand(): void {
  nsyte
    .command("scan")
    .description("Scan directory for secrets before deploying")
    .arguments("[folder:string]")
    .option(
      "--scan-level <level:string>",
      "Scan sensitivity level (low, medium, high)",
      { default: "medium" },
    )
    .option("-q, --quiet", "Show summary only, no findings detail", {
      default: false,
    })
    .option("-v, --verbose", "Show verbose output with extra context", {
      default: false,
    })
    .action(
      async (
        options: { scanLevel: string; quiet: boolean; verbose: boolean },
        folder?: string,
      ) => {
        const targetDir = normalize(folder || ".");
        const level = validateScanLevel(options.scanLevel);

        console.log(
          colors.cyan(
            `Scanning for secrets in ${targetDir} (${level} level)...`,
          ),
        );
        console.log("");

        const result = await scanDirectory(targetDir, {
          level,
          verbose: options.verbose,
        });

        displayScanReport(result, options.quiet, options.verbose);

        // Exit code 1 if findings, 0 if clean (D-10)
        if (result.findings.length > 0) {
          Deno.exit(1);
        }
      },
    )
    .error((error) => {
      console.error(colors.red(`Error scanning for secrets: ${error.message}`));
      Deno.exit(1);
    });
}

/**
 * Validate and normalize the scan level string.
 * Defaults to "medium" for invalid input.
 */
function validateScanLevel(input: string): ScanLevel {
  const level = input.toLowerCase();
  if (level === "low" || level === "medium" || level === "high") {
    return level;
  }
  console.log(
    colors.yellow(`Unknown scan level "${input}", defaulting to "medium".`),
  );
  return "medium";
}
