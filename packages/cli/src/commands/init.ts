import { isGitRepo } from "@/lib/git";
import { getProjectRoot, getResidueDir } from "@/lib/pending";
import { errAsync, ResultAsync } from "neverthrow";
import { mkdir, readFile, writeFile, chmod, stat, appendFile } from "fs/promises";
import { join } from "path";

const POST_COMMIT_LINE = "residue capture";
const PRE_PUSH_LINE = 'residue sync --remote-url "$2"';

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

function ensureGitignore(projectRoot: string): ResultAsync<void, string> {
  const gitignorePath = join(projectRoot, ".gitignore");

  return ResultAsync.fromPromise(
    (async () => {
      let content = "";
      try {
        content = await readFile(gitignorePath, "utf-8");
      } catch {
        // file does not exist yet
      }

      if (content.includes(".residue")) {
        return;
      }

      const line = content.length > 0 && !content.endsWith("\n")
        ? "\n.residue/\n"
        : ".residue/\n";
      await appendFile(gitignorePath, line);
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to update .gitignore")
  );
}

export function init(): ResultAsync<void, string> {
  return isGitRepo().andThen((isRepo) => {
    if (!isRepo) {
      return errAsync("not a git repository");
    }

    return ResultAsync.combine([getProjectRoot(), getGitDirForInit()]).andThen(
      ([projectRoot, gitDir]) => {
        const hooksDir = join(gitDir, "hooks");

        return ResultAsync.combine([
          getResidueDir(projectRoot),
          ResultAsync.fromPromise(
            mkdir(hooksDir, { recursive: true }),
            (e) => (e instanceof Error ? e.message : "Failed to create hooks directory")
          ),
        ]).andThen(() =>
          ResultAsync.combine([
            installHook({ hooksDir, filename: "post-commit", line: POST_COMMIT_LINE }),
            installHook({ hooksDir, filename: "pre-push", line: PRE_PUSH_LINE }),
            ensureGitignore(projectRoot),
          ]).map(([postCommit, prePush]) => {
            console.log("Initialized residue in this repository.");
            console.log(`  ${postCommit}`);
            console.log(`  ${prePush}`);
          })
        );
      }
    );
  });
}
