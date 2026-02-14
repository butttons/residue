#!/usr/bin/env bun

import { Command } from "commander";
import { login } from "@/commands/login";
import { init } from "@/commands/init";
import { sessionStart } from "@/commands/session-start";
import { sessionEnd } from "@/commands/session-end";
import { capture } from "@/commands/capture";
import { sync } from "@/commands/sync";
import { push } from "@/commands/push";
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
  .action(wrapCommand(async (opts: { url: string; token: string }) => {
    await login({ url: opts.url, token: opts.token });
  }));

program
  .command("init")
  .description("Install git hooks in current repo")
  .action(wrapCommand(async () => {
    await init();
  }));

const session = program
  .command("session")
  .description("Manage agent sessions");

session
  .command("start")
  .description("Start tracking an agent session")
  .requiredOption("--agent <name>", "Agent name")
  .requiredOption("--data <path>", "Path to raw session file")
  .option("--agent-version <semver>", "Agent version", "unknown")
  .action(wrapCommand(async (opts: { agent: string; data: string; agentVersion: string }) => {
    await sessionStart({ agent: opts.agent, data: opts.data, agentVersion: opts.agentVersion });
  }));

session
  .command("end")
  .description("Mark an agent session as ended")
  .requiredOption("--id <session-id>", "Session ID to end")
  .action(wrapCommand(async (opts: { id: string }) => {
    await sessionEnd({ id: opts.id });
  }));

program
  .command("capture")
  .description("Tag pending sessions with current commit SHA (called by post-commit hook)")
  .action(wrapHookCommand(async () => {
    await capture();
  }));

program
  .command("sync")
  .description("Upload pending sessions to worker (called by pre-push hook)")
  .action(wrapHookCommand(async () => {
    await sync();
  }));

program
  .command("push")
  .description("Upload pending sessions to worker (manual trigger)")
  .action(wrapCommand(async () => {
    await push();
  }));

program.parse();
