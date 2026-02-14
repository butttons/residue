# Testing residue manually

Quick walkthrough to test residue end-to-end in a scratch repo.

## Prerequisites

```bash
# Build and link the CLI
cd packages/cli && bun run build
# Make sure `residue` is on PATH (npm link or alias to dist/index.js)
residue --version
```

## 1. Set up a test repo

```bash
mkdir /tmp/test-residue && cd /tmp/test-residue
git init
```

## 2. Initialize residue

```bash
residue init
```

Verify:
- `.residue/` directory exists
- `.gitignore` contains `.residue/`
- `.git/hooks/post-commit` contains `residue capture`
- `.git/hooks/pre-push` contains `residue sync`

## 3. Set up an agent adapter

```bash
# For Claude Code:
residue setup claude-code

# For pi:
residue setup pi
```

Verify claude-code: `.claude/settings.json` has SessionStart and SessionEnd hooks.

Verify pi: `.pi/extensions/residue.ts` exists.

## 4. Simulate a session manually

```bash
# Create a fake session file
echo '{"messages": []}' > /tmp/fake-session.jsonl

# Start a session
residue session start --agent claude-code --data /tmp/fake-session.jsonl --agent-version 1.0.0
# Outputs a UUID to stdout

# Check pending state
cat .residue/pending.json
```

## 5. Make a commit

```bash
echo "hello" > test.txt
git add test.txt
git commit -m "test commit"
```

The post-commit hook runs `residue capture` automatically. Check that the session now has a commit SHA:

```bash
cat .residue/pending.json
# commits array should contain the SHA
```

## 6. End the session

```bash
# Use the UUID from step 4
residue session end --id <session-id>

cat .residue/pending.json
# status should be "ended"
```

## 7. Test the Claude Code hook directly

```bash
# Simulate SessionStart
echo '{"session_id":"test-123","transcript_path":"/tmp/fake-session.jsonl","cwd":".","hook_event_name":"SessionStart","source":"startup"}' | residue hook claude-code

# Check state
cat .residue/pending.json
ls .residue/hooks/

# Simulate SessionEnd
echo '{"session_id":"test-123","hook_event_name":"SessionEnd"}' | residue hook claude-code

# State file should be gone, session should be ended
ls .residue/hooks/
cat .residue/pending.json
```

## 8. Test sync (requires a worker)

```bash
# Configure worker credentials
residue login --url https://your-worker.workers.dev --token your-token

# Push to trigger sync, or manually:
residue push
```

## Automated tests

```bash
cd packages/cli && bun test
```
