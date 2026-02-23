# @residue/cli

Published as `@residue/cli` on npm. Built with Bun, uses `neverthrow` for error handling throughout.

Commands live in `src/commands/`, each returning `ResultAsync<void, CliError>`, registered in `src/index.ts` via Commander.

## Agent Adapters

Agent-specific code (mappers, extractors, templates) lives in `@residue/adapter`. The CLI imports via subpath exports.

- **Claude Code** - Uses native hook system. `residue setup claude-code` writes hook entries into `.claude/settings.json`. The hook handler in `src/commands/hook.ts` reads JSON from stdin. This is the one adapter piece that lives in the CLI, not the adapter package.
- **Pi** - Uses pi's extension system. Template embedded from `@residue/adapter/pi/template.ts.txt`.
- **OpenCode** - Uses OpenCode's plugin system. Template embedded from `@residue/adapter/opencode/template.ts.txt`.

## Local State

- **Global config:** `~/.residue/config` (worker URL + auth token).
- **Repo state:** `.residue/` (gitignored by `residue init`). Contains `pending.json` (session queue) and `hooks/` (agent-to-residue session ID mappings).
