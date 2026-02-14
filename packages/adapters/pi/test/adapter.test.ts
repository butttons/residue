import { describe, it, expect, beforeEach } from "bun:test";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown>;
type ExecCall = { command: string; args: string[] };

function createMockPi() {
  const handlers: Record<string, EventHandler[]> = {};
  const execCalls: ExecCall[] = [];
  const execResults: Record<string, { stdout: string; stderr: string; code: number }> = {};

  const mockPi = {
    on(event: string, handler: EventHandler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    async exec(command: string, args: string[]) {
      execCalls.push({ command, args });
      const key = `${command} ${args.join(" ")}`;

      // Match by prefix for flexible matching
      for (const [pattern, result] of Object.entries(execResults)) {
        if (key.startsWith(pattern) || key === pattern) {
          return result;
        }
      }

      return { stdout: "", stderr: "", code: 1, killed: false };
    },
    registerTool() {},
    registerCommand() {},
    registerShortcut() {},
    registerFlag() {},
    sendMessage() {},
    appendEntry() {},
    events: { on() {}, emit() {} },
  } as unknown as ExtensionAPI;

  return {
    pi: mockPi,
    handlers,
    execCalls,
    execResults,
    async emit(event: string, eventData: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
      if (!handlers[event]) return;
      for (const handler of handlers[event]) {
        await handler(eventData, ctx);
      }
    },
  };
}

function createMockCtx(params: { sessionFile?: string }) {
  return {
    sessionManager: {
      getSessionFile: () => params.sessionFile,
    },
    ui: {
      notify() {},
      setStatus() {},
    },
    hasUI: true,
  };
}

function findSessionCall(calls: ExecCall[], subcommand: "start" | "end") {
  return calls.find(
    (c) => c.command === "residue" && c.args[0] === "session" && c.args[1] === subcommand
  );
}

describe("pi adapter", () => {
  let mock: ReturnType<typeof createMockPi>;

  beforeEach(async () => {
    mock = createMockPi();

    // Set up default exec results
    mock.execResults["which residue"] = { stdout: "/usr/local/bin/residue\n", stderr: "", code: 0 };
    mock.execResults["pi --version"] = { stdout: "0.52.12\n", stderr: "", code: 0 };
    mock.execResults["residue session start"] = { stdout: "test-session-id-123", stderr: "", code: 0 };
    mock.execResults["residue session end"] = { stdout: "", stderr: "Session ended", code: 0 };

    // Load the extension
    const extensionModule = await import("../index.ts");
    extensionModule.default(mock.pi);
  });

  it("calls residue session start on session_start", async () => {
    const ctx = createMockCtx({
      sessionFile: "/home/user/.pi/agent/sessions/--project--/session.jsonl",
    });

    await mock.emit("session_start", {}, ctx);

    const startCall = findSessionCall(mock.execCalls, "start");
    expect(startCall).toBeDefined();
    expect(startCall!.args).toEqual([
      "session",
      "start",
      "--agent",
      "pi",
      "--data",
      "/home/user/.pi/agent/sessions/--project--/session.jsonl",
      "--agent-version",
      "0.52.12",
    ]);
  });

  it("calls residue session end on session_shutdown", async () => {
    const ctx = createMockCtx({
      sessionFile: "/home/user/.pi/agent/sessions/--project--/session.jsonl",
    });

    await mock.emit("session_start", {}, ctx);
    await mock.emit("session_shutdown", {}, {});

    const endCall = findSessionCall(mock.execCalls, "end");
    expect(endCall).toBeDefined();
    expect(endCall!.args).toEqual([
      "session",
      "end",
      "--id",
      "test-session-id-123",
    ]);
  });

  it("handles session_switch by ending old and starting new", async () => {
    const ctx1 = createMockCtx({
      sessionFile: "/sessions/old.jsonl",
    });
    const ctx2 = createMockCtx({
      sessionFile: "/sessions/new.jsonl",
    });

    await mock.emit("session_start", {}, ctx1);

    // Clear calls to track only switch calls
    mock.execCalls.length = 0;

    // Simulate session switch - use a new session ID for the second start
    let isSecondStart = false;
    const originalExec = mock.pi.exec.bind(mock.pi);
    (mock.pi as unknown as Record<string, unknown>).exec = async (command: string, args: string[]) => {
      if (command === "residue" && args[0] === "session" && args[1] === "start" && !isSecondStart) {
        isSecondStart = true;
        mock.execCalls.push({ command, args });
        return { stdout: "new-session-id-456", stderr: "", code: 0, killed: false };
      }
      return (originalExec as (cmd: string, a: string[]) => Promise<unknown>)(command, args);
    };

    await mock.emit("session_switch", { reason: "new" }, ctx2);

    const endCall = findSessionCall(mock.execCalls, "end");
    expect(endCall).toBeDefined();
    expect(endCall!.args).toContain("test-session-id-123");

    const startCall = findSessionCall(mock.execCalls, "start");
    expect(startCall).toBeDefined();
    expect(startCall!.args).toContain("/sessions/new.jsonl");
  });

  it("skips when in ephemeral mode (no session file)", async () => {
    const ctx = createMockCtx({ sessionFile: undefined });

    await mock.emit("session_start", {}, ctx);

    const startCall = findSessionCall(mock.execCalls, "start");
    expect(startCall).toBeUndefined();
  });

  it("skips when residue is not available", async () => {
    mock.execResults["which residue"] = { stdout: "", stderr: "", code: 1 };

    const ctx = createMockCtx({
      sessionFile: "/sessions/test.jsonl",
    });

    await mock.emit("session_start", {}, ctx);

    const startCall = findSessionCall(mock.execCalls, "start");
    expect(startCall).toBeUndefined();
  });

  it("does not call session end if no session was started", async () => {
    await mock.emit("session_shutdown", {}, {});

    const endCall = findSessionCall(mock.execCalls, "end");
    expect(endCall).toBeUndefined();
  });

  it("detects pi version via pi --version", async () => {
    mock.execResults["pi --version"] = { stdout: "1.0.0\n", stderr: "", code: 0 };

    const ctx = createMockCtx({
      sessionFile: "/sessions/test.jsonl",
    });

    await mock.emit("session_start", {}, ctx);

    const startCall = findSessionCall(mock.execCalls, "start");
    expect(startCall).toBeDefined();
    expect(startCall!.args).toContain("1.0.0");
  });

  it("uses 'unknown' when pi version detection fails", async () => {
    mock.execResults["pi --version"] = { stdout: "", stderr: "error", code: 1 };

    const ctx = createMockCtx({
      sessionFile: "/sessions/test.jsonl",
    });

    await mock.emit("session_start", {}, ctx);

    const startCall = findSessionCall(mock.execCalls, "start");
    expect(startCall).toBeDefined();
    expect(startCall!.args).toContain("unknown");
  });

  it("checks residue availability via which", async () => {
    const ctx = createMockCtx({
      sessionFile: "/sessions/test.jsonl",
    });

    await mock.emit("session_start", {}, ctx);

    const whichCall = mock.execCalls.find(
      (c) => c.command === "which" && c.args[0] === "residue"
    );
    expect(whichCall).toBeDefined();
  });
});
