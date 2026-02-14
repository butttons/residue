import { writeConfig } from "@/lib/config";
import { errAsync, type ResultAsync } from "neverthrow";

export function login(opts: { url: string; token: string }): ResultAsync<void, string> {
  if (!opts.url.startsWith("http://") && !opts.url.startsWith("https://")) {
    return errAsync("URL must start with http:// or https://");
  }

  const cleanUrl = opts.url.replace(/\/+$/, "");

  return writeConfig({ worker_url: cleanUrl, token: opts.token }).map(() => {
    console.log(`Logged in to ${cleanUrl}`);
  });
}
