import type { Command } from "commander";
import { getGitDir, getPendingPath, getSession, updateSession } from "@/lib/pending";

export function registerSessionEnd(program: Command): void {
  program
    .command("session-end")
    .description("Mark an agent session as ended")
    .requiredOption("--id <session-id>", "Session ID to end")
    .action(async (opts: { id: string }) => {
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

      const pendingPath = pendingPathResult._unsafeUnwrap();

      const sessionResult = await getSession({ path: pendingPath, id: opts.id });
      if (sessionResult.isErr()) {
        console.error(`Error: ${sessionResult._unsafeUnwrapErr()}`);
        process.exit(1);
      }

      const session = sessionResult._unsafeUnwrap();
      if (!session) {
        console.error(`Error: Session not found: ${opts.id}`);
        process.exit(1);
      }

      const updateResult = await updateSession({
        path: pendingPath,
        id: opts.id,
        updates: { status: "ended" },
      });

      if (updateResult.isErr()) {
        console.error(`Error: ${updateResult._unsafeUnwrapErr()}`);
        process.exit(1);
      }

      console.error(`Session ${opts.id} ended`);
    });
}
