# @residue/cli

## 0.0.3

### Patch Changes

- Add status command, common workflows docs, versioning policy.

## 0.0.2

### Patch Changes

- Add per-project login support with `--local` flag. Running `residue login --local` saves config to `.residue/config` in the project root instead of the global `~/.residue/config`. The sync command now resolves config locally first before falling back to global.

## 0.0.1

### Features

- Initial release
- `residue login` to save worker URL and auth token
- `residue init` to install git hooks (post-commit, pre-push)
- `residue setup` for agent adapters (claude-code, pi)
- `residue capture` for post-commit session tagging
- `residue sync` for pre-push session upload via presigned R2 URLs
- `residue push` as manual sync alias
- `residue session start` and `residue session end` for agent adapters
- `residue hook claude-code` for Claude Code native hook protocol
- Claude Code and Pi agent adapters
