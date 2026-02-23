# @residue/cli

CLI that captures AI agent conversations and links them to git commits.

Part of [residue](https://residue.dev). See the [main README](../../README.md) for full setup instructions.

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
residue setup opencode       # for OpenCode
```

After setup, conversations are captured automatically. Commit and push as usual.

## Commands

Run `residue --help` for the full command list, or `residue <command> --help` for details on any command.

**User-facing:** `login`, `init`, `setup`, `push`, `status`, `clear`, `search`, `read`, `context`, `query sessions`, `query commits`, `query session <id>`, `query commit <sha>`.

**Hook-invoked (internal):** `capture`, `sync`, `session start`, `session end`, `hook claude-code`.

## Supported Agents

- **Claude Code**. Uses Claude Code's native hook system.
- **Pi**. Uses pi's extension system.
- **OpenCode**. Uses OpenCode's plugin system.

Run `residue setup <agent>` to configure any of them.

## License

MIT
