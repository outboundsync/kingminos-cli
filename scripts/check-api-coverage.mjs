#!/usr/bin/env node
// API coverage check: the CLI's commands must match the KingMinos OpenAPI
// snapshot in api-sync/openapi.snapshot.json (written by the "API sync"
// workflow from https://api.kingminos.com/openapi.json).
//
// Scope (deterministic, reviewed here rather than guessed per run):
//   - Public surface = every `paths.*.<method>` whose effective security uses the
//     bearer scheme, minus the KingMinos deny-lists shared with kingminos-mcp
//     (inventory/openapi-surfaces.json) and kingminos-application
//     (src/openapi-surfaces.ts): session/account routes under /v1/auth and
//     /v1/account, operator routes under /v1/admin, and the discovery paths.
//   - In scope for the CLI = the public surface minus EXCLUDED_OPERATIONS below.
//     A new public operation is in scope by default, so the sync agent adds a
//     command for it. Leaving one out of the CLI is a human decision: add it to
//     EXCLUDED_OPERATIONS with a reason.
//
// Checks:
//   1. every in-scope operation has a command in src/commands.ts (method + path);
//   2. every command targets an operation in the spec, and not an excluded,
//      denied or discovery-only bearer operation (public no-auth operations such
//      as GET /health are allowed);
//   3. a capability command (POST /v1/<group>/<action>) is named
//      `<group>.<action>` with `-` → `_` (e.g. company.x_account);
//   4. the root help in src/help.ts lists every in-scope operation as
//      `<METHOD> <path>`;
//   5. every exclusion still names an operation in the spec.
// With no snapshot the check skips with a notice and exits 0.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_SNAPSHOT = 'api-sync/openapi.snapshot.json';
export const DEFAULT_COMMANDS = 'src/commands.ts';
export const DEFAULT_HELP = 'src/help.ts';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

/** KingMinos deny-list: session/account and operator routes are never public tools. */
export const DENIED_PATH_PREFIXES = ['/v1/auth', '/v1/account', '/v1/admin'];

/** KingMinos discovery paths (spec documents, health). Not API surface. */
export const DISCOVERY_PATHS = [
	'/health',
	'/openapi.json',
	'/openapi.yaml',
	'/v1/openapi.json',
	'/v1/openapi.yaml',
	'/api/v1/openapi.json',
];

/**
 * Public operations this CLI deliberately does not wrap. Keyed by `METHOD path`
 * (spec form). Every entry needs a reason; remove the entry when a command is added.
 */
export const EXCLUDED_OPERATIONS = {
	'GET /v1/balance': 'Account balance read: not part of the CLI yet (REST, MCP and the app cover it).',
	'GET /v1/balance/ledger': 'Account balance read: not part of the CLI yet (REST, MCP and the app cover it).',
	'GET /v1/balance/history': 'Account balance read: not part of the CLI yet (REST, MCP and the app cover it).',
	'GET /v1/balance/forecast': 'Account balance read: not part of the CLI yet (REST, MCP and the app cover it).',
	'GET /v1/balance/health': 'Account balance read: not part of the CLI yet (REST, MCP and the app cover it).',
	'GET /v1/usage': 'Account usage read: not part of the CLI yet (REST, MCP and the app cover it).',
	'GET /v1/events': 'Event log for webhook consumers: managed in the app, REST and MCP, not the CLI.',
	'GET /v1/webhooks': 'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'POST /v1/webhooks': 'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'GET /v1/webhooks/{id}': 'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'PATCH /v1/webhooks/{id}': 'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'DELETE /v1/webhooks/{id}': 'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'POST /v1/webhooks/{id}/rotate-secret': 'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'POST /v1/webhooks/{id}/test': 'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'GET /v1/webhooks/{id}/deliveries': 'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'POST /v1/webhooks/{id}/deliveries/{delivery_id}/replay':
		'Webhook management: managed in the app, REST and MCP, not the CLI.',
	'GET /v1/credentials':
		'Credential listing is a discovery read in kingminos-application (openapi-surfaces.ts); the CLI only puts and deletes keys.',
	'POST /v1/feedback': 'Answer feedback is sent from the app and MCP, not the CLI.',
};

/** `case` labels in buildRequest that are not HTTP calls. */
const NON_HTTP_COMMANDS = new Set(['help', 'batch']);

