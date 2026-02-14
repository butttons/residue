import { writeConfig } from "@/lib/config";

export async function login(opts: { url: string; token: string }): Promise<void> {
  if (!opts.url.startsWith("http://") && !opts.url.startsWith("https://")) {
    throw new Error("URL must start with http:// or https://");
  }

  const cleanUrl = opts.url.replace(/\/+$/, "");

  const result = await writeConfig({ worker_url: cleanUrl, token: opts.token });
  if (result.isErr()) {
    throw new Error(result._unsafeUnwrapErr());
  }

  console.log(`Logged in to ${cleanUrl}`);
}
