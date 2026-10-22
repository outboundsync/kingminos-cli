import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertKnownFlags, parseArgv, resolveCommand } from "../dist/kingminos.js";

describe("parseArgv", () => {
	it("collects positionals and string flags", () => {
		const parsed = parseArgv([
			"company",
			"domain",
			"--domain",
			"example.com",
			"--priority",
			"speed",
		]);
		assert.deepEqual(parsed.positionals, ["company", "domain"]);
		assert.equal(parsed.flags.domain, "example.com");
		assert.equal(parsed.flags.priority, "speed");
	});

	it("accepts --flag=value", () => {
		const parsed = parseArgv(["health", "--token=osr_test"]);
		assert.equal(parsed.flags.token, "osr_test");
	});

	it("treats --json as a boolean global flag", () => {
		const parsed = parseArgv(["--json", "health"]);
		assert.equal(parsed.flags.json, true);
		assert.deepEqual(parsed.positionals, ["health"]);
	});

	it("rejects unknown flags", () => {
		assert.throws(() => parseArgv(["health", "--min-confidence", "high"]), {
			message: /unknown flag --min-confidence/,
		});
	});

	it("rejects a boolean flag with a value", () => {
		assert.throws(() => parseArgv(["--json=true", "health"]), {
			message: /--json does not take a value/,
		});
	});

	it("rejects a missing flag value", () => {
		assert.throws(() => parseArgv(["company", "domain", "--domain"]), {
			message: /--domain requires a value/,
		});
	});
});

describe("resolveCommand", () => {
	const cases: Array<{ argv: string[]; name: string }> = [
		{ argv: ["health"], name: "health" },
		{ argv: ["openapi"], name: "openapi" },
		{ argv: ["providers"], name: "providers" },
		{ argv: ["capabilities"], name: "capabilities" },
		{ argv: ["recipes"], name: "recipes" },
		{ argv: ["company", "resolve"], name: "company.resolve" },
		{ argv: ["company", "domain"], name: "company.domain" },
		{ argv: ["company", "hierarchy"], name: "company.hierarchy" },
		{ argv: ["company", "b2b-social"], name: "company.b2b_social" },
		{ argv: ["company", "icon"], name: "company.icon" },
		{ argv: ["company", "description"], name: "company.description" },
		{ argv: ["person", "verify-employment"], name: "person.verify_employment" },
		{ argv: ["person", "language"], name: "person.language" },
		{ argv: ["person", "phone"], name: "person.phone" },
		{ argv: ["person", "title"], name: "person.title" },
	];

	for (const { argv, name } of cases) {
		it(`resolves ${argv.join(" ")}`, () => {
			assert.equal(resolveCommand(argv).name, name);
		});
	}

	it("resolves runs get", () => {
		assert.deepEqual(resolveCommand(["runs", "get", "run_1"]), {
			name: "runs.get",
			id: "run_1",
		});
	});

	it("resolves credentials put/delete", () => {
		assert.deepEqual(resolveCommand(["credentials", "put", "zoominfo"]), {
			name: "credentials.put",
			provider: "zoominfo",
		});
		assert.deepEqual(resolveCommand(["credentials", "delete", "leadmagic"]), {
			name: "credentials.delete",
			provider: "leadmagic",
		});
	});

	it("resolves subjects delete", () => {
		assert.deepEqual(resolveCommand(["subjects", "delete", "example.com"]), {
			name: "subjects.delete",
			subjectKey: "example.com",
		});
	});

	it("resolves batch company/person capabilities", () => {
		assert.deepEqual(resolveCommand(["batch", "company", "b2b-social"]), {
			name: "batch",
			capability: "company.b2b_social",
		});
		assert.deepEqual(resolveCommand(["batch", "person", "title"]), {
			name: "batch",
			capability: "person.title",
		});
	});

	it("does not accept a linkedin command name", () => {
		assert.throws(() => resolveCommand(["company", "linkedin"]), {
			message: /company commands:/,
		});
	});

	it("rejects unknown commands", () => {
		assert.throws(() => resolveCommand(["admin"]), { message: /unknown command admin/ });
	});

	it("rejects unexpected extra arguments", () => {
		assert.throws(() => resolveCommand(["health", "extra"]), {
			message: /health does not take arguments/,
		});
	});
});

describe("assertKnownFlags", () => {
	it("allows global --json on any command", () => {
		assert.doesNotThrow(() => assertKnownFlags("health", { json: true, token: "osr_x" }));
	});

	it("rejects a capability flag on the wrong command", () => {
		assert.throws(() => assertKnownFlags("health", { domain: "example.com" }), {
			message: /unknown flag --domain/,
		});
	});
});
