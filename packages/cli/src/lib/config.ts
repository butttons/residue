/**
 * Config management for the residue CLI.
 * Manages ~/.residue/config (JSON file).
 */
import { ResultAsync } from "neverthrow";
import { join } from "path";
import { mkdir } from "fs/promises";

export type ResidueConfig = {
  worker_url: string;
  token: string;
};

function home(): string {
  return process.env.HOME || process.env.USERPROFILE || "/";
}

export function getConfigDir(): string {
  return join(home(), ".residue");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config");
}

export function readConfig(): ResultAsync<ResidueConfig | null, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const path = getConfigPath();
      const file = Bun.file(path);
      const exists = await file.exists();
      if (!exists) return null;
      const text = await file.text();
      return JSON.parse(text) as ResidueConfig;
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to read config")
  );
}

export function writeConfig(config: ResidueConfig): ResultAsync<void, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const dir = getConfigDir();
      await mkdir(dir, { recursive: true });
      await Bun.write(getConfigPath(), JSON.stringify(config, null, 2));
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to write config")
  );
}

export function configExists(): ResultAsync<boolean, string> {
  return ResultAsync.fromPromise(
    Bun.file(getConfigPath()).exists(),
    (e) => (e instanceof Error ? e.message : "Failed to check config")
  );
}
