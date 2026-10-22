/** `safe_to_write` is leaving the API. Confidence is the write signal. Never print it. */
export function stripSafeToWrite(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripSafeToWrite);
	}
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			if (key === "safe_to_write") {
				continue;
			}
			out[key] = stripSafeToWrite(child);
		}
		return out;
	}
	return value;
}
