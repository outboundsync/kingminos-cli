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

`min_confidence` (override the path floor) is not on the live API yet, so this CLI does not expose `--min-confidence`.

## JSON output

`--json` prints the response body only (pretty JSON when the body is JSON). It omits the human `Confidence:` / `Credits spent:` lines and `Next:` hints. Errors still go to stderr.

## Credits

Billing is for delivered answers. The CLI prints `usage.credits.spent` from the response and does not hardcode prices. `next_steps[].est_credits` is whatever the API returned.

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
kingminos company icon --domain example.com
kingminos company description --domain example.com --priority speed
kingminos person verify-employment --email ada@example.com --expected-company-domain example.com
kingminos person language --email ada@example.com
kingminos person phone --email ada@example.com --format e164
kingminos person title --email ada@example.com --company-domain example.com
```

Discovery and account helpers:

```bash
kingminos providers
kingminos capabilities
kingminos recipes
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
```

## License

MIT — see [LICENSE](LICENSE).
