import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
	EXCLUDED_OPERATIONS,
	checkCoverage,
	listOperations,
	main,
	normalizePath,
	parseCommands,
} from '../scripts/check-api-coverage.mjs';

const BEARER = [{ bearer: [] }];

/** A spec with the given bearer ops plus every reviewed exclusion and a few non-surface routes. */
function spec(extraOps = []) {
	const paths = {};
	const add = (method, p, security, operationId = `${method}${p}`) => {
		paths[p] ??= {};
		paths[p][method.toLowerCase()] = { operationId, ...(security === undefined ? {} : { security }) };
	};
	add('GET', '/health', undefined);
	add('GET', '/openapi.yaml', undefined);
	add('GET', '/v1/recipes/guidance', []);
	add('GET', '/v1/pricing', []);
	add('GET', '/v1/account', undefined);
	add('POST', '/v1/admin/privacy/erase', BEARER);
	for (const key of Object.keys(EXCLUDED_OPERATIONS)) {
		const [method, p] = key.split(' ');
		add(method, p, BEARER);
	}
	for (const [method, p] of extraOps) add(method, p, BEARER);
	return {
		openapi: '3.1.0',
		components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
		paths,
	};
}

function commandsSource(cases) {
	return `export function buildRequest(command, flags, loader) {
	switch (command.name) {
		case "help":
			throw new UsageError("help is not an HTTP call");
${cases.join('\n')}
		default:
			return assertNever(command);
	}
}`;
}

const HEALTH = `		case "health":
			return { method: "GET", path: "/health", headers: {}, auth: false };`;
const X_ACCOUNT = `		case "company.x_account":
			return capabilityPost("/v1/company/x-account", xAccountBody(flags, loader), flags);`;
const RUNS_GET = `		case "runs.get":
			return {
				method: "GET",
				path: \`/v1/runs/\${encodeURIComponent(command.id)}\`,
				headers: {},
				auth: true,
			};`;

const HELP = 'export const ROOT_HELP = `Commands:\n  company x-account   POST /v1/company/x-account\n  runs get <id>       GET  /v1/runs/{id}\n`;';

const OPS = [
	['POST', '/v1/company/x-account'],
	['GET', '/v1/runs/{id}'],
];

