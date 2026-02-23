# @residue/worker

Cloudflare Worker serving both the API and UI. Users deploy their own instance. No multi-tenant backend.

Run `wrangler types` after changing bindings in `wrangler.jsonc`. Apply D1 migrations locally before running tests.

## Auth

- **API routes** (`/api/*`): Bearer token via `AUTH_TOKEN` env var.
- **UI routes** (`/app/*`): Cookie-based session auth. `ADMIN_USERNAME` is the super admin. Instances can be public or private.

## Mappers

Conversation mappers in `src/mappers/` are copies from `@residue/adapter` (the adapter is the source-of-truth). Each file has a JSDoc comment referencing its source. When updating a mapper, update the adapter first, then sync the copy here.

## Search

Cloudflare AI Search indexes only the `search/` R2 prefix. The lightweight text files there are uploaded by the CLI, not the worker.

## Demo

The demo instance at `demo.residue.dev` uses `wrangler.local.demo.jsonc` with `IS_DEMO=true` on the `release/demo` branch.