const CAPABILITY_PATH = /^\/v1\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** `/v1/runs/{id}` and `/v1/runs/${…}` both become `/v1/runs/{}`. */
export function normalizePath(p) {
	return p.replace(/\$\{[^}]*\}/g, '{}').replace(/\{[^}]*\}/g, '{}');
}

export function opKey(method, p) {
	return `${method.toUpperCase()} ${p}`;
}

function bearerSchemeNames(spec) {
	const schemes = spec?.components?.securitySchemes ?? {};
	const names = Object.entries(schemes)
		.filter(([, s]) => s && s.type === 'http' && String(s.scheme).toLowerCase() === 'bearer')
		.map(([name]) => name);
	return new Set(names.length > 0 ? names : ['bearer']);
}

/** Every operation in the spec, classified. */
export function listOperations(spec) {
	if (!spec || typeof spec !== 'object' || typeof spec.openapi !== 'string' || !spec.paths) {
		throw new Error('snapshot is not an OpenAPI document (missing .openapi or .paths)');
	}
	const bearer = bearerSchemeNames(spec);
	const ops = [];
	for (const [p, item] of Object.entries(spec.paths)) {
		for (const method of HTTP_METHODS) {
			const op = item?.[method];
			if (!op) continue;
			const security = op.security ?? spec.security ?? [];
			const usesBearer = security.some((req) => Object.keys(req ?? {}).some((k) => bearer.has(k)));
			let kind;
			if (DISCOVERY_PATHS.includes(p)) kind = 'discovery';
			else if (DENIED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) kind = 'denied';
			else if (!usesBearer) kind = 'public-no-auth';
			else if (Object.hasOwn(EXCLUDED_OPERATIONS, opKey(method, p))) kind = 'excluded';
			else kind = 'in-scope';
			ops.push({ method: method.toUpperCase(), path: p, operationId: op.operationId ?? null, kind });
		}
	}
	return ops;
}

/**
 * Commands from the `switch (command.name)` in buildRequest. Each `case` must
 * either throw (not an HTTP call) or return `capabilityPost("<path>", …)` or an
 * object literal `{ method: "<METHOD>", path: "<path>" | `<template>`, … }`.
 */
