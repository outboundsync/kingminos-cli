# Update the KingMinos CLI after a change to the KingMinos OpenAPI spec

You run inside the `API sync` workflow of `outboundsync/kingminos-cli` (npm package `kingminos`). The live KingMinos API spec, `https://api.kingminos.com/openapi.json`, differs from the snapshot this repo last synced to. Your job is to bring the CLI's hand-written commands in line with the live spec. A later step writes the new snapshot, runs the checks, commits the result and opens a pull request that a human reviews and merges. Merging publishes a new CLI version to npm, so be exact.

## What changed

The workflow tells you the mode in its message:

- **update**: `api-sync/openapi.snapshot.json` is the spec the CLI was last synced to. Compare it with the live spec.
- **bootstrap**: there is no snapshot yet. Audit every command against the whole live spec. The CLI already has drift (for example, `POST /v1/company/x-account` has no command); fix all of it.

The live spec, canonicalised with `jq -S .`, is at `$RUNNER_TEMP/openapi.live.json`, with a copy at `api-sync/openapi.live.json` in the working tree. Both files are read-only for you. Useful commands:

- List operations: `jq -r '.paths | to_entries[] | .key as $p | .value | to_entries[] | select(.key != "parameters") | "\(.key | ascii_upcase) \($p) \(.value.operationId)"' api-sync/openapi.live.json`
- In update mode, `diff <(jq ... api-sync/openapi.snapshot.json) <(jq ... api-sync/openapi.live.json)` for any `jq` filter (operations, a request schema under `.components.schemas`, an enum).
- The coverage check against the live spec, which lists missing and stale commands: `npm run check:api-coverage -- --snapshot api-sync/openapi.live.json`

## Scope

`scripts/check-api-coverage.mjs` defines which operations the CLI must cover. Read its header. In short: every operation whose security uses the bearer scheme, except `/v1/auth/*`, `/v1/account/*`, `/v1/admin/*`, discovery paths and the reviewed `EXCLUDED_OPERATIONS` (webhooks, events, balance, usage, credential listing, feedback). A new bearer operation is in scope by default.

- Don't add commands for excluded, `/v1/auth`, `/v1/account` or `/v1/admin` operations.
- You can't change the scope. If you think a new in-scope operation shouldn't be a CLI command, don't add one. Explain why in your summary and a human will decide.

## What to update

Only edit `src/**`, `test/**` (not `test/commands-json.test.ts`, `test/check-api-coverage.test.mjs` or `test/release-calver.test.mjs`) and `README.md` (the "Examples" and other command sections only).

For each change in the spec:

- **New in-scope operation**: add a command. Follow commit `0743317` (`git show 0743317`, "feat: email verify and person email commands"), except that flags now live in the command reference. It touches:
  - `src/reference.ts`: a `COMMAND_REFS` entry (in `ROOT_HELP` order) with the usage line, a one-line summary, method, OpenAPI path, `write`, `auth`, and every flag with a one-line `help` (plus `values` for a fixed set, and `required` only when the CLI rejects the call without it). No prices in summaries or help: `kingminos pricing` reads them from `GET /v1/pricing`. `COMMAND_FLAGS` in `src/parse.ts` is derived from it, and `commands.json` is generated from it.
  - `src/parse.ts`: the `Command` union and `BatchCapability` (capability POSTs), the subcommand in `resolveCommand` and its "… commands: …" usage lists, and the `batch` tails for capability POSTs.
  - `src/commands.ts`: a `case` in `buildRequest` and a `<name>Body` builder.
  - `src/help.ts`: a `ROOT_HELP` line (`  <words>  <METHOD> <path>`, aligned with its neighbours, in the same group order) and a `commandHelp` case listing body fields and headers in the existing layout.
  - `src/kingminos.ts`: the `helpTopic` alias.
  - Tests in `test/parse.test.ts`, `test/commands.test.ts` and `test/help.test.ts`, in the style of the existing ones.
  - A README example line.
- **Removed operation**: remove its command everywhere listed above. This is a breaking change for CLI users; say so in your summary.
- **Changed request body, path, method, header or enum** of a covered operation: update the flags (in `src/reference.ts`), body builder, help text and tests to match. Keep `src/const.ts` `BYOK_PROVIDERS` equal to the spec's credential provider enum (the `{provider}` parameter of `PUT /v1/credentials/{provider}`), and update the provider sentences in `ROOT_HELP` if they become wrong.
- Response-only changes need no CLI change unless the human output in `src/kingminos.ts` or `src/priority.ts` reads that field.

## Command conventions

- Command names: capability `POST /v1/<group>/<action>` is `kingminos <group> <action>` on the command line and `<group>.<action>` with `-` → `_` in code (`POST /v1/company/x-account` → `kingminos company x-account`, `company.x_account`). Other operations are `<resource>.<verb>` (`runs.get`, `credentials.put`, `subjects.delete`). The coverage check enforces the capability rule.
- In `buildRequest`, return `capabilityPost("<literal path>", …)` for capability POSTs, or an object literal `{ method: "<METHOD>", path: "<path>" | \`<template>\`, … }`. The coverage check reads those two forms only.
- Flags are kebab-case versions of the body fields (`company_domain` → `--company-domain`), set with `assignString`, `assignInteger`, `assignJson`, `assignCommon` and `assignRouting`/`withPriority` as the closest existing command does. Expose only fields the live spec lists for that request body. Cache flags (`--skip-cache`, `--cache`, `--cache-control`) only where the closest existing command for that kind of lookup has them and the spec documents them.
- `test/reference.test.ts` checks every `COMMAND_REFS` entry against `buildRequest` (method, path, auth), `ROOT_HELP`, and the command's `--help` text (the usage line, and the same set of `--flags`). Keep all three in step.
- Help text: one-line purpose, `Requires tenant Bearer (--token or ${TOKEN_ENV}).`, `Body fields:` and `Headers:` blocks, and billing wording taken from the spec's description. No prices.

## Rules

- Read `README.md` first and follow it. Describe only what the spec says. Never invent endpoints, fields, flags, enum values or prices.
- Never edit `commands.json` by hand. It is generated from `src/reference.ts`: when `npm test` reports it out of date, run `npm run commands:json`. A later step regenerates it anyway and reverts any other change to it.
- Don't edit `package.json` (including its version and publish config), `package-lock.json`, `scripts/`, `.github/`, `api-sync/`, `tsconfig.json` or `tsup.config.ts`. Don't add dependencies.
- If the diff only touches descriptions or response schemas that the CLI doesn't use, change nothing.
- Don't commit, push, create branches or open pull requests.
- When you're done, run `npm run typecheck`, `npm test` and `npm run check:api-coverage -- --snapshot api-sync/openapi.live.json`, and fix anything they report in the files you may edit.
- End your last message with a line that starts `Summary:`, followed by a short plain-text summary: which commands you added, changed or removed and why, breaking changes, anything you chose not to do, and anything a human should check. The workflow puts it in the pull request.
