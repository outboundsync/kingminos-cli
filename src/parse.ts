import { BOOLEAN_FLAGS, GLOBAL_FLAGS } from "./const";
import { UsageError } from "./usage";

export type FlagMap = Record<string, string | true>;

export interface ParsedArgv {
	positionals: string[];
	flags: FlagMap;
}

const COMMAND_FLAGS: Record<string, ReadonlySet<string>> = {
	health: new Set(),
	openapi: new Set(),
	providers: new Set(),
	capabilities: new Set(),
	recipes: new Set(),
	batch: new Set(["file", "priority", "explain", "schema", "dry-run", "path"]),
	"company.resolve": new Set([
		"body",
		"email",
		"name",
		"domain",
		"website",
		"dry-run",
		"external-ref",
		"routing",
		"compliance",
		"schema-version",
		"idempotency-key",
		"explain",
		"schema",
		"max-provider-credits",
		"path",
		"preset",
		"priority",
	]),
	"company.domain": new Set([
		"body",
		"email",
		"name",
		"company-name",
		"domain",
		"website",
		"city",
		"state",
		"country",
		"postal-code",
		"phone",
		"linkedin-url",
		"family-policy",
		"path",
		"preset",
		"skip-cache",
		"dry-run",
		"external-ref",
		"routing",
		"compliance",
		"schema-version",
		"idempotency-key",
		"explain",
		"schema",
		"max-provider-credits",
		"cache",
		"cache-control",
		"priority",
	]),
	"company.b2b_social": new Set([
		"body",
		"email",
		"name",
		"domain",
		"website",
		"linkedin-url",
		"hint",
		"country",
		"path",
		"preset",
		"dry-run",
		"external-ref",
		"routing",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
		"max-provider-credits",
		"priority",
	]),
	"company.icon": new Set([
		"body",
		"email",
		"name",
		"domain",
		"website",
		"dry-run",
		"external-ref",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
	]),
	"company.description": new Set([
		"body",
		"email",
		"name",
		"domain",
		"website",
		"path",
		"preset",
		"max-chars",
		"skip-cache",
		"dry-run",
		"external-ref",
		"routing",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
		"max-provider-credits",
		"cache",
		"cache-control",
		"priority",
	]),
	"company.hierarchy": new Set([
		"body",
		"email",
		"name",
		"domain",
		"website",
		"country",
		"path",
		"preset",
		"dry-run",
		"external-ref",
		"routing",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
		"max-provider-credits",
		"priority",
	]),
	"person.verify_employment": new Set([
		"body",
		"email",
		"first-name",
		"last-name",
		"linkedin-url",
		"expected-company",
		"expected-company-domain",
		"expected-company-name",
		"expected-company-website",
		"dry-run",
		"external-ref",
		"routing",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
		"max-provider-credits",
		"priority",
	]),
	"person.language": new Set([
		"body",
		"email",
		"first-name",
		"last-name",
		"linkedin-url",
		"skip-cache",
		"dry-run",
		"external-ref",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
		"priority",
	]),
	"person.phone": new Set([
		"body",
		"email",
		"first-name",
		"last-name",
		"linkedin-url",
		"domain",
		"phone-types",
		"max-results",
		"format",
		"skip-cache",
		"dry-run",
		"external-ref",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
		"cache",
		"cache-control",
		"priority",
	]),
	"person.title": new Set([
		"body",
		"email",
		"first-name",
		"last-name",
		"linkedin-url",
		"company-domain",
		"fields",
		"path",
		"routing",
		"skip-cache",
		"dry-run",
		"external-ref",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
		"cache",
		"cache-control",
		"priority",
	]),
	"person.name": new Set([
		"body",
		"email",
		"linkedin-url",
		"path",
		"routing",
		"skip-cache",
		"dry-run",
		"external-ref",
		"compliance",
		"idempotency-key",
		"explain",
		"schema",
		"cache",
		"cache-control",
		"priority",
	]),
	"runs.get": new Set(["explain", "schema"]),
	"credentials.put": new Set(["body", "api-key", "client-id", "client-secret"]),
	"credentials.delete": new Set(),
	"subjects.delete": new Set(),
	help: new Set(),
};

