#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run

/**
 * Generate a coverage badge SVG file based on coverage data
 */

async function getCoveragePercentage(): Promise<number> {
  // Try to read from LCOV file in test-output first
  const lcovPaths = [
    "test-output/coverage.lcov",
    "test-output/lcov.info",
    "coverage.lcov",
    "new_coverage.lcov",
  ];

  for (const lcovPath of lcovPaths) {
    try {
      const lcovContent = await Deno.readTextFile(lcovPath);
      return parseLcovCoverage(lcovContent);
    } catch {
      // Continue to next path
    }
  }

  // Fallback to coverage directory
  try {
    const cmd = new Deno.Command("deno", {
      args: ["coverage", "test-output/coverage"],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout } = await cmd.output();
    let output = new TextDecoder().decode(stdout);

    // Remove ANSI color codes
    // deno-lint-ignore no-control-regex
    output = output.replace(/\x1b\[[0-9;]*m/g, "");

    // Extract the "All files" line coverage percentage
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes("All files")) {
        const parts = line.split("|");
        if (parts.length >= 2) {
          const coverageStr = parts[1].trim();
          const percentage = parseFloat(coverageStr);
          if (!isNaN(percentage)) {
            return percentage;
          }
        }
      }
    }

    throw new Error("Could not extract coverage percentage");
  } catch {
    throw new Error("Could not find coverage data");
  }
}

function parseLcovCoverage(lcovContent: string): number {
  const records = lcovContent.split("end_of_record");
  let totalHit = 0;
  let totalFound = 0;

  for (const record of records) {
    if (record.includes("SF:")) {
      const lhMatch = record.match(/LH:(\d+)/);
      const lfMatch = record.match(/LF:(\d+)/);

      if (lhMatch && lfMatch) {
        const linesHit = parseInt(lhMatch[1]);
        const linesFound = parseInt(lfMatch[1]);

        if (linesFound > 0) {
          totalHit += linesHit;
          totalFound += linesFound;
        }
      }
    }
  }

  if (totalFound === 0) {
    throw new Error("No coverage data found in LCOV file");
  }

  return (totalHit / totalFound) * 100;
}

function getColorForCoverage(percentage: number): string {
  if (percentage >= 80) return "#4c1"; // bright green
  if (percentage >= 60) return "#a3c51c"; // yellow-green
  if (percentage >= 40) return "#dfb317"; // yellow
  if (percentage >= 20) return "#fe7d37"; // orange
  return "#e05d44"; // red
}

function generateBadgeSVG(percentage: number): string {
  const color = getColorForCoverage(percentage);
  const percentageText = `${percentage.toFixed(1)}%`;

  // Calculate text widths (approximate)
  const labelWidth = 65; // "coverage" text width
  const valueWidth = percentageText.length * 8 + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20" role="img" aria-label="coverage: ${percentageText}">
  <title>coverage: ${percentageText}</title>
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
  }">coverage</text>
    <text x="${(labelWidth * 10) / 2}" y="140" transform="scale(.1)" fill="#fff" textLength="${
    (labelWidth - 10) * 10
  }">coverage</text>
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
    // Get coverage percentage
    const percentage = await getCoveragePercentage();
    console.log(`Coverage: ${percentage.toFixed(1)}%`);

    // Generate badge SVG
    const svg = generateBadgeSVG(percentage);

    // Write to file
    await Deno.writeTextFile("static/coverage-badge.svg", svg);
    console.log("Coverage badge generated: static/coverage-badge.svg");
  } catch (error) {
    console.error("Error generating coverage badge:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
