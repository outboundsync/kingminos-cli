import { BOOLEAN_FLAGS, GLOBAL_FLAGS } from "./const";
import { COMMAND_REFS } from "./reference";
import { UsageError } from "./usage";

export type FlagMap = Record<string, string | true>;

export interface ParsedArgv {
	positionals: string[];
	flags: FlagMap;
}

/** Per-command flag allowlist, from the command reference (src/reference.ts). */
const COMMAND_FLAGS: Record<string, ReadonlySet<string>> = {
	...Object.fromEntries(COMMAND_REFS.map((ref) => [ref.id, new Set(ref.flags.map((flag) => flag.name))])),
	help: new Set(),
};

export type Command =
	| { name: "help"; topic?: string }
	| { name: "health" }
	| { name: "openapi" }
	| { name: "pricing" }
	| { name: "providers" }
	| { name: "capabilities" }
	| { name: "recipes" }
	| { name: "recipes.guidance" }
	| { name: "batch"; capability: BatchCapability }
	| { name: "company.resolve" }
	| { name: "company.domain" }
	| { name: "company.hierarchy" }
	| { name: "company.b2b_social" }
	| { name: "company.icon" }
	| { name: "company.description" }
	| { name: "company.x_account" }
	| { name: "person.verify_employment" }
	| { name: "person.language" }
	| { name: "person.phone" }
	| { name: "person.title" }
	| { name: "person.name" }
	| { name: "person.b2b_social" }
	| { name: "person.email" }
	| { name: "email.verify" }
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
	| "company.x_account"
	| "person.verify_employment"
	| "person.language"
	| "person.phone"
	| "person.title"
	| "person.name"
	| "person.b2b_social"
	| "person.email"
	| "email.verify";

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
		if (arg === "-V" || arg === "-v") {
			flags.version = true;
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
		case "pricing":
		case "providers":
		case "capabilities":
			if (mid !== undefined) {
				throw new UsageError(`${head} does not take arguments`);
			}
			return { name: head };
		case "recipes":
			if (mid === "guidance") {
				if (tail !== undefined) {
					throw new UsageError("recipes guidance does not take positional arguments");
				}
				return { name: "recipes.guidance" };
			}
			if (mid !== undefined) {
				throw new UsageError("recipes commands: guidance");
			}
			return { name: "recipes" };
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
				mid !== "name" &&
				mid !== "b2b-social" &&
				mid !== "email"
			) {
				throw new UsageError(
					"person commands: verify-employment | language | phone | title | name | b2b-social | email",
				);
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
			if (mid === "b2b-social") {
				return { name: "person.b2b_social" };
			}
			if (mid === "email") {
				return { name: "person.email" };
			}
			return { name: "person.verify_employment" };
		case "email":
			if (mid !== "verify") {
				throw new UsageError("email commands: verify");
			}
			if (tail !== undefined) {
				throw new UsageError("email verify does not take positional arguments");
			}
			return { name: "email.verify" };
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
			case "company.x_account":
				return { name: "batch", capability: inner.name };
			default:
				throw new UsageError(
					"batch company commands: resolve | domain | hierarchy | b2b-social | icon | description | x-account",
				);
		}
	}
	if (mid === "person") {
		if (
			tail !== "verify-employment" &&
			tail !== "language" &&
			tail !== "phone" &&
			tail !== "title" &&
			tail !== "name" &&
			tail !== "b2b-social" &&
			tail !== "email"
		) {
			throw new UsageError(
				"batch person commands: verify-employment | language | phone | title | name | b2b-social | email",
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
		if (tail === "b2b-social") {
			return { name: "batch", capability: "person.b2b_social" };
		}
		if (tail === "email") {
			return { name: "batch", capability: "person.email" };
		}
		return { name: "batch", capability: "person.verify_employment" };
	}
	if (mid === "email") {
		if (tail !== "verify") {
			throw new UsageError("batch email commands: verify");
		}
		return { name: "batch", capability: "email.verify" };
	}
	throw new UsageError(
		"batch commands: batch <company|person|email> <command> --file <jsonl> --priority speed|balance|accuracy|coverage",
	);
}

function resolveCompany(mid: string | undefined, tail: string | undefined): Command {
	if (tail !== undefined) {
		throw new UsageError(
			"company <resolve|domain|hierarchy|b2b-social|icon|description|x-account> does not take positional arguments",
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
		case "x-account":
			return { name: "company.x_account" };
		default:
			throw new UsageError(
				"company commands: resolve | domain | hierarchy | b2b-social | icon | description | x-account",
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