export type Command =
	| { name: "help"; topic?: string }
	| { name: "health" }
	| { name: "openapi" }
	| { name: "providers" }
	| { name: "capabilities" }
	| { name: "recipes" }
	| { name: "batch"; capability: BatchCapability }
	| { name: "company.resolve" }
	| { name: "company.domain" }
	| { name: "company.hierarchy" }
	| { name: "company.b2b_social" }
	| { name: "company.icon" }
	| { name: "company.description" }
	| { name: "person.verify_employment" }
	| { name: "person.language" }
	| { name: "person.phone" }
	| { name: "person.title" }
	| { name: "person.name" }
	| { name: "runs.get"; id: string }
	| { name: "credentials.put"; provider: string }
	| { name: "credentials.delete"; provider: string }
	| { name: "subjects.delete"; subjectKey: string };

export type BatchCapability =
	| "company.resolve"
	| "company.domain"
	| "company.hierarchy"
	| "company.b2b_social"
	| "company.icon"
	| "company.description"
	| "person.verify_employment"
	| "person.language"
	| "person.phone"
	| "person.title"
	| "person.name";

const KNOWN_FLAGS = new Set<string>([
	...GLOBAL_FLAGS,
	...BOOLEAN_FLAGS,
	...Object.values(COMMAND_FLAGS).flatMap((names) => [...names]),
]);

export function parseArgv(argv: string[]): ParsedArgv {
	const positionals: string[] = [];
	const flags: FlagMap = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === undefined) {
			break;
		}
		if (arg === "--") {
			positionals.push(...argv.slice(i + 1));
			break;
		}
		if (arg.startsWith("--")) {
			const eq = arg.indexOf("=");
			const rawName = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
			const name = rawName.trim();
			if (!name) {
				throw new UsageError("empty flag");
			}
			if (!KNOWN_FLAGS.has(name)) {
				throw new UsageError(`unknown flag --${name}`);
			}
			if (BOOLEAN_FLAGS.has(name)) {
				if (eq !== -1) {
					throw new UsageError(`--${name} does not take a value`);
				}
				flags[name] = true;
				continue;
			}
			const value = eq === -1 ? argv[i + 1] : arg.slice(eq + 1);
			if (eq === -1) {
				i += 1;
			}
			if (value === undefined || (eq === -1 && value.startsWith("--"))) {
				throw new UsageError(`--${name} requires a value`);
			}
			flags[name] = value;
			continue;
		}
		if (arg === "-h") {
			flags.help = true;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new UsageError(`unknown flag ${arg}`);
		}
		positionals.push(arg);
	}
	return { positionals, flags };
}

