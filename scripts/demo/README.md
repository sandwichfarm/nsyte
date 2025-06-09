# Demo Generation

This directory contains scripts for generating authentic demos that use the actual CLI tool, not mocks.

## Files

**Scripts (in this directory):**
- `generate-real-demo.ts` - Generates demo sections using actual CLI output
- `generate-asciinema.ts` - Generates asciinema recordings
- `nsyte-demo-optimal.sh` - Optimal demo recording script
- `demo-sections.js` - Demo configuration

**Generated outputs (in static/demo/):**
- `demo-sections.js` - Generated file containing real CLI demo data (do not edit manually)
- `nsyte-demo.cast` - Asciinema recording for the main demo player
- `nsyte-demo-output.txt` - Captured CLI output

## Regenerating Demo Content

To update the demo sections with current CLI output:

```bash
deno run --allow-read --allow-write --allow-net --allow-env --allow-run scripts/demo/generate-real-demo.ts
```

This will:
1. Run actual CLI commands to capture real output
2. Extract the ASCII header from CLI responses  
3. Generate `demo-sections.js` with authentic command examples
4. Update the splash page demo walkthrough sections

## Creating Asciinema Recordings

To create a new demo cast file:

1. Install asciinema: `brew install asciinema` (or equivalent)
2. Record a real CLI session: `asciinema rec demo/nsyte-demo.cast`
3. Run actual CLI commands during recording
4. Exit recording when complete

## Important Notes

- **NO MOCKS ALLOWED** - All demos must use actual CLI tool output
- Demo sections are auto-generated from real CLI responses
- The main demo cast should be recorded with real CLI interactions
- Always regenerate demos after CLI changes to keep them accurate