import { Command } from "@cliffy/command";
import { version } from "../version.ts";

/** The root cliffy command class */
const nsyte = new Command()
  .name("nsyte")
  .version(version)
  .description("Publish your site to nostr and blossom servers")
  .globalOption("-c, --config <path:string>", "Path to config file (default: .nsite/config.json)")
  .action(async () => {
    // Just show help when no command is provided
    await nsyte.showHelp();
  });

export default nsyte;
