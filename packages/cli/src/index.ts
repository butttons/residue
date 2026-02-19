#!/usr/bin/env bun

import { Command } from "commander";
import { capture } from "@/commands/capture";
import { clear } from "@/commands/clear";
import { hookClaudeCode } from "@/commands/hook";
import { init } from "@/commands/init";
import { login } from "@/commands/login";
import { push } from "@/commands/push";
import {
	queryCommit,
	queryCommits,
	querySession,
	querySessions,
} from "@/commands/query";
import { read } from "@/commands/read";
import { search } from "@/commands/search";
import { sessionEnd } from "@/commands/session-end";
import { sessionStart } from "@/commands/session-start";
import { setup } from "@/commands/setup";
import { status } from "@/commands/status";
import { sync } from "@/commands/sync";
import { wrapCommand, wrapHookCommand } from "@/utils/errors";

import packageJson from "../package.json";

const program = new Command();

program
	.name("residue")
	.description("Capture AI agent conversations linked to git commits")
	.version(packageJson.version);

program
	.command("login")
	.description("Save worker URL and auth token")
	.requiredOption("--url <worker_url>", "Worker URL")
	.requiredOption("--token <auth_token>", "Auth token")
	.option("--local", "Save config to this project instead of globally")
	.action(
		wrapCommand((opts: { url: string; token: string; local?: boolean }) =>
			login({ url: opts.url, token: opts.token, isLocal: opts.local }),
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

program
	.command("read")
	.description("Read session transcript data to stdout")
	.argument("<session-id>", "Session ID to read")
	.action(wrapCommand((sessionId: string) => read({ id: sessionId })));

program
	.command("clear")
	.description("Remove pending sessions from the local queue")
	.option("--id <session-id>", "Clear a specific session by ID")
	.action(wrapCommand((opts: { id?: string }) => clear({ id: opts.id })));

program
	.command("status")
	.description("Show current residue state for this project")
	.action(wrapCommand(() => status()));

program
	.command("search")
	.description("Search session history")
	.argument("<query>", "Search query")
	.option("--ai", "Use AI-powered search (generates an answer with citations)")
	.action(
		wrapCommand((query: string, opts: { ai?: boolean }) =>
			search({ query, isAi: opts.ai }),
		),
	);

const queryCmd = program
	.command("query")
	.description("Query the session database");

queryCmd
	.command("sessions")
	.description("List sessions with optional filters")
	.option("--agent <name>", "Filter by agent name")
	.option("--repo <org/repo>", "Filter by repository")
	.option("--branch <name>", "Filter by branch")
	.option("--since <timestamp>", "Filter by created_at >= unix timestamp")
	.option("--until <timestamp>", "Filter by created_at <= unix timestamp")
	.option("--json", "Output as JSON to stdout")
	.action(
		wrapCommand(
			(opts: {
				agent?: string;
				repo?: string;
				branch?: string;
				since?: string;
				until?: string;
				json?: boolean;
			}) =>
				querySessions({
					agent: opts.agent,
					repo: opts.repo,
					branch: opts.branch,
					since: opts.since,
					until: opts.until,
					isJson: opts.json,
				}),
		),
	);

queryCmd
	.command("commits")
	.description("List commits with optional filters")
	.option("--repo <org/repo>", "Filter by repository")
	.option("--branch <name>", "Filter by branch")
	.option("--author <name>", "Filter by author")
	.option("--since <timestamp>", "Filter by committed_at >= unix timestamp")
	.option("--until <timestamp>", "Filter by committed_at <= unix timestamp")
	.option("--json", "Output as JSON to stdout")
	.action(
		wrapCommand(
			(opts: {
				repo?: string;
				branch?: string;
				author?: string;
				since?: string;
				until?: string;
				json?: boolean;
			}) =>
				queryCommits({
					repo: opts.repo,
					branch: opts.branch,
					author: opts.author,
					since: opts.since,
					until: opts.until,
					isJson: opts.json,
				}),
		),
	);

queryCmd
	.command("session")
	.description("Get full details for a specific session")
	.argument("<id>", "Session ID")
	.option("--json", "Output as JSON to stdout")
	.action(
		wrapCommand((id: string, opts: { json?: boolean }) =>
			querySession({ id, isJson: opts.json }),
		),
	);

queryCmd
	.command("commit")
	.description("Get details for a specific commit")
	.argument("<sha>", "Commit SHA")
	.option("--json", "Output as JSON to stdout")
	.action(
		wrapCommand((sha: string, opts: { json?: boolean }) =>
			queryCommit({ sha, isJson: opts.json }),
		),
	);

program.parse();
