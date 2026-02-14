import { getCurrentSha, getCurrentBranch } from "@/lib/git";
import { getGitDir, getPendingPath, readPending, writePending } from "@/lib/pending";
import { ResultAsync } from "neverthrow";

export function capture(): ResultAsync<void, string> {
  return ResultAsync.combine([getCurrentSha(), getCurrentBranch()]).andThen(
    ([sha, branch]) =>
      getGitDir()
        .andThen(getPendingPath)
        .andThen((pendingPath) =>
          readPending(pendingPath).andThen((sessions) => {
            for (const session of sessions) {
              const isAlreadyTagged = session.commits.some((c) => c.sha === sha);
              if (!isAlreadyTagged) {
                session.commits.push({ sha, branch });
              }
            }
            return writePending({ path: pendingPath, sessions });
          })
        )
  );
}
