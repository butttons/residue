---
name: changelog-maintainer
description: Creates changesets and maintains CHANGELOG.md. Use after committing code changes that should be tracked in the changelog.
---

# Changelog Maintainer

This project uses [changesets](https://github.com/changesets/changesets) for versioning and changelog generation.

## Project Setup

- All packages share the same version (fixed group in `.changeset/config.json`).
- Packages: `@residue/cli`, `@residue/worker`, `@residue/docs`.
- Changelog lives at `CHANGELOG.md` in the repo root (manually maintained, not auto-generated).
- Changeset files live in `.changeset/` and are consumed at release time.

## When to Create a Changeset

After committing a user-facing or notable change. Skip for:
- CI-only changes
- Internal refactors with no behavior change
- Test-only changes
- Docs-only changes to AGENTS.md or comments

## Creating a Changeset

Write a `.changeset/<short-kebab-name>.md` file:

```markdown
---
"@residue/cli": patch
---

One-line description of the change from the user's perspective.
```

### Bump Type

- `patch` -- bug fixes, small features (pre-1.0 this covers most things)
- `minor` -- significant new functionality
- `major` -- breaking changes

Only list the package(s) that actually changed. The fixed group ensures all packages bump to the same version regardless.

### Naming

Use a short kebab-case name that summarizes the change. Examples:
- `add-clear-command.md`
- `fix-stale-session-detection.md`
- `presigned-url-upload.md`

### Description

One sentence. User-facing language. Present tense. No emojis. Example:

```
Add `residue clear` command to remove stuck pending sessions from the local queue.
```

## Updating the Changelog

When preparing a release, add a new version section to `CHANGELOG.md` manually. Group entries by package, newest version at the top.

Format:

```markdown
## X.Y.Z

### @residue/cli

- Description of change one
- Description of change two

### @residue/worker

- Description of change
```

Only include packages that had changes in that version.

## Release Flow

1. Accumulate changesets on the feature/release branch.
2. Before tagging, update `CHANGELOG.md` with the new version section.
3. Run `pnpm changeset version` to bump all package.json files and consume changesets.
4. Commit the version bump and changelog together.
5. Tag and release.

## Instructions

1. Read the latest commit(s) via `git log --oneline -5`.
2. Determine which package(s) were affected and the bump type.
3. Write the changeset file to `.changeset/`.
4. Stage and commit with message: `chore: add changeset for <short description>`.
5. If the user asks to update the changelog for a release, update `CHANGELOG.md` as described above.
