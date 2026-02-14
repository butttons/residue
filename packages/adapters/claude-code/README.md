# @residue/adapter-claude-code

Residue adapter for [Claude Code](https://code.claude.com/). Captures AI coding sessions and links them to git commits.

## How it works

The adapter uses Claude Code's [hooks system](https://code.claude.com/docs/en/hooks) to detect session lifecycle events:

- **SessionStart** -- calls `residue hook claude-code` which creates a pending session
- **SessionEnd** -- calls `residue hook claude-code` which marks the session as ended

The hook command reads JSON from stdin (provided by Claude Code) containing `session_id`, `transcript_path`, and other metadata. It persists the residue session ID in `.residue/hooks/<session-id>.state` (project-local) to correlate start/end events.

## Prerequisites

- [residue CLI](../../cli/) installed and on PATH
- `residue login` configured with your worker URL and token
- `residue init` run in your repo (installs git hooks)

## Setup

```bash
# In your project directory:
residue setup claude-code
```

This creates `.claude/settings.json` in your project with `SessionStart` and `SessionEnd` hooks pointing to `residue hook claude-code`. If the file already exists, hooks are merged without clobbering existing config.

## How sessions are tracked

1. Claude Code starts a session, firing the `SessionStart` hook
2. The hook calls `residue hook claude-code`, which reads JSON from stdin and creates a pending session
3. The residue session ID is stored in `.residue/hooks/<cc-session-id>.state`
4. You work with Claude Code, making commits along the way
5. Each commit triggers `residue capture` (via git post-commit hook) which tags pending sessions with the commit SHA
6. When Claude Code ends the session, the `SessionEnd` hook fires
7. The hook reads the stored residue session ID and marks the session as ended
8. On `git push`, `residue sync` uploads the session data and commit mappings to your worker
