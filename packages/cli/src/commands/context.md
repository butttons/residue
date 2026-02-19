# residue CLI

residue tracks AI agent conversations and links them to git commits. Your conversations are automatically captured, tagged with commit SHAs on commit, and uploaded to a remote worker on push. This gives you a searchable history of how code was written.

## Commands you can use

### Check project state

```
residue status
```

Shows login config, worker reachability, installed hooks, configured adapters, and pending session counts. Use this first to understand what is set up.

### Query sessions

List all sessions (most recent first):

```
residue query sessions
residue query sessions --json
```

Filter by agent, repo, branch, or time range:

```
residue query sessions --agent claude-code
residue query sessions --repo my-org/my-repo
residue query sessions --branch main
residue query sessions --since 1700000000 --until 1700100000
```

Get details for a specific session (linked commits, metadata):

```
residue query session <session-id>
residue query session <session-id> --json
```

### Query commits

List all commits with linked sessions:

```
residue query commits
residue query commits --json
```

Filter by repo, branch, author, or time range:

```
residue query commits --repo my-org/my-repo
residue query commits --branch feat/my-feature
residue query commits --author jane
```

Get details for a specific commit (linked sessions, files changed):

```
residue query commit <sha>
residue query commit <sha> --json
```

### Search conversations

Vector search across all session transcripts:

```
residue search "how was auth implemented"
```

AI-powered search that generates an answer with citations:

```
residue search --ai "why did we switch to presigned URLs"
```

Search results include session IDs, relevance scores, matched snippets, and links to the web UI where you can read the full conversation.

### Read a session transcript

Output the raw transcript file for a local session to stdout:

```
residue read <session-id>
```

This reads the session's data file from disk and pipes it to stdout. Only works for sessions still in the local pending queue (not yet synced and cleared). Use this when you need the full transcript content but cannot access the file path directly.

### Manual sync

Upload pending sessions to the remote worker without pushing:

```
residue push
```

## Output conventions

- All status messages, errors, and human-readable output go to **stderr**.
- Machine-readable data goes to **stdout** (e.g. `--json` flag, `residue read`).
- Use `--json` on query commands to get structured JSON output to stdout.
- Pipe `2>/dev/null` to suppress status messages when parsing stdout.

## Web UI

The remote worker serves a web UI. Session and commit detail pages follow this URL pattern:

```
<worker_url>/app/<org>/<repo>            -- commit log
<worker_url>/app/<org>/<repo>/<sha>      -- commit detail with conversations
```

The worker URL is shown by `residue status`. Search results include direct links to commit pages.

## Typical workflows

**Find what sessions informed a commit:**

```
residue query commit <sha>
```

**Find recent sessions on a branch:**

```
residue query sessions --branch feat/my-feature
```

**Search for a past conversation by topic:**

```
residue search "database migration strategy"
```

**Get an AI-generated summary of past work:**

```
residue search --ai "what changes were made to the auth system"
```

**Read a session transcript when you cannot access the file directly:**

```
residue query session <id>          # find the session ID and data_path
residue read <id>                   # pipe transcript to stdout
```
