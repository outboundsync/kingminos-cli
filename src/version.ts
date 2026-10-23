import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedVersion: string | undefined;

/** Package version from package.json next to the built CLI entry. */
export function getPackageVersion(): string {
	if (cachedVersion !== undefined) {
		return cachedVersion;
	}
	const entryDir = path.dirname(fileURLToPath(import.meta.url));
	const pkgPath = path.join(entryDir, "..", "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
	cachedVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";
	return cachedVersion;
}
