/**
 * Human table for `kingminos pricing` (GET /v1/pricing, schema
 * kingminos.pricing.v1). Every number comes from the response; the CLI never
 * writes a price. Returns undefined when the body isn't the expected shape,
 * and the caller prints the JSON instead.
 */
export function formatPricingTable(body: unknown): string | undefined {
	if (!isRecord(body) || !Array.isArray(body.capabilities)) {
		return undefined;
	}
	const rows: [string, string, string][] = [];
	for (const capability of body.capabilities) {
		if (!isRecord(capability) || typeof capability.id !== "string" || !Array.isArray(capability.paths)) {
			return undefined;
		}
		const first = rows.length;
		for (const path of capability.paths) {
			if (!isRecord(path) || typeof path.name !== "string") {
				return undefined;
			}
			const delivered = formatDelivered(path.delivered);
			if (delivered === undefined) {
				return undefined;
			}
			const label = path.name === capability.default_path ? `${path.name} (default)` : path.name;
			rows.push(["", label, delivered]);
		}
		for (const hop of Array.isArray(capability.opt_in_hops) ? capability.opt_in_hops : []) {
			if (isRecord(hop) && typeof hop.provider === "string" && typeof hop.price === "number") {
				rows.push(["", `+${hop.provider} (opt-in hop)`, String(hop.price)]);
			}
		}
		const row = rows[first];
		if (row) {
			row[0] = capability.id;
		}
	}
	const header: [string, string, string] = ["CAPABILITY", "PATH", "DELIVERED"];
	const widths = [0, 1].map((column) => Math.max(...[header, ...rows].map((row) => row[column].length)));
	const line = (row: [string, string, string]) =>
		`${row[0].padEnd(widths[0] ?? 0)}  ${row[1].padEnd(widths[1] ?? 0)}  ${row[2]}`.trimEnd();
	const version = typeof body.pricing_version === "string" ? `, pricing_version ${body.pricing_version}` : "";
	const out = [`Credits per delivered answer${version}`, "", line(header), ...rows.map(line)];
	const notes = Array.isArray(body.notes) ? body.notes.filter((note) => typeof note === "string") : [];
	if (notes.length > 0) {
		out.push("", ...notes);
	}
	out.push("", "Plans, BYOK fees and the full table: kingminos pricing --json");
	return `${out.join("\n")}\n`;
}

/** A number (outcome-priced), `typical` when the code fixes one price, else min–max. */
function formatDelivered(value: unknown): string | undefined {
	if (typeof value === "number") {
		return String(value);
	}
	if (!isRecord(value) || typeof value.min !== "number" || typeof value.max !== "number") {
		return undefined;
	}
	if (typeof value.typical === "number") {
		return String(value.typical);
	}
	return value.min === value.max ? String(value.min) : `${value.min}–${value.max}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
