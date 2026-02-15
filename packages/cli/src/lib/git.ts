/**
 * Git utility functions for the residue CLI.
 */
import { ok, err, Result, ResultAsync } from "neverthrow";
import { CliError, toCliError } from "@/utils/errors";

function runGitCommand(opts: {
  args: string[];
  errorMessage: string;
}): ResultAsync<string, CliError> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(["git", ...opts.args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(stderr.trim() || `exit code ${exitCode}`);
      }
      return (await new Response(proc.stdout).text()).trim();
    })(),
    toCliError({ message: opts.errorMessage, code: "GIT_ERROR" })
  );
}

export function parseRemote(
  remoteUrl: string
): Result<{ org: string; repo: string }, CliError> {
  const match = remoteUrl.match(/[:\/]([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (!match) {
    return err(
      new CliError({
        message: `Cannot parse git remote URL: ${remoteUrl}`,
        code: "GIT_PARSE_ERROR",
      })
    );
  }
  return ok({ org: match[1], repo: match[2] });
}

export function getRemoteUrl(): ResultAsync<string, CliError> {
  return runGitCommand({
    args: ["remote", "get-url", "origin"],
    errorMessage: "Failed to get git remote URL",
  });
}

export function getCurrentBranch(): ResultAsync<string, CliError> {
  return runGitCommand({
    args: ["rev-parse", "--abbrev-ref", "HEAD"],
    errorMessage: "Failed to get current branch",
  });
}

export function getCurrentSha(): ResultAsync<string, CliError> {
  return runGitCommand({
    args: ["rev-parse", "HEAD"],
    errorMessage: "Failed to get current commit SHA",
  });
}

export function getCommitMeta(
  sha: string
): ResultAsync<
  { message: string; author: string; committed_at: number },
  CliError
> {
  return runGitCommand({
    args: ["log", "-1", "--format=%s%n%an%n%ct", sha],
    errorMessage: `Failed to get commit metadata for ${sha}`,
  }).map((text) => {
    const lines = text.split("\n");
    return {
      message: lines[0] || "",
      author: lines[1] || "",
      committed_at: parseInt(lines[2] || "0", 10),
    };
  });
}

export function isGitRepo(): ResultAsync<boolean, CliError> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    })(),
    toCliError({ message: "Failed to check git repo", code: "GIT_ERROR" })
  );
}
