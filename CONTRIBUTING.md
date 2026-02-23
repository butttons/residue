# Contributing to residue

Thanks for your interest in contributing to residue.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/butttons/residue.git
cd residue

# Install dependencies
pnpm install

# Build the CLI
pnpm --filter @residue/cli build

# Start the worker dev server
pnpm --filter @residue/worker dev

# Apply D1 migrations locally (required before running worker tests)
cd packages/worker && pnpm exec wrangler d1 migrations apply DB --local
```

## Project Structure

```
packages/
  adapter/  -> @residue/adapter (shared, all agent-specific code)
  cli/      -> @residue/cli (npm package, built with bun)
  worker/   -> @residue/worker (Cloudflare Worker, Hono + JSX)
  docs/     -> @residue/docs (documentation site)
```

Monorepo managed with pnpm workspaces. Runtime is bun.

The **adapter** package is the single source of truth for all agent-specific logic: conversation mappers, search text extractors, shared types, and install-time templates. The CLI and worker import from it via subpath exports and contain zero agent-specific parsing code themselves.

## Development

```bash
# Run CLI in dev mode
pnpm --filter @residue/cli dev

# Run worker dev server
pnpm --filter @residue/worker dev

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Coding Conventions

- No emojis anywhere -- code, comments, logs, commit messages.
- Always use `type` over `interface`.
- Boolean variables must be prefixed with `is` or `has`.
- Functions with 2+ parameters must use a single object parameter.
- Never use `any` in TypeScript. If unavoidable, add an inline comment explaining why.
- Use `@/*` path alias (mapped to `src/*`) for imports within CLI and worker. The adapter package uses relative imports since its source files are resolved directly by consumer bundlers.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(cli): add status command
fix(worker): handle empty session data
docs: update setup instructions
```

Keep headers under 72 characters. Present tense. Concise.

## Pull Requests

- Branch from `main`.
- One feature or fix per PR.
- Include tests for new functionality.
- Make sure `pnpm test` and `pnpm typecheck` pass before opening.

## Adding a CLI Command

1. Create `packages/cli/src/commands/<name>.ts` exporting a function that returns `ResultAsync<void, CliError>`.
2. Register it in `packages/cli/src/index.ts`.
3. Use `safeTry` + `yield*` for sequencing multiple `ResultAsync` calls.
4. Use `createLogger("<name>")` for output. All user-facing output goes through `log.info()` to stderr.
5. Reuse existing libs (`@/lib/config`, `@/lib/git`, `@/lib/pending`).

## Adding a New Agent

All agent-specific code lives in `packages/adapter`. No changes to the CLI or worker source are needed.

1. Create `packages/adapter/src/<agent>/mapper.ts` -- export a `Mapper` function that transforms raw session data into `Message[]`.
2. Create `packages/adapter/src/<agent>/search.ts` -- export a search extractor (`raw -> SearchLine[]`) and metadata extractors (`extractFirstMessage`, `extractSessionName`).
3. Create `packages/adapter/src/<agent>/index.ts` -- barrel re-exports.
4. Register the mapper in `packages/adapter/src/mappers.ts`.
5. Register the extractor and metadata extractors in `packages/adapter/src/search.ts`.
6. Add the agent name to the `ExtractorName` union in `packages/adapter/src/types.ts`.
7. Optionally add a `template.ts.txt` if the agent has an install-time adapter file, and add a subpath export for it in `packages/adapter/package.json`.

The CLI and worker pick up new agents automatically via the registries.

### What lives where

| Concern | Location |
|---|---|
| Conversation mappers (`raw -> Message[]`) | `adapter/src/<agent>/mapper.ts` |
| Search text extractors (`raw -> SearchLine[]`) | `adapter/src/<agent>/search.ts` |
| Shared types (`Message`, `ToolCall`, `Mapper`, etc.) | `adapter/src/types.ts` |
| Shared utilities (`summarizeToolInput`, `deriveSessionId`) | `adapter/src/shared.ts` |
| Mapper registry (`getMapper`) | `adapter/src/mappers.ts` |
| Search registry (`getExtractor`, `getMetadataExtractors`, `buildSearchText`) | `adapter/src/search.ts` |
| Install-time templates (pi extension, opencode plugin) | `adapter/src/<agent>/template.ts.txt` |
| Claude Code hook handler (stdin protocol, pending queue) | `cli/src/commands/hook.ts` |

The Claude Code hook handler is the one exception that stays in the CLI. It manages stdin reading, pending queue state, and spawns `claude --version` -- all CLI-runtime concerns that don't belong in the shared adapter package.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
