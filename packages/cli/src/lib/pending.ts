/**
 * Pending queue management for the residue CLI.
 * Manages .git/ai-sessions/pending.json.
 */
import { ok, err, errAsync, Result, ResultAsync } from "neverthrow";
import { join } from "path";
import { mkdir } from "fs/promises";

export type PendingSession = {
  id: string;
  agent: string;
  agent_version: string;
  status: "open" | "ended";
  data_path: string;
  commits: string[];
};

/**
 * Get the git directory for the current repo.
 * Runs `git rev-parse --git-dir` to find .git (works in worktrees too).
 */
export function getGitDir(): ResultAsync<string, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error("Not a git repository");
      }
      const text = await new Response(proc.stdout).text();
      return text.trim();
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to get git directory")
  );
}

/**
 * Get the path to .git/ai-sessions/pending.json, creating the directory if needed.
 */
export function getPendingPath(gitDir: string): ResultAsync<string, string> {
  const sessionsDir = join(gitDir, "ai-sessions");
  return ResultAsync.fromPromise(
    (async () => {
      await mkdir(sessionsDir, { recursive: true });
      return join(sessionsDir, "pending.json");
    })(),
    (e) =>
      e instanceof Error ? e.message : "Failed to create ai-sessions directory"
  );
}

/**
 * Read pending sessions from disk. Returns [] if file doesn't exist.
 */
export function readPending(pendingPath: string): ResultAsync<PendingSession[], string> {
  return ResultAsync.fromPromise(
    (async () => {
      const file = Bun.file(pendingPath);
      const isExists = await file.exists();
      if (!isExists) return [];
      const text = await file.text();
      return JSON.parse(text) as PendingSession[];
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to read pending queue")
  );
}

/**
 * Write pending sessions to disk.
 */
export function writePending(opts: {
  path: string;
  sessions: PendingSession[];
}): ResultAsync<void, string> {
  return ResultAsync.fromPromise(
    (async () => {
      await Bun.write(opts.path, JSON.stringify(opts.sessions, null, 2));
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to write pending queue")
  );
}

/**
 * Add a session to the pending queue.
 */
export function addSession(opts: {
  path: string;
  session: PendingSession;
}): ResultAsync<void, string> {
  return readPending(opts.path).andThen((sessions) => {
    sessions.push(opts.session);
    return writePending({ path: opts.path, sessions });
  });
}

/**
 * Update a session by ID with partial updates.
 */
export function updateSession(opts: {
  path: string;
  id: string;
  updates: Partial<PendingSession>;
}): ResultAsync<void, string> {
  return readPending(opts.path).andThen((sessions) => {
    const index = sessions.findIndex((s) => s.id === opts.id);
    if (index === -1) {
      return errAsync(`Session not found: ${opts.id}`);
    }
    sessions[index] = { ...sessions[index], ...opts.updates };
    return writePending({ path: opts.path, sessions });
  });
}

/**
 * Remove a session by ID.
 */
export function removeSession(opts: {
  path: string;
  id: string;
}): ResultAsync<void, string> {
  return readPending(opts.path).andThen((sessions) => {
    const filtered = sessions.filter((s) => s.id !== opts.id);
    return writePending({ path: opts.path, sessions: filtered });
  });
}

/**
 * Get a session by ID.
 */
export function getSession(opts: {
  path: string;
  id: string;
}): ResultAsync<PendingSession | undefined, string> {
  return readPending(opts.path).map((sessions) =>
    sessions.find((s) => s.id === opts.id)
  );
}
