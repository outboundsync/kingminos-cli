# api-sync

Keeps the CLI's commands in step with the live KingMinos API contract, `https://api.kingminos.com/openapi.json`.

- `openapi.snapshot.json` is the live spec as of the last merged sync, canonicalised with `jq -S .` (sorted keys, 2-space indent). It is written only by the `API sync` workflow (`.github/workflows/api-sync.yml`). Don't edit it by hand. Until the first sync PR merges, it doesn't exist.
- Every 6 hours the workflow fetches the live spec and compares it with the snapshot. When they differ, a Cursor CLI agent (`.github/prompts/api-sync.md`) updates the commands, help, tests and README examples. The workflow then writes the new snapshot and opens or updates a PR on `chore/api-sync`. A human reviews and merges it. Merging publishes a new `kingminos` npm version.
- `npm run check:api-coverage` (`scripts/check-api-coverage.mjs`, run in CI) fails when an in-scope operation in the snapshot has no command, or a command targets an operation that isn't in the snapshot. The scope rule and the reviewed exclusions live at the top of that script. With no snapshot it skips.
