import { getCurrentSha } from "@/lib/git";
import { getGitDir, getPendingPath, readPending, writePending } from "@/lib/pending";

export async function capture(): Promise<void> {
  const shaResult = await getCurrentSha();
  if (shaResult.isErr()) {
    throw new Error(shaResult._unsafeUnwrapErr());
  }

  const gitDirResult = await getGitDir();
  if (gitDirResult.isErr()) {
    throw new Error(gitDirResult._unsafeUnwrapErr());
  }

  const pendingPathResult = await getPendingPath(gitDirResult._unsafeUnwrap());
  if (pendingPathResult.isErr()) {
    throw new Error(pendingPathResult._unsafeUnwrapErr());
  }

  const pendingPath = pendingPathResult._unsafeUnwrap();
  const sessionsResult = await readPending(pendingPath);
  if (sessionsResult.isErr()) {
    throw new Error(sessionsResult._unsafeUnwrapErr());
  }

  const sha = shaResult._unsafeUnwrap();
  const sessions = sessionsResult._unsafeUnwrap();

  for (const session of sessions) {
    if (!session.commits.includes(sha)) {
      session.commits.push(sha);
    }
  }

  const writeResult = await writePending({ path: pendingPath, sessions });
  if (writeResult.isErr()) {
    throw new Error(writeResult._unsafeUnwrapErr());
  }
}
