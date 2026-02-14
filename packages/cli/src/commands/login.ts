import { writeConfig } from "../lib/config";

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

export async function run(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const url = flags["url"];
  const token = flags["token"];

  if (!url || !token) {
    console.error("Usage: residue login --url <worker_url> --token <auth_token>");
    process.exit(1);
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    console.error("Error: URL must start with http:// or https://");
    process.exit(1);
  }

  const cleanUrl = url.replace(/\/+$/, "");

  const result = await writeConfig({ worker_url: cleanUrl, token });
  result.match(
    () => console.log(`Logged in to ${cleanUrl}`),
    (e) => {
      console.error(`Error: ${e}`);
      process.exit(1);
    }
  );
}
