import { getGitDir, getPendingPath, getSession, updateSession } from "@/lib/pending";

export async function sessionEnd(opts: { id: string }): Promise<void> {
  const gitDirResult = await getGitDir();
  if (gitDirResult.isErr()) {
    throw new Error(gitDirResult._unsafeUnwrapErr());
  }

  const pendingPathResult = await getPendingPath(gitDirResult._unsafeUnwrap());
  if (pendingPathResult.isErr()) {
    throw new Error(pendingPathResult._unsafeUnwrapErr());
  }

  const pendingPath = pendingPathResult._unsafeUnwrap();

  const sessionResult = await getSession({ path: pendingPath, id: opts.id });
  if (sessionResult.isErr()) {
    throw new Error(sessionResult._unsafeUnwrapErr());
  }

  const session = sessionResult._unsafeUnwrap();
  if (!session) {
    throw new Error(`Session not found: ${opts.id}`);
  }

  const updateResult = await updateSession({
    path: pendingPath,
    id: opts.id,
    updates: { status: "ended" },
  });

  if (updateResult.isErr()) {
    throw new Error(updateResult._unsafeUnwrapErr());
  }

  console.error(`Session ${opts.id} ended`);
}
