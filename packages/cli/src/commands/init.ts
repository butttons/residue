import { isGitRepo } from "@/lib/git";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { mkdir, readFile, writeFile, chmod, stat } from "fs/promises";
import { join } from "path";

const POST_COMMIT_LINE = "residue capture";
const PRE_PUSH_LINE = "residue sync";

function installHook(opts: {
  hooksDir: string;
  filename: string;
  line: string;
}): ResultAsync<string, string> {
  const hookPath = join(opts.hooksDir, opts.filename);

  return ResultAsync.fromPromise(
    (async () => {
      let isExisting = false;
      try {
        await stat(hookPath);
        isExisting = true;
      } catch {
        // file does not exist
      }

      if (isExisting) {
        const content = await readFile(hookPath, "utf-8");
        if (content.includes(opts.line)) {
          return `${opts.filename}: already installed`;
        }
        await writeFile(hookPath, content.trimEnd() + "\n" + opts.line + "\n");
        await chmod(hookPath, 0o755);
        return `${opts.filename}: appended`;
      }

      await writeFile(hookPath, `#!/bin/sh\n${opts.line}\n`);
      await chmod(hookPath, 0o755);
      return `${opts.filename}: created`;
    })(),
    (e) => (e instanceof Error ? e.message : `Failed to install hook ${opts.filename}`)
  );
}

function getGitDirForInit(): ResultAsync<string, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      return (await new Response(proc.stdout).text()).trim();
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to get git directory")
  );
}

export function init(): ResultAsync<void, string> {
  return isGitRepo().andThen((isRepo) => {
    if (!isRepo) {
      return errAsync("not a git repository");
    }

    return getGitDirForInit().andThen((gitDir) => {
      const sessionsDir = join(gitDir, "ai-sessions");
      const hooksDir = join(gitDir, "hooks");

      return ResultAsync.fromPromise(
        Promise.all([
          mkdir(sessionsDir, { recursive: true }),
          mkdir(hooksDir, { recursive: true }),
        ]),
        (e) => (e instanceof Error ? e.message : "Failed to create directories")
      ).andThen(() =>
        ResultAsync.combine([
          installHook({ hooksDir, filename: "post-commit", line: POST_COMMIT_LINE }),
          installHook({ hooksDir, filename: "pre-push", line: PRE_PUSH_LINE }),
        ]).map(([postCommit, prePush]) => {
          console.log("Initialized residue in this repository.");
          console.log(`  ${postCommit}`);
          console.log(`  ${prePush}`);
        })
      ).andThen(() => {
        const home = process.env.HOME || process.env.USERPROFILE || "/";

        return ResultAsync.fromSafePromise(
          Bun.file(join(home, ".claude")).exists().catch(() => false)
        ).map((hasClaudeDir) => {
          if (hasClaudeDir) {
            console.log("\nDetected adapters: claude-code");
          } else {
            console.log("\nNo known adapters detected. Install an adapter to start capturing sessions.");
          }
        });
      });
    });
  });
}
