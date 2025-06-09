#!/usr/bin/env deno run --allow-read --allow-write --allow-run

/**
 * Generate asciinema recording from the demo script
 */

import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

const demoScript = join(Deno.cwd(), "scripts", "demo-recording", "nsyte-demo-optimal.sh");
const outputCast = join(Deno.cwd(), "demo", "nsyte-demo.cast");

console.log("🎬 Generating asciinema recording...");

try {
  // Check if asciinema is available
  const asciiCheck = new Deno.Command("which", {
    args: ["asciinema"],
    stdout: "piped",
    stderr: "piped"
  });
  
  const { code: checkCode } = await asciiCheck.output();
  
  if (checkCode !== 0) {
    console.log("⚠️  asciinema not found. Install with: brew install asciinema");
    console.log("📝 For now, using the existing demo cast file.");
    Deno.exit(0);
  }

  // Record the demo script with asciinema
  const cmd = new Deno.Command("asciinema", {
    args: [
      "rec", 
      outputCast,
      "--command", demoScript,
      "--title", "nsyte - Decentralized Web Publishing Demo",
      "--cols", "80",
      "--rows", "24",
      "--overwrite"
    ],
    stdout: "inherit",
    stderr: "inherit"
  });

  console.log(`🎥 Recording demo to ${outputCast}...`);
  const { code } = await cmd.output();
  
  if (code === 0) {
    console.log("✅ Demo recording completed successfully!");
    console.log(`📁 Saved to: ${outputCast}`);
  } else {
    console.error("❌ Recording failed");
    Deno.exit(1);
  }
  
} catch (error) {
  console.error("❌ Error generating recording:", error);
  console.log("📝 Using existing demo cast file.");
}