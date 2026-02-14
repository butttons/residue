import { getGitDir, getPendingPath, addSession } from "@/lib/pending";

export async function sessionStart(opts: {
  agent: string;
  data: string;
  agentVersion: string;
}): Promise<void> {
  const gitDirResult = await getGitDir();
  if (gitDirResult.isErr()) {
    throw new Error(gitDirResult._unsafeUnwrapErr());
  }

  const pendingPathResult = await getPendingPath(gitDirResult._unsafeUnwrap());
  if (pendingPathResult.isErr()) {
    throw new Error(pendingPathResult._unsafeUnwrapErr());
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
    throw new Error(result._unsafeUnwrapErr());
  }

  // Only the session ID goes to stdout so adapters can capture it
  process.stdout.write(id);
  console.error(`Session started for ${opts.agent}`);
}
