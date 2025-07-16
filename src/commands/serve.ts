import { colors } from "@cliffy/ansi/colors";
import type { Command } from "@cliffy/command";
// Using Deno.serve instead of importing serve
import { serveDir } from "@std/http/file-server";
import { createLogger } from "../lib/logger.ts";
import { handleError } from "../lib/error-utils.ts";
import { existsSync } from "@std/fs/exists";
import { join } from "@std/path";

const log = createLogger("serve");

interface ServeOptions {
  port?: number;
  dir?: string;
}

/**
 * Register the serve command
 */
export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .alias("srv")
    .description("Build and serve your local nsite files")
    .option("-p, --port <port:number>", "Port number for the local server.", { default: 8080 })
    .option("-d, --dir <dir:string>", "Directory to serve (defaults to current directory).", {
      default: ".",
    })
    .action(async (options: ServeOptions) => {
      await serveCommand(options);
    });
}

/**
 * Main serve command implementation
 */
export async function serveCommand(options: ServeOptions): Promise<void> {
  try {
    const port = options.port || 8080;
    const dir = options.dir || ".";
    const absoluteDir = join(Deno.cwd(), dir);

    // Check if directory exists
    if (!existsSync(absoluteDir)) {
      console.error(colors.red(`Directory not found: ${absoluteDir}`));
      Deno.exit(1);
    }

    console.log(colors.green(`\n🚀 Starting local nsite server`));
    console.log(colors.cyan(`📁 Serving directory: ${absoluteDir}`));
    console.log(colors.cyan(`🌐 Server URL: http://localhost:${port}`));
    console.log(colors.gray(`\nPress Ctrl+C to stop the server\n`));

    // Start the HTTP server
    const handler = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      log.debug(`Request: ${request.method} ${url.pathname}`);

      // Serve files from the specified directory
      return await serveDir(request, {
        fsRoot: absoluteDir,
        showDirListing: true,
        enableCors: true,
      });
    };

    // Start server using Deno.serve
    await Deno.serve({ port }, handler).finished;
  } catch (error: unknown) {
    handleError("Error starting server", error, {
      exit: true,
      showConsole: true,
      logger: log,
    });
  }
}
