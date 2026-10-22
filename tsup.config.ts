import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/kingminos.ts"],
	format: ["esm"],
	platform: "node",
	target: "node20",
	outDir: "dist",
	clean: true,
	banner: {
		js: "#!/usr/bin/env node",
	},
});
