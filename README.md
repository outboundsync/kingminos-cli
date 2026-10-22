# kingminos

Command-line interface for the [KingMinos](https://kingminos.com) API by OutboundSync.

Documentation: [kingminos.com/docs/cli/](https://kingminos.com/docs/cli/)

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

Set your tenant API key (Bearer token, `osr_…`):

```bash
export KINGMINOS_API_KEY=osr_your_key_here
```

Or pass `--token` on each command. The CLI does not store or log your key.

Optional: override the API base URL (default `https://api.kingminos.com`) with `KINGMINOS_BASE_URL` or `--base-url`.

## Quick start

```bash
kingminos --help
kingminos health
kingminos company resolve --help
```

Authenticated calls require a valid tenant key:

```bash
kingminos providers
kingminos company domain --domain example.com --dry-run
```

## Development

```bash
npm ci
npm run build
node dist/kingminos.js --help
npm test
```

## License

MIT — see [LICENSE](LICENSE).
