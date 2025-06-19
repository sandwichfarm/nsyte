#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run

/**
 * Generate coverage badge SVG files for total, line, and branch coverage
 */

interface CoverageData {
  totalPercentage: number;
  linePercentage: number;
  branchPercentage: number;
}

async function getCoverageData(): Promise<CoverageData> {
  // Try to read from LCOV file first
  const lcovPaths = [
    "test-output/coverage.lcov",
    "test-output/lcov.info",
    "coverage.lcov",
    "new_coverage.lcov",
    "static/coverage.lcov",
  ];

  for (const lcovPath of lcovPaths) {
    try {
      const lcovContent = await Deno.readTextFile(lcovPath);
      return parseLcovCoverageData(lcovContent);
    } catch {
      // Continue to next path
    }
  }

  // Fallback to deno coverage command
  try {
    const cmd = new Deno.Command("deno", {
      args: ["coverage", "test-output/coverage", "--detailed"],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout } = await cmd.output();
    let output = new TextDecoder().decode(stdout);

    // Remove ANSI color codes
    // deno-lint-ignore no-control-regex
    output = output.replace(/\x1b\[[0-9;]*m/g, "");

    return parseDenoCoverageOutput(output);
  } catch {
    // Try alternative coverage directory
    try {
      const cmd = new Deno.Command("deno", {
        args: ["coverage", "coverage_data", "--detailed"],
        stdout: "piped",
        stderr: "piped",
      });

      const { stdout } = await cmd.output();
      let output = new TextDecoder().decode(stdout);

      // Remove ANSI color codes
      // deno-lint-ignore no-control-regex
      output = output.replace(/\x1b\[[0-9;]*m/g, "");

      return parseDenoCoverageOutput(output);
    } catch {
      throw new Error("Could not find coverage data");
    }
  }
}

function parseLcovCoverageData(lcovContent: string): CoverageData {
  const records = lcovContent.split("end_of_record");
  let totalLinesHit = 0;
  let totalLinesFound = 0;
  let totalBranchesHit = 0;
  let totalBranchesFound = 0;

  for (const record of records) {
    if (record.includes("SF:")) {
      // Line coverage
      const lhMatch = record.match(/LH:(\d+)/);
      const lfMatch = record.match(/LF:(\d+)/);

      if (lhMatch && lfMatch) {
        const linesHit = parseInt(lhMatch[1]);
        const linesFound = parseInt(lfMatch[1]);

        if (linesFound > 0) {
          totalLinesHit += linesHit;
          totalLinesFound += linesFound;
        }
      }

      // Branch coverage
      const bhMatch = record.match(/BRH:(\d+)/);
      const bfMatch = record.match(/BRF:(\d+)/);

      if (bhMatch && bfMatch) {
        const branchesHit = parseInt(bhMatch[1]);
        const branchesFound = parseInt(bfMatch[1]);

        if (branchesFound > 0) {
          totalBranchesHit += branchesHit;
          totalBranchesFound += branchesFound;
        }
      }
    }
  }

  const linePercentage = totalLinesFound > 0 ? (totalLinesHit / totalLinesFound) * 100 : 0;
  const branchPercentage = totalBranchesFound > 0
    ? (totalBranchesHit / totalBranchesFound) * 100
    : 0;

  // Total coverage is weighted average (70% lines, 30% branches)
  const totalPercentage = linePercentage * 0.7 + branchPercentage * 0.3;

  return {
    totalPercentage,
    linePercentage,
    branchPercentage,
  };
}

function parseDenoCoverageOutput(output: string): CoverageData {
  const lines = output.split("\n");
  let linePercentage = 0;
  let branchPercentage = 0;

  for (const line of lines) {
    if (line.includes("All files")) {
      const parts = line.split("|");
      if (parts.length >= 4) {
        // Try to extract line coverage (usually 2nd column)
        const lineCovStr = parts[1].trim();
        const lineMatch = lineCovStr.match(/(\d+\.?\d*)/);
        if (lineMatch) {
          linePercentage = parseFloat(lineMatch[1]);
        }

        // Try to extract branch coverage (usually 4th column)
        const branchCovStr = parts[3].trim();
        const branchMatch = branchCovStr.match(/(\d+\.?\d*)/);
        if (branchMatch) {
          branchPercentage = parseFloat(branchMatch[1]);
        }
      }
    }
  }

  // If we couldn't find separate values, use total from first column
  if (linePercentage === 0) {
    for (const line of lines) {
      if (line.includes("All files")) {
        const parts = line.split("|");
        if (parts.length >= 2) {
          const coverageStr = parts[1].trim();
          const percentage = parseFloat(coverageStr);
          if (!isNaN(percentage)) {
            linePercentage = percentage;
            branchPercentage = percentage; // Use same value if no branch data
          }
        }
      }
    }
  }

  const totalPercentage = linePercentage * 0.7 + branchPercentage * 0.3;

  return {
    totalPercentage,
    linePercentage,
    branchPercentage,
  };
}

function getColorForCoverage(percentage: number): string {
  if (percentage >= 80) return "#4c1"; // bright green
  if (percentage >= 60) return "#a3c51c"; // yellow-green
  if (percentage >= 40) return "#dfb317"; // yellow
  if (percentage >= 20) return "#fe7d37"; // orange
  return "#e05d44"; // red
}

function generateBadgeSVG(label: string, percentage: number): string {
  const color = getColorForCoverage(percentage);
  const percentageText = `${percentage.toFixed(1)}%`;

  // Calculate text widths (approximate)
  const labelWidth = label.length * 7 + 10;
  const valueWidth = percentageText.length * 8 + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${percentageText}">
  <title>${label}: ${percentageText}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${
    (labelWidth * 10) / 2
  }" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${
    (labelWidth - 10) * 10
  }">${label}</text>
    <text x="${(labelWidth * 10) / 2}" y="140" transform="scale(.1)" fill="#fff" textLength="${
    (labelWidth - 10) * 10
  }">${label}</text>
    <text aria-hidden="true" x="${
    labelWidth * 10 + (valueWidth * 10) / 2
  }" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${
    (valueWidth - 10) * 10
  }">${percentageText}</text>
    <text x="${
    labelWidth * 10 + (valueWidth * 10) / 2
  }" y="140" transform="scale(.1)" fill="#fff" textLength="${
    (valueWidth - 10) * 10
  }">${percentageText}</text>
  </g>
</svg>`;
}

async function main() {
  try {
    // Get coverage data
    const coverageData = await getCoverageData();

    console.log(`Coverage Summary:`);
    console.log(`  Total:  ${coverageData.totalPercentage.toFixed(1)}%`);
    console.log(`  Lines:  ${coverageData.linePercentage.toFixed(1)}%`);
    console.log(`  Branch: ${coverageData.branchPercentage.toFixed(1)}%`);

    // Generate badge SVGs
    const totalBadge = generateBadgeSVG("coverage", coverageData.totalPercentage);
    const lineBadge = generateBadgeSVG("lines", coverageData.linePercentage);
    const branchBadge = generateBadgeSVG("branches", coverageData.branchPercentage);

    // Write to files
    await Deno.writeTextFile("static/coverage-badge.svg", totalBadge);
    await Deno.writeTextFile("static/coverage-lines-badge.svg", lineBadge);
    await Deno.writeTextFile("static/coverage-branches-badge.svg", branchBadge);

    console.log("\nBadges generated:");
    console.log("  - static/coverage-badge.svg (total)");
    console.log("  - static/coverage-lines-badge.svg");
    console.log("  - static/coverage-branches-badge.svg");
  } catch (error) {
    console.error("Error generating coverage badges:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
