import type { Command } from "commander";
import { getCurrentSha } from "@/lib/git";
import { getGitDir, getPendingPath, readPending, writePending } from "@/lib/pending";

export function registerCapture(program: Command): void {
  program
    .command("capture")
    .description("Tag pending sessions with current commit SHA (called by post-commit hook)")
    .action(async () => {
      const shaResult = await getCurrentSha();
      if (shaResult.isErr()) {
        console.error(`Error: ${shaResult._unsafeUnwrapErr()}`);
        process.exit(0);
      }

      const gitDirResult = await getGitDir();
      if (gitDirResult.isErr()) {
        console.error(`Error: ${gitDirResult._unsafeUnwrapErr()}`);
        process.exit(0);
      }

      const pendingPathResult = await getPendingPath(gitDirResult._unsafeUnwrap());
      if (pendingPathResult.isErr()) {
        console.error(`Error: ${pendingPathResult._unsafeUnwrapErr()}`);
        process.exit(0);
      }

      const pendingPath = pendingPathResult._unsafeUnwrap();
      const sessionsResult = await readPending(pendingPath);
      if (sessionsResult.isErr()) {
        console.error(`Error: ${sessionsResult._unsafeUnwrapErr()}`);
        process.exit(0);
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
        console.error(`Error: ${writeResult._unsafeUnwrapErr()}`);
      }

      process.exit(0);
    });
}
