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

**User-facing:**

| Command | Description |
|---|---|
| `residue login` | Save worker URL + auth token |
| `residue init` | Install git hooks (post-commit, pre-push) |
| `residue setup <agent>` | Configure an agent adapter |
| `residue push` | Manually upload pending sessions |
| `residue status` | Show current residue state for this project |
| `residue clear` | Remove pending sessions from the local queue |
| `residue search <query>` | Search session history. Use `--ai` for AI-powered answers |
| `residue read <session-id>` | Read a local session transcript to stdout |
| `residue context` | Output agent-facing documentation to stdout |
| `residue query sessions` | List sessions (filter by `--agent`, `--repo`, `--branch`, `--since`, `--until`) |
| `residue query commits` | List commits (filter by `--repo`, `--branch`, `--author`, `--since`, `--until`) |
| `residue query session <id>` | Get full details for a specific session |
| `residue query commit <sha>` | Get details for a specific commit |

**Hook-invoked (internal):**

| Command | Description |
|---|---|
| `residue capture` | Tag pending sessions with current commit (hook) |
| `residue sync` | Upload sessions + search text to worker (hook) |
| `residue session start` | Register a new session (adapter) |
| `residue session end` | Mark a session as ended (adapter) |
| `residue hook claude-code` | Handle Claude Code hook events (stdin) |

## Search Text Generation

During `residue sync`, the CLI generates a lightweight `.txt` summary of each session alongside the raw data upload. These text files are stored in R2 under `search/<session-id>.txt` and indexed by Cloudflare AI Search.

The text extractor is agent-specific (`packages/cli/src/lib/search-text.ts`) and produces a simple format:

```
Session: <id>
Agent: claude-code
Commits: abc1234, def5678
Branch: feature-auth
Repo: my-team/my-app

[human] how do we fix the auth redirect
[assistant] I'll update the middleware...
[tool] edit packages/worker/src/middleware/auth.ts
[tool] bash git diff --staged
```

Kept: human messages, assistant text, tool names with file paths/commands.
Stripped: thinking blocks, tool output, token metadata, signatures, sidechain entries.

Search upload failure is non-fatal and does not block the sync.

## License

MIT
