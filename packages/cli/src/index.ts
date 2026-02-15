#!/usr/bin/env bun

import { Command } from "commander";
import { capture } from "@/commands/capture";
import { hookClaudeCode } from "@/commands/hook";
import { init } from "@/commands/init";
import { login } from "@/commands/login";
import { push } from "@/commands/push";
import { sessionEnd } from "@/commands/session-end";
import { sessionStart } from "@/commands/session-start";
import { setup } from "@/commands/setup";
import { sync } from "@/commands/sync";
import { wrapCommand, wrapHookCommand } from "@/utils/errors";

const program = new Command();

program
	.name("residue")
	.description("Capture AI agent conversations linked to git commits")
	.version("0.0.1");

program
	.command("login")
	.description("Save worker URL and auth token")
	.requiredOption("--url <worker_url>", "Worker URL")
	.requiredOption("--token <auth_token>", "Auth token")
	.action(
		wrapCommand((opts: { url: string; token: string }) =>
			login({ url: opts.url, token: opts.token }),
		),
	);

program
	.command("init")
	.description("Install git hooks in current repo")
	.action(wrapCommand(() => init()));

program
	.command("setup")
	.description("Configure an agent adapter for this project")
	.argument("<agent>", "Agent to set up (claude-code, pi)")
	.action(wrapCommand((agent: string) => setup({ agent })));

const hook = program
	.command("hook")
	.description("Agent hook handlers (called by agent plugins)");

hook
	.command("claude-code")
	.description("Handle Claude Code hook events (reads JSON from stdin)")
	.action(wrapHookCommand(() => hookClaudeCode()));

const session = program.command("session").description("Manage agent sessions");

session
	.command("start")
	.description("Start tracking an agent session")
	.requiredOption("--agent <name>", "Agent name")
	.requiredOption("--data <path>", "Path to raw session file")
	.option("--agent-version <semver>", "Agent version", "unknown")
	.action(
		wrapCommand((opts: { agent: string; data: string; agentVersion: string }) =>
			sessionStart({
				agent: opts.agent,
				data: opts.data,
				agentVersion: opts.agentVersion,
			}),
		),
	);

session
	.command("end")
	.description("Mark an agent session as ended")
	.requiredOption("--id <session-id>", "Session ID to end")
	.action(wrapCommand((opts: { id: string }) => sessionEnd({ id: opts.id })));

program
	.command("capture")
	.description(
		"Tag pending sessions with current commit SHA (called by post-commit hook)",
	)
	.action(wrapHookCommand(() => capture()));

program
	.command("sync")
	.description("Upload pending sessions to worker (called by pre-push hook)")
	.option("--remote-url <url>", "Remote URL (passed by pre-push hook)")
	.action(
		wrapHookCommand((opts: { remoteUrl?: string }) =>
			sync({ remoteUrl: opts.remoteUrl }),
		),
	);

program
	.command("push")
	.description("Upload pending sessions to worker (manual trigger)")
	.action(wrapCommand(() => push()));

program.parse();
