import { readConfig } from "@/lib/config";
import { getRemoteUrl, parseRemote, getCommitMeta } from "@/lib/git";
import { getProjectRoot, getPendingPath, readPending, writePending } from "@/lib/pending";
import type { PendingSession, CommitRef } from "@/lib/pending";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { stat } from "fs/promises";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

type CommitPayload = {
  sha: string;
  org: string;
  repo: string;
  message: string;
  author: string;
  committed_at: number;
  branch: string;
};

function postSession(opts: {
  workerUrl: string;
  token: string;
  session: {
    id: string;
    agent: string;
    agent_version: string;
    status: string;
    data: string;
  };
  commits: CommitPayload[];
}): ResultAsync<void, string> {
  return ResultAsync.fromPromise(
    fetch(`${opts.workerUrl}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({
        session: opts.session,
        commits: opts.commits,
      }),
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    }),
    (e) => (e instanceof Error ? e.message : "unknown error")
  );
}

function readSessionData(dataPath: string): ResultAsync<string | null, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const file = Bun.file(dataPath);
      const isExists = await file.exists();
      if (!isExists) return null;
      return file.text();
    })(),
    (e) => (e instanceof Error ? e.message : "Failed to read session data")
  );
}

function buildCommitMeta(opts: {
  commitRefs: CommitRef[];
  org: string;
  repo: string;
}): ResultAsync<CommitPayload[], string> {
  return ResultAsync.fromSafePromise(
    (async () => {
      const commits: CommitPayload[] = [];
      for (const ref of opts.commitRefs) {
        const metaResult = await getCommitMeta(ref.sha);
        if (metaResult.isErr()) {
          console.error(`Warning: ${metaResult.error}`);
          continue;
        }
        commits.push({
          sha: ref.sha,
          org: opts.org,
          repo: opts.repo,
          message: metaResult.value.message,
          author: metaResult.value.author,
          committed_at: metaResult.value.committed_at,
          branch: ref.branch,
        });
      }
      return commits;
    })()
  );
}

function getFileMtimeMs(path: string): ResultAsync<number | null, string> {
  return ResultAsync.fromPromise(
    stat(path).then((s) => s.mtimeMs),
    () => "stat failed"
  ).orElse(() => okAsync(null));
}

/**
 * Mark open sessions as ended if their data file hasn't been modified
 * in the last 30 minutes. This handles dangling sessions from crashed
 * or closed agent processes that never called session-end.
 */
function closeStaleOpenSessions(opts: {
  sessions: PendingSession[];
}): ResultAsync<PendingSession[], string> {
  const now = Date.now();
  const openSessions = opts.sessions.filter((s) => s.status === "open");

  if (openSessions.length === 0) {
    return okAsync(opts.sessions);
  }

  const checks = openSessions.map((session) =>
    getFileMtimeMs(session.data_path).map((mtimeMs) => {
      if (mtimeMs === null) {
        session.status = "ended";
        console.error(
          `Auto-closed session ${session.id} (data file not accessible)`
        );
      } else {
        const msSinceModified = now - mtimeMs;
        if (msSinceModified > STALE_THRESHOLD_MS) {
          session.status = "ended";
          console.error(
            `Auto-closed stale session ${session.id} (data file unchanged for ${Math.round(msSinceModified / 60_000)}m)`
          );
        }
      }
    })
  );

  return ResultAsync.combine(checks).map(() => opts.sessions);
}

function syncSessions(opts: {
  sessions: PendingSession[];
  workerUrl: string;
  token: string;
  org: string;
  repo: string;
}): ResultAsync<PendingSession[], string> {
  return ResultAsync.fromSafePromise(
    (async () => {
      const remaining: PendingSession[] = [];

      for (const session of opts.sessions) {
        if (session.commits.length === 0) {
          remaining.push(session);
          continue;
        }

        const dataResult = await readSessionData(session.data_path);
        if (dataResult.isErr()) {
          console.error(`Warning: ${dataResult.error}`);
          remaining.push(session);
          continue;
        }

        const data = dataResult.value;
        if (data === null) {
          console.error(`Dropping session ${session.id}: data file missing at ${session.data_path}`);
          continue;
        }

        const commitsResult = await buildCommitMeta({
          commitRefs: session.commits,
          org: opts.org,
          repo: opts.repo,
        });
        if (commitsResult.isErr()) {
          console.error(`Warning: ${commitsResult.error}`);
          remaining.push(session);
          continue;
        }

        const uploadResult = await postSession({
          workerUrl: opts.workerUrl,
          token: opts.token,
          session: {
            id: session.id,
            agent: session.agent,
            agent_version: session.agent_version,
            status: session.status,
            data,
          },
          commits: commitsResult.value,
        });

        if (uploadResult.isErr()) {
          console.error(`Warning: Upload failed for session ${session.id}: ${uploadResult.error}`);
          remaining.push(session);
          continue;
        }

        if (session.status === "open") {
          remaining.push(session);
        }

        console.error(`Synced session ${session.id}`);
      }

      return remaining;
    })()
  );
}

function resolveRemote(remoteUrl?: string): ResultAsync<{ org: string; repo: string }, string> {
  if (remoteUrl && remoteUrl.length > 0) {
    const result = parseRemote(remoteUrl);
    if (result.isOk()) {
      return okAsync(result.value);
    }
  }
  return getRemoteUrl().andThen(parseRemote);
}

export function sync(opts?: { remoteUrl?: string }): ResultAsync<void, string> {
  return readConfig().andThen((config) => {
    if (!config) {
      return errAsync("Not configured. Run 'residue login' first.");
    }

    return getProjectRoot()
      .andThen(getPendingPath)
      .andThen((pendingPath) =>
        readPending(pendingPath).andThen((sessions) => {
          if (sessions.length === 0) {
            return okAsync(undefined);
          }

          return closeStaleOpenSessions({ sessions })
            .andThen((updatedSessions) =>
              resolveRemote(opts?.remoteUrl)
                .andThen(({ org, repo }) =>
                  syncSessions({
                    sessions: updatedSessions,
                    workerUrl: config.worker_url,
                    token: config.token,
                    org,
                    repo,
                  }).andThen((remaining) =>
                    writePending({ path: pendingPath, sessions: remaining })
                  )
                )
            );
        })
      );
  });
}
