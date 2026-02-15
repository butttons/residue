/**
 * Config management for the residue CLI.
 * Manages ~/.residue/config (JSON file).
 */

import { mkdir } from "fs/promises";
import { ResultAsync } from "neverthrow";
import { join } from "path";
import type { CliError } from "@/utils/errors";
import { toCliError } from "@/utils/errors";

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

export function readConfig(): ResultAsync<ResidueConfig | null, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const path = getConfigPath();
			const file = Bun.file(path);
			const isExists = await file.exists();
			if (!isExists) return null;
			const text = await file.text();
			return JSON.parse(text) as ResidueConfig;
		})(),
		toCliError({ message: "Failed to read config", code: "CONFIG_ERROR" }),
	);
}

export function writeConfig(
	config: ResidueConfig,
): ResultAsync<void, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const dir = getConfigDir();
			await mkdir(dir, { recursive: true });
			await Bun.write(getConfigPath(), JSON.stringify(config, null, 2));
		})(),
		toCliError({ message: "Failed to write config", code: "CONFIG_ERROR" }),
	);
}

export function configExists(): ResultAsync<boolean, CliError> {
	return ResultAsync.fromPromise(
		Bun.file(getConfigPath()).exists(),
		toCliError({ message: "Failed to check config", code: "CONFIG_ERROR" }),
	);
}
