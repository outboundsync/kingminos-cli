import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRequest, COMMAND_REFS, commandHelp, ROOT_HELP } from "../dist/kingminos.js";
import type { Command } from "../src/parse.ts";

// src/reference.ts is the command reference: COMMAND_FLAGS and commands.json
// come from it. These tests keep it honest against the code that sends the
// request and the --help text people read.
const loader = { readFile: () => "", stdin: "" };
const SAMPLE: Record<string, string> = { id: "run_1", provider: "apollo", subject_key: "example.com" };
const GLOBAL_FLAGS = new Set(["token", "base-url", "help"]);

function commandFor(id: string): Command {
	switch (id) {
		case "runs.get":
			return { name: "runs.get", id: SAMPLE.id ?? "" };
		case "credentials.put":
			return { name: "credentials.put", provider: SAMPLE.provider ?? "" };
		case "credentials.delete":
			return { name: "credentials.delete", provider: SAMPLE.provider ?? "" };
		case "subjects.delete":
			return { name: "subjects.delete", subjectKey: SAMPLE.subject_key ?? "" };
		default:
			return { name: id } as Command;
	}
}

describe("command reference", () => {
	for (const ref of COMMAND_REFS) {
		if (ref.id !== "batch") {
			it(`${ref.id} sends ${ref.method} ${ref.path}`, () => {
				const extra = ref.id === "credentials.put" ? { "api-key": "k" } : {};
				const request = buildRequest(commandFor(ref.id), extra, loader);
				const expected = ref.path.replace(/\{([^}]+)\}/g, (_, name: string) => SAMPLE[name] ?? name);
				assert.equal(request.method, ref.method);
				assert.equal(request.path, expected);
				assert.equal(request.auth, ref.auth);
			});

			it(`${ref.id} is in the root help`, () => {
				const words = ref.usage.replace(/^kingminos /, "");
				const line = ROOT_HELP.split("\n").find((text: string) => text.trim().startsWith(`${words} `));
				assert.ok(line, `ROOT_HELP has no line for ${words}`);
				assert.match(line, new RegExp(`\\s${ref.method}\\s+${ref.path.replace(/[{}]/g, "\\$&")}$`));
			});
		}

		it(`${ref.id} matches its --help text`, () => {
			const help = commandHelp(ref.id);
			assert.equal(help.split("\n")[0], ref.usage);
			const inHelp = new Set(
				[...help.matchAll(/--([a-z][a-z0-9-]*)/g)].map((match) => match[1]).filter((name) => !GLOBAL_FLAGS.has(name)),
			);
			assert.deepEqual([...inHelp].sort(), ref.flags.map((flag: { name: string }) => flag.name).sort());
		});
	}

	it("has one entry per command, with unique flags", () => {
		const ids = COMMAND_REFS.map((ref: { id: string }) => ref.id);
		assert.equal(new Set(ids).size, ids.length);
		for (const ref of COMMAND_REFS) {
			const names = ref.flags.map((flag: { name: string }) => flag.name);
			assert.equal(new Set(names).size, names.length, ref.id);
		}
	});
});
