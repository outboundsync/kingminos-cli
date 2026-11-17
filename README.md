# kingminos

Command-line interface for the [KingMinos](https://kingminos.com) API by OutboundSync.

The CLI calls [`https://api.kingminos.com`](https://api.kingminos.com) with the same tenant Bearer token as REST and MCP. Live contract: [`GET /openapi.yaml`](https://api.kingminos.com/openapi.yaml). Docs: [kingminos.com/docs/cli/](https://kingminos.com/docs/cli/).

## Install

```bash
npm install -g kingminos
```

Or run without installing:

```bash
npx kingminos --help
```

Requires Node.js 20 or newer.

## Authentication

Set your tenant API key (Bearer token). Tenant keys use the `osr_` prefix. App-minted user tokens use `km_` and are created after you [sign in](https://app.kingminos.com/login/).

```bash
export KINGMINOS_API_KEY=osr_your_key_here
```

Or pass `--token` on each command. `--token` overrides the env var. The CLI does not store or log your key. A bare key (no `Bearer`) is `401` `malformed`.

Optional: override the API base URL (default `https://api.kingminos.com`) with `KINGMINOS_BASE_URL` or `--base-url`.

## Tiers

`--priority speed|balance|accuracy|coverage` sets `routing.path`. Ask which path before a bulk run. Max yield is `coverage`. `company.resolve` `value` is the one-step lookup, not a tier.

Confidence on the response (`answer.confidence`: `high` | `medium` | `low`) is the write signal. The CLI does not print or depend on `safe_to_write`.

`--min-confidence high|medium|low` sets `min_confidence` and overrides the path floor. Omit it to keep the path default.

## JSON output

`--json` prints the response body only (pretty JSON when the body is JSON). It omits human follow-ups (`Confidence:` / `Credits spent:`, `options[]`, `quality_flags` warnings, `agent_guidance`, and `Next:` hints). Errors still go to stderr. `safe_to_write` is stripped in all modes; everything else passes through unchanged.

## Credits

Billing is for delivered answers. The CLI prints `usage.credits.spent` from the response and does not hardcode prices. `options[].est_credits` and `next_steps[].est_credits` are whatever the API returned.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success (including a business miss — those stay HTTP 200) |
| 1 | Usage / argument error |
| 2 | Unauthorized (HTTP 401) |
| 3 | Out of credits (HTTP 402) |
| 4 | Rate limited or key/tenant budget (HTTP 429) |
| 5 | Server error (HTTP 5xx) |
| 6 | Other HTTP error |

## Examples

Each capability. Set `KINGMINOS_API_KEY` first.

```bash
kingminos health
kingminos company resolve --email ada@example.com --dry-run
kingminos company domain --domain example.com --priority speed
kingminos company hierarchy --domain example.com
kingminos company b2b-social --domain example.com --priority balance
kingminos company x-account --domain example.com --priority balance
kingminos company icon --domain example.com
kingminos company description --domain example.com --priority speed
kingminos person verify-employment --email ada@example.com --expected-company-domain example.com
kingminos person language --email ada@example.com
kingminos person phone --email ada@example.com --format e164
kingminos person title --email ada@example.com --company-domain example.com
kingminos person name --email ada@example.com --path accuracy
kingminos person b2b-social --email ada@example.com --priority balance
kingminos person email --first-name Ada --last-name Lovelace --company-domain example.com --priority balance
kingminos email verify --email ada@example.com --priority accuracy
```

Discovery and account helpers:

```bash
kingminos providers
kingminos capabilities
kingminos recipes
kingminos recipes guidance
kingminos runs get <run_id>
kingminos company domain --domain example.com --json
```

Batch (JSONL of request bodies; `--priority` required):

```bash
kingminos batch company domain --file domains.jsonl --priority speed
```

## Development

```bash
npm ci
npm run build
node dist/kingminos.js --help
npm run ci
npm run check:api-coverage
```

## API sync

The commands follow the live KingMinos contract, [`openapi.json`](https://api.kingminos.com/openapi.json). Every 6 hours the [API sync](.github/workflows/api-sync.yml) workflow compares it with `api-sync/openapi.snapshot.json`. When it changed, a Cursor CLI agent ([prompt](.github/prompts/api-sync.md)) updates the commands, help, tests and examples, the workflow writes the new snapshot, and it opens or updates a PR on `chore/api-sync`. A human reviews and merges every sync PR; merging publishes a new npm version. See [`api-sync/README.md`](api-sync/README.md).

`npm run check:api-coverage` (in CI) fails when an in-scope operation in the snapshot has no command in `src/commands.ts`, or a command targets an operation the snapshot doesn't have. In scope means every Bearer operation except `/v1/auth`, `/v1/account`, `/v1/admin`, discovery paths and the reviewed exclusions (webhooks, events, balance, usage, credential listing, feedback) listed with reasons in [`scripts/check-api-coverage.mjs`](scripts/check-api-coverage.mjs). Leaving a new operation out of the CLI means adding it there. Until the first sync PR adds the snapshot, the check skips.

## Releases & versioning

Published npm versions use **CalVer** in npm-safe semver form: `YYYY.M.DDNN` (UTC calendar date, month without a leading zero, day encoded in the patch as `DD×100+NN`). Examples: `2026.10.2300` (first release on 2026-10-23), `2026.10.2301` (second that day), `2027.1.500` (2027-01-05). Git tags are `v` plus that version (e.g. `v2026.10.2300`).

On `main`, `package.json` stays at a **placeholder** (`0.0.0-dev`). The authoritative version for each release is the git tag; CI bumps `package.json` only in the publish job before `npm publish`, without committing back to `main`.

After [CI](.github/workflows/ci.yml) succeeds on a push to `main` (or on a manual **Publish** workflow run on `main`), [.github/workflows/publish.yml](.github/workflows/publish.yml) plans the next version, skips when there are no releasable commits since the last tag, builds and tests, publishes to npm with OIDC trusted publishing (`npm publish --provenance`), then creates the git tag and GitHub release. Preview locally:

```bash
npm run release:preview
```

## License

MIT — see [LICENSE](LICENSE).
