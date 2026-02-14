import { getCurrentSha } from "@/lib/git";
import { getGitDir, getPendingPath, readPending, writePending } from "@/lib/pending";
import type { ResultAsync } from "neverthrow";

export function capture(): ResultAsync<void, string> {
  return getCurrentSha().andThen((sha) =>
    getGitDir()
      .andThen(getPendingPath)
      .andThen((pendingPath) =>
        readPending(pendingPath).andThen((sessions) => {
          for (const session of sessions) {
            if (session.status === "ended") continue;
            if (!session.commits.includes(sha)) {
              session.commits.push(sha);
            }
          }
          return writePending({ path: pendingPath, sessions });
        })
      )
  );
}
