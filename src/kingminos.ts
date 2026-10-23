import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { apiRequest, formatBody } from "./client";
import { buildRequest } from "./commands";
import { BASE_URL_ENV, DEFAULT_BASE_URL, EXIT, TOKEN_ENV } from "./const";
import { commandHelp, ROOT_HELP } from "./help";
import { classifyHttpError } from "./http-error";
import {
	assertKnownFlags,
	type Command,
	type FlagMap,
	flagBool,
	flagString,
	parseArgv,
	resolveCommand,
} from "./parse";
import { applyPriority, formatDecisionNotes, formatNextStepsHints, parsePriority } from "./priority";
import { UsageError } from "./usage";

export { buildRequest } from "./commands";
export { BASE_URL_ENV, DEFAULT_BASE_URL, EXIT, TOKEN_ENV } from "./const";
export { ROOT_HELP } from "./help";
export { classifyHttpError } from "./http-error";
export { assertKnownFlags, parseArgv, resolveCommand } from "./parse";
export { formatDecisionNotes } from "./priority";
export { stripSafeToWrite } from "./sanitize";

export interface CliIo {
	argv: string[];
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	fetch: typeof fetch;
	readFile?: (path: string) => string;
	stdin?: string;
}

export async function runCli(io: CliIo): Promise<number> {
	try {
		return await runCliUnsafe(io);
	} catch (error) {
		const secrets = collectSecrets(io);
		if (error instanceof UsageError) {
			io.stderr(`${redact(error.message, secrets)}\n`);
			return EXIT.usage;
		}
		const message = error instanceof Error ? error.message : String(error);
		io.stderr(`${redact(message, secrets)}\n`);
		return EXIT.usage;
	}
}

async function runCliUnsafe(io: CliIo): Promise<number> {
	const parsed = parseArgv(io.argv);
	if (parsed.flags.help === true || parsed.flags.h === true) {
		if (parsed.positionals.length === 0) {
			io.stdout(ROOT_HELP);
			return 0;
		}
		const command = resolveCommand(parsed.positionals);
		io.stdout(command.name === "help" ? ROOT_HELP : commandHelp(command.name));
		return 0;
	}
	const command = resolveCommand(parsed.positionals);
	if (command.name === "help") {
		io.stdout(command.topic ? commandHelp(helpTopic(command.topic)) : ROOT_HELP);
		return 0;
	}
	assertKnownFlags(command.name, parsed.flags);
	if (command.name === "batch") {
		return runBatch(io, command, parsed.flags);
	}
	const request = buildRequest(command, parsed.flags, {
		readFile: io.readFile ?? ((path) => readFileSync(path, "utf8")),
		stdin: io.stdin ?? "",
	});
	const token = request.auth ? requireToken(parsed.flags, io.env) : undefined;
	const baseUrl = resolveBaseUrl(parsed.flags, io.env);
	const response = await apiRequest({
		fetch: io.fetch,
		method: request.method,
		url: `${baseUrl}${request.path}`,
		token,
		headers: request.headers,
		body: request.body,
	});
	const formatted = formatBody(response.text, response.contentType);
	const secrets = collectSecrets(io, parsed.flags);
	const asJson = flagBool(parsed.flags, "json") === true;
	if (response.status >= 400) {
		return writeHttpError(io, response.status, response.text, formatted, secrets, asJson);
	}
	io.stdout(redact(formatted, secrets));
	if (!asJson) {
		const parsedBody = parseJson(response.text);
		io.stdout(redact(formatDecisionNotes(parsedBody), secrets));
		io.stdout(redact(formatNextStepsHints(parsedBody), secrets));
	}
	return EXIT.ok;
}

