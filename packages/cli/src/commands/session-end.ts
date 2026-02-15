import { getProjectRoot, getPendingPath, getSession, updateSession } from "@/lib/pending";
import { CliError } from "@/utils/errors";
import { errAsync, type ResultAsync } from "neverthrow";

export function sessionEnd(opts: { id: string }): ResultAsync<void, CliError> {
  return getProjectRoot()
    .andThen(getPendingPath)
    .andThen((pendingPath) =>
      getSession({ path: pendingPath, id: opts.id }).andThen((session) => {
        if (!session) {
          return errAsync(
            new CliError({
              message: `Session not found: ${opts.id}`,
              code: "SESSION_NOT_FOUND",
            })
          );
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
