import { readConfig } from "@/lib/config";
import { getRemoteUrl, parseRemote, getCommitMeta } from "@/lib/git";
import { getGitDir, getPendingPath, readPending, writePending } from "@/lib/pending";
import type { PendingSession } from "@/lib/pending";
import { errAsync, okAsync, ResultAsync } from "neverthrow";

type CommitPayload = {
  sha: string;
  org: string;
  repo: string;
  message: string;
  author: string;
  committed_at: number;
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
  shas: string[];
  org: string;
  repo: string;
}): ResultAsync<CommitPayload[], string> {
  return ResultAsync.fromSafePromise(
    (async () => {
      const commits: CommitPayload[] = [];
      for (const sha of opts.shas) {
        const metaResult = await getCommitMeta(sha);
        if (metaResult.isErr()) {
          console.error(`Warning: ${metaResult.error}`);
          continue;
        }
        commits.push({
          sha,
          org: opts.org,
          repo: opts.repo,
          message: metaResult.value.message,
          author: metaResult.value.author,
          committed_at: metaResult.value.committed_at,
        });
      }
      return commits;
    })()
  );
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
          shas: session.commits,
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

export function sync(): ResultAsync<void, string> {
  return readConfig().andThen((config) => {
    if (!config) {
      return errAsync("Not configured. Run 'residue login' first.");
    }

    return getGitDir()
      .andThen(getPendingPath)
      .andThen((pendingPath) =>
        readPending(pendingPath).andThen((sessions) => {
          if (sessions.length === 0) {
            return okAsync(undefined);
          }

          return getRemoteUrl()
            .andThen(parseRemote)
            .andThen(({ org, repo }) =>
              syncSessions({
                sessions,
                workerUrl: config.worker_url,
                token: config.token,
                org,
                repo,
              }).andThen((remaining) =>
                writePending({ path: pendingPath, sessions: remaining })
              )
            );
        })
      );
  });
}
