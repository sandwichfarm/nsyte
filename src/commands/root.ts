import { Command } from "@cliffy/command";
import { version } from "../version.ts";
import { parseTimestamp } from "../lib/timestamp.ts";

/** The root cliffy command class */
const nsyte = new Command()
  .name("nsyte")
  .version(version)
  .description("Publish your site to nostr and blossom servers")
  .globalOption("-c, --config <path:string>", "Path to config file (default: .nsite/config.json)")
  .globalOption(
    "--created-at <timestamp:string>",
    "Override created_at on nostr events (Unix epoch seconds or ISO 8601 datetime)",
    {
      value: (value: string): number => parseTimestamp(value),
    },
  )
  .action(async () => {
    // Just show help when no command is provided
    await nsyte.showHelp();
  });

export default nsyte;
