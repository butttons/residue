import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { getProjectRoot } from "@/lib/pending";
import { CliError, toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("setup");

import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import opencodePluginSource from "../../adapters/opencode/plugin.ts.txt" with {
	type: "text",
};
// Embedded at build time so the binary doesn't need to resolve a file path at runtime
import piAdapterSource from "../../adapters/pi/extension.ts.txt" with {
	type: "text",
};

type HookHandler = {
	type: string;
	command: string;
	timeout?: number;
};

type HookEntry = {
	matcher: string;
	hooks: HookHandler[];
};

type ClaudeSettings = {
	hooks?: Record<string, HookEntry[]>;
	[key: string]: unknown;
};

const CLAUDE_HOOK_COMMAND = "residue hook claude-code";

function hasResidueHook(entries: HookEntry[]): boolean {
	return entries.some((entry) =>
		entry.hooks.some((h) => h.command === CLAUDE_HOOK_COMMAND),
	);
}

function setupClaudeCode(projectRoot: string): ResultAsync<void, CliError> {
	const claudeDir = join(projectRoot, ".claude");
	const settingsPath = join(claudeDir, "settings.json");

	return ResultAsync.fromPromise(
		(async () => {
			await mkdir(claudeDir, { recursive: true });

			let settings: ClaudeSettings = {};
			try {
				await stat(settingsPath);
				const raw = await readFile(settingsPath, "utf-8");
				settings = JSON.parse(raw) as ClaudeSettings;
			} catch {
				// file does not exist or is invalid
			}

			if (!settings.hooks) {
				settings.hooks = {};
			}

			let isChanged = false;

			// SessionStart hook
			if (!settings.hooks.SessionStart) {
				settings.hooks.SessionStart = [];
			}
			if (!hasResidueHook(settings.hooks.SessionStart)) {
				settings.hooks.SessionStart.push({
					matcher: "startup",
					hooks: [
						{ type: "command", command: CLAUDE_HOOK_COMMAND, timeout: 10 },
					],
				});
				isChanged = true;
			}

			// SessionEnd hook
			if (!settings.hooks.SessionEnd) {
				settings.hooks.SessionEnd = [];
			}
			if (!hasResidueHook(settings.hooks.SessionEnd)) {
				settings.hooks.SessionEnd.push({
					matcher: "",
					hooks: [
						{ type: "command", command: CLAUDE_HOOK_COMMAND, timeout: 10 },
					],
				});
				isChanged = true;
			}

			if (!isChanged) {
				log.info("residue hooks already configured in .claude/settings.json");
				return;
			}

			await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
			log.info("Configured Claude Code hooks in .claude/settings.json");
		})(),
		toCliError({ message: "Failed to setup Claude Code", code: "IO_ERROR" }),
	);
}

function setupPi(projectRoot: string): ResultAsync<void, CliError> {
	const extensionDir = join(projectRoot, ".pi", "extensions");
	const targetPath = join(extensionDir, "residue.ts");

	return ResultAsync.fromPromise(
		(async () => {
			await mkdir(extensionDir, { recursive: true });

			let isExisting = false;
			try {
				await stat(targetPath);
				isExisting = true;
			} catch {
				// does not exist
			}

			if (isExisting) {
				log.info(
					"residue extension already exists at .pi/extensions/residue.ts",
				);
				return;
			}

			await writeFile(targetPath, piAdapterSource);
			log.info("Installed pi extension at .pi/extensions/residue.ts");
		})(),
		toCliError({ message: "Failed to setup pi", code: "IO_ERROR" }),
	);
}

function setupOpencode(projectRoot: string): ResultAsync<void, CliError> {
	const pluginDir = join(projectRoot, ".opencode", "plugins");
	const targetPath = join(pluginDir, "residue.ts");

	return ResultAsync.fromPromise(
		(async () => {
			await mkdir(pluginDir, { recursive: true });

			let isExisting = false;
			try {
				await stat(targetPath);
				isExisting = true;
			} catch {
				// does not exist
			}

			if (isExisting) {
				log.info(
					"residue plugin already exists at .opencode/plugins/residue.ts",
				);
				return;
			}

			await writeFile(targetPath, opencodePluginSource);
			log.info("Installed opencode plugin at .opencode/plugins/residue.ts");
		})(),
		toCliError({ message: "Failed to setup opencode", code: "IO_ERROR" }),
	);
}

export function setup(opts: { agent: string }): ResultAsync<void, CliError> {
	return getProjectRoot().andThen((projectRoot) => {
		switch (opts.agent) {
			case "claude-code":
				return setupClaudeCode(projectRoot);
			case "pi":
				return setupPi(projectRoot);
			case "opencode":
				return setupOpencode(projectRoot);
			default:
				return errAsync(
					new CliError({
						message: `Unknown agent: ${opts.agent}. Supported: claude-code, opencode, pi`,
						code: "VALIDATION_ERROR",
					}),
				);
		}
	});
}
