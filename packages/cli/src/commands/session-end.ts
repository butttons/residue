import { getProjectRoot, getPendingPath, getSession, updateSession } from "@/lib/pending";
import { errAsync, type ResultAsync } from "neverthrow";

export function sessionEnd(opts: { id: string }): ResultAsync<void, string> {
  return getProjectRoot()
    .andThen(getPendingPath)
    .andThen((pendingPath) =>
      getSession({ path: pendingPath, id: opts.id }).andThen((session) => {
        if (!session) {
          return errAsync(`Session not found: ${opts.id}`);
        }
        return updateSession({
          path: pendingPath,
          id: opts.id,
          updates: { status: "ended" },
        });
      })
    )
    .map(() => {
      console.error(`Session ${opts.id} ended`);
    });
}
