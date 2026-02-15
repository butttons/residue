# @residue/cli

CLI that captures AI agent conversations and links them to git commits.

Part of [residue](https://residue.dev) -- see the full docs at [residue.dev](https://residue.dev).

## Install

```bash
bun add -g @residue/cli
```

## Quick Start

```bash
# Save your worker URL and auth token
residue login --url https://your-worker.workers.dev --token YOUR_TOKEN

# Install git hooks in your repo
residue init

# Set up an agent adapter
residue setup claude-code    # for Claude Code
residue setup pi             # for pi coding agent
```

After setup, conversations are captured automatically. Commit and push as usual.

## Commands

| Command | Description |
|---|---|
| `residue login` | Save worker URL + auth token |
| `residue init` | Install git hooks (post-commit, pre-push) |
| `residue setup <agent>` | Configure an agent adapter |
| `residue push` | Manually upload pending sessions |
| `residue capture` | Tag pending sessions with current commit (hook) |
| `residue sync` | Upload sessions to worker (hook) |
| `residue session start` | Register a new session (adapter) |
| `residue session end` | Mark a session as ended (adapter) |

## License

MIT
