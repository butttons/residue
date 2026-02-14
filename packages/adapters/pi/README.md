# @residue/adapter-pi

Residue adapter for the [pi coding agent](https://github.com/badlogic/pi-mono). Automatically captures pi sessions and links them to git commits via the residue CLI.

## Prerequisites

- [residue CLI](../../cli/) installed and on PATH (`residue --help`)
- `residue login` configured with your worker URL and token
- `residue init` run in your git repo (installs git hooks)

## Install

### Option 1: Load directly

```bash
pi -e /path/to/packages/adapters/pi/index.ts
```

### Option 2: Symlink to global extensions

```bash
ln -s /path/to/packages/adapters/pi/index.ts ~/.pi/agent/extensions/residue.ts
```

### Option 3: Install as pi package

```bash
pi install /path/to/packages/adapters/pi
```

## How it works

The adapter hooks into pi's session lifecycle:

1. **Session start** - When pi starts a session, calls `residue session-start --agent pi --data <session-file> --agent-version <pi-version>`. The session JSONL file path is registered in residue's pending queue.

2. **Session switch** - When the user runs `/new` or `/resume`, ends the current residue session and starts a new one for the new pi session.

3. **Session shutdown** - When pi exits, calls `residue session-end --id <session-id>` to mark the session as ended.

From there, residue's git hooks handle the rest:
- `post-commit` hook runs `residue capture` to tag sessions with commit SHAs
- `pre-push` hook runs `residue sync` to upload session data to your worker

## Behavior

- **Ephemeral mode** (`pi --no-session`): Skipped. No session file to track.
- **Residue not on PATH**: Silently skipped. The adapter checks for `residue` availability on startup.
- **Not a git repo**: `residue session-start` will fail silently (residue requires a git repo).
