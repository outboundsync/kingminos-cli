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
		assert.equal(result.stderr, "");
	});
});
