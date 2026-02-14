import type { Command } from "commander";
import { writeConfig } from "@/lib/config";

export function registerLogin(program: Command): void {
  program
    .command("login")
    .description("Save worker URL and auth token")
    .requiredOption("--url <worker_url>", "Worker URL")
    .requiredOption("--token <auth_token>", "Auth token")
    .action(async (opts: { url: string; token: string }) => {
      if (!opts.url.startsWith("http://") && !opts.url.startsWith("https://")) {
        console.error("Error: URL must start with http:// or https://");
        process.exit(1);
      }

      const cleanUrl = opts.url.replace(/\/+$/, "");

      const result = await writeConfig({ worker_url: cleanUrl, token: opts.token });
      result.match(
        () => console.log(`Logged in to ${cleanUrl}`),
        (e) => {
          console.error(`Error: ${e}`);
          process.exit(1);
        }
      );
    });
}
