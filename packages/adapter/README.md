# @residue/adapter

Shared adapter package for residue. Contains agent-specific conversation mappers, search text extractors, and install-time templates.

Part of [residue](https://residue.dev). This is a workspace-internal package, not published to npm.

Each supported agent (Claude Code, Pi, OpenCode) stores conversations in a different format. This package normalizes them for rendering and search indexing.

See [AGENTS.md](./AGENTS.md) for architecture details and the new-agent checklist.

## License

MIT
