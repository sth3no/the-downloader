# The Downloader

This repo is where the extension is developed: source, tests (`npm test`, Vitest), fixtures and CI. It is not what ships to the Raycast Store.

## Store copy

The Store copy lives in `sth3no/raycast-extensions`, branch `ext/the-downloader`, folder `extensions/the-downloader`, and reaches the Store through a PR to `raycast/extensions` ([#31720](https://github.com/raycast/extensions/pull/31720)). The Store review does not allow tests, test config or dev-only tooling there.

1. Commit the change here first. Do not develop in the fork.
2. `node scripts/sync-to-store.mjs [path to raycast-extensions checkout]` (defaults to `../raycast-extensions`). It copies the tracked files except `tests/`, `vitest.config.ts`, `.github/`, `scripts/`, `docs/`, `CLAUDE.md`, removes the `test` script and `vitest`, and regenerates `package-lock.json`.
3. In the Store copy: `npm run build && npm run lint`, review `git diff`, commit, push.

New dev-only files or dependencies go into the lists at the top of `scripts/sync-to-store.mjs`.
