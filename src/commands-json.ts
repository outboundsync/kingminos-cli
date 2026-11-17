import { COMMAND_REFS } from "./reference";

/**
 * The command reference as data (`commands.json`, schema `cli.commands.v1`),
 * built from COMMAND_REFS so the websites can render their CLI docs from it.
 * Same shape as the outboundsync CLI's. No version or date: the file changes
 * only when a command does. `npm run commands:json` writes it; a test fails
 * when the committed file differs from this output.
 */
export interface CommandsJson {
	schema: "cli.commands.v1";
	cli: string;
	commands: CommandEntry[];
}

export interface CommandEntry {
	id: string;
	usage: string;
	summary: string;
	method: string;
	/** The OpenAPI path. */
	path: string;
	flags: FlagEntry[];
	/** Changes stored data (keys, subjects). */
	write: boolean;
	/** Needs a tenant Bearer. */
	auth: boolean;
}

export interface FlagEntry {
	name: string;
	help: string;
	/** The command fails with a usage error without it. */
	required: boolean;
	values?: string[];
}

export function commandsJson(): CommandsJson {
	const commands = COMMAND_REFS.map(
		(ref): CommandEntry => ({
			id: ref.id,
			usage: ref.usage,
			summary: ref.summary,
			method: ref.method,
			path: ref.path,
			flags: ref.flags.map((flag) => ({
				name: flag.name,
				help: flag.help,
				required: flag.required === true,
				...(flag.values ? { values: [...flag.values] } : {}),
			})),
			write: ref.write,
			auth: ref.auth,
		}),
	).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
	return { schema: "cli.commands.v1", cli: "kingminos", commands };
}

/** The exact bytes of commands.json. */
export function commandsJsonText(): string {
	return `${JSON.stringify(commandsJson(), null, 2)}\n`;
}
