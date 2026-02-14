import type { Command } from "commander";
import { getGitDir, getPendingPath, addSession } from "@/lib/pending";

export function registerSessionStart(program: Command): void {
  program
    .command("session-start")
    .description("Start tracking an agent session")
    .requiredOption("--agent <name>", "Agent name")
    .requiredOption("--data <path>", "Path to raw session file")
    .option("--agent-version <semver>", "Agent version", "unknown")
    .action(async (opts: { agent: string; data: string; agentVersion: string }) => {
      const gitDirResult = await getGitDir();
      if (gitDirResult.isErr()) {
        console.error(`Error: ${gitDirResult._unsafeUnwrapErr()}`);
        process.exit(1);
      }

      const pendingPathResult = await getPendingPath(gitDirResult._unsafeUnwrap());
      if (pendingPathResult.isErr()) {
        console.error(`Error: ${pendingPathResult._unsafeUnwrapErr()}`);
        process.exit(1);
      }

      const id = crypto.randomUUID();

      const result = await addSession({
        path: pendingPathResult._unsafeUnwrap(),
        session: {
          id,
          agent: opts.agent,
          agent_version: opts.agentVersion,
          status: "open",
          data_path: opts.data,
          commits: [],
        },
      });

      if (result.isErr()) {
        console.error(`Error: ${result._unsafeUnwrapErr()}`);
        process.exit(1);
      }

      // Only the session ID goes to stdout so adapters can capture it
      process.stdout.write(id);
      console.error(`Session started for ${opts.agent}`);
    });
}
