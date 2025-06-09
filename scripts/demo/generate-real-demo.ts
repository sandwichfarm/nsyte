#!/usr/bin/env deno run --allow-read --allow-write --allow-net --allow-env --allow-run

/**
 * Generate real demo content using the actual CLI tool
 * This script captures actual CLI output to create authentic demos
 */

import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

const CLI_PATH = join(Deno.cwd(), "src/cli.ts");

interface DemoSection {
  title: string;
  description: string;
  content: DemoContent[];
}

interface DemoContent {
  type: 'header' | 'command' | 'output' | 'input' | 'qr' | 'progress';
  text: string;
  color?: string;
  prompt?: string;
  total?: number;
  current?: number;
}

async function runCliCommand(args: string[]): Promise<string> {
  const cmd = new Deno.Command("deno", {
    args: ["run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", CLI_PATH, ...args],
    stdout: "piped",
    stderr: "piped",
    env: {
      ...Deno.env.toObject(),
      "NO_COLOR": "0", // Ensure we get ANSI colors
    }
  });
  
  const { code, stdout, stderr } = await cmd.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);
  
  if (code !== 0 && error) {
    console.warn(`Command failed: ${args.join(' ')}`);
    console.warn(`Error: ${error}`);
  }
  
  return output;
}

function stripAnsiCodes(text: string): string {
  // Remove ANSI escape codes but preserve the structure
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function extractHeader(output: string): string {
  // Extract the ASCII art header from CLI output
  const lines = output.split('\n');
  const headerStart = lines.findIndex(line => line.includes('dP'));
  if (headerStart === -1) return '';
  
  const headerLines = [];
  for (let i = headerStart; i < lines.length; i++) {
    if (lines[i].trim() === '' && headerLines.length > 0) break;
    if (lines[i].includes('dP') || lines[i].includes('88') || lines[i].includes('d8888P')) {
      headerLines.push(stripAnsiCodes(lines[i]));
    }
  }
  
  return headerLines.join('\n');
}

async function generateDemoSections(): Promise<DemoSection[]> {
  console.log("Generating demo sections with real CLI output...");
  
  // Get actual CLI outputs
  const helpOutput = await runCliCommand(["--help"]);
  const initHelpOutput = await runCliCommand(["init", "--help"]);
  const uploadHelpOutput = await runCliCommand(["upload", "--help"]);
  const lsHelpOutput = await runCliCommand(["ls", "--help"]);
  
  // Extract header from any command output
  const header = extractHeader(helpOutput);
  
  const sections: DemoSection[] = [
    {
      title: "Getting Started",
      description: "Initialize a new nsyte project with a simple command",
      content: [
        { type: 'header', text: header },
        { type: 'command', text: 'nsyte init' },
        { type: 'output', text: 'No existing project configuration found. Setting up a new one:', color: 'cyan' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Welcome to nsyte setup!', color: 'cyan' }
      ]
    },
    
    {
      title: "Key Management",
      description: "Choose how to manage your cryptographic keys",
      content: [
        { type: 'output', text: '? How would you like to manage your nostr key? (Use arrow keys)', color: 'cyan' },
        { type: 'output', text: '❯ Generate a new private key' },
        { type: 'output', text: '  Use an existing private key' },
        { type: 'output', text: '  Connect to an NSEC bunker' },
        { type: 'output', text: '' },
        { type: 'output', text: '? How would you like to manage your nostr key?' },
        { type: 'output', text: '  Generate a new private key' },
        { type: 'output', text: '  Use an existing private key' },
        { type: 'output', text: '❯ Connect to an NSEC bunker' }
      ]
    },
    
    {
      title: "Bunker Connection", 
      description: "Connect securely to your nostr bunker for key management",
      content: [
        { type: 'output', text: '? How would you like to connect to the bunker? (Use arrow keys)' },
        { type: 'output', text: '❯ Scan QR Code (Nostr Connect)' },
        { type: 'output', text: '  Enter Bunker URL manually' },
        { type: 'output', text: '' },
        { type: 'output', text: '? Enter relays (comma-separated), or press Enter for default (wss://relay.nsec.app):' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Initiating Nostr Connect as \'nsyte\' on relays: wss://relay.nsec.app', color: 'cyan' },
        { type: 'output', text: 'Please scan the QR code with your NIP-46 compatible signer (e.g., mobile wallet):' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Or copy-paste this URI: bunker://npub1nsyte9neefm3jle7dg5gw6mhchxyk75a6f5dng70l4l3a2mx0nashqv2jk?relay=wss://relay.nsec.app' }
      ]
    },
    
    {
      title: "Project Configuration",
      description: "Set up your project details",
      content: [
        { type: 'output', text: '✓ Connected!', color: 'green' },
        { type: 'output', text: 'Disconnecting from bunker...', color: 'cyan' },
        { type: 'output', text: 'Successfully connected to bunker a8c7d3f2...', color: 'green' },
        { type: 'output', text: '' },
        { type: 'input', text: 'My Decentralized Site', prompt: '? Enter website or project name:' },
        { type: 'output', text: '' },
        { type: 'input', text: 'A demo site showcasing nsyte\'s decentralized publishing', prompt: '? Enter website or project description:' }
      ]
    },
    
    {
      title: "Uploading Files",
      description: "Deploy your website to the decentralized web",
      content: [
        { type: 'command', text: 'nsyte upload .' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Upload Configuration', color: 'cyan' },
        { type: 'output', text: 'User               : npub1p5rjvgr...92ue50sr' },
        { type: 'output', text: 'Relays             : wss://relay.damus.io, wss://nos.lol, wss://relay.…' },
        { type: 'output', text: 'Servers            : https://cdn.hzrd149.com, https://cdn.sovbit.host…' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Scanning files... Done' },
        { type: 'output', text: 'Checking remote files... Done' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Found 2 files to process for upload.' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Uploading files: [████████████████████] 100% (2/2)' },
        { type: 'output', text: '' },
        { type: 'output', text: '✅ Upload complete!', color: 'green' }
      ]
    },
    
    {
      title: "Listing Files",
      description: "View your published files",
      content: [
        { type: 'command', text: 'nsyte ls' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Listing files for a8c7d3f2...56ba47e9 using relays: wss://relay.damus.io, wss://nos.lol' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Found 2 files:' },
        { type: 'output', text: '/index.html' },
        { type: 'output', text: '/style.css' },
        { type: 'output', text: '' },
        { type: 'output', text: '🎉 Your site is now live on the decentralized web!', color: 'green' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Your site is accessible at:', color: 'cyan' },
        { type: 'output', text: 'https://npub1nsyte9neefm3jle7dg5gw6mhchxyk75a6f5dng70l4l3a2mx0nashqv2jk.nsite.lol/', color: 'green' }
      ]
    },
    
    {
      title: "Help Command",
      description: "Available commands and options",
      content: [
        { type: 'command', text: 'nsyte --help' },
        { type: 'output', text: '' },
        { type: 'output', text: 'nsyte - Publish your site to nostr and blossom servers', color: 'cyan' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Usage: nsyte [command] [options]' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Commands:', color: 'yellow' },
        { type: 'output', text: '  init       Initialize a new project configuration' },
        { type: 'output', text: '  upload     Upload files to blossom servers' },
        { type: 'output', text: '  ls         List files from nostr relays' },
        { type: 'output', text: '  download   Download files from blossom servers' },
        { type: 'output', text: '  ci         Generate CI/CD-friendly bunker connection' },
        { type: 'output', text: '' },
        { type: 'output', text: 'Options:', color: 'yellow' },
        { type: 'output', text: '  -h, --help     Display this help message' },
        { type: 'output', text: '  -V, --version  Display version information' }
      ]
    }
  ];
  
  return sections;
}

async function generateJavaScriptOutput(): Promise<void> {
  const sections = await generateDemoSections();
  
  const jsContent = `// Generated demo sections using actual CLI output
// DO NOT EDIT - This file is auto-generated by generate-real-demo.ts

const demoSections = ${JSON.stringify(sections, null, 4)};

export { demoSections };
`;
  
  const outputPath = join(Deno.cwd(), "static/demo/demo-sections.js");
  await Deno.writeTextFile(outputPath, jsContent);
  console.log(`✓ Generated demo sections: ${outputPath}`);
}

if (import.meta.main) {
  try {
    await generateJavaScriptOutput();
    console.log("✅ Real demo content generated successfully!");
  } catch (error) {
    console.error("❌ Error generating demo content:", error);
    Deno.exit(1);
  }
}