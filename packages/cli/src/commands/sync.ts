import type { Command } from "commander";
import { readConfig } from "@/lib/config";
import { getRemoteUrl, parseRemote, getCommitMeta } from "@/lib/git";
import { getGitDir, getPendingPath, readPending, writePending } from "@/lib/pending";
import type { PendingSession } from "@/lib/pending";

async function getUploadUrl(opts: {
  workerUrl: string;
  token: string;
  sessionId: string;
}): Promise<{ isOk: true; url: string } | { isOk: false; error: string }> {
  try {
    const response = await fetch(`${opts.workerUrl}/api/sessions/upload-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({ session_id: opts.sessionId }),
    });

    if (!response.ok) {
      return { isOk: false, error: `HTTP ${response.status}` };
    }

    const body = (await response.json()) as { url: string };
    return { isOk: true, url: body.url };
  } catch (e) {
    return { isOk: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

async function uploadToR2(opts: {
  url: string;
  data: string;
}): Promise<{ isOk: true } | { isOk: false; error: string }> {
  try {
    const response = await fetch(opts.url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: opts.data,
    });

    if (!response.ok) {
      return { isOk: false, error: `HTTP ${response.status}` };
    }

    return { isOk: true };
  } catch (e) {
    return { isOk: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

async function postMetadata(opts: {
  workerUrl: string;
  token: string;
  session: {
    id: string;
    agent: string;
    agent_version: string;
    status: string;
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

export async function runSync(): Promise<void> {
  const configResult = await readConfig();
  if (configResult.isErr()) {
    console.error(`Warning: ${configResult._unsafeUnwrapErr()}`);
    process.exit(0);
  }

  const config = configResult._unsafeUnwrap();
  if (!config) {
    console.error("Warning: Not configured. Run 'residue login' first.");
    process.exit(0);
  }

  const gitDirResult = await getGitDir();
  if (gitDirResult.isErr()) {
    console.error(`Warning: ${gitDirResult._unsafeUnwrapErr()}`);
    process.exit(0);
  }

  const pendingPathResult = await getPendingPath(gitDirResult._unsafeUnwrap());
  if (pendingPathResult.isErr()) {
    console.error(`Warning: ${pendingPathResult._unsafeUnwrapErr()}`);
    process.exit(0);
  }

  const pendingPath = pendingPathResult._unsafeUnwrap();
  const sessionsResult = await readPending(pendingPath);
  if (sessionsResult.isErr()) {
    console.error(`Warning: ${sessionsResult._unsafeUnwrapErr()}`);
    process.exit(0);
  }

  const sessions = sessionsResult._unsafeUnwrap();
  if (sessions.length === 0) {
    process.exit(0);
  }

  const remoteResult = await getRemoteUrl();
  if (remoteResult.isErr()) {
    console.error(`Warning: ${remoteResult._unsafeUnwrapErr()}`);
    process.exit(0);
  }

  const parsed = parseRemote(remoteResult._unsafeUnwrap());
  if (parsed.isErr()) {
    console.error(`Warning: ${parsed._unsafeUnwrapErr()}`);
    process.exit(0);
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

    // Get signed upload URL
    const uploadUrlResult = await getUploadUrl({
      workerUrl: config.worker_url,
      token: config.token,
      sessionId: session.id,
    });

    if (!uploadUrlResult.isOk) {
      console.error(`Warning: Failed to get upload URL for session ${session.id}: ${uploadUrlResult.error}`);
      remaining.push(session);
      continue;
    }

    // Upload raw data directly to R2
    const uploadResult = await uploadToR2({
      url: uploadUrlResult.url,
      data,
    });

    if (!uploadResult.isOk) {
      console.error(`Warning: Upload failed for session ${session.id}: ${uploadResult.error}`);
      remaining.push(session);
      continue;
    }

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

    // POST metadata to worker
    const metadataResult = await postMetadata({
      workerUrl: config.worker_url,
      token: config.token,
      session: {
        id: session.id,
        agent: session.agent,
        agent_version: session.agent_version,
        status: session.status,
      },
      commits,
    });

    if (!metadataResult.isOk) {
      console.error(`Warning: Metadata upload failed for session ${session.id}: ${metadataResult.error}`);
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
    console.error(`Warning: ${writeResult._unsafeUnwrapErr()}`);
  }

  process.exit(0);
}

export function registerSync(program: Command): void {
  program
    .command("sync")
    .description("Upload pending sessions to worker (called by pre-push hook)")
    .action(runSync);
}
