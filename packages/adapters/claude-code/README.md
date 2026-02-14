# @residue/adapter-claude-code

Residue adapter for [Claude Code](https://code.claude.com/). Captures AI coding sessions and links them to git commits.

## How it works

The adapter uses Claude Code's [hooks system](https://code.claude.com/docs/en/hooks) to detect session lifecycle events:

- **SessionStart** -- calls `residue session-start` with the transcript path
- **SessionEnd** -- calls `residue session-end` to mark the session as ended

The hook script receives JSON on stdin from Claude Code containing `session_id`, `transcript_path`, and other metadata. It persists the residue session ID in `~/.residue/claude-code/<session-id>.state` to correlate start/end events.

## Prerequisites

- [residue CLI](../../cli/) installed and on PATH
- `residue login` configured with your worker URL and token
- `residue init` run in your repo (installs git hooks)

## Install

```bash
# From the monorepo root:
bun run packages/adapters/claude-code/install.ts

# Or from this directory:
bun run install.ts
```

This adds `SessionStart` and `SessionEnd` hooks to `~/.claude/settings.json`.

## Uninstall

```bash
bun run packages/adapters/claude-code/uninstall.ts
```

## Manual setup

If you prefer to configure hooks manually, add the following to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/packages/adapters/claude-code/hooks.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/packages/adapters/claude-code/hooks.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Replace `/path/to/` with the actual path to this package.

## How sessions are tracked

1. Claude Code starts a session, firing the `SessionStart` hook
2. The hook calls `residue session-start --agent claude-code --data <transcript_path>`
3. Residue returns a session ID, stored in `~/.residue/claude-code/<cc-session-id>.state`
4. You work with Claude Code, making commits along the way
5. Each commit triggers `residue capture` (via git post-commit hook) which tags pending sessions with the commit SHA
6. When Claude Code ends the session, the `SessionEnd` hook fires
7. The hook reads the stored residue session ID and calls `residue session-end`
8. On `git push`, `residue sync` uploads the session data and commit mappings to your worker
