# @residue/adapter

Source-of-truth for all agent-specific code. The CLI imports from this package via subpath exports. The worker has its own copy of the mappers (see `packages/worker/src/mappers/`) since it deploys standalone without workspace dependencies.

Each agent lives in its own directory under `src/` with a mapper, search extractor, and barrel export. Registries in `src/mappers.ts` and `src/search.ts` look up the right implementation by agent name. Exports point to source `.ts` files directly (no build step). Bun resolves through the workspace link and tree-shakes unused code.

The Claude Code hook handler is the one exception -- it lives in the CLI (`src/commands/hook.ts`) because it reads from stdin and manages pending queue state, which are CLI-runtime concerns.

## Adding a New Agent

1. Create `src/<agent>/mapper.ts`, `src/<agent>/search.ts`, `src/<agent>/index.ts`.
2. Register the mapper in `src/mappers.ts` and the extractor in `src/search.ts`.
3. Add the agent name to the `ExtractorName` union in `src/types.ts`.
4. Copy the mapper into `packages/worker/src/mappers/<agent>.ts` and register it there.
5. Optionally add a `template.ts.txt` for install-time adapter setup.

When updating a mapper, update it here first, then sync the copy in the worker.
