/**
 * Config management for the residue CLI.
 * Global config: ~/.residue/config
 * Local (per-project) config: .residue/config (in project root)
 *
 * resolveConfig() checks local first, then falls back to global.
 */

import { mkdir } from "fs/promises";
import { okAsync, ResultAsync } from "neverthrow";
import { join } from "path";
import { getProjectRoot } from "@/lib/pending";
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

function readConfigFromPath(
	configPath: string,
): ResultAsync<ResidueConfig | null, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const file = Bun.file(configPath);
			const isExists = await file.exists();
			if (!isExists) return null;
			const text = await file.text();
			return JSON.parse(text) as ResidueConfig;
		})(),
		toCliError({ message: "Failed to read config", code: "CONFIG_ERROR" }),
	);
}

function writeConfigToPath(opts: {
	configPath: string;
	config: ResidueConfig;
}): ResultAsync<void, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const dir = join(opts.configPath, "..");
			await mkdir(dir, { recursive: true });
			await Bun.write(opts.configPath, JSON.stringify(opts.config, null, 2));
		})(),
		toCliError({ message: "Failed to write config", code: "CONFIG_ERROR" }),
	);
}

/**
 * Read the global config from ~/.residue/config.
 */
export function readConfig(): ResultAsync<ResidueConfig | null, CliError> {
	return readConfigFromPath(getConfigPath());
}

/**
 * Write the global config to ~/.residue/config.
 */
export function writeConfig(
	config: ResidueConfig,
): ResultAsync<void, CliError> {
	return writeConfigToPath({ configPath: getConfigPath(), config });
}

/**
 * Read the local (per-project) config from .residue/config.
 */
export function readLocalConfig(
	projectRoot: string,
): ResultAsync<ResidueConfig | null, CliError> {
	return readConfigFromPath(join(projectRoot, ".residue", "config"));
}

/**
 * Write the local (per-project) config to .residue/config.
 */
export function writeLocalConfig(opts: {
	projectRoot: string;
	config: ResidueConfig;
}): ResultAsync<void, CliError> {
	return writeConfigToPath({
		configPath: join(opts.projectRoot, ".residue", "config"),
		config: opts.config,
	});
}

/**
 * Resolve config by checking local (per-project) first, then global.
 * Returns the first one found, or null if neither exists.
 */
export function resolveConfig(): ResultAsync<ResidueConfig | null, CliError> {
	return getProjectRoot()
		.andThen((projectRoot) => readLocalConfig(projectRoot))
		.orElse(() => okAsync(null as ResidueConfig | null))
		.andThen((localConfig) => {
			if (localConfig !== null) {
				return okAsync(localConfig as ResidueConfig | null);
			}
			return readConfig();
		});
}

export function configExists(): ResultAsync<boolean, CliError> {
	return ResultAsync.fromPromise(
		Bun.file(getConfigPath()).exists(),
		toCliError({ message: "Failed to check config", code: "CONFIG_ERROR" }),
	);
}
