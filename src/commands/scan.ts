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
 * The default view summarizes findings and affected files by severity.
 * Verbose mode expands the findings, grouped by file and ordered by severity score.
 */
export function formatFindings(
  findings: ScanFinding[],
  expanded = false,
): string[] {
  const severityOrder: Record<ScanFinding["severity"], number> = {
    high: 4,
    medium: 3,
    warning: 2,
    low: 1,
  };
  const findingsByFile = new Map<string, ScanFinding[]>();
  for (const finding of findings) {
    const fileFindings = findingsByFile.get(finding.filePath) ?? [];
    fileFindings.push(finding);
    findingsByFile.set(finding.filePath, fileFindings);
  }

  if (!expanded) {
    const severityLabels: Array<{
      severity: ScanFinding["severity"];
      label: string;
      color: (text: string) => string;
    }> = [
      { severity: "high", label: "HIGH", color: colors.red },
      { severity: "medium", label: "MEDIUM", color: colors.yellow },
      { severity: "warning", label: "WARNING", color: colors.yellow },
      { severity: "low", label: "LOW", color: colors.dim },
    ];

    return severityLabels.flatMap(({ severity, label, color }) => {
      const severityFindings = findings.filter((finding) => finding.severity === severity);
      if (severityFindings.length === 0) return [];
      const affectedFiles = new Set(severityFindings.map((finding) => finding.filePath)).size;
      const findingLabel = severityFindings.length === 1 ? "finding" : "findings";
      const fileLabel = affectedFiles === 1 ? "file" : "files";
      return [
        `  ${
          color(label.padEnd(7))
        } ${severityFindings.length} ${findingLabel} across ${affectedFiles} ${fileLabel}`,
      ];
    });
  }

  const fileScores = new Map<string, number>();
  for (const [filePath, fileFindings] of findingsByFile) {
    fileScores.set(
      filePath,
      fileFindings.reduce((total, finding) => total + severityOrder[finding.severity], 0),
    );
  }

  const files = [...findingsByFile.entries()].sort(([pathA], [pathB]) => {
    return (fileScores.get(pathB)! - fileScores.get(pathA)!) || pathA.localeCompare(pathB);
  });

  const lines: string[] = [];
  for (const [filePath, fileFindings] of files) {
    lines.push(`  ${filePath}`);
    fileFindings.sort((a, b) =>
      severityOrder[b.severity] - severityOrder[a.severity] || a.line - b.line
    );
    for (const finding of fileFindings) {
      const severityColor = finding.severity === "high"
        ? colors.red
        : finding.severity === "low"
        ? colors.dim
        : colors.yellow;
      const location = finding.line > 0 ? `line ${finding.line}` : "file";
      const tag = severityColor(`[${finding.severity.toUpperCase()}]`);
      const patternName = severityColor(finding.patternName);
      lines.push(
        `    - ${location} | ${patternName} (${colors.dim(finding.matchPreview)}) | ${tag}`,
      );
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
  const warningCount = result.findings.filter(
    (f) => f.severity === "warning",
  ).length;

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
    if (warningCount > 0) {
      lines.push(`    ${colors.yellow("Warnings:")}        ${warningCount}`);
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
    .option("-v, --verbose", "Toggle expanded findings view", {
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
