/**
 * Residue adapter for pi coding agent.
 *
 * Hooks into pi's session lifecycle to call the residue CLI,
 * linking AI conversations to git commits.
 *
 * Lifecycle:
 *   session_start   -> residue session start (registers session in pending queue)
 *   session_switch  -> residue session end + session start (swap tracked session)
 *   session_shutdown -> residue session end (marks session as ended)
 *
 * Install:
 *   pi -e /path/to/packages/adapters/pi/index.ts
 *   OR symlink to ~/.pi/agent/extensions/residue.ts
 *   OR pi install /path/to/packages/adapters/pi
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let residueSessionId: string | undefined;
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
      residueSessionId = result.stdout.trim();
    }
  }

  async function endResidueSession(): Promise<void> {
    if (!residueSessionId) return;
    if (!isResidueAvailable) return;

    const sessionId = residueSessionId;
    residueSessionId = undefined;

    await pi.exec("residue", ["session", "end", "--id", sessionId]);
  }

  pi.on("session_start", async (_event, ctx) => {
    isResidueAvailable = await checkResidueAvailable();
    if (!isResidueAvailable) return;

    piVersion = await detectPiVersion();

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