describe('check-api-coverage', () => {
	it('normalizes spec and template path parameters alike', () => {
		assert.equal(normalizePath('/v1/runs/{id}'), '/v1/runs/{}');
		assert.equal(normalizePath('/v1/runs/${encodeURIComponent(command.id)}'), '/v1/runs/{}');
	});

	it('classifies operations by the KingMinos deny-lists and exclusions', () => {
		const kinds = Object.fromEntries(listOperations(spec(OPS)).map((op) => [`${op.method} ${op.path}`, op.kind]));
		assert.equal(kinds['GET /health'], 'discovery');
		assert.equal(kinds['GET /v1/account'], 'denied');
		assert.equal(kinds['POST /v1/admin/privacy/erase'], 'denied');
		assert.equal(kinds['GET /v1/recipes/guidance'], 'public-no-auth');
		assert.equal(kinds['GET /v1/webhooks'], 'excluded');
		assert.equal(kinds['POST /v1/company/x-account'], 'in-scope');
	});

	it('detects bearer by scheme type, not name, and denies admin-tagged operations', () => {
		const s = {
			openapi: '3.1.0',
			components: { securitySchemes: { tenantKey: { type: 'http', scheme: 'bearer' }, other: { type: 'apiKey' } } },
			paths: {
				'/v1/thing': { post: { security: [{ tenantKey: [] }] } },
				'/v1/keyed': { post: { security: [{ other: [] }] } },
				'/v1/ops/report': { get: { security: [{ tenantKey: [] }], tags: ['admin'] } },
			},
		};
		const kinds = Object.fromEntries(listOperations(s).map((op) => [`${op.method} ${op.path}`, op.kind]));
		assert.equal(kinds['POST /v1/thing'], 'in-scope');
		assert.equal(kinds['POST /v1/keyed'], 'public-no-auth');
		assert.equal(kinds['GET /v1/ops/report'], 'denied');
	});

	it('reads capabilityPost, object-literal and fall-through cases', () => {
		const source = commandsSource([
			HEALTH,
			'		case "alias.one":',
			X_ACCOUNT,
			RUNS_GET,
			'		case "batch":\n			throw new UsageError("batch is not a single HTTP call");',
		]);
		const { commands, problems } = parseCommands(source);
		assert.deepEqual(problems, []);
		assert.deepEqual(
			commands.map((c) => `${c.name} ${c.method}`),
			['health GET', 'alias.one POST', 'company.x_account POST', 'runs.get GET'],
		);
	});

	it('flags a case whose request it cannot read', () => {
		const { problems } = parseCommands(commandsSource(['		case "weird":\n			return makeRequest(flags);']));
		assert.equal(problems.length, 1);
		assert.match(problems[0], /command "weird"/);
	});

	it('passes when every in-scope operation has a command and help line', () => {
		const result = checkCoverage({
			spec: spec(OPS),
			commandsSource: commandsSource([HEALTH, X_ACCOUNT, RUNS_GET]),
			helpSource: HELP,
		});
		assert.deepEqual(result.errors, []);
		assert.equal(result.inScope, 2);
	});

	it('accepts a command for a public no-auth operation without putting it in scope', () => {
		const pricing = `		case "pricing":
			return { method: "GET", path: "/v1/pricing", headers: {}, auth: false };`;
		const result = checkCoverage({
			spec: spec(OPS),
			commandsSource: commandsSource([HEALTH, pricing, X_ACCOUNT, RUNS_GET]),
			helpSource: HELP,
		});
		assert.deepEqual(result.errors, []);
		assert.equal(result.inScope, 2);
		assert.equal(result.commands, 4);
	});

	it('fails on a missing command and names the expected command', () => {
		const result = checkCoverage({
			spec: spec(OPS),
			commandsSource: commandsSource([HEALTH, RUNS_GET]),
			helpSource: HELP,
		});
		assert.equal(result.errors.length, 1);
		assert.match(result.errors[0], /missing command for POST \/v1\/company\/x-account .*"company\.x_account"/);
	});

	it('fails on a command whose operation is not in the spec', () => {
		const result = checkCoverage({
			spec: spec([['GET', '/v1/runs/{id}']]),
			commandsSource: commandsSource([X_ACCOUNT, RUNS_GET]),
			helpSource: HELP,
		});
		assert.deepEqual(result.errors, [
			'command "company.x_account" targets POST /v1/company/x-account, which is not in the OpenAPI spec.',
		]);
	});

	it('fails on commands for excluded or denied operations', () => {
		const result = checkCoverage({
			spec: spec([]),
			commandsSource: commandsSource([
				'		case "webhooks.list":\n			return { method: "GET", path: "/v1/webhooks", headers: {}, auth: true };',
				'		case "account":\n			return { method: "GET", path: "/v1/account", headers: {}, auth: true };',
			]),
			helpSource: '',
		});
		assert.equal(result.errors.length, 2);
		assert.match(result.errors[0], /excluded operation GET \/v1\/webhooks/);
		assert.match(result.errors[1], /session\/account\/operator route/);
	});

	it('fails when a capability command does not follow the naming rule', () => {
		const result = checkCoverage({
			spec: spec([['POST', '/v1/company/x-account']]),
			commandsSource: commandsSource([
				'		case "company.twitter":\n			return capabilityPost("/v1/company/x-account", body, flags);',
			]),
			helpSource: HELP,
		});
		assert.equal(result.errors.length, 1);
		assert.match(result.errors[0], /must be named "company\.x_account"/);
	});

	it('fails when the root help does not list an in-scope operation', () => {
		const result = checkCoverage({
			spec: spec(OPS),
			commandsSource: commandsSource([X_ACCOUNT, RUNS_GET]),
			helpSource: 'export const ROOT_HELP = `  runs get <id>  GET /v1/runs/{id}\n`;',
		});
		assert.equal(result.errors.length, 1);
		assert.match(result.errors[0], /does not list POST \/v1\/company\/x-account/);
	});

	it('fails on an exclusion that is no longer in the spec', () => {
		const s = spec(OPS);
		delete s.paths['/v1/feedback'];
		const result = checkCoverage({ spec: s, commandsSource: commandsSource([X_ACCOUNT, RUNS_GET]), helpSource: HELP });
		assert.deepEqual(result.errors, [
			'exclusion "POST /v1/feedback" in scripts/check-api-coverage.mjs is not in the OpenAPI spec; remove it.',
		]);
	});

	it('skips with exit 0 when there is no snapshot, and exits 1 on drift', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'km-cli-coverage-'));
		const log = console.log;
		const lines = [];
		console.log = (line) => lines.push(String(line));
		try {
			assert.equal(main([], dir), 0);
			assert.match(lines.join('\n'), /API coverage skipped/);
			writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(spec(OPS)));
			writeFileSync(path.join(dir, 'commands.ts'), commandsSource([RUNS_GET]));
			writeFileSync(path.join(dir, 'help.ts'), HELP);
			const args = ['--snapshot', 'snapshot.json', '--commands', 'commands.ts', '--help-file', 'help.ts'];
			assert.equal(main(args, dir), 1);
			writeFileSync(path.join(dir, 'commands.ts'), commandsSource([X_ACCOUNT, RUNS_GET]));
			assert.equal(main(args, dir), 0);
		} finally {
			console.log = log;
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
