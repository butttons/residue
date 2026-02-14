import { getProjectRoot, getPendingPath, addSession } from "@/lib/pending";
import type { ResultAsync } from "neverthrow";

export function sessionStart(opts: {
  agent: string;
  data: string;
  agentVersion: string;
}): ResultAsync<void, string> {
  const id = crypto.randomUUID();

  return getProjectRoot()
    .andThen(getPendingPath)
    .andThen((pendingPath) =>
      addSession({
        path: pendingPath,
        session: {
          id,
          agent: opts.agent,
          agent_version: opts.agentVersion,
          status: "open",
          data_path: opts.data,
          commits: [],
        },
      })
    )
    .map(() => {
      // Only the session ID goes to stdout so adapters can capture it
      process.stdout.write(id);
      console.error(`Session started for ${opts.agent}`);
    });
}