export function resolveCommand(positionals: string[]): Command {
	if (positionals.length === 0) {
		return { name: "help" };
	}
	const [head, mid, tail, ...rest] = positionals;
	if (rest.length > 0) {
		throw new UsageError(`unexpected arguments: ${rest.join(" ")}`);
	}
	switch (head) {
		case "help":
			return { name: "help", topic: mid };
		case "health":
		case "openapi":
		case "providers":
		case "capabilities":
		case "recipes":
			if (mid !== undefined) {
				throw new UsageError(`${head} does not take arguments`);
			}
			return { name: head };
		case "batch":
			return resolveBatch(mid, tail);
		case "company":
			return resolveCompany(mid, tail);
		case "person":
			if (
				mid !== "verify-employment" &&
				mid !== "language" &&
				mid !== "phone" &&
				mid !== "title" &&
				mid !== "name"
			) {
				throw new UsageError("person commands: verify-employment | language | phone | title | name");
			}
			if (tail !== undefined) {
				throw new UsageError(`person ${mid} does not take positional arguments`);
			}
			if (mid === "language") {
				return { name: "person.language" };
			}
			if (mid === "phone") {
				return { name: "person.phone" };
			}
			if (mid === "title") {
				return { name: "person.title" };
			}
			if (mid === "name") {
				return { name: "person.name" };
			}
			return { name: "person.verify_employment" };
		case "runs":
			if (mid !== "get" || !tail) {
				throw new UsageError("runs commands: get <id>");
			}
			return { name: "runs.get", id: tail };
		case "credentials":
			if ((mid !== "put" && mid !== "delete") || !tail) {
				throw new UsageError("credentials commands: put <provider> | delete <provider>");
			}
			return mid === "put"
				? { name: "credentials.put", provider: tail }
				: { name: "credentials.delete", provider: tail };
		case "subjects":
			if (mid !== "delete" || !tail) {
				throw new UsageError("subjects commands: delete <subject_key>");
			}
			return { name: "subjects.delete", subjectKey: tail };
		default:
			throw new UsageError(`unknown command ${head}`);
	}
}

function resolveBatch(mid: string | undefined, tail: string | undefined): Command {
	if (mid === "company") {
		const inner = resolveCompany(tail, undefined);
		switch (inner.name) {
			case "company.resolve":
			case "company.domain":
			case "company.hierarchy":
			case "company.b2b_social":
			case "company.icon":
			case "company.description":
				return { name: "batch", capability: inner.name };
			default:
				throw new UsageError(
					"batch company commands: resolve | domain | hierarchy | b2b-social | icon | description",
				);
		}
	}
	if (mid === "person") {
		if (
			tail !== "verify-employment" &&
			tail !== "language" &&
			tail !== "phone" &&
			tail !== "title" &&
			tail !== "name"
		) {
			throw new UsageError(
				"batch person commands: verify-employment | language | phone | title | name",
			);
		}
		if (tail === "language") {
			return { name: "batch", capability: "person.language" };
		}
		if (tail === "phone") {
			return { name: "batch", capability: "person.phone" };
		}
		if (tail === "title") {
			return { name: "batch", capability: "person.title" };
		}
		if (tail === "name") {
			return { name: "batch", capability: "person.name" };
		}
		return { name: "batch", capability: "person.verify_employment" };
	}
	throw new UsageError(
		"batch commands: batch <company|person> <command> --file <jsonl> --priority speed|balance|accuracy|coverage",
	);
}

function resolveCompany(mid: string | undefined, tail: string | undefined): Command {
	if (tail !== undefined) {
		throw new UsageError(
			"company <resolve|domain|hierarchy|b2b-social|icon|description> does not take positional arguments",
		);
	}
	switch (mid) {
		case "resolve":
			return { name: "company.resolve" };
		case "domain":
			return { name: "company.domain" };
		case "hierarchy":
			return { name: "company.hierarchy" };
		case "b2b-social":
			return { name: "company.b2b_social" };
		case "icon":
			return { name: "company.icon" };
		case "description":
			return { name: "company.description" };
		default:
			throw new UsageError(
				"company commands: resolve | domain | hierarchy | b2b-social | icon | description",
			);
	}
}

export function assertKnownFlags(commandName: string, flags: FlagMap): void {
	const allowed = COMMAND_FLAGS[commandName];
	if (!allowed) {
		throw new UsageError(`unknown command ${commandName}`);
	}
	for (const name of Object.keys(flags)) {
		if (GLOBAL_FLAGS.has(name) || allowed.has(name)) {
			continue;
		}
		throw new UsageError(`unknown flag --${name}`);
	}
}

export function flagString(flags: FlagMap, name: string): string | undefined {
	const value = flags[name];
	if (value === undefined || value === true) {
		return undefined;
	}
	return value;
}

export function flagBool(flags: FlagMap, name: string): true | undefined {
	return flags[name] === true ? true : undefined;
}
