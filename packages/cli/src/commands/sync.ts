import { readConfig } from "@/lib/config";
import { getRemoteUrl, parseRemote, getCommitMeta } from "@/lib/git";
import { getGitDir, getPendingPath, readPending, writePending } from "@/lib/pending";
import type { PendingSession } from "@/lib/pending";

async function postSession(opts: {
  workerUrl: string;
  token: string;
  session: {
    id: string;
    agent: string;
    agent_version: string;
    status: string;
    data: string;
  };
  commits: Array<{
    sha: string;
    org: string;
    repo: string;
    message: string;
    author: string;
    committed_at: number;
  }>;
}): Promise<{ isOk: true } | { isOk: false; error: string }> {
  try {
    const response = await fetch(`${opts.workerUrl}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({
        session: opts.session,
        commits: opts.commits,
      }),
    });

    if (!response.ok) {
      return { isOk: false, error: `HTTP ${response.status}` };
    }

    return { isOk: true };
  } catch (e) {
    return { isOk: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

export async function sync(): Promise<void> {
  const configResult = await readConfig();
  if (configResult.isErr()) {
    throw new Error(configResult._unsafeUnwrapErr());
  }

  const config = configResult._unsafeUnwrap();
  if (!config) {
    throw new Error("Not configured. Run 'residue login' first.");
  }

  const gitDirResult = await getGitDir();
  if (gitDirResult.isErr()) {
    throw new Error(gitDirResult._unsafeUnwrapErr());
  }

  const pendingPathResult = await getPendingPath(gitDirResult._unsafeUnwrap());
  if (pendingPathResult.isErr()) {
    throw new Error(pendingPathResult._unsafeUnwrapErr());
  }

  const pendingPath = pendingPathResult._unsafeUnwrap();
  const sessionsResult = await readPending(pendingPath);
  if (sessionsResult.isErr()) {
    throw new Error(sessionsResult._unsafeUnwrapErr());
  }

  const sessions = sessionsResult._unsafeUnwrap();
  if (sessions.length === 0) {
    return;
  }

  const remoteResult = await getRemoteUrl();
  if (remoteResult.isErr()) {
    throw new Error(remoteResult._unsafeUnwrapErr());
  }

  const parsed = parseRemote(remoteResult._unsafeUnwrap());
  if (parsed.isErr()) {
    throw new Error(parsed._unsafeUnwrapErr());
  }

  const { org, repo } = parsed._unsafeUnwrap();
  const remaining: PendingSession[] = [];

  for (const session of sessions) {
    if (session.commits.length === 0) {
      remaining.push(session);
      continue;
    }

    // Read raw session data
    const file = Bun.file(session.data_path);
    const isExists = await file.exists();
    if (!isExists) {
      console.error(`Warning: Session data not found: ${session.data_path}`);
      remaining.push(session);
      continue;
    }

    const data = await file.text();

    // Build commit metadata
    const commits = [];
    for (const sha of session.commits) {
      const metaResult = await getCommitMeta(sha);
      if (metaResult.isErr()) {
        console.error(`Warning: ${metaResult._unsafeUnwrapErr()}`);
        continue;
      }
      const meta = metaResult._unsafeUnwrap();
      commits.push({
        sha,
        org,
        repo,
        message: meta.message,
        author: meta.author,
        committed_at: meta.committed_at,
      });
    }

    // POST session data + metadata to worker
    const uploadResult = await postSession({
      workerUrl: config.worker_url,
      token: config.token,
      session: {
        id: session.id,
        agent: session.agent,
        agent_version: session.agent_version,
        status: session.status,
        data,
      },
      commits,
    });

    if (!uploadResult.isOk) {
      console.error(`Warning: Upload failed for session ${session.id}: ${uploadResult.error}`);
      remaining.push(session);
      continue;
    }

    // On success: keep open sessions, remove ended ones
    if (session.status === "open") {
      remaining.push(session);
    }

    console.error(`Synced session ${session.id}`);
  }

  const writeResult = await writePending({ path: pendingPath, sessions: remaining });
  if (writeResult.isErr()) {
    throw new Error(writeResult._unsafeUnwrapErr());
  }
}
