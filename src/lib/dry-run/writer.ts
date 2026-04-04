import { colors } from "@cliffy/ansi/colors";
import { ensureDir } from "@std/fs";
import { basename, join } from "@std/path";
import { highlightJson } from "../../ui/json-highlighter.ts";
import type { DryRunEvent, DryRunOptions, DryRunResult } from "./types.ts";

/**
 * Print the dry-run banner. Must be prominent and unmissable.
 */
export function printDryRunBanner(): void {
  console.log("");
  console.log(
    colors.bold.yellow("  ┌─────────────────────────────────────────────┐"),
  );
  console.log(
    colors.bold.yellow("  │  [DRY RUN] No changes will be made          │"),
  );
  console.log(
    colors.bold.yellow("  └─────────────────────────────────────────────┘"),
  );
  console.log("");
}

/**
 * Generate a default output directory path with timestamp.
 */
export function defaultOutputDir(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15);
  const tmpDir = Deno.env.get("TMPDIR") || Deno.env.get("TEMP") || Deno.env.get("TMP") || "/tmp";
  return join(tmpDir, `nsyte-dry-run-${ts}`);
}

/**
 * Write dry-run events to files as pretty-printed JSON.
 * Creates the output directory if it does not exist.
 * Returns the list of files written.
 */
export async function writeDryRunEvents(
  events: DryRunEvent[],
  outputDir: string,
): Promise<string[]> {
  await ensureDir(outputDir);
  const writtenFiles: string[] = [];

  for (const event of events) {
    const filePath = join(outputDir, event.filename);
    const json = JSON.stringify(event.template, null, 2);
    await Deno.writeTextFile(filePath, json + "\n");
    writtenFiles.push(filePath);
  }

  return writtenFiles;
}

/**
 * Print specified event kinds to stdout with JSON syntax highlighting.
 */
export function printEventsToStdout(
  events: DryRunEvent[],
  kinds: number[],
): void {
  const matching = events.filter((e) => kinds.includes(e.kind));

  for (const event of matching) {
    console.log("");
    console.log(colors.bold.cyan(`── ${event.label} ──`));
    console.log("");
    const json = JSON.stringify(event.template, null, 2);
    console.log(highlightJson(json));
  }
}

/**
 * Print a summary of files that would be uploaded.
 */
export function printFileSummary(
  totalFiles: number,
  toTransferCount?: number,
): void {
  console.log(colors.bold("  File Summary:"));
  console.log(colors.cyan(`    Total local files: ${totalFiles}`));
  if (toTransferCount !== undefined) {
    console.log(colors.cyan(`    Files to transfer: ${toTransferCount}`));
  }
  console.log("");
}

/**
 * Print summary of collected events.
 */
export function printEventSummary(events: DryRunEvent[]): void {
  console.log(colors.bold("  Events that would be published:"));
  for (const event of events) {
    console.log(colors.cyan(`    • ${event.label}`));
  }
  console.log("");
}

/**
 * Print output file locations.
 */
function printOutputFiles(outputDir: string, files: string[]): void {
  console.log(colors.bold("  Event previews written to:"));
  console.log(colors.dim(`    ${outputDir}/`));
  for (const file of files) {
    const name = basename(file);
    console.log(colors.dim(`      ${name}`));
  }
  console.log("");
}

/**
 * Main entry point for dry-run output handling.
 * Orchestrates: banner -> file summary -> event summary -> write files -> print to stdout.
 */
export async function handleDryRunOutput(
  events: DryRunEvent[],
  options: DryRunOptions = {},
  fileSummary?: { totalFiles: number; toTransferCount?: number },
): Promise<DryRunResult> {
  // 1. Banner
  printDryRunBanner();

  // 2. File summary (if available)
  if (fileSummary) {
    printFileSummary(fileSummary.totalFiles, fileSummary.toTransferCount);
  }

  // 3. Event summary
  printEventSummary(events);

  // 4. Write to files
  const outputDir = options.outputDir || defaultOutputDir();
  const files = await writeDryRunEvents(events, outputDir);
  printOutputFiles(outputDir, files);

  // 5. Print to stdout if requested
  if (options.showKinds && options.showKinds.length > 0) {
    printEventsToStdout(events, options.showKinds);
  }

  // 6. Launch interactive TUI if requested
  if (options.interactive && events.length > 0) {
    // Check if stdin is actually a terminal
    try {
      if (Deno.stdin.isTerminal()) {
        console.log(
          colors.dim("  Press Enter to open the event inspector, or Ctrl+C to exit..."),
        );
        // Wait for Enter key — read until line ending to consume any buffered input
        const buf = new Uint8Array(1024);
        let sawLineEnding = false;
        while (!sawLineEnding) {
          const bytesRead = await Deno.stdin.read(buf);
          if (bytesRead === null) break;
          for (let i = 0; i < bytesRead; i++) {
            if (buf[i] === 10 || buf[i] === 13) {
              sawLineEnding = true;
              break;
            }
          }
        }

        const { runDryRunInspector } = await import("../../ui/dry-run/mod.ts");
        await runDryRunInspector(events);
      }
    } catch {
      // Not a terminal or stdin not available — skip TUI
    }
  }

  return { outputDir, files, events };
}
