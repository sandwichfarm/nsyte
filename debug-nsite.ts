#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run

// Debug script to monitor .nsite directory access

const nsitePath = "./.nsite";

console.log("Monitoring .nsite directory...");
console.log("Current working directory:", Deno.cwd());

// Check if .nsite exists
try {
  const stat = await Deno.stat(nsitePath);
  console.log(".nsite exists:", stat.isDirectory);
} catch (e) {
  console.log(".nsite does NOT exist");
}

// List all TypeScript files that reference .nsite
const command = new Deno.Command("grep", {
  args: ["-r", "-n", "--include=*.ts", "\\.nsite", "src/"],
  stdout: "piped",
  stderr: "piped",
});

const { stdout } = await command.output();
const output = new TextDecoder().decode(stdout);

console.log("\nFiles that reference .nsite:");
const lines = output.split("\n").filter(line => line.trim());
for (const line of lines) {
  console.log("  " + line);
}

// Look for any remove/delete operations near .nsite references
console.log("\nSearching for potential deletion code...");
const deleteCommand = new Deno.Command("grep", {
  args: ["-r", "-B3", "-A3", "--include=*.ts", "remove\\|delete\\|clean", "src/"],
  stdout: "piped",
  stderr: "piped",
});

const deleteResult = await deleteCommand.output();
const deleteOutput = new TextDecoder().decode(deleteResult.stdout);

// Filter for lines that might be related to .nsite
const deleteLines = deleteOutput.split("\n");
let inRelevantSection = false;
let contextLines: string[] = [];

for (const line of deleteLines) {
  if (line.includes(".nsite") || line.includes("configDir") || line.includes("projectDir")) {
    inRelevantSection = true;
    contextLines = [];
  }
  
  if (inRelevantSection) {
    contextLines.push(line);
    
    if (line.includes("remove") || line.includes("delete") || line.includes("clean")) {
      console.log("\nPotential deletion code found:");
      for (const contextLine of contextLines) {
        console.log("  " + contextLine);
      }
    }
    
    if (line === "--" || contextLines.length > 7) {
      inRelevantSection = false;
      contextLines = [];
    }
  }
}

console.log("\nTo trace actual deletions, you can run nsyte commands with strace:");
console.log(`  strace -e unlink,rmdir,unlinkat nsyte <command>

This will show any system calls that delete files or directories.`);