function writeHttpError(
	io: CliIo,
	status: number,
	rawText: string,
	formatted: string,
	secrets: string[],
	asJson: boolean,
): number {
	const classified = classifyHttpError(status, parseJson(rawText));
	if (asJson) {
		io.stderr(redact(formatted, secrets));
	} else {
		io.stderr(redact(`${classified.message}\n${formatted}`, secrets));
	}
	return classified.exitCode;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

async function runBatch(
	io: CliIo,
	command: Extract<Command, { name: "batch" }>,
	flags: FlagMap,
): Promise<number> {
	const rawPriority = flagString(flags, "priority");
	if (!rawPriority) {
		throw new UsageError(
			"Before a bulk run, ask which path: speed, balance, accuracy, or coverage. Re-run with --priority speed|balance|accuracy|coverage. Max yield = coverage.",
		);
	}
	const priority = parsePriority(rawPriority);
	const file = flagString(flags, "file");
	if (!file) {
		throw new UsageError(
			"batch requires --file <path|-> (JSONL or a JSON array of request bodies)",
		);
	}
	const loader = {
		readFile: io.readFile ?? ((path) => readFileSync(path, "utf8")),
		stdin: io.stdin ?? "",
	};
	const raw = file === "-" ? loader.stdin : loader.readFile(file);
	const rows = parseBatchRows(raw);
	if (rows.length === 0) {
		throw new UsageError("batch file is empty");
	}
	const token = requireToken(flags, io.env);
	const baseUrl = resolveBaseUrl(flags, io.env);
	const secrets = collectSecrets(io, flags);
	const asJson = flagBool(flags, "json") === true;
	let worst: number = EXIT.ok;
	for (const [index, row] of rows.entries()) {
		const body = applyPriority(row, priority, command.capability);
		const request = buildRequest({ name: command.capability }, flags, {
			...loader,
			stdin: JSON.stringify(body),
		});
		// Force the per-row body; flags like --body must not leak across rows.
		request.body = body;
		const response = await apiRequest({
			fetch: io.fetch,
			method: request.method,
			url: `${baseUrl}${request.path}`,
			token,
			headers: request.headers,
			body: request.body,
		});
		const formatted = formatBody(response.text, response.contentType);
		if (response.status >= 400) {
			const prefix = asJson ? "" : `row ${index + 1} `;
			const code = writeHttpError(
				io,
				response.status,
				response.text,
				`${prefix}${formatted}`,
				secrets,
				asJson,
			);
			worst = Math.max(worst, code);
			continue;
		}
		if (asJson) {
			io.stdout(redact(formatted, secrets));
		} else {
			io.stdout(redact(`# row ${index + 1}\n${formatted}`, secrets));
			const parsedBody = parseJson(response.text);
			io.stdout(redact(formatDecisionNotes(parsedBody), secrets));
			io.stdout(redact(formatNextStepsHints(parsedBody), secrets));
		}
	}
	return worst;
}

function parseBatchRows(raw: string): Record<string, unknown>[] {
	const trimmed = raw.trim();
	if (!trimmed) {
		return [];
	}
	if (trimmed.startsWith("[")) {
		const parsed: unknown = JSON.parse(trimmed);
		if (!Array.isArray(parsed)) {
			throw new UsageError("--file JSON array is invalid");
		}
		return parsed.map((row, index) => {
			if (!row || typeof row !== "object" || Array.isArray(row)) {
				throw new UsageError(`--file row ${index + 1} must be a JSON object`);
			}
			return row as Record<string, unknown>;
		});
	}
	return trimmed.split(/\r?\n/).flatMap((line, index) => {
		if (!line.trim()) {
			return [];
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			throw new UsageError(`--file line ${index + 1} is not valid JSON`);
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new UsageError(`--file line ${index + 1} must be a JSON object`);
		}
		return [parsed as Record<string, unknown>];
	});
}

function helpTopic(topic: string): string {
	switch (topic) {
		case "resolve":
			return "company.resolve";
		case "domain":
			return "company.domain";
		case "hierarchy":
			return "company.hierarchy";
		case "b2b-social":
			return "company.b2b_social";
		case "icon":
			return "company.icon";
		case "description":
			return "company.description";
		case "verify-employment":
			return "person.verify_employment";
		case "language":
			return "person.language";
		case "phone":
			return "person.phone";
		case "title":
			return "person.title";
		case "name":
			return "person.name";
		case "recipes":
			return "recipes";
		case "batch":
			return "batch";
		default:
			return topic;
	}
}

function resolveBaseUrl(flags: FlagMap, env: NodeJS.ProcessEnv): string {
	const fromFlag = typeof flags["base-url"] === "string" ? flags["base-url"] : undefined;
	const raw = fromFlag?.trim() || env[BASE_URL_ENV]?.trim() || DEFAULT_BASE_URL;
	return raw.replace(/\/+$/, "");
}

function optionalToken(flags: FlagMap, env: NodeJS.ProcessEnv): string | undefined {
	const fromFlag = typeof flags.token === "string" ? flags.token.trim() : "";
	const fromEnv = env[TOKEN_ENV]?.trim() ?? "";
	return fromFlag || fromEnv || undefined;
}

function requireToken(flags: FlagMap, env: NodeJS.ProcessEnv): string {
	const token = optionalToken(flags, env);
	if (!token) {
		throw new UsageError(`missing tenant Bearer: set ${TOKEN_ENV} or pass --token`);
	}
	return token;
}

function collectSecrets(io: CliIo, flags?: FlagMap): string[] {
	const secrets: string[] = [];
	const push = (value: string | undefined) => {
		const trimmed = value?.trim();
		if (trimmed) {
			secrets.push(trimmed);
		}
	};
	push(io.env[TOKEN_ENV]);
	if (typeof flags?.token === "string") {
		push(flags.token);
	}
	if (typeof flags?.["api-key"] === "string") {
		push(flags["api-key"]);
	}
	if (typeof flags?.["client-secret"] === "string") {
		push(flags["client-secret"]);
	}
	return secrets;
}

function redact(text: string, secrets: string[]): string {
	return secrets.reduce((out, secret) => out.split(secret).join("[redacted]"), text);
}

function launchedAsCli(): boolean {
	const self = fileURLToPath(import.meta.url);
	const argv1 = process.argv[1];
	if (!argv1) {
		return false;
	}
	try {
		return realpathSync(argv1) === realpathSync(self);
	} catch {
		return (
			argv1.endsWith("kingminos.ts") ||
			argv1.endsWith("kingminos.js") ||
			/(^|\/)kingminos$/.test(argv1)
		);
	}
}

async function readStdin(): Promise<string> {
	if (process.stdin.isTTY) {
		return "";
	}
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

if (launchedAsCli()) {
	const readBodyStdin = process.argv.includes("--body") && process.argv.includes("-");
	const stdin = readBodyStdin ? await readStdin() : "";
	const code = await runCli({
		argv: process.argv.slice(2),
		env: process.env,
		stdout: (text) => {
			process.stdout.write(text);
		},
		stderr: (text) => {
			process.stderr.write(text);
		},
		fetch,
		stdin,
	});
	process.exitCode = code;
}