export function parseCommands(source) {
	const start = source.indexOf('export function buildRequest');
	if (start < 0) throw new Error('src/commands.ts: export function buildRequest not found');
	const end = source.indexOf('default:', start);
	if (end < 0) throw new Error('src/commands.ts: buildRequest switch has no default branch');
	const body = source.slice(start, end);
	const caseRe = /case\s+(["'])([^"']+)\1\s*:/g;
	const labels = [];
	for (const m of body.matchAll(caseRe)) labels.push({ name: m[2], index: m.index, after: m.index + m[0].length });
	const commands = [];
	const problems = [];
	let pending = [];
	labels.forEach((label, i) => {
		const block = body.slice(label.after, i + 1 < labels.length ? labels[i + 1].index : body.length);
		if (block.trim() === '') {
			pending.push(label.name); // fall-through: shares the next case's request
			return;
		}
		const names = [...pending, label.name];
		pending = [];
		const capability = block.match(/capabilityPost\(\s*(["'`])([^"'`]+)\1/);
		const literal = block.match(/method:\s*(["'])([A-Za-z]+)\1\s*,\s*path:\s*(["'`])([^"'`]+)\3/);
		let request = null;
		if (capability) request = { method: 'POST', path: capability[2] };
		else if (literal) request = { method: literal[2].toUpperCase(), path: literal[4] };
		for (const name of names) {
			if (request) commands.push({ name, ...request });
			else if (NON_HTTP_COMMANDS.has(name) || /throw\s+new\s+UsageError/.test(block)) continue;
			else
				problems.push(
					`command "${name}": cannot read its request in src/commands.ts. Return capabilityPost("<path>", …) or { method: "<METHOD>", path: … } directly in the case.`,
				);
		}
	});
	return { commands, problems };
}

/** `<METHOD> <path>` lines in ROOT_HELP, normalised. */
export function parseHelpOps(source) {
	const m = source.match(/export const ROOT_HELP = `([\s\S]*?)`;/);
	const text = m ? m[1] : source;
	const ops = new Set();
	for (const line of text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s]*)/g)) {
		ops.add(opKey(line[1], normalizePath(line[2])));
	}
	return ops;
}

function expectedCommandName(p) {
	const m = p.match(CAPABILITY_PATH);
	return m ? `${m[1]}.${m[2].replaceAll('-', '_')}` : null;
}

export function checkCoverage({ spec, commandsSource, helpSource }) {
	const errors = [];
	const ops = listOperations(spec);
	const byKey = new Map(ops.map((op) => [opKey(op.method, normalizePath(op.path)), op]));
	const { commands, problems } = parseCommands(commandsSource);
	errors.push(...problems);
	const helpOps = parseHelpOps(helpSource);

	const commandsByOp = new Map();
	for (const cmd of commands) {
		const key = opKey(cmd.method, normalizePath(cmd.path));
		if (!commandsByOp.has(key)) commandsByOp.set(key, []);
		commandsByOp.get(key).push(cmd.name);
		const op = byKey.get(key);
		if (!op) {
			errors.push(`command "${cmd.name}" targets ${cmd.method} ${cmd.path}, which is not in the OpenAPI spec.`);
			continue;
		}
		if (op.kind === 'excluded') {
			errors.push(
				`command "${cmd.name}" targets excluded operation ${opKey(op.method, op.path)}. Remove the command, or remove the exclusion in scripts/check-api-coverage.mjs.`,
			);
		} else if (op.kind === 'denied') {
			errors.push(
				`command "${cmd.name}" targets ${opKey(op.method, op.path)}, a session/account/operator route that is never public surface.`,
			);
		}
	}

	const inScope = ops.filter((op) => op.kind === 'in-scope');
	for (const op of inScope) {
		const key = opKey(op.method, normalizePath(op.path));
		const names = commandsByOp.get(key);
		const label = `${opKey(op.method, op.path)}${op.operationId ? ` (${op.operationId})` : ''}`;
		if (!names) {
			const expected = expectedCommandName(op.path);
			errors.push(
				`missing command for ${label}${expected && op.method === 'POST' ? `: add "${expected}"` : ''}.`,
			);
			continue;
		}
		const expected = op.method === 'POST' ? expectedCommandName(op.path) : null;
		if (expected && !names.includes(expected)) {
			errors.push(`${label} is wired to "${names.join('", "')}"; capability commands must be named "${expected}".`);
		}
		if (!helpOps.has(key)) {
			errors.push(`root help (src/help.ts ROOT_HELP) does not list ${opKey(op.method, op.path)}.`);
		}
	}

	const specKeys = new Set(ops.map((op) => opKey(op.method, op.path)));
	for (const key of Object.keys(EXCLUDED_OPERATIONS)) {
		if (!specKeys.has(key)) {
			errors.push(`exclusion "${key}" in scripts/check-api-coverage.mjs is not in the OpenAPI spec; remove it.`);
		}
	}

	return { errors, inScope: inScope.length, commands: commands.length, operations: ops.length };
}

function readArg(argv, flag, fallback) {
	const i = argv.indexOf(flag);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

export function main(argv = process.argv.slice(2), root = ROOT) {
	const snapshotPath = path.resolve(root, readArg(argv, '--snapshot', DEFAULT_SNAPSHOT));
	if (!existsSync(snapshotPath)) {
		console.log(
			`::notice title=API coverage skipped::No ${path.relative(root, snapshotPath)} yet. The first "API sync" run adds it; until then the CLI is not checked against the OpenAPI spec.`,
		);
		return 0;
	}
	const spec = JSON.parse(readFileSync(snapshotPath, 'utf8'));
	const commandsSource = readFileSync(path.resolve(root, readArg(argv, '--commands', DEFAULT_COMMANDS)), 'utf8');
	const helpSource = readFileSync(path.resolve(root, readArg(argv, '--help-file', DEFAULT_HELP)), 'utf8');
	const result = checkCoverage({ spec, commandsSource, helpSource });
	if (result.errors.length > 0) {
		for (const error of result.errors) console.log(`::error::${error}`);
		console.log(
			`API coverage failed: ${result.errors.length} problem(s). ${result.inScope} in-scope operations, ${result.commands} CLI commands.`,
		);
		return 1;
	}
	console.log(
		`API coverage ok: ${result.inScope} in-scope operations all have CLI commands; ${result.commands} commands all target the spec (${result.operations} operations in the snapshot).`,
	);
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		process.exitCode = main();
	} catch (error) {
		console.log(`::error::API coverage check crashed: ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}
