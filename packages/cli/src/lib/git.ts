/**
 * Git utility functions for the residue CLI.
 */
import { ok, err, Result, ResultAsync } from "neverthrow";

export function parseRemote(
  remoteUrl: string
): Result<{ org: string; repo: string }, string> {
  // SSH: git@github.com:org/repo.git
  // HTTPS: https://github.com/org/repo.git
  const match = remoteUrl.match(/[:\/]([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (!match) {
    return err(`Cannot parse git remote URL: ${remoteUrl}`);
  }
  return ok({ org: match[1], repo: match[2] });
}

export function getRemoteUrl(): ResultAsync<string, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error("Failed to get git remote URL");
      }
      const text = await new Response(proc.stdout).text();
      return text.trim();
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to get git remote URL")
  );
}

export function getCurrentBranch(): ResultAsync<string, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error("Failed to get current branch");
      }
      const text = await new Response(proc.stdout).text();
      return text.trim();
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to get current branch")
  );
}

export function getCurrentSha(): ResultAsync<string, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error("Failed to get current commit SHA");
      }
      const text = await new Response(proc.stdout).text();
      return text.trim();
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to get current commit SHA")
  );
}

export function getCommitMeta(
  sha: string
): ResultAsync<
  { message: string; author: string; committed_at: number },
  string
> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(
        ["git", "log", "-1", "--format=%s%n%an%n%ct", sha],
        { stdout: "pipe", stderr: "pipe" }
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error(`Failed to get commit metadata for ${sha}`);
      }
      const text = await new Response(proc.stdout).text();
      const lines = text.trim().split("\n");
      return {
        message: lines[0] || "",
        author: lines[1] || "",
        committed_at: parseInt(lines[2] || "0", 10),
      };
    })(),
    (e) =>
      e instanceof Error
        ? e.message
        : `Failed to get commit metadata for ${sha}`
  );
}

export function isGitRepo(): ResultAsync<boolean, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to check git repo")
  );
}
