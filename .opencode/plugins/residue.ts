/**
 * Residue adapter for OpenCode.
 *
 * Hooks into OpenCode's plugin event system to call the residue CLI,
 * linking AI conversations to git commits.
 *
 * Uses a persistent state file (.residue/hooks/opencode.state) to survive
 * process crashes. On startup, any leftover state from a previous
 * run is cleaned up automatically.
 *
 * Session data is dumped as JSON (array of {info, parts}) to
 * .residue/sessions/opencode-<sessionId>.json via the SDK client.
 *
 * Lifecycle:
 *   session.created   -> end previous session (if any), start new one
 *   session.compacted -> end current session, start new one (natural break point)
 */

import type { Plugin } from "@opencode-ai/plugin"

const STATE_FILE = ".residue/hooks/opencode.state"
const SESSIONS_DIR = ".residue/sessions"

export const ResiduePlugin: Plugin = async ({ client, $, directory }) => {
  const fs = await import("fs")
  const path = await import("path")

  let isResidueAvailable = true
  let opencodeVersion = "unknown"

  async function checkResidueAvailable(): Promise<boolean> {
    try {
      const result = await $`which residue`.quiet()
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  async function detectOpencodeVersion(): Promise<string> {
    try {
      const result = await $`opencode version`.quiet()
      if (result.exitCode === 0 && result.stdout.toString().trim()) {
        return result.stdout.toString().trim()
      }
    } catch {
      // ignore
    }
    return "unknown"
  }

  function stateFilePath(): string {
    return path.join(directory, STATE_FILE)
  }

  function readStateFile(): string | undefined {
    try {
      const content = fs.readFileSync(stateFilePath(), "utf-8").trim()
      return content || undefined
    } catch {
      return undefined
    }
  }

  function writeStateFile(opts: { residueSessionId: string }): void {
    const dir = path.dirname(stateFilePath())
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(stateFilePath(), opts.residueSessionId)
  }

  function removeStateFile(): void {
    try {
      fs.unlinkSync(stateFilePath())
    } catch {
      // ignore if missing
    }
  }

  function dataFilePath(opts: { opencodeSessionId: string }): string {
    return path.join(directory, SESSIONS_DIR, `opencode-${opts.opencodeSessionId}.json`)
  }

  async function dumpSessionData(opts: { opencodeSessionId: string }): Promise<void> {
    try {
      const response = await client.session.messages({
        path: { id: opts.opencodeSessionId },
      })
      const dataPath = dataFilePath({ opencodeSessionId: opts.opencodeSessionId })
      fs.mkdirSync(path.dirname(dataPath), { recursive: true })
      fs.writeFileSync(dataPath, JSON.stringify(response.data, null, 2))
    } catch {
      // non-fatal: session data dump failure should not break the workflow
    }
  }

  async function endSessionById(opts: { residueSessionId: string }): Promise<void> {
    if (!isResidueAvailable) return
    try {
      await $`residue session end --id ${opts.residueSessionId}`.quiet()
    } catch {
      // ignore
    }
  }

  async function endStaleSession(): Promise<void> {
    const staleId = readStateFile()
    if (!staleId) return
    await endSessionById({ residueSessionId: staleId })
    removeStateFile()
  }

  async function startResidueSession(opts: { opencodeSessionId: string }): Promise<void> {
    if (!isResidueAvailable) return

    const dataPath = dataFilePath({ opencodeSessionId: opts.opencodeSessionId })
    fs.mkdirSync(path.dirname(dataPath), { recursive: true })
    // Create empty file so residue can track it
    if (!fs.existsSync(dataPath)) {
      fs.writeFileSync(dataPath, "[]")
    }

    try {
      const result =
        await $`residue session start --agent opencode --data ${dataPath} --agent-version ${opencodeVersion}`.quiet()
      const residueSessionId = result.stdout.toString().trim()
      if (residueSessionId) {
        writeStateFile({ residueSessionId })
      }
    } catch {
      // ignore
    }
  }

  async function endCurrentSession(opts: { opencodeSessionId: string }): Promise<void> {
    const residueSessionId = readStateFile()
    if (!residueSessionId) return
    if (!isResidueAvailable) return

    // Dump latest session data before ending
    await dumpSessionData({ opencodeSessionId: opts.opencodeSessionId })
    await endSessionById({ residueSessionId })
    removeStateFile()
  }

  // -- Initialization --

  isResidueAvailable = await checkResidueAvailable()
  if (!isResidueAvailable) return {}

  opencodeVersion = await detectOpencodeVersion()
  await endStaleSession()

  // -- Track current opencode session ID --

  let currentOpencodeSessionId: string | undefined

  return {
    event: async ({ event }) => {
      if (!isResidueAvailable) return

      if (event.type === "session.created") {
        const newSessionId = event.properties.info.id

        // End previous session if one was being tracked
        if (currentOpencodeSessionId) {
          await endCurrentSession({ opencodeSessionId: currentOpencodeSessionId })
        }

        currentOpencodeSessionId = newSessionId
        await startResidueSession({ opencodeSessionId: newSessionId })
      }

      if (event.type === "session.compacted") {
        const sessionId = event.properties.sessionID
        if (!sessionId) return

        // End current residue session and start a new one
        // Compaction is a natural break point but the opencode session continues
        await endCurrentSession({ opencodeSessionId: sessionId })
        currentOpencodeSessionId = sessionId
        await startResidueSession({ opencodeSessionId: sessionId })
      }
    },
  }
}
