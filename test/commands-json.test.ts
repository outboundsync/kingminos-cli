import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { commandsJson, commandsJsonText, COMMAND_REFS } from "../dist/kingminos.js";

// commands.json is generated from COMMAND_REFS by `npm run commands:json` and
// published (GitHub raw and the npm package) for the websites' CLI docs.
describe("commands.json", () => {
	it("matches the generator output; run `npm run commands:json` after changing a command", () => {
		const committed = readFileSync(new URL("../commands.json", import.meta.url), "utf8");
		assert.equal(committed, commandsJsonText());
	});

	it("lists every command once, sorted by id", () => {
		const ids = commandsJson().commands.map((command: { id: string }) => command.id);
		assert.deepEqual(ids, COMMAND_REFS.map((command: { id: string }) => command.id).sort());
		assert.equal(new Set(ids).size, ids.length);
	});

	it("uses the shared cli.commands.v1 shape with no version or date", () => {
		const data = commandsJson();
		assert.deepEqual(Object.keys(data), ["schema", "cli", "commands"]);
		assert.equal(data.schema, "cli.commands.v1");
		assert.equal(data.cli, "kingminos");
		for (const command of data.commands) {
			assert.deepEqual(Object.keys(command), ["id", "usage", "summary", "method", "path", "flags", "write", "auth"]);
			assert.match(command.usage, /^kingminos /);
			assert.match(command.path, /^\//);
			for (const flag of command.flags) {
				assert.deepEqual(
					Object.keys(flag),
					flag.values ? ["name", "help", "required", "values"] : ["name", "help", "required"],
				);
			}
		}
	});

	it("marks only the key and subject changes as writes; capability POSTs are lookups", () => {
		for (const command of commandsJson().commands) {
			assert.equal(command.write, command.method === "PUT" || command.method === "DELETE", command.id);
		}
	});

	it("ships in the npm package", () => {
		const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { files: string[] };
		assert.ok(pkg.files.includes("commands.json"));
	});
});
