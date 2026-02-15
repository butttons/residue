/**
 * Residue adapter for pi coding agent.
 *
 * Hooks into pi's session lifecycle to call the residue CLI,
 * linking AI conversations to git commits.
 *
 * Uses a persistent state file (.residue/hooks/pi.state) to survive
 * process crashes. On startup, any leftover state from a previous
 * run is cleaned up automatically.
 *
 * Lifecycle:
 *   session_start   -> end stale session (if any), then residue session start
 *   session_switch  -> residue session end + session start (swap tracked session)
 *   session_shutdown -> residue session end (marks session as ended)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const STATE_FILE = ".residue/hooks/pi.state";

export default function (pi: ExtensionAPI) {
  let piVersion = "unknown";
  let isResidueAvailable = true;

  async function detectPiVersion(): Promise<string> {
    const result = await pi.exec("pi", ["--version"]);
    if (result.code === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
    return "unknown";
  }

  async function checkResidueAvailable(): Promise<boolean> {
    const result = await pi.exec("which", ["residue"]);
    return result.code === 0;
  }

  async function readStateFile(): Promise<string | undefined> {
    const result = await pi.exec("cat", [STATE_FILE]);
    if (result.code === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
    return undefined;
  }

  async function writeStateFile(params: {
    sessionId: string;
  }): Promise<void> {
    await pi.exec("mkdir", ["-p", ".residue/hooks"]);
    // Use sh -c to write via redirect since pi.exec may not support shell features
    await pi.exec("sh", ["-c", `printf '%s' '${params.sessionId}' > ${STATE_FILE}`]);
  }

  async function removeStateFile(): Promise<void> {
    await pi.exec("rm", ["-f", STATE_FILE]);
  }

  /**
   * End a session by ID. Does not touch the state file.
   */
  async function endSessionById(params: {
    sessionId: string;
  }): Promise<void> {
    if (!isResidueAvailable) return;
    await pi.exec("residue", ["session", "end", "--id", params.sessionId]);
  }

  /**
   * End whatever session is recorded in the state file, then remove
   * the state file. This cleans up after crashes / missed shutdowns.
   */
  async function endStaleSession(): Promise<void> {
    const staleId = await readStateFile();
    if (!staleId) return;
    await endSessionById({ sessionId: staleId });
    await removeStateFile();
  }

  async function startResidueSession(params: {
    sessionFile: string | undefined;
  }): Promise<void> {
    if (!params.sessionFile) return;
    if (!isResidueAvailable) return;

    const result = await pi.exec("residue", [
      "session",
      "start",
      "--agent",
      "pi",
      "--data",
      params.sessionFile,
      "--agent-version",
      piVersion,
    ]);

    if (result.code === 0 && result.stdout.trim()) {
      const sessionId = result.stdout.trim();
      await writeStateFile({ sessionId });
    }
  }

  async function endResidueSession(): Promise<void> {
    const sessionId = await readStateFile();
    if (!sessionId) return;
    if (!isResidueAvailable) return;

    await endSessionById({ sessionId });
    await removeStateFile();
  }

  pi.on("session_start", async (_event, ctx) => {
    isResidueAvailable = await checkResidueAvailable();
    if (!isResidueAvailable) return;

    piVersion = await detectPiVersion();

    // Clean up any leftover session from a previous run that
    // did not shut down cleanly.
    await endStaleSession();

    const sessionFile = ctx.sessionManager.getSessionFile();
    await startResidueSession({ sessionFile });
  });

  pi.on("session_switch", async (_event, ctx) => {
    if (!isResidueAvailable) return;

    await endResidueSession();

    const sessionFile = ctx.sessionManager.getSessionFile();
    await startResidueSession({ sessionFile });
  });

  pi.on("session_shutdown", async () => {
    await endResidueSession();
  });
}
