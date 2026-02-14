# Pi Adapter

Source file for the residue pi extension. This file is copied into your project by `residue setup pi`.

## Setup

```bash
residue setup pi
```

This copies `index.ts` to `.pi/agent/extensions/residue.ts` in your project.

## How it works

The extension hooks into pi's session lifecycle:

1. **Session start** - Calls `residue session-start --agent pi --data <session-file>`
2. **Session switch** - Ends the current residue session and starts a new one
3. **Session shutdown** - Calls `residue session-end --id <session-id>`

Residue's git hooks handle the rest:
- `post-commit` runs `residue capture` to tag sessions with commit SHAs
- `pre-push` runs `residue sync` to upload session data to your worker

Silently skips if residue is not on PATH or the session is ephemeral.
