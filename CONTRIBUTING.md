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
  cli/      -> @residue/cli (npm package, built with bun)
  worker/   -> @residue/worker (Cloudflare Worker, Hono + JSX)
  docs/       -> @residue/docs (documentation site)
```

Monorepo managed with pnpm workspaces. Runtime is bun.

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
- Use `@/*` path alias (mapped to `src/*`) for all imports. No relative `../` paths.

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

### CLI side

1. Add a search-text extractor in `packages/cli/src/lib/search-text.ts`.
2. Add an adapter in `packages/cli/adapters/`.

### Worker side

1. Add a mapper in `packages/worker/src/mappers/` that transforms raw session data into the common `Message[]` format.
2. Register it in `packages/worker/src/mappers/index.ts`.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
