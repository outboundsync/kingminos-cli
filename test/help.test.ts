import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist", "kingminos.js");

describe("kingminos CLI", () => {
	it("prints root help for --help", () => {
		const result = spawnSync(process.execPath, [cli, "--help"], {
			encoding: "utf8",
			cwd: repoRoot,
		});
		assert.equal(result.status, 0);
		assert.match(result.stdout, /King Minos CLI/);
		assert.match(result.stdout, /health\s+GET\s+\/health/);
		assert.match(result.stdout, /--json/);
		assert.doesNotMatch(result.stdout, /ROUTER_API_KEY/);
		assert.doesNotMatch(result.stdout, /harris@/);
		assert.doesNotMatch(result.stdout, /safe_to_write/);
		assert.equal(result.stderr, "");
	});

	it("does not put LinkedIn in the b2b-social help heading", () => {
		const result = spawnSync(process.execPath, [cli, "company", "b2b-social", "--help"], {
			encoding: "utf8",
			cwd: repoRoot,
		});
		assert.equal(result.status, 0);
		const heading = result.stdout.split("\n").slice(0, 3).join("\n");
		assert.match(heading, /company b2b-social/);
		assert.doesNotMatch(heading, /LinkedIn/);
	});

	it("lists person name and prints its help", () => {
		const root = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8", cwd: repoRoot });
		assert.match(root.stdout, /person name\s+POST \/v1\/person\/name/);
		const result = spawnSync(process.execPath, [cli, "person", "name", "--help"], {
			encoding: "utf8",
			cwd: repoRoot,
		});
		assert.equal(result.status, 0);
		assert.match(result.stdout, /POST \/v1\/person\/name/);
		assert.match(result.stdout, /--email \| --linkedin-url \(one required\)/);
	});

	it("lists person b2b-social and prints its help", () => {
		const root = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8", cwd: repoRoot });
		assert.match(root.stdout, /person b2b-social\s+POST \/v1\/person\/b2b-social/);
		const result = spawnSync(process.execPath, [cli, "person", "b2b-social", "--help"], {
			encoding: "utf8",
			cwd: repoRoot,
		});
		assert.equal(result.status, 0);
		const heading = result.stdout.split("\n").slice(0, 3).join("\n");
		assert.match(heading, /person b2b-social/);
		assert.doesNotMatch(heading, /LinkedIn/);
		assert.match(result.stdout, /--email \(required\)/);
		assert.match(result.stdout, /no coverage/);
	});

	it("lists person email and email verify and prints their help", () => {
		const root = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8", cwd: repoRoot });
		assert.match(root.stdout, /person email\s+POST \/v1\/person\/email/);
		assert.match(root.stdout, /email verify\s+POST \/v1\/email\/verify/);
		const find = spawnSync(process.execPath, [cli, "person", "email", "--help"], {
			encoding: "utf8",
			cwd: repoRoot,
		});
		assert.equal(find.status, 0);
		assert.match(find.stdout, /--first-name --last-name --company-domain/);
		const verify = spawnSync(process.execPath, [cli, "email", "verify", "--help"], {
			encoding: "utf8",
			cwd: repoRoot,
		});
		assert.equal(verify.status, 0);
		assert.match(verify.stdout, /valid \| invalid \| catch_all \| unknown/);
		assert.doesNotMatch(verify.stdout, /--cache /);
	});
});
